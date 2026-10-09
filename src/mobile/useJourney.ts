import { useEffect, useState } from 'react';
import type { RouteResearch } from '../geography/routeTypes';
import { createSavedJourney, JOURNEY_STORAGE_KEY, readJourneyStorage, serializeJourneyStorage, setJourneyDirection, validateRouteResearch } from './journey';

export const JOURNEY_STORE = JOURNEY_STORAGE_KEY;
function readStoredJourney() {
  try { return readJourneyStorage(localStorage.getItem(JOURNEY_STORE), localStorage.getItem('baixi.mobile.v2'), localStorage.getItem('xiangxu.local-plan')); }
  catch { return readJourneyStorage(null, null); }
}

export function useJourney(load: boolean) {
  const [initial] = useState(readStoredJourney);
  const [journey, setJourney] = useState(initial.journey);
  const [savedPlan, setSavedPlan] = useState(initial.savedPlan);
  const [research, setResearch] = useState<RouteResearch | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [attempt, setAttempt] = useState(0);
  const enabled = load || journey.mode === 'research';

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let disposed = false;
    const timer = setTimeout(() => controller.abort(), 10000);
    setStatus('loading'); setResearch(null);
    void fetch(import.meta.env.BASE_URL + 'geography/route-research.json', { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Road research unavailable'); return response.json(); })
      .then(value => {
        const data = validateRouteResearch(value);
        if (disposed) return;
        setResearch(data); setStatus('ready');
        setJourney(current => setJourneyDirection(current, current.direction, data));
      })
      .catch(() => { if (!disposed) { setStatus('error'); setResearch(null); } })
      .finally(() => clearTimeout(timer));
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [enabled, attempt]);

  function savePlan() {
    const plan = createSavedJourney(journey, research, new Date().toISOString());
    if (!plan) return { ok: false, message: '请先选择两个不同的古村。' };
    try {
      const legacyDemoReturn = readJourneyStorage(null, localStorage.getItem('baixi.mobile.v2')).legacyDemoReturn;
      localStorage.setItem(JOURNEY_STORE, serializeJourneyStorage(journey, plan, legacyDemoReturn));
      setSavedPlan(plan);
      return { ok: true, message: '研究计划已保存到本机，站点与班次仍待核验。' };
    } catch { return { ok: false, message: '本机未能保存计划，当前选择仅在本次打开期间保留。' }; }
  }
  function removePlan() {
    try {
      const legacyDemoReturn = readJourneyStorage(null, localStorage.getItem('baixi.mobile.v2')).legacyDemoReturn;
      localStorage.setItem(JOURNEY_STORE, serializeJourneyStorage(journey, null, legacyDemoReturn));
      setSavedPlan(null);
      return { ok: true, message: '已移除本地研究计划。' };
    } catch { return { ok: false, message: '未能移除本地计划，请稍后重试。' }; }
  }
  return { journey, setJourney, research, status, savedPlan, savePlan, removePlan, retry: () => setAttempt(value => value + 1) };
}
