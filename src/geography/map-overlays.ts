import type { FeatureCollection, MapCameraSnapshot } from './map-depth.ts';
import { hasClosedTravelLoop, type TravelLoop } from './travelLoop.ts';

export type ScreenPoi = { id:string; x:number; y:number };
/** Cluster intersecting 48px touch squares without changing any geographic coordinates. */
export function clusterScreenPois(points:ScreenPoi[], touchSize=48):ScreenPoi[][] {
  const parents=points.map((_,index)=>index);
  const find=(index:number):number=>parents[index]===index?index:(parents[index]=find(parents[index]));
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
    if(Math.abs(points[i].x-points[j].x)<touchSize&&Math.abs(points[i].y-points[j].y)<touchSize)parents[find(j)]=find(i);
  }
  const groups=new Map<number,ScreenPoi[]>();
  points.forEach((point,index)=>{const root=find(index),group=groups.get(root)??[];group.push(point);groups.set(root,group);});
  return [...groups.values()];
}

export function isCameraSnapshot(value:MapCameraSnapshot|null|undefined):value is MapCameraSnapshot {
  return !!value&&value.center.length===2&&value.center.every(Number.isFinite)&&Math.abs(value.center[0])<=180&&Math.abs(value.center[1])<90&&Number.isFinite(value.zoom)&&value.zoom>=5&&value.zoom<=18&&Number.isFinite(value.bearing)&&Number.isFinite(value.pitch)&&value.pitch>=0&&value.pitch<=48&&(!value.padding||Object.values(value.padding).every(part=>Number.isFinite(part)&&part>=0));
}

/** An incomplete export retains its individual proven roads; it never joins missing ends. */
export function loopFeatureCollection(loop:TravelLoop|null|undefined):FeatureCollection {
  if(!loop)return {type:'FeatureCollection',features:[]};
  const geometries=hasClosedTravelLoop(loop)?[loop.geometry]:loop.segments.filter(segment=>segment.coordinates.length>=2).map(segment=>({type:'LineString' as const,coordinates:segment.coordinates}));
  return {type:'FeatureCollection',features:geometries.map(geometry=>({type:'Feature',properties:{status:loop.status,closureStatus:loop.closureStatus},geometry}))};
}

/** One static arrow at an actual source vertex per directed segment; no artificial closing line. */
export function loopDirectionCollection(loop:TravelLoop|null|undefined):FeatureCollection {
  if(!loop)return {type:'FeatureCollection',features:[]};
  return {type:'FeatureCollection',features:loop.segments.flatMap(segment=>{
    const points=segment.coordinates;if(points.length<2)return [];
    const lengths=points.slice(1).map((point,index)=>Math.hypot((point[0]-points[index][0])*Math.cos(point[1]*Math.PI/180),point[1]-points[index][1]));
    const half=lengths.reduce((sum,value)=>sum+value,0)/2;let length=0,index=0;
    while(index<lengths.length-1&&length+lengths[index]<half){length+=lengths[index];index++;}
    const from=points[index],to=points[index+1];
    const bearing=Math.atan2((to[0]-from[0])*Math.cos(from[1]*Math.PI/180),to[1]-from[1])*180/Math.PI;
    return [{type:'Feature' as const,properties:{bearing,segmentId:segment.id},geometry:{type:'Point' as const,coordinates:from}}];
  })};
}
