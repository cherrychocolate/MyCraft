import unittest,tempfile,copy,json
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
import server,creative_assets as c,watchface_core as w
class CreativeTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.old=server.DB;server.DB=Path(self.tmp.name)/'test.db';server.init()
 def tearDown(self):server.DB=self.old;self.tmp.cleanup()
 def test_search_keeps_source_and_license(self):
  response={'query':{'pages':{'1':{'title':'File:Snoopy.jpg','imageinfo':[{'mime':'image/jpeg','url':'https://upload.wikimedia.org/a.jpg','descriptionurl':'https://commons.wikimedia.org/wiki/File:Snoopy.jpg','extmetadata':{'Artist':{'value':'<b>Author</b>'},'LicenseShortName':{'value':'CC BY-SA'}}}]}}}}
  with patch.object(c.connections,'request',return_value=response):r=c.search(server,'Snoopy')
  self.assertEqual(r['items'][0]['author'],'Author');self.assertEqual(r['items'][0]['license'],'CC BY-SA');self.assertEqual(r['provider'],'Wikimedia Commons')
 def test_search_import_rejects_non_wikimedia_target(self):
  server.save({'id':'s','items':[{'url':'https://127.0.0.1/private'}]},'asset-search')
  with self.assertRaisesRegex(ValueError,'Wikimedia'):c.import_asset(server,{'searchId':'s','index':0})
 def test_one_sentence_creates_editable_scene_with_separate_live_clock_and_animation(self):
  asset={'id':'a','imageSrc':'https://example.com/character.png'}
  with patch.object(c,'search',return_value={'id':'s','items':[]}),patch.object(c.threading,'Thread',side_effect=lambda target,daemon:SimpleNamespace(start=target)):
   r=c.create(server,{'prompt':'史努比主题表盘'},lambda *a:{'id':'model'},lambda *a:(json.dumps({'name':'史努比','background':'#ffffff','changes':[]}),{}),lambda p:{'asset':asset})
  job=next(x for x in c.jobs(server)['jobs'] if x['id']==r['id']);self.assertEqual(job['status'],'succeeded')
  doc=next(d for d in server.docs() if d['id']==job['serviceId']);self.assertEqual(doc['elements'],doc['watchface']['nodes']);w.validate(doc['watchface']);self.assertEqual(doc['elements'][0]['binding'],'face.time');self.assertEqual(doc['elements'][2]['type'],'component');self.assertEqual(doc['elements'][2]['referenceAssetId'],'a');self.assertEqual(doc['watchface']['background'],'#000000')
 def test_failed_generation_never_creates_fake_service(self):
  def fail(p):raise ValueError('no pixels')
  with patch.object(c,'search',return_value={'id':'s','items':[]}),patch.object(c.threading,'Thread',side_effect=lambda target,daemon:SimpleNamespace(start=target)):
   r=c.create(server,{'prompt':'史努比'},None,None,fail)
  self.assertEqual(c.jobs(server)['jobs'][0]['status'],'failed');self.assertFalse(any(d['_kind']=='service' for d in server.docs()))
 def test_animation_budget_and_order(self):
  face={'schemaVersion':1,'width':600,'height':800,'nodes':[{'id':'a','type':'image','x':0,'y':0,'w':300,'h':300,'motion':{'preset':'keyframes','durationMs':2000,'frames':[{'offset':0},{'offset':1,'y':-30}]}}]}
  w.validate(face)
  for frames in [[{'offset':0},{'offset':1,'y':999}],[{'offset':1},{'offset':0}],[{'offset':0},{'offset':1,'script':'evil'}]]:
   invalid=copy.deepcopy(face);invalid['nodes'][0]['motion']['frames']=frames
   with self.assertRaises(ValueError):w.validate(invalid)
