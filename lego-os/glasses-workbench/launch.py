"""Start the workbench independently of the terminal and verify readiness."""
import subprocess,sys,time,urllib.request,json
from pathlib import Path
root=Path(__file__).resolve().parent
url='http://127.0.0.1:8765'
def healthy():
 try:
  with urllib.request.urlopen(url+'/api/state',timeout=2) as r:
   d=json.load(r);return isinstance(d.get('documents'),list) and 'providers' in d
 except Exception:return False
if not healthy():
 with open(root/'data/server.log','ab') as log:
  p=subprocess.Popen([sys.executable,str(root/'server.py')],cwd=root,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
 (root/'data/server.pid').write_text(str(p.pid))
 for _ in range(30):
  if healthy():break
  if p.poll() is not None:raise SystemExit('启动失败，请查看 data/server.log；端口可能已被占用。')
  time.sleep(.2)
 if not healthy():raise SystemExit('服务未就绪，请查看 data/server.log。')
print('工作台已启动：'+url)

subprocess.run([sys.executable,str(root/"launch_models.py")],cwd=root,check=True)
