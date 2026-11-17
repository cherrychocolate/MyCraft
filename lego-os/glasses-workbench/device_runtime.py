"""Reference host for a device WebView + local service runtime, not a firmware image.
Use a separate data directory. Credentials come from the device service environment.
"""
import argparse,os,sys,json,subprocess,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--data',required=True);parser.add_argument('--check',action='store_true');args=parser.parse_args()
 provider=os.environ.get('LEGO_MODEL_PROVIDER','Qwen');model=os.environ.get('LEGO_MODEL_ID','qwen-plus');env={'Qwen':'DASHSCOPE_API_KEY','DeepSeek':'DEEPSEEK_API_KEY','Gemini':'GEMINI_API_KEY','Kimi':'MOONSHOT_API_KEY'}.get(provider)
 if not env:raise SystemExit('Unsupported device model provider')
 checks={'staticUI':(ROOT/'static/os.html').is_file(),'modelCredentialInjected':bool(os.environ.get(env)),'speechCredentialInjected':bool(os.environ.get('DASHSCOPE_API_KEY')),'workspaceForRealtime':not ('realtime' in model) or bool(os.environ.get('LEGO_WORKSPACE_ID')),'platformNeedsWebViewAndAudioAdapter':True}
 if args.check:print(json.dumps(checks));return
 if not checks['modelCredentialInjected'] or not checks['workspaceForRealtime']:raise SystemExit('请先注入模型凭据及实时模型所需业务空间；不会使用模拟回答')
 for port in [8765,8766]:
  try:
   urllib.request.urlopen('http://127.0.0.1:'+str(port),timeout=1).close()
  except urllib.error.HTTPError:raise SystemExit('端口已被已有服务使用；未修改现有服务')
  except OSError:continue
  else:raise SystemExit('端口已被已有服务使用；未修改现有服务')
 data=Path(args.data).expanduser().resolve();data.mkdir(parents=True,exist_ok=True);os.environ['GLASSHOUSE_DATA']=str(data)
 import server
 server.init()
 profile={'id':'device-chat','name':'设备个人助手','provider':provider,'model':model,'baseUrl':server.PROVIDERS[provider],'enabled':True,'storage':'environment','credentialRef':env,'thinking':'auto','workspaceId':os.environ.get('LEGO_WORKSPACE_ID',''),'region':os.environ.get('LEGO_MODEL_REGION','cn')}
 old=next((d for d in server.docs() if d['id']==profile['id']),None);server.save(profile,'model-profile',old['_revision'] if old else None)
 routing=next((d for d in server.docs() if d['id']=='model-routing'),None);server.save({'id':'model-routing','routes':{**(routing or {}).get('routes',{}),'chat':profile['id']}},'settings',routing['_revision'] if routing else None)
 if checks['speechCredentialInjected']:
  speech={**profile,'id':'device-speech','name':'设备语音凭据','provider':'Qwen','model':'qwen-plus','baseUrl':server.PROVIDERS['Qwen'],'credentialRef':'DASHSCOPE_API_KEY'};old=next((d for d in server.docs() if d['id']==speech['id']),None);server.save(speech,'model-profile',old['_revision'] if old else None)
  import speech_gateway
  old=next((d for d in server.docs() if d['id']==speech_gateway.CONFIG_ID),None);speech_gateway.save(server,{'expected':old['_revision'] if old else 0,'speechProfileId':speech['id'],'region':profile['region'],'workspaceId':profile['workspaceId'],'asrModel':'qwen3-asr-flash','ttsModel':'qwen3-tts-flash','voice':'Cherry','autoSpeak':True},lambda:[speech])
 children=[]
 try:
  for script in ['server.py','model_gateway.py']:
   child=subprocess.Popen([sys.executable,str(ROOT/script)],cwd=ROOT);children.append(child)
  print('Open device WebView: http://127.0.0.1:8765/os.html',flush=True)
  while all(c.poll() is None for c in children):time.sleep(1)
 finally:
  for c in children:
   if c.poll() is None:c.terminate()
  for c in children:
   try:c.wait(timeout=5)
   except subprocess.TimeoutExpired:c.kill()
if __name__=='__main__':main()
