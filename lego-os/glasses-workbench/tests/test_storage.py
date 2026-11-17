import unittest, tempfile, sys, json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
class StorageTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.old=server.DB;server.DB=Path(self.tmp.name)/'test.sqlite3';server.init()
 def tearDown(self): server.DB=self.old;self.tmp.cleanup()
 def test_seed_contract(self):
  atoms=[d for d in server.docs() if d['_kind']=='atom'];self.assertEqual(len(atoms),83);self.assertEqual(len({a['category'] for a in atoms}),8);self.assertTrue(all(a['input'] and a['output'] for a in atoms))
 def test_version_and_snapshot(self):
  atom=next(d for d in server.docs() if d['id']=='I01');s=server.save({'id':'service','nodes':[{'snapshot':atom}]},'service');updated=server.save({**atom,'name':'Changed'},'atom',1)
  self.assertEqual(updated['_revision'],2);self.assertEqual(next(d for d in server.docs() if d['id']=='service')['nodes'][0]['snapshot']['name'],'语音指令采集')
  with server.connect() as c:self.assertEqual(c.execute('SELECT COUNT(*) FROM history').fetchone()[0],1)
 def test_conflict_is_atomic(self):
  a=server.save({'id':'sample','name':'one'},'service');server.save({**a,'name':'two'},'service',1)
  with self.assertRaises(ValueError):server.save({**a,'name':'stale'},'service',1)
  self.assertEqual(next(d for d in server.docs() if d['id']=='sample')['name'],'two')
 def test_soft_delete_restore(self):
  a=server.save({'id':'sample','name':'sample'},'service');a=server.save({**a,'deleted':True},'service',1);a=server.save({**a,'deleted':False},'service',2);self.assertFalse(a['deleted']);self.assertEqual(a['_revision'],3)
 def test_noop_save_has_no_history(self):
  a=server.save({'id':'same','name':'same','nodes':[]},'service');b=server.save({'nodes':[],'name':'same',**a},'service',a['_revision']);self.assertEqual(a['_revision'],b['_revision'])
  with server.connect() as c:self.assertEqual(c.execute("SELECT COUNT(*) FROM history WHERE id='same'").fetchone()[0],0)
 def test_output_migration_preserves_customizations(self):
  old=next(x for x in server.docs() if x['id']=='O03');new=next(x for x in server.docs() if x['id']=='O07');server.save({**new,'name':'我的 Widget'},'atom',1);server.init()
  self.assertEqual(next(x for x in server.docs() if x['id']=='O07')['name'],'我的 Widget');self.assertEqual(next(x for x in server.docs() if x['id']=='O03'),old)
 def test_ai_requires_real_configuration(self):
  with self.assertRaises(ValueError):server.ai({'provider':'unknown','model':'x'})
if __name__=='__main__':unittest.main()
