import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO, demoService, getPage } from '../src/data/demo.ts';
import { defaults, loadPreferences, parsePreferences, savePreferences } from '../src/services/preferences.ts';

test('去返方向、站序、目的地与关联回程一致，时间有序', () => {
  const outbound = demoService.getJourney('outbound');
  const inbound = demoService.getJourney('inbound');
  assert.deepEqual(outbound.stops.map(stop => stop.id), inbound.stops.map(stop => stop.id).reverse());
  for (const journey of [outbound, inbound]) {
    assert.ok(journey.departure > DEMO.clock);
    assert.ok(journey.arrival > journey.departure);
    assert.ok(journey.relatedReturn.departure > journey.arrival);
    assert.equal(journey.relatedReturn.from, journey.stops[1].name);
    assert.ok(journey.stops.every(stop => stop.name.includes('示例') && stop.status === 'unverified'));
  }
});

test('损坏、旧版本和不合法本地数据安全降级', () => {
  for (const value of [null, '', '{bad', 'null', '[]', '42', '{"version":2}']) assert.deepEqual(parsePreferences(value), defaults);
  assert.deepEqual(parsePreferences('{"version":1,"fontSize":"tiny","favorites":["outbound","unknown","outbound",0]}'), { version: 1, fontSize: 'standard', favorites: ['outbound'] });
});

test('保存与恢复大字和收藏，存储异常不报成功', () => {
  let value: string | null = null;
  const store = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
  const prefs = { ...defaults, fontSize: 'large' as const, favorites: ['outbound' as const] };
  assert.equal(savePreferences(prefs, store), true);
  assert.deepEqual(loadPreferences(store).preferences, prefs);
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
  assert.equal(savePreferences(prefs, broken), false);
  assert.equal(loadPreferences(broken).error, true);
});

test('页面直达与未知地址有安全回退', () => {
  assert.equal(getPage('#/return'), 'return');
  assert.equal(getPage('#/town'), 'town');
  assert.equal(getPage('#/help'), 'help');
  assert.equal(getPage('#/unknown'), 'ride');
});

test('设计文字和控件配色满足本轮对比度目标', () => {
  function luminance(hex: string) {
    const rgb = hex.match(/\w\w/g)!.map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  }
  for (const [front, back, minimum] of [
    ['34383A', 'F4F0E6', 7], ['606765', 'EDE9DD', 4.5], ['606765', 'F4F0E6', 4.5],
    ['FFFFFF', '355B5A', 7], ['FFFFFF', '5D7877', 4.5], ['FFFFFF', '9A6A49', 4.5], ['7C523B', 'F4F0E6', 4.5],
  ] as const) {
    const a = luminance(front), b = luminance(back);
    const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    assert.ok(ratio >= minimum, `${front}/${back}: ${ratio.toFixed(2)} < ${minimum}`);
  }
});
