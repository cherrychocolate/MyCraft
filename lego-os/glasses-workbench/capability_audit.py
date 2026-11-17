"""Evidence-based graph readiness. An OS feature is not automatically a graph executor."""
from collections import Counter
GRAPH={'F02','F03','O01','O03','O07','O08','O09','O17'}
CONDITIONAL={'C02','C04'}
SIMULATED={'I02','I07','O02','P01','P07','F04'}
AUTH={'C01':'目标账号的授权范围与应用配置','C02':'飞书用户授权及日历事件读取权限','C03':'地图供应商选择；收费路线API需要Key，基础地图可用开放数据','C05':'邮箱类型、OAuth授权；自建OAuth应用时需Client ID/Secret','I01':'麦克风许可及语音供应商凭据','I02':'麦克风许可及语音供应商凭据','P01':'Qwen/火山ASR凭据与录音样本；现有图节点仍为文字模拟','O02':'Qwen/火山TTS凭据与音色；现有图节点仍为状态模拟','A06':'外部动作API的权限和回执约定'}
DEVICE={'I03','I04','I05','I09','P04','P05','O04','O05','A03','C06','C08','C09','C10','C11','C12','F10','G03','G07','G08','G09','G10'}
NAMES={'graph':'工作流可执行（本机软件）','conditional':'已有执行器，模板/配置受限','simulated':'受限实现 / 模拟','definition':'只有定义，无独立执行器','external':'Apify执行器已接入，待账号实测'}
def audit(server):
 rows=[]
 for atom in server.docs():
  if atom['_kind']!='atom' or atom.get('deleted'):continue
  ident=atom['id'];external=bool(atom.get('connectorId'));group='external' if external else 'graph' if ident in GRAPH else 'conditional' if ident in CONDITIONAL else 'simulated' if ident in SIMULATED else 'definition'
  evidence='static/simulator.js / runtime-engine.js' if group in ('graph','simulated') else 'static/real-services.js / service_connectors.py' if group=='conditional' else 'external_connectors.py / 官方Actor输入Schema' if external else '未注册通用工作流执行器'
  if ident=='O17':evidence='watchface_core.py / watchface-creative.js；史努比案例已实测'
  help='提供 Apify Token、Actor使用权限与余额；配置输入后实际运行验证' if external else AUTH.get(ident) or ('真实外设协议、硬件样机/数据与设备调试环境' if ident in DEVICE else '无需额外账号即可继续开发本机软件版本；当前状态见执行范围')
  note=''
  if ident=='C04':note='当前只有天气/Reddit模板分支，不能任意检索或调用所有平台'
  if ident=='C02':note='本地课表可执行；真实飞书依赖CLI授权和日历ID'
  if ident=='F04':note='当前只是透传；执行引擎顺序处理，不是实际并发汇合'
  if ident=='P07':note='当前读取手动译文，没有调用真实翻译模型'
  if ident=='P01':note='OS个人助手的Qwen ASR已通过真实语音闭环；图积木仍只透传手输文字'
  if ident=='O02':note='OS个人助手的Qwen TTS已通过真实合成及播放接口；图积木仍只返回模拟状态'
  if ident=='C05':note='当前没有邮件读取执行器；其他已连接应用的邮箱工具不等于本工程已接入'
  if ident=='C03':note='城市搜索/天气定位不等于地图、路线或导航功能'
  if group=='definition' and ident in {'G02','G05','G06','A04','A05','D07','O10','O11','O12','O13','O14'}:note='OS或工作台存在部分相关机制，但尚未实现此定义要求的完整图节点接口'
  if ident in {'A01','D01','D03','F09','O13','G05','G06'}:note='OS个人助手已有版本化技能目录、工具回执、会话检查点及服务UI浮层；此原子定义的通用图执行器尚未完成'
  rows.append({'id':ident,'name':atom['name'],'group':group,'readiness':NAMES[group],'evidence':evidence,'help':help,'note':note,'requiresUser':external or ident in AUTH or ident in DEVICE})
 base=[r for r in rows if r['group']!='external'];counts=Counter(r['group'] for r in base)
 return {'baselineCount':len(base),'baselineCounts':dict(counts),'externalCount':len(rows)-len(base),'labels':NAMES,'rows':sorted(rows,key=lambda r:r['id']),'method':'按工作流执行器审计。可执行不表示每种输入或真实外设均已验收；系统界面能力与工作流积木分开。'}
