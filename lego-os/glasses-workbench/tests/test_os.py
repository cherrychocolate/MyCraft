import unittest,tempfile,json
from pathlib import Path
import server,os_backend
class OSTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.old=server.DB;server.DB=Path(self.tmp.name)/'test.db';server.init()
 def tearDown(self):server.DB=self.old;self.tmp.cleanup()
 def draft(self,name='Test'):
  return server.save({'id':'draft','kind':'service','name':name,'template':'reddit','nodes':[{'id':'n','atomId':'C04'},{'id':'o','atomId':'O08'}],'edges':[{'from':'n','to':'o'}],'elements':[]},'service')
 def test_draft_invisible_until_publish_and_snapshot_immutable(self):
  d=self.draft();self.assertEqual(os_backend.state(server.connect)['state']['installed'],{})
  r=os_backend.publish(server.connect,{'id':d['id'],'expected':d['_revision']})['release'];server.save({**d,'name':'Edited draft'},'service',1)
  self.assertEqual(os_backend.state(server.connect)['releases'][0]['snapshot']['name'],'Test');self.assertEqual(r['sourceRevision'],1)
 def test_publish_version_and_reuse_identical_snapshot(self):
  d=self.draft();p={'id':'draft','expected':1};a=os_backend.publish(server.connect,p);b=os_backend.publish(server.connect,p);self.assertEqual(a['release']['id'],b['release']['id'])
  d=server.save({**d,'name':'v2'},'service',1);c=os_backend.publish(server.connect,{'id':'draft','expected':2});self.assertEqual(c['release']['version'],2)
  os_backend.install(server.connect,{'sourceId':'draft','releaseId':a['release']['id']});self.assertEqual(os_backend.state(server.connect)['state']['installed']['draft']['releaseId'],a['release']['id'])
 def test_os_userdata_independent_from_draft_and_install_pointer_protected(self):
  self.draft();os_backend.publish(server.connect,{'id':'draft','expected':1});r=os_backend.state(server.connect);r['state']['userdata']['draft']={'redditState':{'saved':['x']}};r['state']['installed']={}
  os_backend.update(server.connect,{'state':r['state'],'expected':r['revision']});s=os_backend.state(server.connect);self.assertTrue(s['state']['installed']);self.assertEqual(s['state']['userdata']['draft']['redditState']['saved'],['x']);self.assertNotIn('redditState',next(d for d in server.docs() if d['id']=='draft'))
  with self.assertRaises(ValueError):os_backend.update(server.connect,{'state':r['state'],'expected':r['revision']})
 def test_unknown_executor_and_bad_prototype_blocked(self):
  d=self.draft();d['nodes'][0]['atomId']='I09';server.save(d,'service',1)
  with self.assertRaisesRegex(ValueError,'执行器'):os_backend.publish(server.connect,{'id':'draft','expected':2})
  with self.assertRaisesRegex(ValueError,'首页'):os_backend.validate({'pages':[]},'prototype')
 def test_catalog_idempotent_and_no_hardware_invention(self):
  data=os_backend.catalog(server.ROOT);ids=[a['id'] for a in data['atoms']];self.assertEqual(len(ids),len(set(ids)));self.assertTrue(all(not a['hardware'] for a in data['atoms']));a=next(a for a in server.docs() if a['id']=='I09');server.save({**a,'name':'Custom'},'atom',1);server.init();self.assertEqual(next(a for a in server.docs() if a['id']=='I09')['name'],'Custom')
