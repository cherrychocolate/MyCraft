import unittest,tempfile,threading,sys,json,urllib.request,urllib.error
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
class HTTPTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.old=(server.DB,server.DATA);server.DATA=Path(self.tmp.name);server.DB=server.DATA/'test.sqlite3';server.init();self.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler);self.thread=threading.Thread(target=self.http.serve_forever,daemon=True);self.thread.start();self.url='http://127.0.0.1:'+str(self.http.server_port)
 def tearDown(self):self.http.shutdown();self.http.server_close();server.DB,server.DATA=self.old;self.tmp.cleanup()
 def req(self,path,data=None,headers=None):
  req=urllib.request.Request(self.url+'/api/'+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json',**(headers or {})})
  with urllib.request.urlopen(req) as r:return json.load(r)
 def test_export_import_preserves_all_records_and_backup(self):
  self.req('save',{'kind':'service','document':{'id':'demo','name':'Migration','nodes':[],'cameraSample':'data:image/png;base64,example'}})
  self.req('save',{'kind':'service','document':{'id':'demo','name':'Revision 2'},'expected':1})
  package=self.req('export');self.req('delete',{'id':'demo'});self.req('import',package);self.assertEqual(self.req('export')['tables'],package['tables']);self.assertEqual(len(list(server.DATA.glob('before-import-*'))),1)
 def test_invalid_import_does_not_change_workspace(self):
  before=self.req('export')['tables'];p={'format':'glasshouse','version':1,'tables':{}}
  with self.assertRaises(urllib.error.HTTPError):self.req('import',p)
  self.assertEqual(self.req('export')['tables'],before)
 def test_cross_site_write_rejected(self):
  with self.assertRaises(urllib.error.HTTPError):self.req('save',{'kind':'service','document':{'id':'bad'}},{'Origin':'https://example.com'})
  self.assertFalse(any(d['id']=='bad' for d in self.req('state')['documents']))
 def test_calendar_requires_explicit_id(self):
  with self.assertRaises(urllib.error.HTTPError) as error:self.req('calendar',{'calendarId':''})
  self.assertIn('primary',json.load(error.exception)['error']);error.exception.close()
 def test_credentials_not_exported(self):
  self.req('key',{'provider':'Gemini','key':'test-secret-value'});self.assertNotIn('test-secret-value',json.dumps(self.req('export')));server.SECRETS.clear()
if __name__=='__main__':unittest.main()
