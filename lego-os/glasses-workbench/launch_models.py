"""Start only the model service. The original process and its live credentials stay intact."""
from pathlib import Path
import argparse,urllib.request,json,subprocess,sys,time
root=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--workbench-port',type=int,default=8765)
workbench_port=parser.parse_args().workbench_port
port=workbench_port+1
health=f'http://127.0.0.1:{port}/api/models/health'
try:
 with urllib.request.urlopen(health,timeout=2) as r:
  if json.load(r).get('service')=='model-gateway':print('模型中心已就绪');raise SystemExit(0)
except (OSError,ValueError):pass
with open(root/'data/model-gateway.log','ab') as log:p=subprocess.Popen([sys.executable,str(root/'model_gateway.py'),'--workbench-port',str(workbench_port)],cwd=root,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
(root/('data/model-gateway.pid' if port==8766 else f'data/model-gateway-{port}.pid')).write_text(str(p.pid))
for _ in range(35):
 try:
  with urllib.request.urlopen(health,timeout=1) as r:
   if json.load(r).get('ok'):print('模型中心已启动，现有连接保持运行');break
 except Exception:time.sleep(.15)
else:raise SystemExit('模型中心启动失败，请检查 data/model-gateway.log')
