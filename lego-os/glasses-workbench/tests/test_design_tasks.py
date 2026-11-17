import unittest,tempfile,json,time
from pathlib import Path
import server,watchface_tasks as tasks,watchface_core,os_backend,design_media
class DesignTaskTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.old=server.DB;server.DB=Path(self.tmp.name)/'test.db';server.init()
  self.face={'schemaVersion':1,'width':600,'height':800,'pageId':'face','nodes':[{'id':'time','type':'text','text':'time','binding':'face.time','x':0,'y':0,'w':500,'h':100}]}
  self.doc=server.save({'id':'draft','name':'Face','kind':'service','watchface':self.face,'elements':self.face['nodes'],'pages':[{'id':'face','elements':self.face['nodes']}],'startPage':'face'},'service')
 def tearDown(self):server.DB=self.old;self.tmp.cleanup()
 def proposal(self):
  return server.save({'id':'task','sourceId':'draft','baseRevision':1,'createdAt':time.time(),'status':'review','prompt':'orange','summary':'changed','operations':[{'op':'update','id':'time','changes':{'color':'#ff5100'}}]},'design-task')
 def test_accept_updates_scene_and_editor_and_conversation_atomically(self):
  self.proposal();d=tasks.accept(server,{'taskId':'task'});self.assertEqual(d['_revision'],2);self.assertEqual(d['watchface']['nodes'],d['elements']);self.assertEqual(d['pages'][0]['elements'],d['elements']);self.assertEqual(len(d['designConversation']),2)
  with self.assertRaises(ValueError):tasks.accept(server,{'taskId':'task'})
 def test_stale_proposal_never_overwrites_manual_edit(self):
  self.proposal();server.save({**self.doc,'name':'Manual edit'},'service',1)
  with self.assertRaisesRegex(ValueError,'草稿已改变'):tasks.accept(server,{'taskId':'task'})
  self.assertEqual(tasks.get(server,'draft','service')['name'],'Manual edit');self.assertEqual(tasks.get(server,'task','design-task')['status'],'review')
 def test_cancel_and_restart_do_not_apply(self):
  self.proposal();tasks.cancel(server,{'taskId':'task'})
  with self.assertRaises(ValueError):tasks.accept(server,{'taskId':'task'})
  server.save({'id':'running','createdAt':0,'status':'running'},'design-task');tasks.recover(server);self.assertEqual(tasks.get(server,'running','design-task')['status'],'interrupted');self.assertEqual(tasks.get(server,'draft','service')['_revision'],1)
 def test_publish_is_not_apply_or_launchable_app_and_new_version_does_not_replace(self):
  r=os_backend.publish(server.connect,{'id':'draft','expected':1,'mode':'watchface'})['release'];self.assertEqual(os_backend.state(server.connect)['state']['installed'],{})
  applied=watchface_core.apply_release(server.connect,r['id'],0);server.save({**self.doc,'name':'Version two'},'service',1);new=os_backend.publish(server.connect,{'id':'draft','expected':2,'mode':'watchface'})['release'];self.assertNotEqual(r['id'],new['id']);self.assertEqual(os_backend.state(server.connect)['state']['watchface']['activeReleaseId'],r['id'])
 def test_media_rejects_fabricated_image_and_unsupported_provider(self):
  with self.assertRaises(ValueError):design_media.image_part('data:image/png;base64,YWJj')
  logs=[]
  with self.assertRaisesRegex(ValueError,'Gemini'):design_media.run(server,{'operation':'generate'},lambda *a:{'provider':'DeepSeek'},None,None,None,lambda *a,**k:logs.append(k))
  self.assertEqual(len(logs),1)
 def test_media_payload_and_provenance(self):
  # Synthetic PNG signature tests protocol parsing only, not visual output quality.
  import base64
  b=base64.b64encode(b'\x89PNG\r\n\x1a\n'+b'fixture').decode();seen=[]
  def request(url,payload,headers,**kw):seen.append(payload);return {'candidates':[{'content':{'parts':[{'inlineData':{'mimeType':'image/png','data':b}}]}}]}
  model={'provider':'Gemini','model':'test','id':'m','baseUrl':'https://example.com'}
  r=design_media.run(server,{'operation':'generate','prompt':'sun'},lambda *a:model,lambda m:'test',lambda b:b,request,lambda *a,**k:None)
  self.assertEqual(seen[0]['generationConfig']['responseModalities'],['TEXT','IMAGE']);self.assertEqual(r['asset']['provenance']['prompt'],'sun')
