import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapVillages, boardingPoints, services } from '../src/data/villages.ts';
import {
  JOURNEY_STORAGE_KEY, createJourney, selectJourneyVillage, openResearch,
  chooseJourneyDestination, setJourneyDirection, journeyEndpoints, findJourneyRoute,
  validateRouteResearch, createSavedJourney, readJourneyStorage, serializeJourneyStorage,
} from '../src/mobile/journey.ts';
import type { JourneyState, SavedJourney, LegacyDemoReturn } from '../src/mobile/journey.ts';

const rawData: unknown = JSON.parse(readFileSync('public/geography/route-research.json','utf8'));
const research = validateRouteResearch(rawData);
const savedAt = '2026-10-09T09:20:00.000Z';
const selectedPair = () => chooseJourneyDestination(openResearch(createJourney('xujiashan')), 'longgong', research);
const clone = () => structuredClone(research);

test('all twenty sourced directed village pairs adapt without inventing endpoints', () => {
  let checked = 0;
  for (const origin of mapVillages) for (const destination of mapVillages) {
    if (origin.id === destination.id) continue;
    const initial = openResearch(createJourney(origin.id));
    assert.equal(initial.destinationVillageId, null);
    const state = chooseJourneyDestination(initial,destination.id,research);
    const route = findJourneyRoute(state,research)!;
    assert.equal(state.originVillageId,origin.id); assert.equal(state.destinationVillageId,destination.id);
    assert.equal(state.routeProposalId,route.id);
    assert.deepEqual(journeyEndpoints(state),{fromVillageId:origin.id,toVillageId:destination.id});
    assert.equal(route.fromVillageId,origin.id); assert.equal(route.toVillageId,destination.id);
    assert.equal(route.estimatedDurationSeconds,null); assert.equal(route.operatingStatus,'research-not-confirmed');
    const point = research.suggestions.find(point => point.id === route.fromSuggestionId)!;
    assert.equal(point.accessConnectionStatus,'unknown'); assert.equal(point.status,'suggested-unverified');
    assert.deepEqual(route.coordinates![0],point.coordinates);
    assert.notDeepEqual(point.coordinates,origin.normalizedCoordinate);
    checked++;
  }
  assert.equal(checked,20); assert.deepEqual(boardingPoints,[]); assert.deepEqual(services,[]);
});

test('return uses the independent reverse record and keeps canonical origin/destination', () => {
  const outbound = selectedPair(), back = setJourneyDirection(outbound,'return',research);
  assert.equal(findJourneyRoute(outbound,research)!.distanceMeters,41888);
  assert.equal(findJourneyRoute(back,research)!.distanceMeters,58175);
  assert.equal(back.originVillageId,outbound.originVillageId);
  assert.equal(back.destinationVillageId,outbound.destinationVillageId);
  assert.deepEqual(journeyEndpoints(back),{fromVillageId:'longgong',toVillageId:'xujiashan'});
  assert.equal(back.routeProposalId,'longgong-xujiashan');
  assert.notDeepEqual(findJourneyRoute(back,research)!.coordinates,findJourneyRoute(outbound,research)!.coordinates!.slice().reverse());
  assert.equal(setJourneyDirection(back,'outbound',research).routeProposalId,'xujiashan-longgong');
  assert.equal(chooseJourneyDestination(back,'ruoao',research).direction,'outbound');
});

test('new village clears the draft, same village preserves explicit user choices', () => {
  const before = selectedPair();
  assert.equal(selectJourneyVillage(before,'xujiashan'),before);
  assert.equal(openResearch(before),before);
  const next = selectJourneyVillage(before,'qingtan');
  assert.equal(next.selectedVillageId,'qingtan'); assert.equal(next.originVillageId,'qingtan');
  assert.equal(next.destinationVillageId,null); assert.equal(next.routeProposalId,null); assert.equal(next.direction,'outbound');
  assert.equal(selectJourneyVillage(before,'liyang'),before);
  assert.equal(chooseJourneyDestination(before,'xujiashan',research),before);
  assert.equal(chooseJourneyDestination(before,'not-a-village',research),before);
  assert.equal(createJourney('qiantong').selectedVillageId,'xujiashan');
});

test('entering research never guesses a destination or maps an old demo station to a village', () => {
  const initial = createJourney();
  assert.equal(initial.mode,'demo'); assert.equal(initial.originVillageId,null);
  assert.deepEqual(journeyEndpoints(initial),{fromVillageId:null,toVillageId:null});
  const opened = openResearch(initial);
  assert.equal(opened.originVillageId,initial.selectedVillageId); assert.equal(opened.destinationVillageId,null);
  assert.equal(findJourneyRoute(opened,research),null);
  assert.equal(createSavedJourney(opened,research,savedAt),null);
  assert.equal(setJourneyDirection(initial,'return',research),initial);
});

test('missing route and missing reverse remain unavailable without reversing another line', () => {
  const partial = clone();
  partial.routes = partial.routes.filter(route => route.id !== 'longgong-xujiashan');
  validateRouteResearch(partial);
  const back = setJourneyDirection(selectedPair(),'return',partial);
  assert.equal(back.routeProposalId,null); assert.equal(findJourneyRoute(back,partial),null);
  const plan = createSavedJourney(back,partial,savedAt)!;
  assert.equal(plan.routeStatus,'unavailable'); assert.equal(plan.dataVersion,research.version);
  assert.equal(plan.routeProposalId,null); assert.equal(plan.operatingStatus,'research-not-confirmed');
  assert.equal(plan.direction,'return');
});

test('an explicit no-path record preserves its reason and can be saved only as unavailable', () => {
  const data = clone(), route = data.routes.find(route => route.id === 'xujiashan-longgong')!;
  Object.assign(route,{geometryStatus:'unavailable',coordinates:null,nodeIds:[],wayIds:[],distanceMeters:null,unavailableReason:'样本缺少连通道路'});
  validateRouteResearch(data);
  const state = chooseJourneyDestination(openResearch(createJourney()),'longgong',data);
  assert.equal(findJourneyRoute(state,data)!.unavailableReason,'样本缺少连通道路');
  assert.equal(findJourneyRoute(state,data)!.distanceMeters,null);
  assert.equal(createSavedJourney(state,data,savedAt)!.routeStatus,'unavailable');
});

test('offline intentions keep null version and route ID; incomplete or invalid plans are not saved', () => {
  const state = selectedPair(), plan = createSavedJourney(state,null,savedAt)!;
  assert.equal(plan.routeStatus,'data-unavailable'); assert.equal(plan.dataVersion,null); assert.equal(plan.routeProposalId,null);
  assert.equal(plan.destinationVillageId,'longgong');
  assert.equal(createSavedJourney(createJourney(),null,savedAt),null);
  assert.equal(createSavedJourney({...state,destinationVillageId:state.originVillageId},research,savedAt),null);
  assert.equal(createSavedJourney(state,research,'2026-02-30T09:00:00Z'),null);
  assert.equal(createSavedJourney(state,research,'2026-10-09T25:00:00Z'),null);
  assert.equal(createSavedJourney(state,research,'yesterday'),null);
});

test('null sourced distance remains unknown rather than becoming zero or a travel time', () => {
  const data = clone(), record = data.routes.find(route => route.id === 'xujiashan-longgong')!;
  record.distanceMeters = null;
  validateRouteResearch(data);
  const route = findJourneyRoute(selectedPair(),data)!;
  assert.equal(route.distanceMeters,null); assert.equal(route.estimatedDurationSeconds,null);
  assert.equal(createSavedJourney(selectedPair(),data,savedAt)!.routeStatus,'source-road-geometry');
});

test('runtime dataset rejects invented ETA, formal station status, fake geometry and conflicting relationships', () => {
  const mutations: ((value: Record<string, any>) => void)[] = [
    value => { value.routes[0].estimatedDurationSeconds = 1800; },
    value => { value.routes[0].operatingStatus = 'confirmed'; },
    value => { value.suggestions[0].status = 'verified'; },
    value => { value.suggestions[0].accessConnectionStatus = 'verified'; },
    value => { value.suggestions[0].coordinates = [0,0]; },
    value => { value.routes[0].coordinates[0] = [121,29]; },
    value => { value.routes[0].coordinates[0] = [29,121]; },
    value => { value.routes[0].nodeIds = []; },
    value => { value.routes[0].distanceMeters = -1; },
    value => { value.routes[0].distanceMeters = Infinity; },
    value => { value.routes[0].fromVillageId = 'liyang'; },
    value => { value.routes[0].fromSuggestionId = value.routes[0].toSuggestionId; },
    value => { value.routes.push({...value.routes[0],id:'duplicate-pair'}); },
    value => { value.suggestions.push({...value.suggestions[0]}); },
    value => { value.routes[0].geometryStatus = 'unavailable'; },
    value => { value.routes[0].retrievedAt = 'invalid'; },
    value => { value.license = 'unknown'; },
    value => { value.checkedAt = '2026-02-30'; },
  ];
  for (const mutate of mutations) {
    const value = structuredClone(rawData) as Record<string, any>;
    mutate(value);
    assert.throws(() => validateRouteResearch(value),/道路研究资料无效/);
  }
  for (const value of [null,[],{},'dataset',true,42]) assert.throws(() => validateRouteResearch(value));
});

test('persisted route ID is never used to choose another pair or direction', () => {
  const inconsistent = {...selectedPair(),routeProposalId:'qingtan-ruoao'};
  assert.equal(findJourneyRoute(inconsistent,research)!.id,'xujiashan-longgong');
  assert.equal(createSavedJourney(inconsistent,research,savedAt)!.routeProposalId,'xujiashan-longgong');
});

test('new storage round trips the research state, data version and direction independently from preferences', () => {
  const state = setJourneyDirection(selectedPair(),'return',research);
  const saved = createSavedJourney(state,research,savedAt)!;
  const demo: LegacyDemoReturn = {kind:'demo-return',time:'18:00'};
  const raw = serializeJourneyStorage(state,saved,demo), restored = readJourneyStorage(raw,null);
  assert.equal(JOURNEY_STORAGE_KEY,'xiangxu.journey.v1');
  assert.deepEqual(restored,{journey:state,savedPlan:saved,legacyDemoReturn:demo});
  const envelope = JSON.parse(raw);
  assert.equal(envelope.schemaVersion,1); assert.equal(envelope.kind,'journey-storage');
  assert.equal(envelope.savedPlan.kind,'research-plan'); assert.equal(envelope.savedPlan.dataVersion,research.version);
  assert.equal('size' in envelope,false); assert.equal('savedReturn' in envelope,false);
  assert.equal('coordinates' in envelope.savedPlan,false); assert.equal('estimatedDurationSeconds' in envelope.savedPlan,false);
});

test('legacy display preferences stay intact and an old time only migrates as a demo return', () => {
  const prefs = {size:'L',regularSize:'M',senior:true,favorite:true,quiet:true,savedReturn:'18:30'};
  const raw = JSON.stringify(prefs), restored = readJourneyStorage(null,raw);
  assert.deepEqual(restored.legacyDemoReturn,{kind:'demo-return',time:'18:30'});
  assert.equal(restored.savedPlan,null); assert.equal(restored.journey.originVillageId,null);
  assert.deepEqual(JSON.parse(raw),prefs);
  const output = serializeJourneyStorage(restored.journey,restored.savedPlan,restored.legacyDemoReturn);
  assert.deepEqual(Object.keys(JSON.parse(output).legacyDemoReturn).sort(),['kind','time']);
  assert.equal(output.includes('18:30'),true);
  assert.equal('size' in JSON.parse(output),false);
});

test('legacy research plan keeps its original version/date while awaiting current geometry validation', () => {
  const legacy = {from:'xujiashan',to:'longgong',direction:'return',dataVersion:'older-road-sample-v1',savedAt,operatingStatus:'research-not-confirmed'};
  const restored = readJourneyStorage(null,null,JSON.stringify(legacy));
  assert.equal(restored.savedPlan!.dataVersion,'older-road-sample-v1');
  assert.equal(restored.savedPlan!.savedAt,savedAt);
  assert.equal(restored.savedPlan!.routeStatus,'data-unavailable');
  assert.equal(restored.savedPlan!.routeProposalId,null);
  assert.equal(restored.journey.originVillageId,'xujiashan');
  assert.equal(restored.journey.destinationVillageId,'longgong');
  assert.equal(findJourneyRoute(restored.journey,research)!.id,'longgong-xujiashan');
  assert.notEqual(restored.savedPlan!.dataVersion,research.version);
  assert.deepEqual(readJourneyStorage(serializeJourneyStorage(restored.journey,restored.savedPlan,null),null),restored);
});

test('broken saved-plan fields safely degrade and do not overwrite or reinterpret old preference values', () => {
  const state = selectedPair(), saved = createSavedJourney(state,research,savedAt)!;
  const changes: Record<string,unknown>[] = [
    {originVillageId:'unknown'}, {destinationVillageId:'xujiashan'}, {selectedVillageId:'liyang'},
    {direction:'backwards'}, {mode:'demo'}, {routeProposalId:'bad route id'},
    {dataVersion:7}, {dataVersion:null}, {savedAt:'2026-02-30T00:00:00Z'}, {savedAt:'invalid'},
    {routeStatus:'operating'}, {kind:'bus-ticket'}, {schemaVersion:2}, {operatingStatus:'confirmed'},
  ];
  for (const change of changes) {
    const raw = JSON.stringify({schemaVersion:1,kind:'journey-storage',journey:state,savedPlan:{...saved,...change}});
    const result = readJourneyStorage(raw,JSON.stringify({size:'L',senior:true,savedReturn:'17:30'}));
    assert.equal(result.savedPlan,null);
    assert.deepEqual(result.legacyDemoReturn,{kind:'demo-return',time:'17:30'});
    assert.deepEqual(result.journey,state);
  }
  for (const raw of ['{broken','null','[]','42','true',JSON.stringify({schemaVersion:999})]) {
    const result = readJourneyStorage(raw,'{broken');
    assert.deepEqual(result,{journey:createJourney(),savedPlan:null,legacyDemoReturn:null});
  }
});

test('deleted current plans do not resurrect legacy plans, and removed demo times stay removed', () => {
  const legacy = JSON.stringify({from:'xujiashan',to:'longgong',direction:'outbound',dataVersion:research.version,savedAt,operatingStatus:'research-not-confirmed'});
  const raw = serializeJourneyStorage(createJourney(),null,{kind:'demo-return',time:'17:30'});
  const restored = readJourneyStorage(raw,JSON.stringify({savedReturn:null}),legacy);
  assert.equal(restored.savedPlan,null); assert.equal(restored.legacyDemoReturn,null);
  assert.equal(restored.journey.mode,'demo');
});

test('serializer discards unrecognized fields and invalid state without modifying its inputs', () => {
  const valid = selectedPair(), saved = createSavedJourney(valid,research,savedAt)!;
  const state = {...valid,extra:'not part of storage'};
  const withExtra = {...saved,operator:'unverified operator',departure:'17:30'};
  const raw = serializeJourneyStorage(state,withExtra,null);
  assert.equal(raw.includes('not part of storage'),false); assert.equal(raw.includes('17:30'),false);
  assert.equal(state.extra,'not part of storage');
  assert.equal(withExtra.departure,'17:30');
  const bad = {...valid,direction:'invalid'} as unknown as JourneyState;
  const badPlan = {...saved,kind:'ticket'} as unknown as SavedJourney;
  const restored = readJourneyStorage(serializeJourneyStorage(bad,badPlan,null),null);
  assert.deepEqual(restored,{journey:createJourney(),savedPlan:null,legacyDemoReturn:null});
});
