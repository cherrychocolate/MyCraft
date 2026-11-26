import copy,io,json,sys,unittest,urllib.error
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import youtube_connector as yt
class Store:
 def __init__(self):self.rows={};self.logs=[]
 def docs(self):return list(self.rows.values())
 def save(self,d,kind,expected=None):
  d=copy.deepcopy(d);d['_kind']=kind;d['_revision']=self.rows.get(d['id'],{}).get('_revision',0)+1;self.rows[d['id']]=d;return d
 def log_run(self,d):self.logs.append(d)
class Vault:
 def __init__(self):self.values={}
 def put(self,k,v):self.values[k]=v
 def get(self,k):return self.values.get(k)
 def has(self,k):return k in self.values
class Tests(unittest.TestCase):
 def setUp(self):self.s=Store();self.v=Vault();self.key='TESTSECRET_key_12345678901234567890';yt.save(self.s,self.v,{'key':self.key})
 def test_secret_not_public_or_documents(self):
  self.assertNotIn(self.key,json.dumps(self.s.docs()));self.assertNotIn(self.key,json.dumps(yt.public(self.s,self.v)))
 def test_cache_and_query_isolation(self):
  response={'items':[{'id':{'videoId':'abcdefghijk'},'snippet':{'title':'A &amp; B','channelTitle':'Author','thumbnails':{'high':{'url':'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'}}}}]}
  with patch.object(yt,'request',return_value=response) as call:
   a=yt.search(self.s,self.v,{'query':'AR'});b=yt.search(self.s,self.v,{'query':'AR'})
   self.assertEqual(call.call_count,1);self.assertTrue(b['cached']);self.assertEqual(a['items'][0]['title'],'A & B')
   yt.search(self.s,self.v,{'query':'VR'});self.assertEqual(call.call_count,2)
   yt.search(self.s,self.v,{'query':'AR','refresh':True});self.assertEqual(call.call_count,3)
 def test_recent_popular_uses_a_separate_cache_and_official_filters(self):
  with patch.object(yt,'request',return_value={'items':[]}) as call:
   yt.search(self.s,self.v,{'query':'AI'})
   feed=yt.search(self.s,self.v,{'query':'AI','ranking':'recent_popular'})
   self.assertEqual(call.call_count,2)
   self.assertEqual(feed['ranking'],'recent_popular')
   self.assertEqual(call.call_args.args[2]['order'],'viewCount')
   self.assertRegex(call.call_args.args[2]['publishedAfter'],r'^20\d\d-\d\d-\d\dT00:00:00Z$')
 def test_failure_does_not_overwrite_cache(self):
  with patch.object(yt,'request',return_value={'items':[]}):yt.search(self.s,self.v,{'query':'AR'})
  with patch.object(yt,'request',side_effect=ValueError('quota exceeded')):
   with self.assertRaises(ValueError):yt.search(self.s,self.v,{'query':'AR','refresh':True})
  self.assertTrue(yt.search(self.s,self.v,{'query':'AR'})['cached'])
 def test_missing_credential_or_invalid_limit_never_requests(self):
  with patch.object(yt,'request') as call:
   for payload in [{'query':''},{'query':'AR','maxResults':50}]:
    with self.assertRaises(ValueError):yt.search(self.s,self.v,payload)
   with self.assertRaises(ValueError):yt.search(Store(),self.v,{'query':'AR'})
   call.assert_not_called()
 def test_pagination_is_forwarded_and_cached_independently(self):
  with patch.object(yt,'request',return_value={'items':[],'nextPageToken':'PAGE2'}) as call:
   first=yt.search(self.s,self.v,{'query':'AR'})
   self.assertEqual(first['nextPageToken'],'PAGE2')
   yt.search(self.s,self.v,{'query':'AR','pageToken':'PAGE2'})
   self.assertEqual(call.call_args.args[2]['pageToken'],'PAGE2')
   self.assertEqual(call.call_count,2)
   yt.search(self.s,self.v,{'query':'AR','pageToken':'PAGE2'})
   self.assertEqual(call.call_count,2)
 def test_description_survives_disabled_comments(self):
  with patch.object(yt,'request',side_effect=[{'items':[{'snippet':{'description':'Full description'}}]},ValueError('此视频已关闭评论')]):
   result=yt.detail(self.s,self.v,{'videoId':'abcdefghijk'})
   self.assertEqual(result['description'],'Full description')
   self.assertIn('关闭评论',result['commentError'])
 def test_invalid_page_or_video_does_not_request(self):
  with patch.object(yt,'request') as call:
   with self.assertRaises(ValueError):yt.search(self.s,self.v,{'query':'AR','pageToken':'https://evil/'})
   with self.assertRaises(ValueError):yt.detail(self.s,self.v,{'videoId':'../evil'})
   call.assert_not_called()
 def test_upstream_body_and_key_are_never_exposed(self):
  err=urllib.error.HTTPError('https://example',403,'forbidden',{},io.BytesIO(json.dumps({'error':{'message':self.key,'errors':[{'reason':'quotaExceeded'}]}}).encode()))
  with patch('urllib.request.OpenerDirector.open',side_effect=err):
   with self.assertRaisesRegex(ValueError,'配额') as ctx:yt.request(self.key,'search',{})
   self.assertNotIn(self.key,str(ctx.exception))
if __name__=='__main__':unittest.main()
