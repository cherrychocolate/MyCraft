"""Start only the model service. The original process and its live credentials stay intact."""
from pathlib import Path
import urllib.request,json,subprocess,sys,time
root=Path(__file__).resolve().parent
try:
 with urllib.request.urlopen('http://127.0.0.1:8766/api/models/health',timeout=2) as r:
  if json.load(r).get('service')=='model-gateway':print('模型中心已就绪');raise SystemExit(0)
except (OSError,ValueError):pass
with open(root/'data/model-gateway.log','ab') as log:p=subprocess.Popen([sys.executable,str(root/'model_gateway.py')],cwd=root,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
(root/'data/model-gateway.pid').write_text(str(p.pid))
for _ in range(35):
 try:
  with urllib.request.urlopen('http://127.0.0.1:8766/api/models/health',timeout=1) as r:
   if json.load(r).get('ok'):print('模型中心已启动，现有连接保持运行');break
 except Exception:time.sleep(.15)
else:raise SystemExit('模型中心启动失败，请检查 data/model-gateway.log')
