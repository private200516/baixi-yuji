export type IconName = 'ride' | 'return' | 'town' | 'help' | 'arrow' | 'pin' | 'speaker' | 'star' | 'check' | 'close' | 'menu' | 'clock';
const shapes: Record<IconName, React.ReactNode> = {
  ride: <><rect x="5" y="3" width="14" height="16" rx="4"/><path d="M5 11h14M8 19v2m8-2v2M9 6h6"/><path d="M8 15h1m6 0h1"/></>,
  return: <><path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12h-3"/></>,
  town: <><path d="m2 11 10-7 10 7M4 11v9h16v-9M9 20v-6h6v6M4 7V4h4"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 8.5a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16h.01"/></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  speaker: <><path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
  star: <path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
};
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}
