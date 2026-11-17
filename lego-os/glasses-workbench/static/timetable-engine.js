/* Local dates are deliberately treated as date-only UTC values; device timezone is Asia/Shanghai. */
(function(root){
const day=d=>Date.parse(d+'T00:00:00Z'), iso=n=>new Date(n).toISOString().slice(0,10);
function add(d,n){return iso(day(d)+n*86400000)}
function week(start,date){return Math.floor((day(date)-day(start))/604800000)+1}
function monday(date){const n=new Date(day(date)).getUTCDay();return add(date,-((n+6)%7))}
function occurrences(data,date){const w=week(data.start,date),dow=(new Date(day(date)).getUTCDay()+6)%7;return data.courses.flatMap(c=>{
const original=c.day===dow&&w>=c.from&&w<=c.to&&(c.repeat==='all'||(c.repeat==='odd'?w%2===1:w%2===0));
const changes=data.exceptions||[];const e=changes.find(e=>e.course===c.id&&e.date===date);
const rows=original?[{...c,date,originDate:date,status:e?.cancelled?'cancelled':e?'changed':'normal',...(e?.patch||{})}]:[];
for(const change of changes.filter(e=>e.course===c.id&&e.patch?.date===date&&e.date!==date))rows.push({...c,...change.patch,date,originDate:change.date,status:change.cancelled?'cancelled':'changed'});
return rows.filter(r=>r.date===date);
}).sort((a,b)=>a.start.localeCompare(b.start))}
function upcoming(rows,time){return rows.find(r=>r.status!=='cancelled'&&r.end>time)||null}
function conflicts(rows){const live=rows.filter(r=>r.status!=='cancelled');return live.filter((r,i)=>live.some((s,j)=>i!==j&&r.start<s.end&&s.start<r.end)).map(r=>r.id)}
const api={add,week,monday,occurrences,upcoming,conflicts};root.TimetableEngine=api;
})(globalThis);
