import unittest, uuid, io, urllib.error, subprocess
from unittest.mock import patch, Mock
import connections
class ConnectionTests(unittest.TestCase):
 def run_case(self,p,response=None,keys=None,error=None):
  ident=str(uuid.uuid4());connections.JOBS[ident]={'id':ident,'status':'running','steps':[],'kind':p['kind']};records=[]
  with patch.dict('os.environ',{},clear=True),patch('connections.request',side_effect=error,return_value=response):connections.run(ident,p,keys or {},{'Gemini':'https://api.example.com','DeepSeek':'https://api.example.com'},records.append)
  return connections.snapshot(ident),records
 def test_no_key_is_not_connected(self):
  r,_=self.run_case({'kind':'model','provider':'Gemini','model':'test'})
  self.assertEqual(r['status'],'failed');self.assertEqual(r['error']['code'],'configuration')
 def test_real_generation_shape_required(self):
  r,_=self.run_case({'kind':'model','provider':'DeepSeek','model':'test'}, {'data':[]},{'DeepSeek':'SECRET'})
  self.assertEqual(r['status'],'failed')
 def test_generation_success_redacts_credentials(self):
  r,logs=self.run_case({'kind':'model','provider':'DeepSeek','model':'test'}, {'choices':[{'message':{'content':'OK'}}]},{'DeepSeek':'SECRET'})
  self.assertEqual(r['status'],'passed');self.assertNotIn('SECRET',str(logs));self.assertEqual(len(r['steps']),5)
 def test_weather_validates_fields(self):
  r,_=self.run_case({'kind':'weather'}, {'current':{}});self.assertEqual(r['status'],'failed')
 def test_weather_success(self):
  r,_=self.run_case({'kind':'weather'}, {'current':{'temperature_2m':22,'time':'2026-11-11T10:00'}});self.assertEqual(r['status'],'passed')
 def test_http_auth_classification(self):
  opener=Mock();opener.open.side_effect=urllib.error.HTTPError('https://example.com',401,'Unauthorized',{},io.BytesIO(b'secret body'))
  with patch('connections.urllib.request.build_opener',return_value=opener):
   with self.assertRaises(connections.DiagnosticError) as ctx:connections.request('https://example.com')
  self.assertEqual(ctx.exception.code,'authentication');self.assertNotIn('secret',str(ctx.exception))
 def test_timeout_failure(self):
  r,_=self.run_case({'kind':'weather'},error=connections.DiagnosticError('timeout','请求超时','稍后重试'));self.assertEqual(r['error']['code'],'timeout');self.assertEqual(r['steps'][-1]['status'],'failed')
 def test_calendar_no_id_requires_explicit_scope(self):
  with patch('connections.shutil.which',return_value='/bin/lark-cli'):
   r,_=self.run_case({'kind':'calendar'});self.assertEqual(r['error']['code'],'configuration')
 def test_empty_calendar_is_success_without_private_data_log(self):
  with patch('connections.shutil.which',return_value='/bin/lark-cli'),patch('connections.subprocess.run',return_value=Mock(returncode=0,stdout='{"ok":true,"data":{"items":[]}}')):
   r,logs=self.run_case({'kind':'calendar','calendarId':'test'});self.assertEqual(r['status'],'passed');self.assertNotIn('items',str(logs))
 def test_webhook_private_network_rejected(self):
  with patch('connections.socket.getaddrinfo',return_value=[(2,1,6,'',('127.0.0.1',443))]):
   r,_=self.run_case({'kind':'webhook','url':'https://example.com'});self.assertEqual(r['status'],'failed')
if __name__=='__main__':unittest.main()
