export type Direction = 'outbound' | 'inbound';
export type Page = 'ride' | 'return' | 'town' | 'help';
export type FontSize = 'standard' | 'large';

export interface DemoStop { id: string; name: string; status: 'unverified'; }
export interface DemoJourney {
  id: Direction;
  destination: string;
  directionLabel: string;
  stops: DemoStop[];
  departure: string;
  arrival: string;
  relatedReturn: { departure: string; from: string; destination: string };
}

const city: DemoStop = { id: 'city', name: '宁海城区换乘点（示例）', status: 'unverified' };
const town: DemoStop = { id: 'town', name: '前童古镇接驳点（示例）', status: 'unverified' };

// Only two explicitly fictitious concept stops, not an official bus route.
export const DEMO = {
  date: '2026-09-29',
  dateLabel: '2026年9月29日',
  clock: '09:20',
  updatedAt: '2026-09-29 09:20',
  label: '演示数据',
  notice: '站点与班次尚未核实，请勿作为实际乘车依据。',
  service: { network: 'local-only', location: 'not-requested', prediction: 'unavailable', operation: 'demo' },
  asset: { platformPhoto: null, source: '未提供站台照片', rights: '待采集与核验' },
} as const;

const journeys: Record<Direction, DemoJourney> = {
  outbound: {
    id: 'outbound', destination: '前童古镇', directionLabel: '去古镇',
    stops: [city, town], departure: '09:30', arrival: '10:10',
    relatedReturn: { departure: '16:30', from: town.name, destination: '宁海城区' },
  },
  inbound: {
    id: 'inbound', destination: '宁海城区', directionLabel: '回城区',
    stops: [town, city], departure: '10:30', arrival: '11:10',
    relatedReturn: { departure: '15:00', from: city.name, destination: '前童古镇' },
  },
};

export const demoService = {
  getJourney: (direction: Direction): DemoJourney => journeys[direction],
};

export const pages: { id: Page; label: string }[] = [
  { id: 'ride', label: '乘车' }, { id: 'return', label: '返程' },
  { id: 'town', label: '古镇' }, { id: 'help', label: '帮助' },
];

export function getPage(hash: string): Page {
  const id = hash.replace(/^#\/?/, '');
  return pages.some(page => page.id === id) ? id as Page : 'ride';
}
