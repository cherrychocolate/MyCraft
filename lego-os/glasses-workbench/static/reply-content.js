/* One safe content renderer for complete answers and streaming updates. No HTML from models. */
(function(root){
 const escape=text=>String(text??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 function render(text){
  const value=String(text??''),pattern=/\[([^\]\n]+)\]\((https?:\/\/[^\s<>]+)\)|(https?:\/\/[^\s<>"'，。；！]+)/g;
  let html='',offset=0;
  for(const match of value.matchAll(pattern)){
   html+=escape(value.slice(offset,match.index));
   const url=match[2]||match[3],label=match[1]||url;
   try{const parsed=new URL(url);html+=['https:','http:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password?`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`:escape(match[0]);}
   catch{html+=escape(match[0]);}
   offset=match.index+match[0].length;
  }
  return html+escape(value.slice(offset));
 }
 root.LegoReplyContent={render};
})(globalThis);
