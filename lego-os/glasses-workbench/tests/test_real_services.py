import unittest
from unittest.mock import patch
import service_connectors as s
class RealServiceTests(unittest.TestCase):
 def setUp(self):s.REDDIT_CACHE.clear()
 def test_reddit_rss_fields_and_unavailable_metrics(self):
  raw=b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>post1</id><title>Actual post</title><link href="https://www.reddit.com/r/test/comments/1/a/"/><content type="html">&lt;p&gt;Text&lt;/p&gt;</content></entry></feed>'
  with patch.object(s,'fetch',return_value=raw):r=s.reddit({'subreddit':'test'})
  self.assertEqual(r['items'][0]['excerpt'],'Text');self.assertIsNone(r['items'][0]['score']);self.assertEqual(len(r['items']),1)
 def test_no_default_location(self):
  with self.assertRaisesRegex(ValueError,'位置'):s.weather({})
 def test_community_validation_before_network(self):
  with patch.object(s,'fetch') as fetch:
   with self.assertRaises(ValueError):s.reddit({'subreddit':'../../private'})
   fetch.assert_not_called()
 def test_weather_7day_hourly_explicit_coordinates(self):
  with patch.object(s,'fetch',return_value=b'{"current":{"temperature_2m":25}}') as fetch:
   r=s.weather({'lat':22.55,'lon':114.05,'locationName':'深圳'})
  self.assertIn('forecast_days=7',fetch.call_args[0][0]);self.assertIn('hourly=',fetch.call_args[0][0]);self.assertEqual(r['location']['name'],'深圳')
 def test_reddit_media_html_extraction_and_safe_urls(self):
  parser=s.FeedMedia();parser.feed('<img src="https://preview.redd.it/test.jpg?x=1&amp;y=2"><img src="https://evil.example/a.jpg"><a href="https://v.redd.it/abc">video</a>')
  media=parser.media();self.assertEqual(media['images'],['https://preview.redd.it/test.jpg?x=1&y=2']);self.assertEqual(media['videoPage'],'https://v.redd.it/abc');self.assertIsNone(media['video'])
  for url in ['http://i.redd.it/a.jpg','https://i.redd.it.evil/a.jpg','https://key@i.redd.it/a.jpg','https://i.redd.it:abc/a.jpg','javascript:alert(1)']:self.assertIsNone(s.media_url(url))
 def test_reddit_authenticated_gallery_video_and_sensitive(self):
  post={'id':'a','title':'Media','permalink':'/r/test/comments/a/','preview':{'images':[{'source':{'url':'https://preview.redd.it/a.jpg?a=1&amp;b=2'}}]},'media_metadata':{'b':{'s':{'u':'https://i.redd.it/b.png'}}},'secure_media':{'reddit_video':{'fallback_url':'https://v.redd.it/a/DASH_720.mp4'}},'score':23,'num_comments':4}
  items=s.reddit_json({'data':{'children':[{'data':post},{'data':{**post,'over_18':True}}]}},'test')
  self.assertEqual(len(items[0]['media']['images']),2);self.assertEqual(items[0]['score'],23);self.assertTrue(items[0]['media']['video'].endswith('.mp4'));self.assertTrue(items[1]['media']['sensitive']);self.assertEqual(items[1]['media']['images'],[]);self.assertIsNone(items[1]['media']['video'])
 def test_reddit_oauth_requires_credential_before_call(self):
  with patch.object(s.urllib.request,'urlopen') as network:
   with self.assertRaisesRegex(ValueError,'OAuth'):s.reddit({'redditSource':'oauth'})
   network.assert_not_called()

 def test_reddit_short_cache_and_stale_timestamp(self):
  raw=b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>p</id><title>Actual</title></entry></feed>'
  with patch.object(s,'fetch',return_value=raw) as fetch:
   first=s.reddit({'subreddit':'test'});second=s.reddit({'subreddit':'test'})
  self.assertEqual(fetch.call_count,1);self.assertTrue(second['cached']);self.assertEqual(first['at'],second['at'])
  for cached in s.REDDIT_CACHE.values():cached['at']-=121
  with patch.object(s,'fetch',side_effect=s.urllib.error.HTTPError('https://www.reddit.com',429,'rate limited',{},None)):
   stale=s.reddit({'subreddit':'test'})
  self.assertTrue(stale['stale']);self.assertIn('429',stale['cacheReason'])
