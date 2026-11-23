const wishes=[
 ['下周要去新加坡外派了，第一次在国外生活，有点担心刚过去不适应。','出行','想先熟悉住处附近，还是每天上班的路线？','先熟悉上班的路线','地点与路线','通勤向导','查看通勤路线','住处 → 地铁站 → 办公室'],
 ['我有 ADHD，最近工作又特别碎。经常一件事还没做完就被打断，回来就接不上了。','教育','中断时，要给回来后的自己留什么？','留一句我刚做到哪里','记录与回放','接续按钮','回到上次的位置','上次停在 · 整理提纲的第二段'],
 ['最近在管胰岛素抵抗，也想慢慢把体重减下来。吃饭、睡觉、运动这几件事，我一直顾不太过来。','健康','想先把哪些记录放在一起看？','把睡眠和运动放到一起','记录与时间线','每周回顾','展开示例记录','周二 · 睡眠 7 小时　步行 35 分钟'],
 ['接下来几个月想做一期自己的播客。最近听到、看到的东西都可能用得上，想趁着有感觉的时候把它们攒起来。','创意','遇到灵感时，你想怎么留下它？','把随口说的一句话和素材放一起','语音与素材','灵感收集器','打开素材盒','声音片段和照片已排在同一张素材板上'],
 ['最近工作上接触的海外同事越来越多，我想把英语重新捡起来，跟大家交流起来更自在一点。','教育','你最想练的是听懂对方，还是接得上话？','听得懂，就是开口时容易卡','声音与回放','接话练习','试一次接话','What are you working on this week?']
];
const spaces=['创意','健康','出行','教育'];
let wish=4, beat=0, room=3, market=false, joined=false, expert=0, docked=false, playing=false, typing=0, erased=false, hold=0, sleepUntil=0, own='';
const overlay=document.createElement('div');overlay.className='story-ui';intro.append(overlay);
function button(action,label){return '<button data-story="'+action+'">'+label+'</button>'}
function layout(){
 const w=wishes[wish];overlay.className='story-ui story-'+currentModel;
 if(currentModel===0){overlay.innerHTML='<form class="wish"><textarea rows="2" aria-label="说说你的近况"></textarea><button aria-label="进入交流">↵</button></form>';const field=overlay.querySelector('textarea');field.value=own||w[0].slice(0,typing);field.oninput=()=>{own=field.value};overlay.querySelector('form').onsubmit=e=>{e.preventDefault();enter()};return}
 const title=currentModel===1?(beat===0?'一起找个起点。':beat===1?'找到合适的积木。':'做成自己的工具。'):currentModel===2?(market?'共享工作室':spaces[room]+'空间'):expert?'在当地，接上服务。':'找到合适的专家。';
 let copy='',controls='',signature='';
 if(currentModel===1){
 copy=beat===0?(own?'你希望先整理已有信息，还是拆解下一步？':w[2]):beat===1?'已从工具库取出「'+(own?'记录与整理':w[4])+'」。':playing?(own?'已生成第一步：写下这件事最先要确认的信息。':w[7]):'橘色转轴接上了你的「'+(own?'行动清单':w[5])+'」。';
 controls=beat===0?button('answer',own?'先拆解下一步':w[3]):beat===1?button('assemble','拼装我的工具'):button('play',own?'试用行动清单':w[6]);}
 if(currentModel===2){signature='Make it yours. Let curiosity lead.';copy=market?(joined?'共享空间已加入你的工作台。':'选一间工作室，把它的搭建图带回去。'):['移动素材臂，把色片送上画架。','启动训练轮，在记录台留下一枚记录片。','移动路线标记，连接下一站。','拨动练习轮，开始一轮专注练习。'][room];controls=spaces.map((s,i)=>button('room'+i,s)).join('')+(market?button('join',joined?'已加入':'加入我的空间')+button('market','回工作台'):button('play',playing?'暂停运转':'启动空间')+button('market','共享图纸'));}
 if(currentModel===3){signature=docked?'Your AI, Assembled Your Way.':'Hand it off. Stay in control.';copy=expert?'已授权的海外行程，让当地向导在侧线就位。':'一项新的签证委托，匹配到材料整理与事项核对。';controls=button('visa','签证委托')+button('travel','海外行程')+button('dock',docked?'已接入 · 进入系统介绍':expert?'接入翻译与导航':'本次接入专家');}
 overlay.innerHTML='<article><h2>'+title+'</h2><p>'+copy+'</p><div>'+controls+'</div><em>'+signature+'</em></article>';
 if(currentModel===1){const quote=document.createElement('aside');quote.textContent=beat?(own||w[3]):(own||w[0]);overlay.append(quote)}
}
function rebuild(){models[currentModel]=makeSpace(currentModel,room);chooseModel(currentModel);layout()}
function enter(){if(currentModel!==0)return;const field=overlay.querySelector('textarea');if(field)field.blur();room=spaces.indexOf(wishes[wish][1]);models[1]=makeSpace(1,room);requestIntroModel(1)}
overlay.onclick=e=>{const a=e.target.closest('[data-story]')?.dataset.story;if(!a)return;if(a.startsWith('room')){room=Number(a.slice(-1));playing=false}else if(a==='answer')beat=1;else if(a==='assemble')beat=2;else if(a==='play')playing=!playing;else if(a==='market')market=!market;else if(a==='join')joined=true;else if(a==='dock'){if(docked){showSlide(1);return}docked=true}else{expert=Number(a==='travel');docked=false}rebuild()};
intro.addEventListener('click',e=>{if(!currentModel&&!introShot&&!overlay.contains(e.target))enter()});
overlay.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'&&e.target.tagName==='TEXTAREA'&&!e.isComposing){e.preventDefault();enter()}});
let displayed=-1;
setInterval(()=>{if(!introActive)return;if(displayed!==currentModel){displayed=currentModel;playing=false;rebuild()}if(currentModel||own||overlay.matches(':hover')||overlay.contains(document.activeElement)||Date.now()<sleepUntil)return;
const field=overlay.querySelector('textarea');if(!field)return;const line=wishes[wish][0];typing+=erased?-2:2;typing=Math.max(0,Math.min(line.length,typing));field.value=line.slice(0,typing);
if(typing===line.length){erased=true;sleepUntil=Date.now()+3000}else if(!typing){erased=false;wish=(wish+1)%wishes.length;room=spaces.indexOf(wishes[wish][1]);rebuild()}},105);
