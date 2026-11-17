import unittest,tempfile,json,time
from pathlib import Path
from unittest.mock import patch,Mock
import server,model_gateway as m,model_vault
class ModelTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.old=(server.DB,server.DATA,m.VAULT,m.SESSION);server.DATA=Path(self.tmp.name);server.DB=server.DATA/'models.sqlite3';server.init();m.VAULT=model_vault.MemoryVault();m.SESSION=model_vault.MemoryVault();m.JOBS.clear()
 def tearDown(self):server.DB,server.DATA,m.VAULT,m.SESSION=self.old;self.tmp.cleanup()
 def create(self,**extra):return m.save_profile({'name':'DeepSeek A','provider':'DeepSeek','baseUrl':'https://api.deepseek.com','model':'deepseek-flash','key':'safe-test-secret-AB12','remember':True,**extra})
 def test_key_is_masked_and_never_enters_database_or_calls(self):
  p=self.create();self.assertTrue(p['credentialConfigured']);self.assertEqual(p['keySuffix'],'AB12');self.assertNotIn('credentialRef',p);self.assertNotIn('safe-test-secret',json.dumps(server.docs()));self.assertEqual(m.credential(m.profile(p['id'])),'safe-test-secret-AB12')
 def test_empty_key_preserves_original_and_multiple_models_are_independent(self):
  a=self.create();b=self.create(name='DeepSeek B',model='deepseek-v4-pro',key='other-test-key-XYZ9');m.save_profile({'id':a['id'],'expected':a['_revision'],'name':'Renamed','provider':a['provider'],'baseUrl':a['baseUrl'],'model':a['model'],'key':''});self.assertEqual(m.credential(m.profile(a['id'])),'safe-test-secret-AB12');self.assertEqual(m.credential(m.profile(b['id'])),'other-test-key-XYZ9')
 def test_credentials_cannot_be_sent_to_changed_endpoint_implicitly(self):
  a=self.create()
  with self.assertRaisesRegex(m.ModelError,'密钥'):m.save_profile({**a,'expected':a['_revision'],'baseUrl':'https://other.example/v1','key':''})
  self.assertEqual(m.profile(a['id'])['baseUrl'],'https://api.deepseek.com')
 def test_stale_save_does_not_rotate_secret(self):
  a=self.create()
  with self.assertRaisesRegex(m.ModelError,'其他页面'):m.save_profile({**a,'expected':0,'key':'replacement-new-key'})
  self.assertEqual(m.credential(m.profile(a['id'])),'safe-test-secret-AB12')
 def test_role_switch_dispatches_exact_selected_profile_and_records_usage(self):
  a=self.create();b=self.create(name='B',model='deepseek-v4-pro');m.bind({'role':'chat','profileId':b['id']})
  with patch.object(m,'endpoint',side_effect=lambda x:x),patch.object(m.connections,'request',return_value={'choices':[{'message':{'content':'Actual B'}}],'usage':{'total_tokens':8}}) as req:
   r=m.invoke({'text':'hello'})
  self.assertEqual(r['answer'],'Actual B');self.assertEqual(req.call_args[0][1]['model'],'deepseek-v4-pro');self.assertEqual(m.calls()[0]['profileId'],b['id']);self.assertEqual(m.calls()[0]['usage']['total_tokens'],8)
 def test_failures_are_recorded_without_key_or_prompt(self):
  a=self.create();m.bind({'role':'chat','profileId':a['id']})
  with patch.object(m,'raw',side_effect=m.ModelError('billing','余额异常','检查供应商余额')):
   with self.assertRaises(m.ModelError):m.invoke({'text':'private question'})
  events=m.calls();self.assertEqual(events[0]['status'],'failed');self.assertNotIn('private question',str(events));self.assertNotIn('safe-test-secret',str(events))
 def test_os_bridge_validates_actions_and_uses_chosen_profile(self):
  a=self.create();m.bind({'role':'chat','profileId':a['id']})
  with patch.object(m,'raw',return_value=(json.dumps({'answer':'打开课表','actions':[{'type':'open_service','serviceId':'calendar'}]}),{'total_tokens':4})):
   r=m.os_chat({'text':'打开课表','context':{'services':[{'id':'calendar'}]}})
  self.assertEqual(r['provider'],'DeepSeek');self.assertEqual(r['actions'][0]['serviceId'],'calendar')
  with patch.object(m,'raw',return_value=('{"answer":"bad","actions":[{"type":"execute"}]}',{})):
   with self.assertRaisesRegex(ValueError,'不受支持'):m.os_chat({'text':'x'})
 def test_legacy_profiles_delegate_without_exposing_original_key(self):
  a=server.save({'id':'legacy','name':'original','provider':'DeepSeek','model':'deepseek-v4-pro','baseUrl':'https://api.deepseek.com','storage':'legacy','enabled':True},'model-profile')
  with patch.object(m,'legacy',return_value={'result':{'ideas':[{'description':'actual legacy reply'}]},'usage':{'total_tokens':5}}) as api:
   text,usage=m.raw(a,[{'role':'user','content':'hello'}])
  self.assertEqual(text,'actual legacy reply');self.assertEqual(api.call_args[0][1]['provider'],'DeepSeek');self.assertNotIn('key',api.call_args[0][1])
 def test_draft_can_save_key_before_selecting_model(self):
  a=self.create(model='');self.assertTrue(a['credentialConfigured'])
  with self.assertRaisesRegex(m.ModelError,'模型 ID'):m.raw(m.profile(a['id']),[])
 def test_http_blocks_untrusted_origin_before_profile_mutation(self):
  import threading,urllib.request,urllib.error
  from http.server import ThreadingHTTPServer
  http=ThreadingHTTPServer(('127.0.0.1',0),m.Handler);thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
  try:
   req=urllib.request.Request('http://127.0.0.1:'+str(http.server_port)+'/api/models/save',data=b'{}',headers={'Origin':'https://untrusted.example','Content-Type':'application/json'})
   with self.assertRaises(urllib.error.HTTPError) as caught:urllib.request.urlopen(req)
   with caught.exception as response:body=json.load(response);self.assertEqual(body['code'],'origin');self.assertIsNone(response.headers.get('Access-Control-Allow-Origin'))
   self.assertEqual(m.profiles(),[])
  finally:http.shutdown();http.server_close();thread.join()
 def test_http_state_returns_masked_profile_and_persisted_route(self):
  import threading,urllib.request
  from http.server import ThreadingHTTPServer
  a=self.create();m.bind({'role':'design','profileId':a['id']});http=ThreadingHTTPServer(('127.0.0.1',0),m.Handler);thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
  try:
   req=urllib.request.Request('http://127.0.0.1:'+str(http.server_port)+'/api/models/state',headers={'Origin':'http://127.0.0.1:8765'})
   with urllib.request.urlopen(req) as response:body=response.read().decode();self.assertEqual(response.headers['Access-Control-Allow-Origin'],'http://127.0.0.1:8765')
   self.assertNotIn('safe-test-secret',body);self.assertNotIn('credentialRef',body);self.assertEqual(json.loads(body)['routing']['design'],a['id'])
  finally:http.shutdown();http.server_close();thread.join()
