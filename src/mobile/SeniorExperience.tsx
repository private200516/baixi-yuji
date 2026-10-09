import { useEffect, useRef } from 'react';
import { Glyph, RiverMark } from './TransitArt';

type SeniorScreen = 'ride' | 'scan' | 'return' | 'help';
export function SeniorExperience({ screen, station, destination, minutes, slot, savedReturn, speaking,
  onGo, onSettings, onListen, onStations, onTimes, onSave }: {
  screen: string; station: string; destination: string; minutes: number; slot: string;
  savedReturn: string | null; speaking: boolean;
  onGo: (screen: SeniorScreen) => void; onSettings: () => void; onListen: () => void;
  onStations: () => void; onTimes: () => void; onSave: () => void;
}) {
  const current = ['ride', 'scan', 'return', 'help'].includes(screen) ? screen : 'ride';
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [current]);
  return <main id="main-view" className={`senior-main senior-${current}`}>
    <header className="senior-topbar">
      {current === 'ride' ? <span className="senior-brand"><RiverMark/>乡序</span> :
        <button className="senior-back" onClick={() => onGo('ride')}><Glyph name="back"/>返回首页</button>}
      <button className="senior-settings" onClick={onSettings}><Glyph name="settings"/>设置</button>
    </header>
    <div className="senior-heading"><div><span>老年人模式</span><h2 ref={heading} tabIndex={-1}>
      {{ ride: '安心乘车', scan: '乘车码', return: '安排返程', help: '找人帮忙' }[current]}
    </h2></div><button className="senior-listen" onClick={onListen} aria-pressed={speaking}><Glyph name="volume"/>{speaking ? '停止朗读' : '听一遍'}</button></div>
    {current === 'ride' && <>
      <section className="senior-boarding" aria-label="候车信息"><p><Glyph name="pin"/>在这里上车 · 5 路</p><h3>{station}</h3><div className="senior-destination">开往{destination}</div><div className="senior-arrival"><span>约 <strong>{minutes}</strong> 分钟</span><span>到站</span></div></section>
      <div className="senior-tasks">
        <button onClick={onStations}><Glyph name="pin"/><span>换个车站</span></button>
        <button className="senior-code-task" onClick={() => onGo('scan')}><Glyph name="scan"/><span>乘车码</span></button>
        <button onClick={() => onGo('return')}><Glyph name="back"/><span>看返程</span></button>
        <button onClick={() => onGo('help')}><Glyph name="help"/><span>找人帮忙</span></button>
      </div>
    </>}
    {current === 'scan' && <section className="senior-scan-card"><p>上车时，出示此码</p><div className="senior-qr"><img src="./art/demo-qr.svg" alt="演示二维码，不能用于乘车或支付"/></div><strong>演示码 · 不能乘车</strong><p>真实乘车请按司机指引购票</p></section>}
    {current === 'return' && <>
      <section className="senior-return-card"><p>在古镇起点站上车</p><h3>返回城区终点站</h3><span className="senior-departure">出发时间</span><strong className="senior-time">{slot}</strong><button className="senior-secondary" onClick={onTimes}>换个时间<Glyph name="chevron"/></button></section>
      <button className="senior-primary" onClick={onSave}><Glyph name="check"/>{savedReturn === slot ? '已记住这趟车' : '记住这趟车'}</button>
      <p className="senior-explanation">{savedReturn === slot ? '下次打开，还能看到这个时间。' : '记在本机，方便下次查看。'}<br/>不发送发车提醒。</p>
    </>}
    {current === 'help' && <section className="senior-help-card"><div className="senior-help-icon"><Glyph name="help"/></div><h3>请找司机<br/>或站务人员帮忙</h3><p>可以把这个页面给对方看：</p><div className="senior-help-message">我在<strong>{station}</strong>，<br/>想去<strong>{destination}</strong>。<br/>请帮我确认乘车方向。</div><p className="senior-help-note">这里暂未接通电话或在线客服</p></section>}
    <p className="senior-demo">演示信息，出行前请向工作人员确认</p>
  </main>;
}
