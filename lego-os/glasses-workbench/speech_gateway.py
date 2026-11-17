"""Shared speech configuration; profile credential references instead of copied browser keys."""
import time,uuid
import voice_backend as v
CONFIG_ID='voice-engine-config'
def config(server,public,profiles,legacy):
 saved=next((d for d in server.docs() if d['id']==CONFIG_ID),None)
 old=next((d for d in server.docs() if d['id']=='voice-config'),{})
 raw=saved or {**v.config(old),'speechProfileId':'','credentialSource':'legacy'}
 choices=[public(p) for p in profiles() if p['provider']=='Qwen' and p.get('enabled',True)]
 d={k:raw.get(k) for k in ['region','workspaceId','asrModel','ttsModel','voice','autoSpeak','speechProfileId','credentialSource']}
 d.update(id=CONFIG_ID,revision=raw.get('_revision',0),speechKeyConfigured=False,profiles=[{k:p.get(k) for k in ['id','name','model','credentialConfigured','credentialLabel']} for p in choices])
 if raw.get('speechProfileId'):d['speechKeyConfigured']=any(p['id']==raw['speechProfileId'] and p['credentialConfigured'] for p in choices)
 else:
  try:d['speechKeyConfigured']=legacy('voice-config').get('speechKeyConfigured',False)
  except Exception:pass
 return d

def save(server,p,profiles):
 old=next((d for d in server.docs() if d['id']==CONFIG_ID),{})
 if p.get('expected')!=old.get('_revision',0):raise ValueError('语音配置已改变，请重新打开后保存')
 cfg=v.config(p)
 if cfg['region'] not in v.REGIONS:raise ValueError('不支持的语音区域')
 v.base(cfg)
 if cfg['ttsModel'].lower().startswith('qwen-audio') or cfg['voice'].startswith('long'):raise ValueError('当前接入 Qwen-TTS HTTP 协议，请选 qwen3-tts-flash 和匹配音色 Cherry；不能混用 CosyVoice 音色')
 ident=p.get('speechProfileId','')
 if ident and not any(x['id']==ident and x['provider']=='Qwen' and x.get('enabled',True) for x in profiles()):raise ValueError('请选择已配置的百炼凭据')
 safe={k:cfg[k] for k in ['region','workspaceId','asrModel','ttsModel','voice','autoSpeak']};safe.update(id=CONFIG_ID,speechProfileId=ident,credentialSource='profile' if ident else 'legacy')
 server.save(safe,'settings',old.get('_revision'))

def invoke(server,kind,p,profiles,credential,legacy,network):
 cfg=next((d for d in server.docs() if d['id']==CONFIG_ID),None)
 if not cfg or not cfg.get('speechProfileId'):return legacy('speech-'+kind,p)
 model=next((x for x in profiles() if x['id']==cfg['speechProfileId']),None)
 if not model:raise ValueError('语音凭据引用的模型配置已不存在')
 start=time.monotonic()
 try:
  result=getattr(v,kind)(p,cfg,{'QwenSpeech':credential(model)},network)
  if kind=='tts':
   for field in ['url','urls']:
    if field in result:result[field]=[s.replace('/api/speech-audio','/api/models/voice/audio') for s in result[field]] if isinstance(result[field],list) else result[field].replace('/api/speech-audio','/api/models/voice/audio')
  server.log_run({'type':'speech-call','kind':kind,'status':'succeeded','model':cfg[kind+'Model'],'durationMs':round((time.monotonic()-start)*1000)})
  return result
 except Exception as e:
  server.log_run({'type':'speech-call','kind':kind,'status':'failed','model':cfg[kind+'Model'],'error':{'code':getattr(e,'code','speech_failed'),'message':str(e)},'durationMs':round((time.monotonic()-start)*1000)});raise
