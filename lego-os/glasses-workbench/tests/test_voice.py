import unittest,json,base64
from unittest.mock import Mock
import voice_backend as v
class VoiceTests(unittest.TestCase):
 def cfg(self):return v.config({'provider':'Qwen'})
 def test_no_rule_fallback_without_key(self):
  with self.assertRaisesRegex(ValueError,'API Key'):v.chat({'text':'深圳天气如何'},self.cfg(),{}, {'Qwen':'https://example.com'},Mock())
 def test_model_answer_and_validated_actions(self):
  network=Mock(return_value={'choices':[{'message':{'content':json.dumps({'answer':'打开天气服务','actions':[{'type':'open_service','serviceId':'weather'}]})}}]})
  result=v.chat({'text':'看看天气','context':{'services':[{'id':'weather'}]}},self.cfg(),{'Qwen':'SECRET'},{'Qwen':'https://example.com'},network)
  self.assertEqual(result['answer'],'打开天气服务');self.assertNotIn('SECRET',str(result));self.assertIn('dashscope.aliyuncs.com',network.call_args[0][0])
 def test_model_cannot_invoke_unknown_service_or_script(self):
  network=Mock(return_value={'choices':[{'message':{'content':'{"answer":"x","actions":[{"type":"execute","command":"bad"}]}'}}]})
  with self.assertRaisesRegex(ValueError,'不受支持'):v.chat({'text':'x','context':{}},self.cfg(),{'Qwen':'key'},{'Qwen':'x'},network)
 def test_config_does_not_persist_secrets(self):
  cfg=v.config({'chatKey':'SECRET','speechKey':'SECRET','model':'model'});self.assertNotIn('SECRET',str(cfg))
 def test_asr_payload_and_actual_transcript(self):
  network=Mock(return_value={'choices':[{'message':{'content':'明天有什么课'}}]});wav=b'RIFF'+b'\0'*4+b'WAVE'+b'\0'*32
  r=v.asr({'audio':'data:audio/wav;base64,'+base64.b64encode(wav).decode()},self.cfg(),{'QwenSpeech':'key'},network)
  self.assertEqual(r['text'],'明天有什么课');self.assertEqual(network.call_args[0][1]['messages'][0]['content'][0]['type'],'input_audio')
 def test_bad_audio_rejected(self):
  with self.assertRaises(ValueError):v.asr({'audio':'data:text/plain;base64,QQ=='},self.cfg(),{'QwenSpeech':'key'},Mock())
 def test_workspace_domain_is_constrained(self):
  self.assertEqual(v.base(v.config({'workspaceId':'workspace-123','region':'cn'})),'https://workspace-123.cn-beijing.maas.aliyuncs.com')
  with self.assertRaises(ValueError):v.base(v.config({'workspaceId':'bad.example.com/path'}))
 def test_tts_returns_local_audio_handle(self):
  import io
  from unittest.mock import patch
  audio=io.BytesIO(b'RIFFaudio');audio.headers={'Content-Type':'audio/wav'}
  opener=Mock();opener.open.return_value=audio
  network=Mock(return_value={'output':{'audio':{'url':'https://example.oss-cn-beijing.aliyuncs.com/audio.wav'}}})
  with patch('voice_backend.urllib.request.build_opener',return_value=opener):r=v.tts({'text':'连接测试'},self.cfg(),{'QwenSpeech':'SECRET'},network)
  self.assertTrue(r['url'].startswith('/api/speech-audio?id='));self.assertNotIn('SECRET',str(r))
