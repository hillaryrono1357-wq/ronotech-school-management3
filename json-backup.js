// Full, portable JSON backup. Active sign-in sessions are deliberately not portable.
const TABLES = {
  app_state: ['key','value','updated_at'],
  users: ['id','username','full_name','role','password_hash','active','created_at','updated_at'],
  audit_log: ['id','user_id','username','action','details','ip_address','created_at']
};
const FORMAT='RonoTech.FullSystemBackup';
function exportJsonBackup(db){
  return db.transaction(()=>({format:FORMAT,version:1,createdAt:new Date().toISOString(),
    tables:Object.fromEntries(Object.keys(TABLES).map(table=>[table,db.prepare('SELECT * FROM '+table).all()]))}))();
}
function validateJsonBackup(backup){
  const fail=message=>{throw new Error(message);};
  if(!backup || backup.format!==FORMAT || backup.version!==1 || !backup.tables || !Number.isFinite(Date.parse(backup.createdAt))) fail('Choose a valid RonoTech full-system JSON backup.');
  for(const [table,columns] of Object.entries(TABLES)){
    const rows=backup.tables[table]; if(!Array.isArray(rows)) fail('Missing '+table+' records.');
    const keys=new Set();
    for(const row of rows){
      if(!row || typeof row!=='object' || Array.isArray(row) || Object.keys(row).length!==columns.length || columns.some(c=>!Object.hasOwn(row,c))) fail('Invalid '+table+' record fields.');
      for(const c of columns){
        const value=row[c];
        if(['id','active','user_id'].includes(c)){
          if(c==='user_id' && value===null) continue;
          if(!Number.isSafeInteger(value) || (c==='active' ? ![0,1].includes(value) : value<1)) fail('Invalid '+table+'.'+c);
        }else if(value===null && table==='audit_log' && ['username','details','ip_address'].includes(c)){
          continue;
        }else if(typeof value!=='string') fail('Invalid '+table+'.'+c);
      }
      const id=table==='app_state'?row.key:row.id;
      if(keys.has(id)) fail('Duplicate '+table+' record.'); keys.add(id);
      if(table==='users' && (!row.username.trim() || !['admin','staff','teacher','finance','librarian'].includes(row.role) || !/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(row.password_hash))) fail('Invalid user account.');
      if(table==='app_state' && ['SMS_V4_DATABASE','DEMO_SMS_V4_DATABASE','MABASI_EXAM_ANALYZER','DEMO_MABASI_EXAM_ANALYZER','SCHOOL_PROFILE','DEMO_SCHOOL_PROFILE','LICENSE'].includes(row.key)){
        let value;try{value=JSON.parse(row.value);}catch{fail('Invalid saved data: '+row.key);}
        if(!value || typeof value!=='object' || Array.isArray(value)) fail('Invalid saved data: '+row.key);
      }
    }
  }
  const users=backup.tables.users, names=new Set();
  for(const u of users){if(names.has(u.username)) fail('Duplicate username.');names.add(u.username);}
  if(!users.some(u=>u.role==='admin' && u.active===1)) fail('Backup must contain an active administrator.');
  const userIds=new Set(users.map(u=>u.id));
  if(backup.tables.audit_log.some(r=>r.user_id!==null && !userIds.has(r.user_id))) fail('Audit history references an unknown account.');
  return backup;
}
function restoreJsonBackup(db,input){
  const backup=validateJsonBackup(input);
  db.transaction(()=>{
    db.prepare('DELETE FROM sessions').run();
    db.prepare('DELETE FROM audit_log').run();
    db.prepare('DELETE FROM users').run();
    db.prepare('DELETE FROM app_state').run();
    for(const [table,columns] of Object.entries(TABLES)){
      const insert=db.prepare('INSERT INTO '+table+' ('+columns.join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')');
      for(const row of backup.tables[table]) insert.run(...columns.map(c=>row[c]));
    }
  })();
}
module.exports={exportJsonBackup,validateJsonBackup,restoreJsonBackup};
