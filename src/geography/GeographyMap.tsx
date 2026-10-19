import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { mapVillages } from '../data/villages';
import { emptyCollection, mapStyle, scopeNames, type MapScope, type MapDepth, type MapRoute, type MapBoardingPoint, type MapDetail, type FeatureCollection, type Polygon, type MapPresentation, type MapViewportInsets, type MapCameraSnapshot } from './map-depth';
import type { TravelLoop } from './travelLoop';
import type { VillagePoi } from './poiCatalog';
import { clusterScreenPois, isCameraSnapshot, loopFeatureCollection, loopDirectionCollection } from './map-overlays';
import './map-depth.css';
export type { MapScope, MapDepth, MapRoute, MapBoardingPoint, MapPresentation, MapViewportInsets, MapCameraSnapshot } from './map-depth';

// Vite prebundling changes import.meta.url; retain the emitted local module worker.
maplibregl.setWorkerUrl(workerUrl);

type Manifest = { extent: [number,number,number,number]; layers: Record<'boundary'|'roads'|'water',string>; crs: string };
type Collection = FeatureCollection;
function isCollection(value: unknown, allowEmpty=false): value is Collection {
  if (!value || typeof value!=='object') return false;
  const data = value as Collection;
  if (data.type!=='FeatureCollection' || !Array.isArray(data.features) || (!allowEmpty && !data.features.length)) return false;
  const validCoordinates = (v: unknown): boolean => Array.isArray(v) && v.length>0 && (typeof v[0]==='number' ? v.length===2 && v.every(Number.isFinite) && Math.abs(v[0])<=180 && Math.abs(v[1] as number)<=90 : v.every(validCoordinates));
  return data.features.every(f=>f.type==='Feature' && f.geometry && 'coordinates' in f.geometry && validCoordinates(f.geometry.coordinates));
}
type GeographyMapProps = {selectedId:string;onSelect:(id:string)=>void;reducedMotion:boolean;large:boolean;scope?:MapScope;depth?:MapDepth;route?:MapRoute|null;boardingPoints?:MapBoardingPoint[];onScopeChange?:(scope:MapScope)=>void;onDepthChange?:(depth:MapDepth)=>void;presentation?:MapPresentation;viewportInsets?:MapViewportInsets;travelLoop?:TravelLoop|null;pois?:VillagePoi[];selectedPoiId?:string|null;onPoiSelect?:(ids:string[])=>void;onVillageGroupSelect?:(ids:string[])=>void;cameraSnapshot?:MapCameraSnapshot|null;onCameraChange?:(camera:MapCameraSnapshot)=>void;fitRequest?:number};
export function GeographyMap({selectedId,onSelect,reducedMotion,large,scope='county',depth='flat',route=null,boardingPoints=[],onDepthChange,presentation='card',viewportInsets,travelLoop=null,pois=[],selectedPoiId=null,onPoiSelect,onVillageGroupSelect,cameraSnapshot=null,onCameraChange,fitRequest=0}: GeographyMapProps) {
  const container=useRef<HTMLDivElement>(null), map=useRef<maplibregl.Map|null>(null), markers=useRef<maplibregl.Marker[]>([]);
  const stopMarkers=useRef<maplibregl.Marker[]>([]), buildings=useRef<FeatureCollection>(emptyCollection);
  const current=useRef({scope,depth,reducedMotion,presentation,viewportInsets});current.current={scope,depth,reducedMotion,presentation,viewportInsets};
  const routeRef=useRef(route);routeRef.current=route;
  const loopRef=useRef(travelLoop);loopRef.current=travelLoop;
  const poisRef=useRef(pois);poisRef.current=pois;
  const poiSelect=useRef(onPoiSelect);poiSelect.current=onPoiSelect;
  const chosenPoi=useRef(selectedPoiId);chosenPoi.current=selectedPoiId;
  const villageGroupSelect=useRef(onVillageGroupSelect);villageGroupSelect.current=onVillageGroupSelect;
  const cameraChange=useRef(onCameraChange);cameraChange.current=onCameraChange;
  const initialCamera=useRef(cameraSnapshot),preserveCamera=useRef(isCameraSnapshot(cameraSnapshot));
  const lastFitKey=useRef(''),fitKey=`${scope}:${scope==='village'?selectedId:scope==='route'?route?.id??'':''}:${fitRequest}`;
  const currentFitKey=useRef(fitKey);currentFitKey.current=fitKey;
  const poiMarkers=useRef(new Map<string,maplibregl.Marker>()),layoutPois=useRef<()=>void>(()=>{});
  const [ready,setReady]=useState(0),[detailState,setDetailState]=useState<'loading'|'ready'|'unavailable'>('loading');
  const [buildingCounts,setBuildingCounts]=useState<Record<string,number>>({});
  const layoutLabels=useRef<()=>void>(()=>{});
  const select=useRef(onSelect); select.current=onSelect;
  const chosen=useRef(selectedId); chosen.current=selectedId;
  const [status,setStatus]=useState('正在载入本地地理数据…'),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
  const bounds=useRef<Manifest['extent']|null>(null);
  const mapLoaded=useRef(false),fitRunning=useRef(false),fitCurrentScope=useRef<(duration:number)=>void>(()=>{});
  function publishCamera(){
    const instance=map.current;if(!instance||!mapLoaded.current)return;
    const padding=instance.getPadding();
    const snapshot:MapCameraSnapshot={center:instance.getCenter().toArray(),zoom:instance.getZoom(),bearing:instance.getBearing(),pitch:instance.getPitch(),padding:{top:padding.top??0,bottom:padding.bottom??0,left:padding.left??0,right:padding.right??0}};
    if(container.current){container.current.dataset.mapPitch=String(Math.round(snapshot.pitch));container.current.dataset.mapZoom=snapshot.zoom.toFixed(2);container.current.dataset.mapCenter=snapshot.center.join(',');}
    cameraChange.current?.(snapshot);
  }
  function visiblePois(){return poisRef.current.filter(poi=>poi.villageId===chosen.current&&poi.verificationStatus.identity==='verified'&&poi.verificationStatus.summary==='verified'&&poi.verificationStatus.coordinates==='verified'&&poi.normalizedCoordinate?.length===2&&poi.normalizedCoordinate.every(Number.isFinite));}
  function measureMapUi() {
    const card=container.current?.parentElement,attribution=card?.querySelector<HTMLElement>('.map-attribution');
    if(card&&attribution)card.style.setProperty('--map-attribution-height',`${Math.ceil(attribution.getBoundingClientRect().height)}px`);
  }
  function scenePadding(width:number,height:number):MapViewportInsets {
    const requested=current.current.viewportInsets??{top:0,bottom:0,left:0,right:0};
    const clamp=(value:number)=>Number.isFinite(value)?Math.max(0,value):0;
    const padding={top:clamp(requested.top),bottom:clamp(requested.bottom),left:clamp(requested.left),right:clamp(requested.right)};
    const vertical=Math.min(1,Math.max(0,height-48)/(padding.top+padding.bottom||1));
    const horizontal=Math.min(1,Math.max(0,width-48)/(padding.left+padding.right||1));
    return {top:padding.top*vertical,bottom:padding.bottom*vertical,left:padding.left*horizontal,right:padding.right*horizontal};
  }
  function fitScope(duration:number) {
    measureMapUi();
    const instance=map.current;if(!instance||!bounds.current||failed)return;
    const card=container.current?.parentElement,box=card?.getBoundingClientRect();
    const width=container.current?.clientWidth??400,height=container.current?.clientHeight??400;
    const compact=width<320&&height<330;
    card?.classList.toggle('map-compact',compact);
    const measuredBottom=(selector:string,fallback:number)=>{
      const element=card?.querySelector<HTMLElement>(selector);if(!element||!box)return fallback;
      const rect=element.getBoundingClientRect();if(!rect.height)return 0;
      return Math.max(0,box.bottom-rect.top+6);
    };
    // A compact phone preview needs a smaller camera scale, not clipped geography.
    // Keep the whole county between the real HTML controls and attribution footer.
    const heading=card?.querySelector<HTMLElement>('.map-heading')?.getBoundingClientRect();
    const top=compact&&box&&heading?Math.max(34,heading.bottom-box.top+6):62;
    const padding=current.current.presentation==='scene'?scenePadding(width,height):{top,bottom:Math.min(Math.max(24,height-top-40),Math.max(measuredBottom('.map-attribution',44),measuredBottom('.map-status',62))),left:compact?12:28,right:compact?12:64};
    // fitBounds places extreme coordinates on its padding edge. Reserve actual
    // touch/label room inside the unobstructed area, rather than clipping those points.
    const paddedFit=(margin:number)=>{
      const horizontal=Math.min(margin,Math.max(0,(width-padding.left-padding.right-48)/2));
      const vertical=Math.min(margin,Math.max(0,(height-padding.top-padding.bottom-48)/2));
      return {left:padding.left+horizontal,right:padding.right+horizontal,top:padding.top+vertical,bottom:padding.bottom+vertical};
    };
    const pitch=current.current.depth==='relief'?42:0;
    instance.stop();
    fitRunning.current=duration>0;
    if(current.current.scope==='village'){
      const village=mapVillages.find(v=>v.id===chosen.current);if(!village?.normalizedCoordinate)return;
      const localPois=visiblePois();
      if(localPois.length){
        const localBounds=new maplibregl.LngLatBounds(village.normalizedCoordinate,village.normalizedCoordinate);
        localPois.forEach(poi=>localBounds.extend(poi.normalizedCoordinate!));
        instance.fitBounds(localBounds,{padding:paddedFit(28),maxZoom:16,pitch,bearing:0,duration});return;
      }
      if(current.current.presentation==='scene'){
        const visibleWidth=width-padding.left-padding.right,visibleHeight=height-padding.top-padding.bottom;
        const zoom=visibleWidth<210||visibleHeight<160?11.5:visibleWidth>360?12:11.8;
        instance.easeTo({center:village.normalizedCoordinate,zoom,pitch,bearing:0,padding,duration,easing:t=>t*t*(3-2*t)});
        return;
      }
      const localBounds=new maplibregl.LngLatBounds(village.normalizedCoordinate,village.normalizedCoordinate);
      const localBuildings=buildings.current.features.filter(f=>f.properties?.villageId===village.id);
      if(localBuildings.length){
        for(const feature of localBuildings)for(const pair of (feature.geometry as Polygon).coordinates[0])localBounds.extend(pair as [number,number]);
        instance.fitBounds(localBounds,{padding,maxZoom:16,pitch,bearing:0,duration});
      }else instance.easeTo({center:village.normalizedCoordinate,zoom:15.2,pitch,bearing:0,padding:{top:20,bottom:20,left:0,right:36},duration});
      return;
    }
    if(current.current.scope==='loop'){
      const collection=loopFeatureCollection(loopRef.current),loopBounds=new maplibregl.LngLatBounds();
      for(const feature of collection.features)if(feature.geometry.type==='LineString')feature.geometry.coordinates.forEach(pair=>loopBounds.extend(pair as [number,number]));
      if(!loopBounds.isEmpty()){
        for(const village of mapVillages)if(loopRef.current?.orderedVillageIds.includes(village.id))loopBounds.extend(village.normalizedCoordinate!);
        // The actual road envelope already extends beyond the village points on
        // the horizontal axis. Keep that usable width for separated touch targets.
        instance.fitBounds(loopBounds,{padding,maxZoom:15,pitch,bearing:0,duration});return;
      }
    }
    if(current.current.scope==='route'&&routeRef.current?.geometry){
      const geometry=routeRef.current.geometry,pairs=geometry.type==='LineString'?geometry.coordinates:geometry.coordinates.flat();
      if(pairs.length){const routeBounds=new maplibregl.LngLatBounds();pairs.forEach(pair=>routeBounds.extend(pair as [number,number]));instance.fitBounds(routeBounds,{padding,maxZoom:15,pitch,bearing:0,duration});return;}
    }
    const [w,s,e,n]=bounds.current;instance.fitBounds([[w,s],[e,n]],{padding,pitch,bearing:0,duration});
  }
  fitCurrentScope.current=fitScope;
  layoutPois.current=()=>{
    const instance=map.current,element=container.current;if(!instance||!element||!mapLoaded.current)return;
    const available=current.current.scope==='village'?visiblePois():[],safe=current.current.presentation==='scene'?scenePadding(element.clientWidth,element.clientHeight):{top:24,bottom:56,left:24,right:56};
    const projected=available.map(poi=>({id:poi.id,...instance.project(poi.normalizedCoordinate!)})).filter(point=>point.x>=safe.left+24&&point.x<=element.clientWidth-safe.right-24&&point.y>=safe.top+24&&point.y<=element.clientHeight-safe.bottom-24);
    const groups=clusterScreenPois(projected,52),retained=new Set<string>();
    const card=element.parentElement!,box=element.getBoundingClientRect(),scaleX=box.width/element.clientWidth||1,scaleY=box.height/element.clientHeight||1;
    const occupied=[...card.querySelectorAll<HTMLElement>('.pin-dot,.boarding-dot')].map(pin=>pin.getBoundingClientRect());
    for(const group of groups){
      const point=[...group].sort((a,b)=>a.id.localeCompare(b.id))[0],x=box.left+point.x*scaleX,y=box.top+point.y*scaleY;
      occupied.push({left:x-14*scaleX,right:x+14*scaleX,top:y-14*scaleY,bottom:y+14*scaleY} as DOMRect);
    }
    for(const group of groups){
      const ids=group.map(point=>point.id).sort(),key=ids.join('|'),members=ids.map(id=>available.find(poi=>poi.id===id)!);
      const representative=members[0];retained.add(key);
      let marker=poiMarkers.current.get(key);
      if(!marker){
        const button=document.createElement('button');button.type='button';button.className='poi-marker';button.dataset.poiIds=ids.join(',');button.dataset.poiId=group.length===1?ids[0]:'';
        button.setAttribute('aria-label',group.length===1?`查看${representative.officialName}简介`:`选择${group.length}处景点：${members.map(poi=>poi.officialName).join('、')}`);
        const icon=document.createElement('span');icon.className='poi-icon';icon.setAttribute('aria-hidden','true');
        if(group.length>1){icon.textContent=String(group.length);button.classList.add('poi-cluster');}
        else{
          const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');
          const path=document.createElementNS('http://www.w3.org/2000/svg','path'),category=String(representative.category).toLowerCase();
          path.setAttribute('d',/桥|bridge/.test(category)?'M3 18V9m18 9V9M3 13c5-7 13-7 18 0M3 18h18M7 10v8m5-10v10m5-8v8':/自然|tree|landscape/.test(category)?'M12 21V12M12 3c-4 0-7 4-7 8 0 3 3 5 7 5s7-2 7-5c0-4-3-8-7-8Z':/街|lane|street/.test(category)?'m8 3-4 18m12-18 4 18M12 4v3m0 4v3m0 4v3':'m3 10 9-7 9 7M5 10v11h14V10M9 21v-7h6v7');svg.append(path);icon.append(svg);
        }
        const label=document.createElement('span');label.className='poi-name';label.textContent=group.length>1?`${group.length}处景点`:representative.officialName;button.append(icon,label);
        button.addEventListener('click',()=>{
          // MapLibre consumes pointer focus during map gestures. Make the actual
          // activated control explicit before the existing modal records its trigger.
          button.focus({preventScroll:true});poiSelect.current?.(ids);
        });
        marker=new maplibregl.Marker({element:button,anchor:'center',pitchAlignment:'viewport',rotationAlignment:'viewport'}).setLngLat(representative.normalizedCoordinate!).addTo(instance);poiMarkers.current.set(key,marker);
      }
      const button=marker.getElement(),label=button.querySelector<HTMLElement>('.poi-name')!;label.style.display='block';
      button.setAttribute('aria-pressed',String(chosenPoi.current!==null&&ids.includes(chosenPoi.current)));
      const pin=button.getBoundingClientRect(),labelBox=label.getBoundingClientRect(),x=(pin.left+pin.right)/2,y=(pin.top+pin.bottom)/2,w=labelBox.width,h=labelBox.height;
      let placed=false;
      const labelCandidates=[[x-w/2,y+22*scaleY],[x-w/2,y-22*scaleY-h],[x-22*scaleX-w,y-h/2],[x+22*scaleX,y-h/2]].map(([left,top])=>[Math.max(box.left+safe.left*scaleX,Math.min(left,box.right-safe.right*scaleX-w)),Math.max(box.top+safe.top*scaleY,Math.min(top,box.bottom-safe.bottom*scaleY-h))]);
      for(const [left,top] of labelCandidates){
        const candidate={left,top,right:left+w,bottom:top+h};
        if(left<box.left+safe.left*scaleX||candidate.right>box.right-safe.right*scaleX||top<box.top+safe.top*scaleY||candidate.bottom>box.bottom-safe.bottom*scaleY)continue;
        if(occupied.some(rect=>left<rect.right+4&&candidate.right>rect.left-4&&top<rect.bottom+4&&candidate.bottom>rect.top-4))continue;
        label.style.left=`${(left-pin.left)/scaleX}px`;label.style.top=`${(top-pin.top)/scaleY}px`;occupied.push(candidate as DOMRect);placed=true;break;
      }
      if(!placed)label.style.display='none';
    }
    for(const [key,marker] of poiMarkers.current)if(!retained.has(key)){marker.remove();poiMarkers.current.delete(key);}
  };
  useEffect(()=>{
    const abort=new AbortController(); let disposed=false; let instance:maplibregl.Map|null=null;
    let renderTimeout: ReturnType<typeof setTimeout> | undefined;
    const timeout=setTimeout(()=>abort.abort(),15000);
    const fail=(message:string)=>{if(!disposed){setFailed(true);setStatus(message);}};
    setFailed(false);setStatus('正在载入本地地理数据…');setDetailState('loading');setReady(0);mapLoaded.current=false;
    async function json(path:string) { const response=await fetch(import.meta.env.BASE_URL+path,{signal:abort.signal});if(!response.ok)throw new Error('数据请求失败');return response.json(); }
    async function start() {
      try {
        const manifest=await json('geography/manifest.json') as Manifest;
        if(manifest.crs!=='EPSG:4326'||!Array.isArray(manifest.extent)||manifest.extent.length!==4||!manifest.extent.every(Number.isFinite)||!manifest.layers)throw new Error('清单格式错误');
        const layers=await Promise.all(['boundary','roads','water'].map(name=>json(manifest.layers[name as keyof Manifest['layers']])));
        if(!layers.every(layer=>isCollection(layer)))throw new Error('地理数据格式错误');
        let detailLayers:FeatureCollection[]=[emptyCollection,emptyCollection,emptyCollection];
        try{
          const detail=await json('geography/detail-manifest.json') as MapDetail;
          if(detail.crs!=='EPSG:4326')throw new Error('局部坐标系错误');
          const detailData=await Promise.all(['buildings','detail-roads','detail-water'].map(name=>json(detail.layers[name as keyof MapDetail['layers']])));
          if(!detailData.every(layer=>isCollection(layer,true)))throw new Error('局部数据格式错误');
          detailLayers=detailData;buildings.current=detailData[0];
          // Access-road research adds actual roads outside the smaller village-detail sample.
          const access=await json('geography/access-roads.geojson');
          if(isCollection(access,true)){
            const seen=new Set(detailData[1].features.map(feature=>feature.properties?.osmId));
            detailLayers[1]={type:'FeatureCollection',features:[...detailData[1].features,...access.features.filter(feature=>!seen.has(feature.properties?.osmId)).map(feature=>({...feature,properties:{...feature.properties,movement:'road'}}))]};
          }
          if(!disposed){setDetailState('ready');setBuildingCounts(detail.villageBuildingCounts);}
        }catch{if(!disposed){setDetailState('unavailable');setBuildingCounts({});}buildings.current=emptyCollection;detailLayers=[emptyCollection,emptyCollection,emptyCollection];}
        clearTimeout(timeout);if(disposed)return;bounds.current=manifest.extent;
        instance=new maplibregl.Map({container:container.current!,style:mapStyle(layers,detailLayers,current.current.presentation),center:[121.46,29.31],zoom:9,minZoom:5,maxZoom:18,maxPitch:48,attributionControl:false,renderWorldCopies:false,dragRotate:false,pitchWithRotate:false,canvasContextAttributes:{preserveDrawingBuffer:true}});
        map.current=instance;
        instance.touchZoomRotate.disableRotation();instance.touchPitch.disable();
        renderTimeout=setTimeout(()=>fail('地图显示超时，请使用下方古村列表。'),15000);
        instance.on('error',()=>fail('地图渲染失败，请使用下方古村列表。'));
        instance.getCanvas().addEventListener('webglcontextlost',()=>fail('地图显示中断，请使用下方古村列表。'),{signal:abort.signal});
        instance.on('load',()=>{
          clearTimeout(renderTimeout);
          if(disposed||!instance)return;
          mapLoaded.current=true;
          const arrow=document.createElement('canvas');arrow.width=28;arrow.height=28;
          const context=arrow.getContext('2d');
          if(context){context.lineWidth=3;context.strokeStyle='#24383A';context.fillStyle='#F5F2E9';context.lineJoin='round';context.beginPath();context.moveTo(14,4);context.lineTo(23,23);context.lineTo(14,18);context.lineTo(5,23);context.closePath();context.fill();context.stroke();instance.addImage('loop-direction',context.getImageData(0,0,28,28));}
          lastFitKey.current=currentFitKey.current;
          if(isCameraSnapshot(initialCamera.current))instance.jumpTo({...initialCamera.current,padding:initialCamera.current.padding??{top:0,bottom:0,left:0,right:0}});
          else fitScope(0);
          markers.current=mapVillages.map((v,index)=>{
            const button=document.createElement('button');button.type='button';button.className=`village-pin pin-${index}`;button.dataset.villageId=v.id;button.setAttribute('aria-label',`查看${v.displayName}`);button.setAttribute('aria-pressed',String(v.id===chosen.current));
            const dot=document.createElement('span');dot.className='pin-dot';dot.setAttribute('aria-hidden','true');
            const label=document.createElement('span');label.className='pin-name';label.textContent=v.displayName;button.append(dot,label);
            button.addEventListener('click',()=>{
              const group=button.dataset.villageGroupIds?.split(',').filter(Boolean)??[];
              if(group.length>1&&villageGroupSelect.current){button.focus({preventScroll:true});villageGroupSelect.current(group);}
              else select.current(v.id);
            });
            return new maplibregl.Marker({element:button,anchor:'center',pitchAlignment:'viewport',rotationAlignment:'viewport'}).setLngLat(v.normalizedCoordinate!).addTo(instance!);
          });
          // Resolve label collisions in screen space; never move the geographic dot.
          layoutLabels.current=()=>{
            if(disposed||!container.current)return;
            const card=container.current.parentElement!, box=card.getBoundingClientRect();
            const canvasBox=container.current.getBoundingClientRect();
            const scaleX=canvasBox.width/(container.current.clientWidth||canvasBox.width)||1,scaleY=canvasBox.height/(container.current.clientHeight||canvasBox.height)||1;
            // Insets are CSS layout pixels; rectangles include the desktop phone's zoom/transform.
            const safe=current.current.presentation==='scene'?scenePadding(container.current.clientWidth,container.current.clientHeight):{top:0,bottom:0,left:0,right:0};
            const labelBounds={left:box.left+safe.left*scaleX,top:box.top+safe.top*scaleY,right:box.right-safe.right*scaleX,bottom:box.bottom-safe.bottom*scaleY};
            const villageOrder=loopRef.current?.orderedVillageIds??mapVillages.map(village=>village.id);
            const clusters=current.current.scope==='loop'&&villageGroupSelect.current?clusterScreenPois(mapVillages.map(village=>{
              const point=instance!.project(village.normalizedCoordinate!);
              // Default MapLibre DOM markers snap their center to whole CSS pixels.
              return {id:village.id,x:Math.round(point.x),y:Math.round(point.y)};
            }),48):mapVillages.map(village=>[{id:village.id,x:0,y:0}]);
            const groupsByVillage=new Map<string,{ids:string[];representative:string}>();
            for(const cluster of clusters){
              const ids=cluster.map(point=>point.id).sort((a,b)=>villageOrder.indexOf(a)-villageOrder.indexOf(b));
              const representative=ids.includes(chosen.current)?chosen.current:ids[0];
              ids.forEach(id=>groupsByVillage.set(id,{ids,representative}));
            }
            for(const marker of markers.current){
              const button=marker.getElement(),id=button.dataset.villageId!,group=groupsByVillage.get(id)!,hidden=id!==group.representative,index=villageOrder.indexOf(id),cluster=group.ids.length>1;
              button.dataset.villageGroupIds=group.ids.join(',');button.dataset.villageGroupHidden=String(hidden);button.classList.toggle('village-cluster',cluster&&!hidden);
              const dot=button.querySelector<HTMLElement>('.pin-dot')!,label=button.querySelector<HTMLElement>('.pin-name')!;
              const names=group.ids.map(member=>mapVillages.find(village=>village.id===member)!.displayName);
              dot.textContent=cluster&&!hidden?`${group.ids.length}村`:loopRef.current?String(index+1):'';
              label.textContent=cluster&&!hidden?names.join('、'):mapVillages.find(village=>village.id===id)!.displayName;
              button.setAttribute('aria-label',cluster&&!hidden?`选择${group.ids.length}座古村：${names.join('、')}`:loopRef.current?`游览顺序${index+1}，查看${label.textContent}${index===0?'，浏览起点':''}`:`查看${label.textContent}`);
              // Hidden members remain at their real coordinates but cannot receive
              // pointer or keyboard input behind the group's representative button.
              button.style.visibility=hidden?'hidden':'visible';button.style.pointerEvents=hidden?'none':'';
            }
            const occupied=[...card.querySelectorAll<HTMLElement>('.map-heading span,.map-tools,.map-status,.map-attribution,.pin-dot,.boarding-dot,.poi-icon,.poi-name')].filter(el=>el.style.display!=='none'&&el.closest<HTMLElement>('.village-pin')?.dataset.villageGroupHidden!=='true').map(el=>el.getBoundingClientRect());
            const sorted=[...markers.current].sort((a,b)=>Number(b.getElement().dataset.villageId===chosen.current)-Number(a.getElement().dataset.villageId===chosen.current));
            for(const marker of sorted){
              const button=marker.getElement(), label=button.querySelector<HTMLElement>('.pin-name')!;
              label.style.display='block';label.style.transform='none';label.style.bottom='auto';label.style.right='auto';
              const pin=button.getBoundingClientRect(),labelBox=label.getBoundingClientRect(),w=labelBox.width,h=labelBox.height,x=pin.left+pin.width/2,y=pin.top+pin.height/2;
              // Off-screen map buttons must not become invisible keyboard stops.
              const visible=button.dataset.villageGroupHidden!=='true'&&x>=labelBounds.left&&x<=labelBounds.right&&y>=labelBounds.top&&y<=labelBounds.bottom;
              button.tabIndex=visible?0:-1;button.setAttribute('aria-hidden',String(!visible));button.style.visibility=visible?'visible':'hidden';
              if(!visible){label.style.display='none';continue;}
              const clearance=loopRef.current?25:18;
              const above=[x-w/2,y-clearance*scaleY-h],below=[x-w/2,y+clearance*scaleY],left=[x-clearance*scaleX-w,y-h/2],right=[x+clearance*scaleX,y-h/2];
              const primary=button.classList.contains('pin-2')?[above,left,right,below]:button.classList.contains('pin-3')?[right,below,left,above]:button.classList.contains('pin-4')?[below,left,right,above]:[left,above,below,right];
              const diagonal=[[x+12*scaleX,y-clearance*scaleY-h],[x-12*scaleX-w,y-clearance*scaleY-h],[x+12*scaleX,y+clearance*scaleY],[x-12*scaleX-w,y+clearance*scaleY]];
              const preferred=loopRef.current?[...primary,...diagonal].map(([lx,ly])=>[Math.max(labelBounds.left+4*scaleX,Math.min(lx,labelBounds.right-w-4*scaleX)),Math.max(labelBounds.top+4*scaleY,Math.min(ly,labelBounds.bottom-h-4*scaleY))]):primary;
              let placed=false;
              for(const [lx,ly] of preferred){
                const candidate={left:lx,top:ly,right:lx+w,bottom:ly+h};
                const edge=loopRef.current?3:6;
                if(candidate.left<labelBounds.left+edge*scaleX||candidate.right>labelBounds.right-edge*scaleX||candidate.top<labelBounds.top+edge*scaleY||candidate.bottom>labelBounds.bottom-edge*scaleY)continue;
                if(occupied.some(r=>candidate.left<r.right+3*scaleX&&candidate.right>r.left-3*scaleX&&candidate.top<r.bottom+3*scaleY&&candidate.bottom>r.top-3*scaleY))continue;
                label.style.left=`${(lx-pin.left)/scaleX}px`;label.style.top=`${(ly-pin.top)/scaleY}px`;occupied.push(candidate as DOMRect);placed=true;break;
              }
              if(!placed)label.style.display='none';
            }
          };
          layoutLabels.current();
          instance.on('move',()=>{layoutPois.current();layoutLabels.current();});instance.on('resize',()=>{layoutPois.current();layoutLabels.current();});
          instance.on('movestart',event=>{if(event.originalEvent)preserveCamera.current=true;});
          instance.on('moveend',()=>{fitRunning.current=false;layoutPois.current();layoutLabels.current();publishCamera();});
          void document.fonts.ready.then(()=>{if(!disposed){measureMapUi();if(!preserveCamera.current)fitCurrentScope.current(0);layoutPois.current();layoutLabels.current();}});
          publishCamera();
          setStatus('本地地理样本已载入');setReady(attempt+1);
        });
      } catch {fail('地图暂时无法显示，请使用下方古村列表。');clearTimeout(timeout);}
    }
    void start();
    let resizeFrame=0,lastWidth=0,lastHeight=0;
    const observer=new ResizeObserver(()=>{
      const width=container.current?.clientWidth??0,height=container.current?.clientHeight??0;
      if(width===lastWidth&&height===lastHeight)return;
      lastWidth=width;lastHeight=height;cancelAnimationFrame(resizeFrame);
      resizeFrame=requestAnimationFrame(()=>{map.current?.resize();if(mapLoaded.current&&!preserveCamera.current)fitCurrentScope.current(0);});
    });if(container.current)observer.observe(container.current);
    const typographyObserver=new MutationObserver(()=>{measureMapUi();if(mapLoaded.current&&!preserveCamera.current)fitCurrentScope.current(0);layoutPois.current();layoutLabels.current();});
    const app=container.current?.closest('.geography-app');if(app)typographyObserver.observe(app,{attributes:true,attributeFilter:['class','style']});
    const footerObserver=new ResizeObserver(()=>{measureMapUi();if(mapLoaded.current&&!preserveCamera.current)fitCurrentScope.current(0);layoutPois.current();layoutLabels.current();});
    const attribution=container.current?.parentElement?.querySelector('.map-attribution');if(attribution)footerObserver.observe(attribution);
    return()=>{publishCamera();disposed=true;mapLoaded.current=false;cancelAnimationFrame(resizeFrame);clearTimeout(timeout);clearTimeout(renderTimeout);abort.abort();observer.disconnect();typographyObserver.disconnect();footerObserver.disconnect();markers.current.forEach(m=>m.remove());stopMarkers.current.forEach(m=>m.remove());poiMarkers.current.forEach(m=>m.remove());markers.current=[];stopMarkers.current=[];poiMarkers.current.clear();instance?.remove();map.current=null;};
  },[attempt]);
  useEffect(()=>{markers.current.forEach(marker=>marker.getElement().setAttribute('aria-pressed',String(marker.getElement().dataset.villageId===selectedId)));layoutLabels.current();},[selectedId,ready,Boolean(onVillageGroupSelect)]);
  useEffect(()=>{container.current?.style.setProperty('--map-type-scale',large?'1.15':'1');layoutPois.current();layoutLabels.current();},[large]);
  useEffect(()=>{if(ready&&lastFitKey.current!==fitKey){lastFitKey.current=fitKey;preserveCamera.current=false;fitScope(reducedMotion?0:presentation==='scene'?720:380);}},[ready,fitKey]);
  useEffect(()=>{if(ready&&!preserveCamera.current)fitScope(0);layoutPois.current();layoutLabels.current();},[presentation,viewportInsets?.top,viewportInsets?.bottom,viewportInsets?.left,viewportInsets?.right]);
  useEffect(()=>{
    const instance=map.current;if(!ready||!instance||failed)return;
    (instance.getSource('travel-loop') as maplibregl.GeoJSONSource).setData(loopFeatureCollection(travelLoop));
    (instance.getSource('loop-directions') as maplibregl.GeoJSONSource).setData(loopDirectionCollection(travelLoop));
    for(const marker of markers.current){
      const button=marker.getElement(),index=travelLoop?.orderedVillageIds.indexOf(button.dataset.villageId??'')??-1,dot=button.querySelector<HTMLElement>('.pin-dot')!;
      dot.textContent=index>=0?String(index+1):'';button.classList.toggle('loop-village',index>=0);
      const village=mapVillages.find(item=>item.id===button.dataset.villageId)!;
      button.setAttribute('aria-label',index>=0?`游览顺序${index+1}，查看${village.displayName}${index===0?'，浏览起点':''}`:`查看${village.displayName}`);
    }
    if(scope==='loop'&&!preserveCamera.current)fitScope(0);
    layoutLabels.current();
  },[ready,travelLoop,failed]);
  useEffect(()=>{
    const instance=map.current;if(!ready||!instance||failed)return;
    const available=scope==='village'?visiblePois():[];
    const collection:FeatureCollection={type:'FeatureCollection',features:available.map(poi=>({type:'Feature',properties:{id:poi.id,villageId:poi.villageId,category:poi.category},geometry:{type:'Point',coordinates:poi.normalizedCoordinate!}}))};
    (instance.getSource('village-pois') as maplibregl.GeoJSONSource).setData(collection);
    layoutPois.current();layoutLabels.current();
  },[ready,pois,scope,selectedId,selectedPoiId,failed]);
  useEffect(()=>{
    const instance=map.current;if(!ready||!instance||failed)return;
    for(const layer of mapStyle([emptyCollection,emptyCollection,emptyCollection],[emptyCollection,emptyCollection,emptyCollection],presentation).layers){
      if(!instance.getLayer(layer.id))continue;
      if('paint' in layer&&layer.paint)for(const [name,value] of Object.entries(layer.paint))instance.setPaintProperty(layer.id,name as Parameters<maplibregl.Map['setPaintProperty']>[1],value);
      if(layer.id==='county-edge')instance.setLayoutProperty(layer.id,'visibility',presentation==='scene'?'none':'visible');
      instance.setLayerZoomRange(layer.id,layer.minzoom??0,layer.maxzoom??24);
    }
  },[ready,presentation,failed]);
  useEffect(()=>{
    const instance=map.current;if(!ready||!instance||failed||!instance.getLayer('building-models'))return;
    instance.setLayoutProperty('building-models','visibility',depth==='relief'?'visible':'none');
    instance.setPaintProperty('building-footprints','fill-opacity',depth==='relief'?.55:.92);
    // A second tap during a scope transition must not strand the camera in the old county view.
    if(fitRunning.current){fitScope(reducedMotion?0:presentation==='scene'?720:320);return;}
    // Comparison changes only pitch; preserve center and zoom.
    if(Math.abs(instance.getPitch()-(depth==='relief'?42:0))>.01)instance.easeTo({pitch:depth==='relief'?42:0,duration:reducedMotion?0:320});
  },[ready,depth,reducedMotion,failed]);
  useEffect(()=>{
    const instance=map.current;if(!ready||!instance||failed)return;
    const geometry=route?.geometry;
    const proposal:FeatureCollection=geometry&&scope!=='county'?{type:'FeatureCollection',features:[{type:'Feature',properties:{status:'research-only'},geometry}]}:emptyCollection;
    const source=instance.getSource('proposal') as maplibregl.GeoJSONSource|undefined;if(!source)return;source.setData(proposal);
    stopMarkers.current.forEach(marker=>marker.remove());
    stopMarkers.current=scope==='county'?[]:boardingPoints.map(point=>{
      const element=document.createElement('span');element.className='boarding-marker';element.dataset.boardingId=point.id;
      element.setAttribute('role','img');element.setAttribute('aria-label',`${point.name}，${point.status==='verified'?'已核验上下客点':'道路参考点，未核验'}`);
      element.title=`${point.name} · ${point.status==='verified'?'已核验':'道路参考点，未核验'}`;
      const dot=document.createElement('span');dot.className='boarding-dot';dot.textContent='◇';dot.setAttribute('aria-hidden','true');element.append(dot);
      return new maplibregl.Marker({element,anchor:'center',pitchAlignment:'viewport'}).setLngLat(point.coordinates).addTo(instance);
    });layoutLabels.current();
  },[ready,route,scope,boardingPoints,failed]);
  const selectedName=mapVillages.find(v=>v.id===selectedId)?.displayName??'古村';
  const detailNote=detailState==='unavailable'?'局部数据未载入':scope==='village'?(buildingCounts[selectedId]?'建筑高度为示意 · 平面地形':'暂无建筑轮廓 · 平面地形'):depth==='relief'?'轻立体视角 · 平面地形':'村落点 · 非车站';
  return <section className={`map-card map-${presentation} depth-${depth} ${failed?'map-failed':''}`} aria-label={`宁海县古村${depth==='relief'?'轻立体':'平面'}地图`} data-selected-village-id={selectedId} data-map-scope={scope} data-map-depth={depth} data-map-presentation={presentation} data-buildings-available={buildingCounts[selectedId]??0}>
    <div className="map-canvas" ref={container}/>
    {presentation==='card'&&<div className="map-heading"><span>{scope==='village'?selectedName:scopeNames[scope]}</span><span>北 ↑</span></div>}
    {failed?<div className="map-message" role="status"><strong>{presentation==='scene'?'地图暂未加载':'古村列表仍可使用'}</strong><p>{status}</p><button onClick={()=>{onDepthChange?.('flat');setAttempt(a=>a+1);}}>{presentation==='scene'?'重新加载地图':'重新载入平面地图'}</button></div>:presentation==='card'&&<>
      <div className="map-tools" aria-label="地图操作"><button aria-label="放大地图" onClick={()=>map.current?.zoomIn({duration:reducedMotion?0:220})}>＋</button><button aria-label="缩小地图" onClick={()=>map.current?.zoomOut({duration:reducedMotion?0:220})}>−</button><button aria-label="恢复北向与当前范围" onClick={()=>fitScope(reducedMotion?0:320)}>复位</button></div>
      <span className="map-status" role="status">{!ready?status:detailNote}</span>
    </>}
    <div className="map-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a><span>ODbL · 本地样本</span></div>
  </section>;
}
