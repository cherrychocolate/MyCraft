import unittest,tempfile,json
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
import server,external_connectors as e,model_vault,capability_audit,glasses_policy,watchface_core
class ExternalTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.old=server.DB;server.DB=Path(self.tmp.name)/'test.db';server.init();self.vault=model_vault.MemoryVault();e.save_config(server,self.vault,{'key':'apify-test-not-real'})
 def tearDown(self):server.DB=self.old;self.tmp.cleanup()
 def test_registry_is_distinct_and_based_on_real_actor_schemas(self):
  entries=e.registry();self.assertEqual(len(entries),24);self.assertEqual(len({x['id'] for x in entries}),24)
  for x in entries:self.assertTrue(x['inputSchema']['properties']);self.assertTrue(x['source'].startswith('https://apify.com/'))
 def test_defaults_do_not_guess_input_types(self):
  for x in e.registry():
   inp=dict(x['defaults'])
   for k in ['videoUrls','noteUrls','userUrls','directUrls','startUrls']:
    if k in inp and inp[k]==[]:inp[k]=[{'url':'https://example.com/content'}] if k=='startUrls' else ['https://example.com/content']
   e.validate(x,inp)
 def test_missing_credentials_or_invalid_mode_never_starts_paid_run(self):
  entry=e.registry()[0]
  with patch.object(e.connections,'request') as remote:
   with self.assertRaisesRegex(ValueError,'实际运行'):e.start(server,self.vault,{'connectorId':entry['id'],'input':entry['defaults']})
   with self.assertRaisesRegex(ValueError,'0.01'):e.start(server,self.vault,{'connectorId':entry['id'],'input':entry['defaults'],'execute':True,'maxChargeUsd':50})
   remote.assert_not_called()
 def test_async_run_polls_reads_dataset_and_reuses_receipt(self):
  entry=e.registry()[0];responses=[{'data':{'id':'run1','status':'READY'}},{'data':{'id':'run1','status':'SUCCEEDED','defaultDatasetId':'ds1','usageTotalUsd':.01}},[{'id':'post1','title':'A real result','url':'https://reddit.com/r/test/1','thumbnailUrl':'https://i.redd.it/a.jpg'}]]
  with patch.object(e.connections,'request',side_effect=responses) as remote,patch.object(e.threading,'Thread',side_effect=lambda target,daemon:SimpleNamespace(start=target)):
   p={'connectorId':entry['id'],'input':entry['defaults'],'serviceId':'s','execute':True,'maxChargeUsd':.05,'reuse':True};j=e.start(server,self.vault,p);self.assertEqual(j['status'],'succeeded');self.assertEqual(j['result']['type'],'content-feed');self.assertEqual(j['itemCount'],1);self.assertIn('maxTotalChargeUsd=0.05',remote.call_args_list[0].args[0]);again=e.start(server,self.vault,p);self.assertTrue(again['reused']);self.assertEqual(remote.call_count,3)
 def test_failed_run_is_not_successful_feed(self):
  entry=e.registry()[0]
  with patch.object(e.connections,'request',side_effect=[{'data':{'id':'r','status':'READY'}},{'data':{'status':'FAILED'}}]),patch.object(e.threading,'Thread',side_effect=lambda target,daemon:SimpleNamespace(start=target)):
   j=e.start(server,self.vault,{'connectorId':entry['id'],'input':entry['defaults'],'execute':True})
  self.assertEqual(j['status'],'failed');self.assertNotIn('result',j)
 def test_credentials_are_not_in_saved_documents(self):
  self.assertNotIn('apify-test-not-real',json.dumps(server.docs()));self.assertTrue(e.public_config(server,self.vault)['configured'])
 def test_audit_counts_graph_and_simulation_separately(self):
  e.initialize(server);audit=capability_audit.audit(server);self.assertEqual(audit['baselineCount'],83);self.assertEqual(audit['externalCount'],24);self.assertEqual(audit['baselineCounts']['graph'],8);self.assertEqual(audit['baselineCounts']['definition'],67)
 def test_glass_policy_black_background_and_pin_limits(self):
  d={'name':'史努比','pages':[{'id':'p','elements':[]}],'startPage':'p','watchface':{'pageId':'p','nodes':[]}}
  result=glasses_policy.upgrade(d);self.assertEqual(result['watchface']['background'],'#000000');self.assertTrue(any(n['type']=='component' for n in result['elements']));watchface_core.validate(result['watchface'])
  result['watchface']['background']='#ffffff'
  with self.assertRaisesRegex(ValueError,'纯黑'):watchface_core.validate(result['watchface'])
  result=glasses_policy.upgrade(d)
  result['watchface']['nodes'] += [{'id':'pin'+str(i),'type':'text','binding':'pin.text','x':40,'y':500,'w':400,'h':50,'text':'test'} for i in range(3)]
  with self.assertRaisesRegex(ValueError,'2条'):watchface_core.validate(result['watchface'])
