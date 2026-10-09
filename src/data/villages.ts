export type Evidence = { title: string; url: string; publishedAt: string | null; location?: string };
export type Village = {
  id: string; queryName: string; officialName: string | null; displayName: string;
  aliases: string[]; township: string | null; settlementType: 'historical-settlement' | 'unresolved';
  administrativeStatus: 'unknown'; heritageEvidence: string | null;
  identitySources: Evidence[]; geographySources: Evidence[]; checkedAt: string; sourcePublishedAt: string | null;
  identityStatus: 'verified' | 'unknown'; heritageStatus: 'verified' | 'unknown';
  coordinateStatus: 'verified' | 'unknown'; routeCandidateStatus: 'research-candidate' | 'pending';
  boardingStatus: 'unverified'; originalCoordinate: { coordinates: [number, number]; crs: 'EPSG:4326' } | null;
  normalizedCoordinate: [number, number] | null; representativePointType: 'mapped-settlement-point' | null;
  coordinatePrecisionNote: string; boardingPointIds: string[]; sourceLicense: string | null; notes: string; description: string;
};
const registry: Evidence = {title:'宁波市域历史文化名村、传统村落名录',url:'https://zjjcmspublic.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn/jcms_files/jcms1/web3506/site/attach/0/51271e0d908c4dc2acc2a7f6479693a5.pdf',publishedAt:null,location:'PDF 第15页（印刷页14）；已下载并查看表格'};
const qingtan: Evidence = {title:'清气长存 走进千年古村清潭',url:'https://www.zjsjw.gov.cn/zhuantizhuanlan/qinglianwenhua/qingfengzhilv/202302/t20230217_8648066_ext.html',publishedAt:'2023-03-13'};
const ruoao: Evidence = {title:'箬岙村历史文化名村保护规划（2023—2035年）简本',url:'https://zjjcmspublic.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn/jcms_files/jcms1/web3575/site/attach/0/550ebc7cf2c7407d973729780d1fb30c.pdf',publishedAt:'2025-07',location:'第1—2页，宁海县人民政府'};
function record(id: string, name: string, township: string | null, heritage: string | null, sources: Evidence[], coordinates: [number,number] | null, osmId: number | null, description: string, notes: string): Village {
  return {id,queryName:name,officialName:sources.length?name:null,displayName:name,aliases:[],township,settlementType:sources.length?'historical-settlement':'unresolved',administrativeStatus:'unknown',heritageEvidence:heritage,identitySources:sources,geographySources:osmId?[{title:`OpenStreetMap 聚落节点 ${osmId}`,url:`https://www.openstreetmap.org/node/${osmId}`,publishedAt:null}]:[],checkedAt:'2026-10-08',sourcePublishedAt:sources[0]?.publishedAt??null,identityStatus:sources.length?'verified':'unknown',heritageStatus:heritage?'verified':'unknown',coordinateStatus:coordinates?'verified':'unknown',routeCandidateStatus:coordinates&&heritage?'research-candidate':'pending',boardingStatus:'unverified',originalCoordinate:coordinates?{coordinates,crs:'EPSG:4326'}:null,normalizedCoordinate:coordinates,representativePointType:coordinates?'mapped-settlement-point':null,coordinatePrecisionNote:coordinates?'OSM 村落名称代表点；精度未知，未实地测量。不是村口、村界、上车点或步行终点。':'暂无核验后的村落代表点；不使用镇中心、景区点或同名公交站代替。',boardingPointIds:[],sourceLicense:coordinates?'ODbL-1.0':null,notes,description};
}
export const villages: Village[] = [
  record('xujiashan','许家山村','茶院乡','中国历史文化名村 · 中国传统村落',[registry],[121.5337458,29.3211666],4884534804,'沿石屋与石巷，读一座山村的岁月。','按历史聚落展示；当前行政村及合并关系尚待核实。'),
  record('longgong','龙宫村','深甽镇','中国历史文化名村 · 中国传统村落',[registry],[121.2721072,29.3753662],2453222394,'在山水之间，寻找龙宫古村的聚落记忆。','OSM 节点标注 source=GNS，代表点精度未知；当前行政关系待核实。'),
  record('qingtan','清潭村','深甽镇','中国传统村落 · 宁波市历史文化名村',[qingtan,registry],[121.2881886,29.4315601],10931261589,'循清溪入村，走近耕读文化与古民居。','官方正文确认传统村落资格；当前行政合并状态尚未确认。'),
  record('meizhitian','梅枝田村','越溪乡','中国传统村落',[registry],[121.506495,29.2348314],9470889346,'先认识古村的位置，再安排自己的旅程。','政府托管名录确认历史聚落与乡属；当前行政关系待核实。'),
  record('ruoao','箬岙村','一市镇','浙江省历史文化名村',[ruoao],[121.4779495,29.184526],9471546436,'山海相依的古村，留有耕读与海防的印记。','2025年保护规划确认保护对象；OSM 代表点不是规划范围中心。'),
  record('liyang','力洋村','力洋镇','浙江省历史文化名村 · 中国传统村落',[registry],null,null,'','名录已确认历史聚落；检索得到的 place=town 为力洋镇，不作为村落坐标。'),
  record('dongxiang','东香村',null,null,[],null,null,'','名称待核实：官方名录出现“东岙村”，不可未经核对将东香改为东岙。'),
  record('xiao','西岙村','长街镇','中国传统村落',[registry],null,null,'','名录已有依据；OSM 新西岙与旧西岙的空间、合并关系未厘清，不替代坐标。'),
  record('qiantong','前童相关传统聚落',null,null,[],null,null,'','前童镇与景区不等于单一村落。具体传统聚落、现行名称与范围待核验。'),
  ...['梁皇村','河洪村','上金村','海洋村','中湖村','西翁村','张家村'].map((name,i)=>record(`expansion-${i}`,name,null,null,[],null,null,'','扩展线索，本轮未完成身份、保护依据与点位核验。')),
];
export function isMappable(v: Village): boolean { return v.identityStatus==='verified' && v.heritageStatus==='verified' && v.coordinateStatus==='verified' && v.normalizedCoordinate!==null; }
export const mapVillages = villages.filter(isMappable);
// Separate entities: a village label never silently becomes a passenger stop.
export type BoardingPoint = { id: string; villageId: string; coordinates: [number,number]; verified: boolean; sources: Evidence[] };
export type RouteProposal = { id: string; status: 'research'; villageIds: string[]; boardingPointIds: string[] };
export type Service = { id: string; routeId: string; status: 'confirmed'; operatorSource: Evidence };
export const boardingPoints: BoardingPoint[] = [];
export const routeProposals: RouteProposal[] = [];
export const services: Service[] = [];
