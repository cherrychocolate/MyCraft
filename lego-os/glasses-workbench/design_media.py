"""Explicit media tools with provenance; never pretend a text-only model generated pixels."""
import base64,re,time,uuid,urllib.parse

def image_part(data,max_bytes=4_000_000):
 m=re.fullmatch(r'data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)',str(data))
 if not m:raise ValueError('需要 PNG、JPEG 或 WebP 图像')
 raw=base64.b64decode(m[2],validate=True)
 if not raw or len(raw)>max_bytes:raise ValueError('图片为空或超过4MB')
 if not (raw.startswith(b'\x89PNG\r\n\x1a\n') or raw.startswith(b'\xff\xd8\xff') or (raw[:4]==b'RIFF' and raw[8:12]==b'WEBP')):raise ValueError('图像内容与格式不符')
 return {'mimeType':m[1],'data':m[2]}

def run(server,p,choose,credential,endpoint,request,record):
 operation=p.get('operation')
 if operation not in ('generate','review'):raise ValueError('未知素材工具')
 role='image' if operation=='generate' else 'vision';model=choose({},role);start=time.monotonic()
 try:
  if model['provider']!='Gemini' or model.get('storage')=='legacy':raise ValueError('当前素材工具使用 Gemini 原生接口，请在模型中心配置对应用途；不会回退到文本模型')
  key=credential(model);base=endpoint(model['baseUrl']);prompt=str(p.get('prompt','')).strip()[:6000]
  if not prompt:raise ValueError('请输入素材需求或审查要求')
  parts=[{'text':('生成用于600×800眼镜表盘的独立图形素材，不要绘制时钟文字和整个UI。' if operation=='generate' else '审查这张真实渲染的600×800眼镜表盘截图，指出具体的可读性、对比度、遮挡和布局问题。不要声称修改了设计。')+prompt}]
  if operation=='review':parts.append({'inlineData':image_part(p.get('image'))})
  payload={'contents':[{'role':'user','parts':parts}],'generationConfig':{'maxOutputTokens':4096}}
  if operation=='generate':payload['generationConfig']['responseModalities']=['TEXT','IMAGE']
  result=request(base+'/models/'+urllib.parse.quote(model['model'],safe='')+':generateContent',payload,{'x-goog-api-key':key},timeout=90,max_bytes=8_000_000)
  parts=[part for candidate in result.get('candidates',[])[:1] for part in candidate.get('content',{}).get('parts',[]) if not part.get('thought')]
  text='\n'.join(x.get('text','') for x in parts);output={'text':text,'provider':model['provider'],'model':model['model'],'usage':result.get('usageMetadata',{})}
  if operation=='generate':
   part=next((x['inlineData'] for x in parts if x.get('inlineData')),None)
   if not part:raise ValueError('模型没有返回图片，请确认所选模型支持图片生成；未创建假素材')
   url='data:'+part.get('mimeType','')+';base64,'+part.get('data','');image_part(url)
   asset=server.save({'id':'asset-'+str(uuid.uuid4()),'name':prompt[:80],'imageSrc':url,'provenance':{'type':'generated','provider':model['provider'],'model':model['model'],'prompt':prompt,'createdAt':time.time()},'description':text},'design-asset');output['asset']=asset
  elif not text.strip():raise ValueError('视觉模型没有返回审查结果')
  record(model,'design-'+operation,'succeeded',durationMs=round((time.monotonic()-start)*1000),usage=output['usage']);return output
 except Exception as e:
  record(model,'design-'+operation,'failed',durationMs=round((time.monotonic()-start)*1000),error={'message':str(e)});raise
