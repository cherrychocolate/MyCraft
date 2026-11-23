from pathlib import Path
dest = Path(__file__).resolve().parent
s = (dest / 'base.html').read_text(encoding='utf-8')
p=s.index('const modelMeta=')
s=s[:p]+(dest/'models.js').read_text(encoding='utf-8')+s[p:]
s=s.replace('const oldIndex=slideIndex;', 'if(n!==0)models.splice(0,4,...originalForms);const oldIndex=slideIndex;')
s=s.replace('if(introActive)b.p=p.slice();','if(introActive){const u=Math.min(1,transition*2);b.p=b.from.map((v,k)=>v+(p[k]-v)*u);}')
s=s.replace('gl.uniform2f(uniforms.PartAngle,partX,partZ);','if(introActive&&b.item.moving&&typeof playing!=="undefined"&&playing){partZ+=Math.sin(clock*2)*.25;q[0]+=Math.sin(clock*2)*.18;}gl.uniform2f(uniforms.PartAngle,partX,partZ);')
start=s.index('const brandStory=document.createElement')
# preserve other modules following brand code
end=s.index('{capture:true,passive:true});',start)+len('{capture:true,passive:true});')
s=s[:start]+(dest/'story.js').read_text(encoding='utf-8')+s[end:]
s=s.replace('if(n===0&&oldIndex!==0)restorePrologue(savedIntroModel);','if(n===0&&oldIndex!==0){models[savedIntroModel]=makeSpace(savedIntroModel,room);restorePrologue(savedIntroModel);displayed=-1;}')
s=s.replace('const stop=(next+.5)/4;', 'if(id===0&&currentModel===0)return;if(id===0)models[next]=makeSpace(next,room);const stop=(next+.5)/4;')
s=s.replace('</head>','''<style>
.story-ui{position:absolute;inset:0;z-index:8;pointer-events:none;color:#312842;font-family:var(--brand-sans)}.story-ui article,.story-ui aside,.wish{position:absolute;pointer-events:auto}.story-ui article{width:min(34vw,450px);left:6vw;top:29%}.story-1 article,.story-3 article{left:auto;right:6vw}.story-ui aside{bottom:13%;left:6%;width:36%;font-size:17px;line-height:1.6}.story-ui h2{font:500 clamp(30px,4vw,62px)/1.08 var(--brand-sans);letter-spacing:-.065em;margin:0}.story-ui p{line-height:1.6;margin:17px 0}.story-ui button{font:inherit;color:inherit;cursor:pointer;background:#fff9;border:1px solid #43334d55;border-radius:16px;padding:8px 13px;margin:3px}.story-ui em{display:block;font:italic 24px Georgia;margin-top:22px}.wish{left:50%;top:49%;transform:translate(-50%,-50%);width:min(760px,86vw);background:linear-gradient(145deg,#fff9fcf2,#f7e2fff2);border-radius:26px;box-shadow:0 8px 0 #c399bf,0 28px 55px #62377d30;display:flex;align-items:center;padding:24px;gap:12px}.wish textarea{resize:none;flex:1;min-width:0;font:500 clamp(19px,2.2vw,32px)/1.45 var(--brand-sans);border:0;background:none;color:inherit}.wish button{background:#ed9be6;box-shadow:0 4px 0 #b772af;font-size:26px}.intro-slide:has(.story-0) #bricks{filter:blur(4px);opacity:.48}.intro-transitioning .story-ui{opacity:0}.story-ui{transition:opacity .35s}.story-ui button:focus-visible{outline:3px solid #7365ba}@media(max-width:700px){.story-ui article,.story-1 article,.story-3 article{top:16%;left:7%;right:7%;width:auto}.story-ui aside{bottom:8%;width:64%;font-size:13px}.story-ui em{font-size:18px}.wish{padding:16px}}
</style></head>''')
(dest / 'index.html').write_text(s, encoding='utf-8')
