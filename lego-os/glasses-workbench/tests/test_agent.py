import unittest,tempfile,json
from pathlib import Path
from unittest.mock import Mock
import server,os_backend,agent_backend as a,speech_gateway as s,voice_backend as v,qwen_realtime as q
class AgentTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.old=server.DB;server.DB=Path(self.tmp.name)/'test.db';server.init()
 def tearDown(self):server.DB=self.old;self.tmp.cleanup()
 def publish(self):
  d=server.save({'id':'school','name':'My Planner','description':'Own lessons','template':'calendar','nodes':[{'id':'n','atomId':'F02'},{'id':'w','atomId':'O07'},{'id':'a','atomId':'O08'}],'edges':[{'from':'n','to':'w'},{'from':'n','to':'a'}],'elements':[]},'service');return os_backend.publish(server.connect,{'id':d['id'],'expected':d['_revision']})['release']
 def gen(self,actions=[],answer='Ready'):
  return Mock(return_value={'text':json.dumps({'answer':answer,'actions':actions}),'provider':'Test','model':'test','profileId':'test'})
 def test_registry_tracks_published_versions_and_ignores_draft(self):
  r=self.publish();self.assertEqual(a.catalog(server)[0]['releaseId'],r['id']);d=next(d for d in server.docs() if d['id']=='school');d=server.save({**d,'name':'Updated'},'service',d['_revision']);self.assertEqual(a.catalog(server)[0]['name'],'My Planner');os_backend.publish(server.connect,{'id':'school','expected':d['_revision']});self.assertEqual(a.catalog(server)[0]['name'],'Updated')
 def test_no_unknown_tools_surfaces_or_routes(self):
  self.publish();items=a.catalog(server)
  for actions in [[{'type':'execute','serviceId':'school'}],[{'type':'run_service','serviceId':'missing'}],[{'type':'present_service','serviceId':'school','surface':'camera'}],[{'type':'service_action','serviceId':'school','action':'route','value':'javascript:bad'}]]:
   with self.assertRaises(ValueError):a.validate(actions,items)
 def test_provider_entry_never_accepts_model_urls(self):
  self.assertEqual(a.validate([{'type':'present_entry','page':'travel','url':'https://example.invalid'}],[]),[{'type':'present_entry','page':'travel'}])
  with self.assertRaises(ValueError):a.validate([{'type':'present_entry','page':'payment'}],[])
 def test_videos_only_use_an_installed_official_youtube_service(self):
  action={'type':'search_videos','serviceId':'youtube','query':' AI ','ranking':'recent_popular'}
  item={'id':'youtube','releaseId':'v1','officialYouTube':True}
  self.assertEqual(a.validate([action],[item])[0]['query'],'AI')
  with self.assertRaises(ValueError):a.validate([action],[{**item,'officialYouTube':False}])
 def test_receipts_are_bound_to_session_and_fact_bodies_not_logged(self):
  self.publish();r=a.turn(server,{'text':'Read my planner'},self.gen([{'type':'run_service','serviceId':'school'}]));ident=r['actions'][0]['id']
  with self.assertRaisesRegex(ValueError,'尚未全部'):a.turn(server,{'text':'next','sessionId':r['sessionId']},self.gen())
  with self.assertRaises(ValueError):a.turn(server,{'text':'next','sessionId':r['sessionId'],'toolResults':[{'id':'fake','status':'succeeded'}]},self.gen())
  gen=self.gen(answer='Actual result');a.turn(server,{'text':'Read my planner','sessionId':r['sessionId'],'toolResults':[{'id':ident,'status':'failed','error':'network failure','result':{'private':'FACT_BODY'}}]},gen)
  prompt=gen.call_args[0][0][-1]['content'];self.assertIn('network failure',prompt);saved=next(d for d in server.docs() if d['id']==r['sessionId']);self.assertNotIn('FACT_BODY',json.dumps(saved));self.assertEqual(saved['receipts'][0]['source'],'device-reported')
 def test_new_sessions_isolate_history_and_resume_persists(self):
  r=a.turn(server,{'text':'My code is Pine'},self.gen());g=self.gen();a.turn(server,{'text':'what is my code?','sessionId':r['sessionId']},g);self.assertIn('Pine',str(g.call_args));g2=self.gen();a.turn(server,{'text':'Hello'},g2);self.assertNotIn('Pine',str(g2.call_args));self.assertEqual(a.session(server,r['sessionId'])['history'][0]['content'],'My code is Pine')
 def test_paid_connector_is_never_implicitly_authorized(self):
  items=[{'id':'external','releaseId':'v1','surfaces':['window'],'routes':['today'],'requiresConfirmation':True}];self.assertTrue(a.validate([{'type':'run_service','serviceId':'external'}],items)[0]['requiresConfirmation'])
 def test_cancel_clears_pending_plan(self):
  self.publish();r=a.turn(server,{'text':'read'},self.gen([{'type':'run_service','serviceId':'school'}]));a.cancel(server,{'sessionId':r['sessionId']});a.turn(server,{'text':'stop','sessionId':r['sessionId']},self.gen())
 def test_speech_keeps_only_profile_reference_and_checks_protocol(self):
  p={'expected':0,'speechProfileId':'q','region':'cn','asrModel':'qwen3-asr-flash','ttsModel':'Qwen-Audio-3.1-TTS','voice':'longanhuan_v3.1'}
  profiles=lambda:[{'id':'q','provider':'Qwen','enabled':True}]
  with self.assertRaisesRegex(ValueError,'混用'):s.save(server,p,profiles)
  s.save(server,{**p,'ttsModel':'qwen3-tts-flash','voice':'Cherry','speechKey':'DO_NOT_SAVE'},profiles);cfg=next(d for d in server.docs() if d['id']==s.CONFIG_ID);self.assertNotIn('DO_NOT_SAVE',str(cfg));self.assertEqual(cfg['speechProfileId'],'q')
 def test_realtime_requires_workspace_and_region_host(self):
  with self.assertRaises(ValueError):q.address({'model':'qwen3.8-omni-flash-realtime'})
  self.assertIn('workspace-123.cn-beijing.maas.aliyuncs.com',q.address({'model':'qwen3.8-omni-flash-realtime','workspaceId':'workspace-123','region':'cn'}))

 def test_explicit_memory_is_reusable_editable_and_reversibly_disabled(self):
  r=a.save_memory(server,{'text':'默认天气位置是深圳'});g=self.gen();a.turn(server,{'text':'天气位置？'},g);self.assertIn('深圳',str(g.call_args))
  with self.assertRaises(ValueError):a.save_memory(server,{'id':r['id'],'text':'changed','expected':0})
  r2=a.save_memory(server,{'id':r['id'],'text':'默认天气位置是深圳','expected':r['revision'],'deleted':True});g=self.gen();a.turn(server,{'text':'天气位置？'},g);self.assertNotIn('深圳',str(g.call_args))
  a.save_memory(server,{'id':r['id'],'text':'默认天气位置是深圳','expected':r2['revision'],'deleted':False});self.assertFalse(a.memories(server)['memories'][0]['deleted'])
