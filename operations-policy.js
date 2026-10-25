const fields=['attendanceRecords','timetableLessons','inventoryItems','inventoryMovements','disciplineIncidents'];
function canRead(role,key){return ['admin','staff'].includes(role)||role==='teacher'&&!['inventoryItems','inventoryMovements'].includes(key);}
function canWrite(role,key){return ['admin','staff'].includes(role)||role==='teacher'&&['attendanceRecords','disciplineIncidents'].includes(key);}
function hideOperations(data,role){for(const key of fields)if(!canRead(role,key))data[key]=[];return data;}
function protectOperations(data,current,role){for(const key of fields)if(!canWrite(role,key)){if(current[key]!==undefined)data[key]=current[key];else delete data[key];}return data;}
function validateOperations(data){
 const fail=m=>{const e=new Error(m);e.status=400;throw e;};
 const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 for(const key of fields){if(data[key]===undefined)continue;if(!Array.isArray(data[key]))fail('Invalid '+key);const ids=new Set();for(const r of data[key]){if(!r||typeof r.id!=='string'||!r.id||ids.has(r.id))fail('Duplicate or invalid record in '+key);ids.add(r.id);}}
 for(const r of data.attendanceRecords||[])if(!date(r.date)||r.id!==r.date+':'+r.studentId||!['Present','Absent','Late','Excused'].includes(r.status))fail('Invalid attendance record');
 const time=s=>{const m=/^(\d{2}):(\d{2})$/.exec(s||'');return m&&+m[1]<24&&+m[2]<60?+m[1]*60 + +m[2]:NaN;};
 const lessons=data.timetableLessons||[];
 for(let i=0;i<lessons.length;i++){const a=lessons[i];if(!['Monday','Tuesday','Wednesday','Thursday','Friday'].includes(a.day)||!a.teacherId||!a.className||!a.stream||!a.subject||!Number.isFinite(time(a.start))||!Number.isFinite(time(a.end))||time(a.end)<=time(a.start))fail('Invalid lesson');for(const b of lessons.slice(i+1))if(a.day===b.day&&time(a.start)<time(b.end)&&time(b.start)<time(a.end)&&(a.teacherId===b.teacherId||a.className===b.className&&(a.stream==='ALL'||b.stream==='ALL'||a.stream===b.stream)||a.room&&b.room&&a.room.toLowerCase()===b.room.toLowerCase())){const e=new Error('Timetable clash after syncing. Review overlapping lessons.');e.status=409;throw e;}}
 const items=data.inventoryItems||[],itemIds=new Set(items.map(r=>r.id)),tags=new Set();for(const r of items){if(!r.name||!r.location||!['Supply','Asset'].includes(r.kind)||!Number.isInteger(r.minimum)||r.minimum<0)fail('Invalid inventory item');if(r.tag){const tag=String(r.tag).toLowerCase();if(tags.has(tag))fail('Duplicate asset tag');tags.add(tag);}}
 const totals={};for(const r of data.inventoryMovements||[]){if(!itemIds.has(r.itemId)||!Number.isInteger(r.quantity)||r.quantity===0||!date(r.date)||!r.note)fail('Invalid stock movement');totals[r.itemId]=(totals[r.itemId]||0)+r.quantity;}
 if(Object.values(totals).some(q=>q<0)){const e=new Error('Combined stock issues exceed available stock. Review pending issues.');e.status=409;throw e;}
 for(const r of data.disciplineIncidents||[])if(!r.studentId||!date(r.date)||!['Open','Following up','Resolved'].includes(r.status)||!['Attendance','Behaviour','Bullying','Safety','Other'].includes(r.category)||!r.details||!r.action||!r.assignedTo||r.followupDate&&(!date(r.followupDate)||r.followupDate<r.date)||!Array.isArray(r.history))fail('Invalid discipline incident');
 return data;
}
module.exports={hideOperations,protectOperations,validateOperations};
