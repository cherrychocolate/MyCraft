import {requestJSON} from './models.mjs';
import {quota} from './store.mjs';

const idRE = /^[A-Za-z0-9_-]{11}$/;
const pageRE = /^[A-Za-z0-9_=-]{0,512}$/;
const origin='https://www.googleapis.com/youtube/v3/';
const unescape = value => String(value||'').replace(/&(?:amp|quot|apos|lt|gt|#39);/g,s=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&#39;':"'",'&lt;':'<','&gt;':'>'})[s]);
function item(id,s) {
  const picture=s.thumbnails?.high?.url||s.thumbnails?.medium?.url||s.thumbnails?.default?.url;
  const images=/^https:\/\/(?:i|i\d+)\.ytimg\.com\//.test(picture||'')?[picture]:[];
  return {id,title:unescape(s.title),excerpt:unescape(s.description),author:s.channelTitle||'',published:s.publishedAt,
    url:'https://www.youtube.com/watch?v='+id,media:{images},sourcePlatform:'youtube',channelId:s.channelId};
}
async function readCached(env, context, type, parameters, load) {
  if(!context)return load();
  const {origin,owner,manager}=context;
  const cache=globalThis.caches?.default;
  const key=new Request(`${origin}/_youtube-cache/${type}?${new URLSearchParams(parameters)}`);
  const cached=await cache?.match(key).catch(()=>undefined);
  if(cached)return cached.json();
  if(!manager){
    const isSearch=type==='search';
    const limit=owner==='__preview'?(isSearch?35:120):(isSearch?7:25);
    try{
      await quota(env.DB,`__youtube:${type}:${owner}`,limit);
      await quota(env.DB,`__youtube:${type}:site`,isSearch?75:240);
    }catch(error){
      if(error.status===429)throw Object.assign(Error('今天的 YouTube 试用额度已用完，请明天再试'),{status:429});
      throw error;
    }
  }
  const result=await load();
  if(cache)await cache.put(key,new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=600'}})).catch(()=>{});
  return result;
}
export async function youtube(env,path,p={},context) {
  if(path==='config')return {configured:!!env.YOUTUBE_API_KEY,storage:'站点服务器'};
  if(!env.YOUTUBE_API_KEY)throw Error('YouTube 官方凭据尚未配置');
  const call=(resource,params)=>requestJSON(origin+resource+'?'+new URLSearchParams(params),undefined,{'X-Goog-Api-Key':env.YOUTUBE_API_KEY});
  const page=String(p.pageToken||'');
  if(!pageRE.test(page))throw Error('翻页参数无效');
  if(path==='search') {
    const query=String(p.query||'').trim(),ranking=p.ranking||'relevance',maxResults=Number(p.maxResults||5);
    if(!query||query.length>200||!Number.isInteger(maxResults)||maxResults<1||maxResults>10||!['relevance','recent_popular'].includes(ranking))throw Error('搜索参数无效');
    const order=ranking==='recent_popular'?{publishedAfter:new Date(Date.now()-7*86400000).toISOString(),order:'viewCount'}:{};
    return readCached(env,context,'search',{query,ranking,maxResults,page},async()=>{
      const r=await call('search',{part:'snippet',type:'video',videoEmbeddable:'true',videoSyndicated:'true',q:query,maxResults,...order,...(page?{pageToken:page}:{})});
      return {type:'content-feed',platform:'youtube',query,ranking,items:(r.items||[]).filter(v=>idRE.test(v.id?.videoId||'')).map(v=>item(v.id.videoId,v.snippet)),
        nextPageToken:r.nextPageToken,at:Date.now()/1000,source:'YouTube Data API v3 · 官方'};
    });
  }
  if(path==='detail') {
    const id=String(p.videoId||p.id||'');
    if(!idRE.test(id))throw Error('视频 ID 无效');
    return readCached(env,context,'detail',{id,page},async()=>{
      const result={comments:[],at:Date.now()/1000,source:'YouTube Data API v3 · 官方'};
      if(!page){
        const r=await call('videos',{part:'snippet',id});
        if(!r.items?.length)throw Error('视频不可用');
        result.description=r.items[0].snippet.description||'';
      }
      try{
        const r=await call('commentThreads',{part:'snippet',videoId:id,maxResults:15,textFormat:'plainText',...(page?{pageToken:page}:{})});
        result.comments=(r.items||[]).map(({id,snippet})=>({id,author:snippet.topLevelComment?.snippet?.authorDisplayName,
          body:snippet.topLevelComment?.snippet?.textDisplay,replies:snippet.totalReplyCount||0}));
        result.nextPageToken=r.nextPageToken;
      }catch{result.commentError='当前视频的评论未能读取。';}
      return result;
    });
  }
  throw Object.assign(Error('此接口不可用'),{status:404});
}
