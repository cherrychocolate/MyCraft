import unittest,copy,tempfile
from pathlib import Path
import watchface_core as w,server,os_backend
class WatchfaceTests(unittest.TestCase):
 def face(self):return {'schemaVersion':1,'width':600,'height':800,'nodes':[{'id':'clock','type':'text','text':'12:00','binding':'face.time','x':32,'y':100,'w':500,'h':100,'locked':True},{'id':'label','type':'text','text':'Hello','x':32,'y':250,'w':500,'h':60}]}
 def test_atomic_patch_and_lock(self):
  f=self.face();before=copy.deepcopy(f)
  with self.assertRaisesRegex(ValueError,'锁定'):w.patch(f,[{'op':'update','id':'label','changes':{'text':'changed'}},{'op':'remove','id':'clock'}])
  self.assertEqual(f,before)
 def test_stable_ids_and_graphics_preserved(self):
  f=self.face();f['nodes'][1]['type']='image';r=w.patch(f,[{'op':'update','id':'label','changes':{'y':300}}]);self.assertEqual(r['nodes'][1]['type'],'image');self.assertEqual(r['nodes'][1]['id'],'label');self.assertEqual(f['nodes'][1]['y'],250)
 def test_invalid_bounds_and_duplicate_ids(self):
  f=self.face()
  with self.assertRaises(ValueError):w.patch(f,[{'op':'update','id':'label','changes':{'w':900}}])
  with self.assertRaises(ValueError):w.patch(f,[{'op':'add','node':f['nodes'][0]}])
 def test_release_selection_is_version_pinned_and_conflict_safe(self):
  with tempfile.TemporaryDirectory() as tmp:
   old=server.DB;server.DB=Path(tmp)/'test.db'
   try:
    server.init();f=self.face();server.save({'id':'release-a','snapshot':{'watchface':f}},'release')
    r=w.apply_release(server.connect,'release-a',0);self.assertEqual(r['state']['watchface']['activeReleaseId'],'release-a')
    with self.assertRaises(ValueError):w.apply_release(server.connect,None,0)
    r=w.apply_release(server.connect,None,1);self.assertEqual(r['state']['watchface']['history'],['release-a',None])
   finally:server.DB=old
