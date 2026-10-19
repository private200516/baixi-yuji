import type { Evidence } from '../data/villages';

export type PoiCategory = 'ancestral-hall' | 'historic-house' | 'academy' | 'bridge' | 'temple' | 'agricultural-heritage' | 'tower' | 'landscape';
export const poiCategoryLabels: Record<PoiCategory, string> = {
  'ancestral-hall': '宗祠家庙', 'historic-house': '古民居', academy: '书院书舍',
  bridge: '古桥', temple: '古庙戏台', 'agricultural-heritage': '农耕遗存', tower: '古塔', landscape: '山水景观',
};

export type VillagePoi = {
  id: string;
  villageId: string;
  officialName: string;
  aliases: string[];
  category: PoiCategory;
  summary: string;
  identitySources: Evidence[];
  summarySources: Evidence[];
  coordinateSources: Evidence[];
  originalCoordinate: { coordinates: [number, number]; crs: 'EPSG:4326'; sourceNotation?: string } | null;
  normalizedCoordinate: [number, number] | null;
  coordinatePurpose: 'published-reference-point' | null;
  coordinatePrecisionNote: string;
  verificationStatus: { identity: 'verified' | 'pending'; summary: 'verified' | 'pending'; coordinates: 'verified' | 'pending' };
  publicAccessStatus: 'unknown';
  publicAccessNote: string;
  image: { src: string; alt: string; author: string; license: string; subject: string } | null;
  checkedAt: string;
};

// Independent from village representative points, passenger stops and research endpoints.
// A verified published coordinate is not a surveyed entrance or permission to enter.
const qingtanSource: Evidence = { title: '清气长存 走进千年古村清潭 · 浙江省纪委省监委', url: 'https://www.zjsjw.gov.cn/zhuantizhuanlan/qinglianwenhua/qingfengzhilv/202302/t20230217_8648066.shtml', publishedAt: '2023-03-13', location: '三鉴堂正文及照片说明；供稿宁海县纪委监委' };
const shuangzhiSource: Evidence = { title: '双枝庙 · 维基百科固定版本', url: 'https://zh.wikipedia.org/w/index.php?oldid=85668020&title=双枝庙', publishedAt: '2025-01-13', location: '正文、坐标栏；坐标为资料代表点，非测量或入口' };
const townPlan: Evidence = { title: '宁海县深甽镇国土空间总体规划 · 政府公示资料', url: 'https://zjjcmspublic.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn/jcms_files/jcms1/web3575/site/attach/0/2fb4309afa884382a51c3ac35dae0c71.pdf', publishedAt: null, location: 'PDF 第 29 页明确清潭双枝庙古戏台，第 30 页为历史文化资源统计表' };
const chenSource: Evidence = { title: '龙宫陈氏宗祠的建筑艺术 · 宁海新闻网', url: 'https://nh.cnnb.com.cn/system/2017/04/24/011550057.shtml', publishedAt: '2017-04-24', location: '建筑布局、戏台藻井及文保身份正文' };
const chenCoordinate: Evidence = { title: '龙宫陈氏宗祠 · 维基百科固定版本', url: 'https://zh.wikipedia.org/w/index.php?oldid=89181774&title=龙宫陈氏宗祠', publishedAt: '2025-09-17', location: '坐标栏；资料代表点，非测量或入口' };
const academySource: Evidence = { title: '留住一方乡愁 · 宁海新闻网', url: 'https://nh.cnnb.com.cn/system/2017/06/09/011567839_01.shtml', publishedAt: '2017-06-09', location: '龙宫村育英书院修复专题；箬岙植桂书舍历史建筑段落' };
const schoolSource: Evidence = { title: '实地悟校史 文化育新人 · 浙江工商职业技术学院', url: 'https://tw.zbti.edu.cn/_t292/2026/0519/c647a60172/page.htm', publishedAt: '2026-05-19', location: '龙宫育英书院现场参访及 1941 年校史段落' };
const xujiaSource: Evidence = { title: '许家山 火山口上的石头村 · 中国宁波网', url: 'https://news.cnnb.com.cn/system/2013/01/20/007604326.shtml', publishedAt: '2013-01-20', location: '文末文化古迹：许家山大道地、许家山石碾' };
const meiSource: Evidence = { title: '走进古村落 寻迹旧时光 · 宁海新闻网', url: 'https://nh.cnnb.com.cn/system/2014/12/30/011116910.shtml', publishedAt: '2014-12-30', location: '梅枝田村田氏家庙、朱家道地与申坎头水库的现场报道' };
const ruoSource: Evidence = { title: '箬岙村历史文化名村保护规划（2023—2035年）简本 · 宁海县人民政府', url: 'https://zjjcmspublic.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn/jcms_files/jcms1/web3575/site/attach/0/550ebc7cf2c7407d973729780d1fb30c.pdf', publishedAt: '2025-07', location: '第 5 页价值特色、第 6 页保护要素、第 7、9 页保护规划图；不从无地理注册图猜经纬度' };
const waterCoordinate: Evidence = { title: 'OpenStreetMap 申坎头水库 way 1210271570', url: 'https://www.openstreetmap.org/way/1210271570', publishedAt: null, location: '2026-07-28 OSM 快照；2026-10-19 获取。只作水域包围盒中心资料点，非岸边入口' };

type PoiInput = Pick<VillagePoi, 'id' | 'villageId' | 'officialName' | 'category' | 'summary'> & {
  sources: Evidence[];
  aliases?: string[];
  summarySources?: Evidence[];
  coordinates?: [number, number];
  coordinateSources?: Evidence[];
  sourceNotation?: string;
  coordinatePrecisionNote?: string;
  publicAccessNote?: string;
};
function poi(input: PoiInput): VillagePoi {
  const coordinates = input.coordinates ?? null;
  return {
    id: input.id, villageId: input.villageId, officialName: input.officialName, aliases: input.aliases ?? [], category: input.category, summary: input.summary,
    identitySources: input.sources, summarySources: input.summarySources ?? input.sources, coordinateSources: input.coordinateSources ?? [],
    originalCoordinate: coordinates ? { coordinates, crs: 'EPSG:4326', sourceNotation: input.sourceNotation } : null,
    normalizedCoordinate: coordinates, coordinatePurpose: coordinates ? 'published-reference-point' : null,
    coordinatePrecisionNote: input.coordinatePrecisionNote ?? (coordinates ? '已核对公开来源的经纬度；位置精度未知，未实地测量。资料点不代表建筑入口或步行终点。' : '名称、归属及简介有依据；暂无核验后的经纬度，不在地图落点。'),
    verificationStatus: { identity: 'verified', summary: 'verified', coordinates: coordinates ? 'verified' : 'pending' },
    publicAccessStatus: 'unknown', publicAccessNote: input.publicAccessNote ?? '开放情况尚未核实，请尊重居民生活及现场管理；介绍不表示允许入内。',
    image: null, checkedAt: '2026-10-19',
  };
}

// This first sample is not an exhaustive village inventory. Known text stays
// available even when its independent coordinate verification is incomplete.
export const villagePois: VillagePoi[] = [
  poi({ id: 'qingtan-shuangzhi', villageId: 'qingtan', officialName: '双枝庙', aliases: ['双枝庙古戏台'], category: 'temple',
    summary: '双枝庙位于深甽镇清潭村，是村中保存的古建筑之一。庙内的单藻井戏台具有地方建筑特色，作为宁海古戏台的组成部分列入全国重点文物保护单位。这里可以帮助了解古村的传统戏曲空间。',
    sources: [townPlan, shuangzhiSource], summarySources: [townPlan, shuangzhiSource], coordinates: [121.2921056, 29.4325806], coordinateSources: [shuangzhiSource], sourceNotation: '29°25′57.29″N 121°17′31.58″E；页面同时给出十进制度' }),
  poi({ id: 'qingtan-sanjian', villageId: 'qingtan', officialName: '三鉴堂', category: 'historic-house',
    summary: '三鉴堂是清潭村的老民居，建于清道光年间。堂名借古人、他人和镜子三种明鉴寄托自省之意，后来也融入张氏家训。它让古村的耕读传统与日常居住空间有了具体的联系。',
    sources: [qingtanSource] }),
  poi({ id: 'longgong-chen-hall', villageId: 'longgong', officialName: '龙宫陈氏宗祠', aliases: ['星聚堂'], category: 'ancestral-hall',
    summary: '龙宫陈氏宗祠又称星聚堂，始建于明崇祯年间。院落、厅堂与戏台沿纵向展开，戏台藻井以层层收束的木构装饰见长。它既是陈氏宗族礼乐空间，也保存了宁海古戏台的建筑技艺。',
    sources: [chenSource], coordinates: [121.2748611, 29.3745944], coordinateSources: [chenCoordinate], sourceNotation: '29°22′28.54″N 121°16′29.50″E；页面同时给出十进制度' }),
  poi({ id: 'longgong-yuying', villageId: 'longgong', officialName: '育英书院', category: 'academy',
    summary: '育英书院位于龙宫村，保留正厅、厢房和门屋等传统空间。它曾参与承接战时迁入山区的教育活动，见证了当地从书院到学校的历史。修缮报道与学校校史共同留下了这处建筑的记忆。',
    sources: [academySource, schoolSource] }),
  poi({ id: 'xujiashan-dadaodi', villageId: 'xujiashan', officialName: '许家山大道地', aliases: ['大道地'], category: 'historic-house',
    summary: '许家山大道地是村内民国时期的院落，正屋、东西厢房与门楼围合成四合院。院中保留石子铺地及图案，建筑以朴素的形制呈现山村居住方式，是认识许家山传统民居的一处实物。',
    sources: [xujiaSource] }),
  poi({ id: 'xujiashan-stone-mill', villageId: 'xujiashan', officialName: '许家山石碾', category: 'agricultural-heritage',
    summary: '许家山石碾位于茶院乡许家山村，是过去村民加工谷物的工具。碾槽与碾轮留存了山村农耕生活的痕迹，地方文物报道将它列为值得保护的遗存。观看石碾，可以了解石材在日常生产中的用途。',
    sources: [xujiaSource] }),
  poi({ id: 'meizhitian-tian-hall', villageId: 'meizhitian', officialName: '田氏家庙', category: 'ancestral-hall',
    summary: '田氏家庙位于梅枝田村，木构厅堂、两侧厢房、天井与戏台组成礼仪空间。木雕、砖雕和石雕等装饰共同呈现地方工艺，是了解村落宗族记忆的一处建筑，当前开放安排还需向现场确认。',
    sources: [meiSource] }),
  poi({ id: 'meizhitian-zhu-courtyard', villageId: 'meizhitian', officialName: '朱家道地', category: 'historic-house',
    summary: '朱家道地是梅枝田古村报道中记录的传统院落。它以不同颜色的石子铺出庭院图案，门窗留有雕花细部，体现了老宅营造的巧思。作为村落居住遗存，宜尊重居民生活，具体可参观范围待核实。',
    sources: [meiSource] }),
  poi({ id: 'meizhitian-shenkantou', villageId: 'meizhitian', officialName: '申坎头水库', category: 'landscape',
    summary: '申坎头水库是宁海新闻网走访梅枝田村时记录的沿途山水景观。水面与周围青山共同构成进入古村前的环境印象，和村内院落形成不同的观看角度。此处只介绍地景，不提供临水活动或进入水库的指引。',
    sources: [meiSource], coordinates: [121.5036383, 29.2394411], coordinateSources: [waterCoordinate], sourceNotation: 'OSM way 1210271570 的 out center 结果：lon 121.5036383, lat 29.2394411',
    coordinatePrecisionNote: '公开 OSM 水域包围盒中心，精度未知，未测量；仅用于地景资料定位，不是岸边、入口或可站立的位置。与梅枝田的关联来自走访正文，不表示村界归属。',
    publicAccessNote: '水库进入及临水开放条件未核实；此资料点不可作为步行或下水目的地。' }),
  poi({ id: 'ruoao-chu-hall', villageId: 'ruoao', officialName: '褚氏宗祠', category: 'ancestral-hall',
    summary: '褚氏宗祠是箬岙村保护规划明确列出的古建筑与保护要素。它与族谱、柱对等共同承载家族聚居的历史记忆。理解这处宗祠，也能看到山海古村中宗族文化与日常生活的联系。',
    sources: [ruoSource] }),
  poi({ id: 'ruoao-chengmen-bridge', villageId: 'ruoao', officialName: '城门桥', category: 'bridge',
    summary: '城门桥位于箬岙古城墙旧址南端。保护规划记载，它为同治年间遗存，曾承担护城河蓄放水斗门的作用。小桥关联着村落水系与海防格局，是认识箬岙历史空间的一处线索。',
    sources: [ruoSource] }),
  poi({ id: 'ruoao-zhigui', villageId: 'ruoao', officialName: '植桂书舍', category: 'academy',
    summary: '植桂书舍是箬岙村耕读文化的具体遗存。保护规划把书舍及其匾额纳入保护要素，地方报道也记录了它的修缮。它与村中书院、楹联等一起，呈现山海古村重视读书教育的一面。',
    sources: [ruoSource, academySource] }),
];
export function getVillagePois(villageId: string): VillagePoi[] {
  return villagePois.filter(poi => poi.villageId === villageId && poi.verificationStatus.identity === 'verified' && poi.verificationStatus.summary === 'verified');
}
export function getMappableVillagePois(villageId: string): VillagePoi[] {
  return getVillagePois(villageId).filter(isMappablePoi);
}
export function isMappablePoi(poi: VillagePoi): boolean {
  const point = poi.normalizedCoordinate;
  return poi.verificationStatus.identity === 'verified' && poi.verificationStatus.summary === 'verified' && poi.verificationStatus.coordinates === 'verified'
    && point !== null && point.length === 2 && point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90
    && poi.coordinateSources.length > 0;
}
export function getPoiById(id: string | null | undefined): VillagePoi | undefined {
  return villagePois.find(poi => poi.id === id);
}
