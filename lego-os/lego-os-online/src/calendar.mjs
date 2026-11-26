import {get,save} from './store.mjs';

const dateRE=/^\d{4}-\d{2}-\d{2}$/;
const dayMs=86400000;
const shift=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+dayMs*n).toISOString().slice(0,10);
const examples = [
  ['体验课程 · 交互设计','09:00','10:15','设计教室'],
  ['体验课程 · 计算机图形','13:30','14:45','实验室'],
  ['体验课表 · 项目讨论','10:00','11:00','讨论室']
];
function demo(start,end) {
  const events=[];
  for(let day=start;day<=end;day=shift(day,1)) {
    const weekDay=new Date(day+'T00:00:00Z').getUTCDay();
    if(weekDay===0||weekDay===6)continue;
    const [title,from,to,location]=examples[weekDay%examples.length];
    events.push({id:'example-'+day,title,start:day+'T'+from+':00+08:00',end:day+'T'+to+':00+08:00',location});
  }
  return events;
}
const decode = value => value?.replace(/\\[nN]/g,' ').replace(/\\([,;\\])/g,'$1').trim().slice(0,240);
function readDate(value) {
  const m=/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value||'');
  if(!m)return '';
  const date=`${m[1]}-${m[2]}-${m[3]}`;
  if(!m[4])return date+'T00:00:00+08:00';
  return `${date}T${m[4]}:${m[5]}:${m[6]}${m[7]?'Z':'+08:00'}`;
}
const localDate = value => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export async function calendar(env,owner,path,p) {
  const old=await get(env.DB,owner,'trial-calendar-import');
  if(path==='import') {
    if(typeof p.ics!=='string'||p.ics.length>500000||!p.ics.includes('BEGIN:VCALENDAR'))throw Error('请选择有效的 .ics 日历文件（500 KB 以内）');
    const items=[];let repeating=0;
    for(const match of p.ics.replace(/\r?\n[ \t]/g,'').matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/g)){
      const fields={};
      for(const line of match[1].split(/\r?\n/)){
        const i=line.indexOf(':');
        if(i>0)fields[line.slice(0,i).split(';')[0]]=line.slice(i+1);
      }
      const start=readDate(fields.DTSTART),end=readDate(fields.DTEND);
      if(fields.RRULE)repeating++;
      if(start&&fields.SUMMARY&&Number.isFinite(Date.parse(start)))items.push({id:crypto.randomUUID(),title:decode(fields.SUMMARY),start,end,location:decode(fields.LOCATION),status:fields.STATUS?.toLowerCase()});
    }
    if(!items.length)throw Error('文件中没有可读取的日程');
    if(items.length>1500)throw Error('单次最多导入 1500 项日程');
    await save(env.DB,owner,{id:'trial-calendar-import',items},'internal',old?._revision,env);
    return {imported:items.length,repeating};
  }
  if(path==='status')return {loggedIn:!!old,calendarScope:!!old,identity:'personal-import',message:old?'个人日历已导入':'当前展示体验课表，可从模拟器导入个人 .ics'};
  const start=String(p.start||'').slice(0,10),end=String(p.end||'').slice(0,10);
  if(p.calendarId!=='workbench-calendar'||!dateRE.test(start)||!dateRE.test(end)||start>end||Date.parse(end)-Date.parse(start)>31*dayMs)throw Error('日程日期范围无效');
  return {type:'calendar',source:old?'个人导入日历':'体验课表 · 示例',at:Date.now()/1000,
    result:old?old.items.filter(e=>localDate(e.start)>=start&&localDate(e.start)<=end):demo(start,end)};
}
