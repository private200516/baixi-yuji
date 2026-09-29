import type { CSSProperties } from 'react';

export type GlyphName = 'bus' | 'back' | 'scan' | 'town' | 'help' | 'pin' | 'arrow' | 'swap' | 'star' | 'close' | 'clock' | 'volume' | 'check' | 'ticket' | 'refresh' | 'chevron' | 'search' | 'walk' | 'sun' | 'bell' | 'heart' | 'settings';
const paths: Record<GlyphName, React.ReactNode> = {
  settings: <><path d="m10 3-.6 2.2-2 .9-2-.7-2 3.3 1.5 1.6v2.4L3.4 14l2 3.3 2-.6 2 .9.6 2.4h4l.6-2.4 2-.9 2 .6 2-3.3-1.5-1.3v-2.4l1.5-1.6-2-3.3-2 .7-2-.9L14 3Z"/><circle cx="12" cy="11.5" r="3"/></>,
  bus: <><rect x="5" y="3" width="14" height="16" rx="4"/><path d="M5 11h14M8 19v2m8-2v2M9 6h6M8 15h1m6 0h1"/></>,
  back: <path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12h-3"/>,
  scan: <><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3M3 12h18"/></>,
  town: <><path d="m2 11 10-7 10 7M4 11v9h16v-9M9 20v-6h6v6M8 7V4h8v3"/></>,
  help: <><path d="M4 14v-3a8 8 0 0 1 16 0v3M19 17c0 4-4 4-7 4"/><rect x="2" y="11" width="4" height="7" rx="2"/><rect x="18" y="11" width="4" height="7" rx="2"/></>,
  pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  swap: <path d="M3 8h17l-4-4M21 16H4l4 4"/>,
  star: <path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
  volume: <><path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  ticket: <><path d="M3 4h18v5a3 3 0 0 0 0 6v5H3v-5a3 3 0 0 0 0-6V4Z"/><path d="M9 7v2m0 3v1m0 3v1m4-9h4m-4 4h4m-4 4h4"/></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 7a8 8 0 0 1 13-2l2 3M4 16l2 3a8 8 0 0 0 13-2"/></>,
  chevron: <path d="m9 5 7 7-7 7"/>,
  search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
  walk: <><circle cx="13" cy="4" r="2"/><path d="m9 21 3-7-3-4 3-3 4 5h4M4 13l5-3M12 14l5 7"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 8-3 8-3 10h18c0-2-3-2-3-10M9 21h6"/></>,
  heart: <path d="M20 5c-3-3-7-1-8 2-1-3-5-5-8-2-5 5 1 10 8 16 7-6 13-11 8-16Z"/>,
};
export function Glyph({ name, className = '' }: { name: GlyphName; className?: string }) {
  return <svg className={`glyph ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export function TransitMark() {
  return <svg className="transit-mark" viewBox="0 0 70 44" fill="currentColor" aria-hidden="true"><rect x="4" y="-3" width="16" height="48" rx="8" transform="rotate(42 20 22)"/><rect x="30" y="7" width="16" height="36" rx="8" transform="rotate(42 38 25)"/><path d="M58 23c5-5 11-1 11 5v8c0 5-3 7-7 7h-7c-6 0-8-6-4-10Z"/></svg>;
}
export function RiverMark() {
  return <svg className="river-mark" viewBox="0 0 68 66" aria-hidden="true"><circle cx="42" cy="9" r="7" fill="#b75135"/><path d="M4 28C11 12 20 17 31 26c12 8 22-12 29-4 9 10 5 29-3 35C32 73 1 56 4 28Z" fill="#527d7a"/><path d="M6 38c14-4 28-2 46-10-9 8-31 12-28 15 9 5 22 8 36 12C42 58 31 43 6 38Z" fill="#f4f1e7"/></svg>;
}
export function DotLandscape() {
  return <svg className="dot-landscape" viewBox="0 0 320 108" aria-hidden="true">{Array.from({ length: 11 }, (_, row) => Array.from({ length: 30 }, (_, col) => {
    const height = col < 11 ? 4 + Math.sin(col / 3) * 2 : col < 18 ? 7 : 10 - Math.abs(col - 25) * .9;
    if (10 - row > height || (row === 10 && (col < 4 || (col > 12 && col < 20)))) return null;
    return <circle key={`${row}-${col}`} cx={7 + col * 10.5} cy={7 + row * 9} r="2.65" fill={(row * 3 + col * 7) % 13 < 3 ? '#719793' : (row === 1 && col === 25 ? '#bb4c33' : '#f4f1e7')} style={{ '--dot-delay': `${(col * 24 + row * 34)}ms` } as CSSProperties}/>;
  }))}</svg>;
}
export function RouteRiver({ stops, reversed = false }: { stops: string[]; reversed?: boolean }) {
  const points = [[20, 102], [115, 102], [210, 80], [304, 28]];
  return <svg className={`route-river ${reversed ? 'reversed' : ''}`} viewBox="0 0 324 157" role="img" aria-label={`线路示意：${stops.join('、')}`}>
    <path className="route-track" d="M20 102C55 102 48 83 115 102S171 80 210 80 256 28 304 28"/>
    <path className="route-draw" d="M20 102C55 102 48 83 115 102S171 80 210 80 256 28 304 28"/>
    <circle className="route-moving" r="5" fill="#e2ba86"/>
    {points.map(([x,y], i) => <g key={stops[i]}><circle cx={x} cy={y} r={i === 0 || i === 3 ? 9 : 6} fill={i === 0 || i === 3 ? '#507673' : '#f4f1e7'} stroke="#f4f1e7" strokeWidth={i === 0 ? 3 : 2}/><text x={x} y={y + 29} textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}>{stops[i]}</text></g>)}
    <g className="route-bus" transform="translate(59 58)"><rect x="-13" y="-12" width="26" height="26" rx="9" fill="#f4f1e7"/><path d="m-3 14 3 4 3-4" fill="#f4f1e7"/><rect x="-6" y="-7" width="12" height="15" rx="3" stroke="#436763" fill="none" strokeWidth="1.5"/><path d="M-6 0H6M-3 4h1m4 0h1" stroke="#436763" strokeWidth="1.5"/></g>
  </svg>;
}
export const landmarks = [
  { name: '鼓亭', en: 'DRUM PAVILION', desc: '从鼓亭出发，在屋檐与光影间，感受古镇的慢节奏。', x: 86, y: 51, type: 'town' as const },
  { name: '老街', en: 'OLD STREET', desc: '沿着老街走一走，把街巷里的烟火气留在旅途中。', x: 243, y: 133, type: 'town' as const },
  { name: '水脉', en: 'WATERWAYS', desc: '循着溪水的声音，寻找古镇里一处安静的停留。', x: 94, y: 217, type: 'sun' as const },
  { name: '石巷', en: 'STONE ALLEY', desc: '转入石巷，让脚步慢下来，看看路边的门窗与纹样。', x: 242, y: 289, type: 'town' as const },
];
export function TownMap({ selected, onSelect }: { selected: number; onSelect: (index: number) => void }) {
  return <div className="town-map"><svg viewBox="0 0 340 344" preserveAspectRatio="none" aria-hidden="true">
    <path d="M-20 97C75 100 7 175 106 177S67 231 116 255 93 301 178 364" stroke="#8eb7bc" strokeWidth="13" fill="none"/>
    <path d="M99 218C158 177 190 247 259 215s64 21 113 3" stroke="#8eb7bc" strokeWidth="4" fill="none"/>
    <path className="map-trail" d="M86 51C183 41 89 146 94 217S239 252 242 289M121 108C215 56 154 128 243 133M97 218C151 267 168 184 243 133" stroke="#f4f1e7" strokeWidth="3" fill="none"/>
    <path d="m222 44 27-26q9-8 19 2l19 20 12-7q8-6 16 3l25 25h-33l-12-8-14 7-22-20-21 17Z" fill="#80a39a" opacity=".6"/>
    <path d="m-3 302 34-34q8-9 16 1l21 23 15-8 29 28H-3Z" fill="#80a39a" opacity=".6"/>
    {[[22,57],[312,164],[299,290],[63,279],[23,198]].map(([x,y]) => <g key={x} fill="#8eb6a6" opacity=".75"><ellipse cx={x} cy={y} rx="5" ry="12"/><path d={`M${x} ${y}v18`} stroke="#8eb6a6" strokeWidth="2"/></g>)}
    {Array.from({length: 43},(_,i) => {const x = 20+(i*47)%303, y = 39+(i*31)%268; return <circle key={i} cx={x} cy={y} r={i%3 === 0 ? 2.6 : 1.8} fill={i%4 === 0 ? '#c2935f' : '#e6ddbe'} opacity=".7"/>;})}
  </svg>{landmarks.map((item,i) => <button key={item.name} className={`map-landmark ${selected === i ? 'selected' : ''}`} style={{ left: `${item.x/340*100}%`, top: `${item.y/344*100}%` }} onClick={() => onSelect(i)} aria-label={`查看${item.name}`} aria-pressed={selected === i}><span><Glyph name={item.type}/></span><strong>{item.name}</strong></button>)}<span className="map-label">古镇漫游 · 示意地图</span></div>;
}
