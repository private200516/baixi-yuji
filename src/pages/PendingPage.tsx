import { DEMO, pages } from '../data/demo';
import type { DemoJourney, Page } from '../data/demo';
import { Icon } from '../components/Icon';
import { CurveSurface } from '../components/CurveSurface';

export function PendingPage({ page, journey }: { page: Exclude<Page, 'ride'>; journey: DemoJourney }) {
  const label = pages.find(item => item.id === page)!.label;
  return <div className="pending-board">
    <div className="page-intro"><div><p className="eyebrow">从容去，安心回</p><h1>{label}</h1></div><p className="intro-note">一程山水，<br/>一路相伴。</p></div>
    <CurveSurface><div className="surface-heading pending-heading"><span>{label === '返程' ? '回程也有着落' : label === '古镇' ? '沿溪看风物' : '一路有照应'}</span><span className="demo-badge">阶段 A</span></div>
      <section className="pending-page"><span className="small-pill">阶段 A · 待开发</span>
        {page === 'return' ? <><h2>回程信息，先看一眼。</h2><p className="demo-badge">{DEMO.label}</p><dl><dt>上车点</dt><dd>{journey.relatedReturn.from}</dd><dt>开往</dt><dd>{journey.relatedReturn.destination}</dd><dt>示例发车时间</dt><dd>{journey.relatedReturn.departure} · {DEMO.dateLabel}</dd></dl><p>返程卡的保存、再次查看和删除将在后续阶段开发。目前未保存返程卡。</p><p>{DEMO.notice}</p></> : page === 'town' ? <><h2>古镇风物，待与你见面。</h2><p>古镇介绍、照片与交通资料待补充、核验。本阶段不提供景点导览或正式乘车方案。</p></> : <><h2>把字看清，把方向认准。</h2><p>本轮可以在页头切换字号，在乘车页切换方向、收藏线路和查看站点说明。</p><p>完整帮助、朗读和本地数据管理待开发。客服电话与服务时段尚未核实。</p></>}
        <a className="primary-button" href="#/ride">返回乘车首页<Icon name="arrow"/></a>
      </section><div className="pending-bottom" aria-hidden="true">白溪舆记 · 一路相伴</div>
    </CurveSurface>
  </div>;
}
