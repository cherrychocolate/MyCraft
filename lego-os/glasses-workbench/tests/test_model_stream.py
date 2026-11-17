import io,json,sys,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import model_stream as m
class Response(io.BytesIO):
 def __enter__(self):return self
 def __exit__(self,*args):self.close()
class Tests(unittest.TestCase):
 def test_answer_preview_never_exposes_actions_or_broken_escape(self):
  p=m.AnswerPreview();self.assertIsNone(p.feed('{"ans'))
  self.assertEqual(p.feed('wer":"hello\\'), 'hello')
  self.assertEqual(p.feed('n\\u4f60'), 'hello\n你')
  self.assertIsNone(p.feed('","actions":[{"type":"navigate"}]}'))
  self.assertNotIn('navigate',p.shown)
 def test_stream_forwards_content_but_not_reasoning_or_tool_calls(self):
  events=[{'choices':[{'delta':{'reasoning_content':'SECRET'}}]},{'choices':[{'delta':{'content':'hello'}}]},{'choices':[{'delta':{'tool_calls':[{'x':'PRIVATE'}]}}]},{'choices':[{'delta':{'content':' world'}}]}]
  raw=''.join('data: '+json.dumps(e)+'\n\n' for e in events)+'data: [DONE]\n\n';deltas=[]
  with patch('urllib.request.OpenerDirector.open',return_value=Response(raw.encode())):
   text,_=m.request('https://test.example',{}, {},deltas.append)
  self.assertEqual(text,'hello world');self.assertEqual(deltas,['hello',' world'])
 def test_gemini_thought_parts_are_not_previewed(self):
  raw='data: '+json.dumps({'candidates':[{'content':{'parts':[{'text':'hidden','thought':True},{'text':'answer'}]}}]})+'\n\n';deltas=[]
  with patch('urllib.request.OpenerDirector.open',return_value=Response(raw.encode())):
   text,_=m.request('https://test.example',{}, {},deltas.append,gemini=True)
  self.assertEqual(text,'answer')
if __name__=='__main__':unittest.main()
