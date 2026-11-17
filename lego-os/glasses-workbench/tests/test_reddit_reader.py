import io,json,sys,unittest,urllib.error
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import service_connectors as sc
class Reply(io.BytesIO):
 def __enter__(self):return self
 def __exit__(self,*args):self.close()
class Tests(unittest.TestCase):
 def test_full_body_and_nested_comments(self):
  body='native content '*1000
  data=[{'data':{'children':[{'data':{'id':'abc123','name':'t3_abc123','selftext':body}}]}},{'data':{'children':[{'kind':'t1','data':{'name':'t1_test','author':'a','body':'hello','replies':{'data':{'children':[{'kind':'t1','data':{'name':'t1_child','body':'reply'}}]}}}},{'kind':'more','data':{'children':['more123']}}]}}]
  with patch('urllib.request.OpenerDirector.open',return_value=Reply(json.dumps(data).encode())):
   r=sc.reddit_read({'subreddit':'technology','postId':'abc123'})
  self.assertEqual(r['post']['excerpt'],body);self.assertEqual(r['comments'][1]['depth'],1);self.assertEqual(r['nextChildren'],['more123'])
 def test_page_cursor_and_fixed_host(self):
  with patch('urllib.request.OpenerDirector.open',return_value=Reply(b'{"data":{"children":[],"after":"t3_next"}}')) as call:
   r=sc.reddit_read({'subreddit':'technology','after':'t3_abc123'})
   url=call.call_args.args[0].full_url
  self.assertTrue(url.startswith('https://www.reddit.com/r/technology/hot.json?'));self.assertIn('after=t3_abc123',url);self.assertEqual(r['after'],'t3_next')
 def test_bad_ids_never_request(self):
  with patch('urllib.request.OpenerDirector.open') as call:
   for p in [{'subreddit':'../evil'},{'postId':'https://evil'},{'after':'../evil'},{'children':['../evil']}]:
    with self.assertRaises(ValueError):sc.reddit_read(p)
   call.assert_not_called()
 def test_auth_failure_is_actionable_and_does_not_leak_token(self):
  with patch('urllib.request.OpenerDirector.open',side_effect=urllib.error.HTTPError('https://reddit',403,'SECRET',{},io.BytesIO())):
   with self.assertRaisesRegex(ValueError,'授权') as c:sc.reddit_read({'postId':'abc123'},{'Reddit':'SECRET'})
  self.assertNotIn('SECRET',str(c.exception))
if __name__=='__main__':unittest.main()
