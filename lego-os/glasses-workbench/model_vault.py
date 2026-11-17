"""Model credentials: macOS Keychain for persistence, explicit session memory otherwise.
No key is written to project documents, logs or migration packages.
"""
import ctypes as c,sys,threading
class MemoryVault:
 def __init__(self):self.values={}
 def put(self,name,value):self.values[name]=value
 def get(self,name):return self.values.get(name)
 def has(self,name):return name in self.values
 def delete(self,name):self.values.pop(name,None)
class KeychainVault:
 service=b'GlasshouseWorkbench.ModelCredentials.v1'
 def __init__(self):
  if sys.platform!='darwin':raise RuntimeError('当前系统未配置持久凭据库；可选择仅本次运行保存')
  self.s=c.CDLL('/System/Library/Frameworks/Security.framework/Security');self.cf=c.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');self.lock=threading.RLock()
  self.s.SecKeychainFindGenericPassword.argtypes=[c.c_void_p,c.c_uint32,c.c_char_p,c.c_uint32,c.c_char_p,c.POINTER(c.c_uint32),c.POINTER(c.c_void_p),c.POINTER(c.c_void_p)];self.s.SecKeychainFindGenericPassword.restype=c.c_int32
  self.s.SecKeychainAddGenericPassword.argtypes=[c.c_void_p,c.c_uint32,c.c_char_p,c.c_uint32,c.c_char_p,c.c_uint32,c.c_void_p,c.POINTER(c.c_void_p)];self.s.SecKeychainAddGenericPassword.restype=c.c_int32
  self.s.SecKeychainItemModifyAttributesAndData.argtypes=[c.c_void_p,c.c_void_p,c.c_uint32,c.c_void_p];self.s.SecKeychainItemModifyAttributesAndData.restype=c.c_int32
  self.s.SecKeychainItemFreeContent.argtypes=[c.c_void_p,c.c_void_p];self.s.SecKeychainItemDelete.argtypes=[c.c_void_p];self.s.SecKeychainItemDelete.restype=c.c_int32;self.cf.CFRelease.argtypes=[c.c_void_p]
 def check(self,status):
  if status:raise ValueError('无法访问本机钥匙串（状态 '+str(status)+'）；请解锁或允许访问，或改用“仅本次运行”。原配置未被清空。')
 def find(self,name,password=False):
  account=name.encode();item=c.c_void_p();size=c.c_uint32();data=c.c_void_p();status=self.s.SecKeychainFindGenericPassword(None,len(self.service),self.service,len(account),account,c.byref(size) if password else None,c.byref(data) if password else None,c.byref(item))
  return status,item,size,data
 def has(self,name):
  with self.lock:
   status,item,_,_=self.find(name)
   if item:self.cf.CFRelease(item)
   if status==-25300:return False
   self.check(status);return True
 def get(self,name):
  with self.lock:
   status,item,size,data=self.find(name,True)
   if status==-25300:return None
   self.check(status)
   try:return c.string_at(data,size.value).decode()
   finally:
    if data:self.s.SecKeychainItemFreeContent(None,data)
    if item:self.cf.CFRelease(item)
 def put(self,name,value):
  raw=value.encode();buf=c.create_string_buffer(raw);account=name.encode()
  with self.lock:
   status,item,_,_=self.find(name)
   try:
    if status==0:self.check(self.s.SecKeychainItemModifyAttributesAndData(item,None,len(raw),buf))
    elif status==-25300:
     created=c.c_void_p();self.check(self.s.SecKeychainAddGenericPassword(None,len(self.service),self.service,len(account),account,len(raw),buf,c.byref(created)))
     if created:self.cf.CFRelease(created)
    else:self.check(status)
   finally:
    if item:self.cf.CFRelease(item)
 def delete(self,name):
  with self.lock:
   status,item,_,_=self.find(name)
   if status==-25300:return
   self.check(status)
   try:self.check(self.s.SecKeychainItemDelete(item))
   finally:
    if item:self.cf.CFRelease(item)

class EnvironmentVault:
 """Device/server deployments inject credentials via their protected service environment.
 Persistent writes require a platform keystore adapter; never fall back to plaintext files.
 """
 def get(self,name):
  import os
  if name not in ('DASHSCOPE_API_KEY','DEEPSEEK_API_KEY','GEMINI_API_KEY','MOONSHOT_API_KEY','APIFY_API_TOKEN'):return None
  return os.environ.get(name)
 def has(self,name):return bool(self.get(name))
 def put(self,name,value):raise ValueError('此设备未接持久凭据库；请通过受保护的服务环境注入凭据，或明确选择仅本次运行')
 def delete(self,name):raise ValueError('环境凭据需在设备服务配置中撤销')
