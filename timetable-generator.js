const {LEVELS,classLevel}=require('./school-levels');
/* Constraint-based timetable drafting. Independent from the desktop program. */
const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday'];
const time=s=>{const m=/^(\d{2}):(\d{2})$/.exec(s||'');return m&&+m[1]<24&&+m[2]<60?+m[1]*60 + +m[2]:NaN;};
const overlaps=(a,b)=>time(a.start)<time(b.end)&&time(b.start)<time(a.end);
const groupClash=(a,b)=>a.className===b.className&&(a.stream==='ALL'||b.stream==='ALL'||a.stream===b.stream);
function validateConfig(c){
 if(c?.section&&!LEVELS.includes(c.section))throw Error('Select a valid school level.');if(c?.section&&(c.requirements||[]).some(r=>classLevel(r.className)!==c.section))throw Error('Lesson requirements must belong to the selected school level.');
 const bad=m=>{throw new Error(m);};
 if(!c||!Array.isArray(c.slots)||!c.slots.length||c.slots.length>20||!Array.isArray(c.requirements)||!c.requirements.length||c.requirements.length>150||!Array.isArray(c.blocked)||c.blocked.length>2000)bad('Enter valid periods, lesson requirements and availability.');
 const ids=new Set();for(const s of c.slots){if(typeof s.id!=='string'||! /^[A-Za-z0-9_-]+$/.test(s.id)||ids.has(s.id)||!Number.isFinite(time(s.start))||!Number.isFinite(time(s.end))||time(s.end)<=time(s.start)||typeof s.break!=='boolean')bad('Invalid or duplicate period.');ids.add(s.id);}
 for(let i=0;i<c.slots.length;i++)for(const b of c.slots.slice(i+1))if(overlaps(c.slots[i],b))bad('Periods overlap.');
 const reqIds=new Set();let total=0;for(const r of c.requirements){if(typeof r.id!=='string'||! /^[A-Za-z0-9_-]+$/.test(r.id)||reqIds.has(r.id)||!r.className||!r.stream||!r.subject||!r.teacherId||!Number.isInteger(r.count)||r.count<1||r.count>50||!Number.isInteger(r.maxPerDay)||r.maxPerDay<1||r.maxPerDay>10)bad('Invalid lesson requirement.');if(r.room!==undefined&&typeof r.room!=='string')bad('Invalid room.');reqIds.add(r.id);total+=r.count;}
 if(total>600)bad('Maximum 600 new lessons per draft.');
 for(const b of c.blocked)if(!b||typeof b.id!=='string'||! /^[A-Za-z0-9_-]+$/.test(b.id)||!b.teacherId||!DAYS.includes(b.day)||!ids.has(b.slotId))bad('Invalid teacher availability.');
 return c;
}
function solve(config,existing=[],options={}){
 validateConfig(config);const slots=config.slots.filter(s=>!s.break),deadline=Date.now()+(options.timeLimit||2000),nodeLimit=options.nodeLimit||15000;
 const places=DAYS.flatMap(day=>slots.map(s=>({day,start:s.start,end:s.end,slotId:s.id})));let best=[],nodes=0,finished=false;
 let seed=options.seed||Date.now()%2147483647||1;const random=()=>{seed=seed*48271%2147483647;return seed/2147483647;};
 const total=config.requirements.reduce((n,r)=>n+r.count,0);
 const compatible=(r,p,plan)=>{
   if(config.blocked.some(b=>b.teacherId===r.teacherId&&b.day===p.day&&b.slotId===p.slotId))return false;
   const same=[...existing,...plan].filter(x=>x.day===p.day&&groupClash(x,r)&&String(x.subject).trim().toLowerCase()===String(r.subject).trim().toLowerCase()).length;if(same>=r.maxPerDay)return false;
   const candidate={...r,...p};return ![...existing,...plan].some(x=>x.day===p.day&&overlaps(candidate,x)&&(x.teacherId===r.teacherId||groupClash(candidate,x)||r.room&&x.room&&r.room.trim().toLowerCase()===x.room.trim().toLowerCase()));
 };
 const plan=[],remaining=new Map(config.requirements.map(r=>[r.id,r.count]));
 function search(){
  if(Date.now()>=deadline||nodes++>=nodeLimit)return false;
  if(plan.length>best.length)best=plan.map(x=>({...x}));if(plan.length===total){finished=true;return true;}
  let chosen=null,candidates=null;
  for(const r of config.requirements){if(!remaining.get(r.id))continue;const available=places.filter(p=>compatible(r,p,plan));if(available.length<remaining.get(r.id))return false;if(!candidates||available.length/remaining.get(r.id)<candidates.length/remaining.get(chosen.id)){chosen=r;candidates=available;}}
  if(!chosen)return false;
  const scored=candidates.map(p=>({p,score:plan.filter(x=>x.day===p.day&&(groupClash(x,chosen)||x.teacherId===chosen.teacherId)).length+random()})).sort((a,b)=>a.score-b.score);
  for(const {p} of scored){plan.push({requirementId:chosen.id,className:chosen.className,stream:chosen.stream,subject:chosen.subject,teacherId:chosen.teacherId,room:chosen.room||'',...p});remaining.set(chosen.id,remaining.get(chosen.id)-1);if(search())return true;remaining.set(chosen.id,remaining.get(chosen.id)+1);plan.pop();if(Date.now()>=deadline||nodes>=nodeLimit)break;}
  return false;
 }
 search();
 // If early infeasibility prevents any partial draft, show capacity diagnostics instead.
 const unplaced=config.requirements.map(r=>({requirementId:r.id,className:r.className,stream:r.stream,subject:r.subject,teacherId:r.teacherId,count:r.count-best.filter(x=>x.requirementId===r.id).length})).filter(r=>r.count>0);
 const notes=[];for(const r of config.requirements){const avail=places.filter(p=>compatible(r,p,[])).length;if(avail<r.count)notes.push(`${r.subject} (${r.className}/${r.stream}): needs ${r.count} lessons, only ${avail} permitted slots.`);if(r.count>5*r.maxPerDay)notes.push(`${r.subject}: weekly requirement exceeds its daily limit across five days.`);}
 if(!finished&&!notes.length)notes.push(nodes>=nodeLimit||Date.now()>=deadline?'Search limit reached. Retry generation or relax availability/daily limits.':'Requirements cannot all fit together. Review teacher/class capacity, rooms and availability.');
 return {complete:finished,lessons:best,requested:total,placed:best.length,unplaced,notes,nodes};
}
module.exports={solve,validateConfig,DAYS};
