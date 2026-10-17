import { useId } from 'react';
import './theme-bus.css';

// Display a window onto the supplied artwork; preserve its original pixels.
export const busThemes = [
  { id: 'qiantong', name: '前童', top: 202, bodyTop: 221, bodyBottom: 374, roofTop: 214, acTop: 204, wheels: [[374, 357], [734, 357]] },
  { id: 'xujiashan', name: '许家山', top: 384, bodyTop: 402, bodyBottom: 553, roofTop: 395, acTop: 386, wheels: [[372, 540], [737, 540]] },
  { id: 'longgong', name: '龙宫', top: 566, bodyTop: 584, bodyBottom: 735, roofTop: 577, acTop: 568, wheels: [[372, 722], [739, 723]] },
  { id: 'liyang', name: '力洋', top: 748, bodyTop: 765, bodyBottom: 925, roofTop: 758, acTop: 749, wheels: [[370, 908], [742, 910]] },
] as const;

export function RouteIdentityContent({ theme }: { theme: number }) {
  const bus = busThemes[theme];
  const clip = useId();
  return <>
    <svg className="theme-bus" data-bus-theme={bus.id} viewBox={`247 ${bus.top} 578 198`} role="img" aria-label={`${bus.name}主题巴士`}>
      <defs><clipPath id={clip}>
        <rect x="248" y={bus.bodyTop} width="576" height={bus.bodyBottom - bus.bodyTop}/>
        <rect x="350" y={bus.roofTop} width="60" height={bus.bodyTop - bus.roofTop + 1}/>
        <rect x="517" y={bus.acTop} width="191" height={bus.bodyTop - bus.acTop + 1}/>
        {bus.wheels.map(([cx, cy]) => <circle key={cx} cx={cx} cy={cy} r="35"/>)}
      </clipPath></defs>
      <image href={`${import.meta.env.BASE_URL}brand/town-buses.png`} width="1024" height="1024" clipPath={`url(#${clip})`}/>
    </svg>
    <strong>宁海旅游专线</strong>
    <span className="bus-model">XML6805JEVJ0C8</span>
  </>;
}
