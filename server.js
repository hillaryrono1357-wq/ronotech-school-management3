const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const https = require('https');
const app = express();
const TLS_DIR=path.join(__dirname,'tls');
const PFX_ENABLED=fs.existsSync(path.join(TLS_DIR,'server.pfx')) && fs.existsSync(path.join(TLS_DIR,'server-passphrase.txt'));
const HTTPS_ENABLED=PFX_ENABLED || fs.existsSync(path.join(TLS_DIR,'server-key.pem')) && fs.existsSync(path.join(TLS_DIR,'server-cert.pem'));
const SERVER_SCHEME=HTTPS_ENABLED?'https':'http';
const DEFAULT_PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const PORT_FILE = path.join(__dirname, 'server.port');
const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAPY0t/GnrkVC2zihYci45QYghLWZ1rq5jJq5FgtMnui4=
-----END PUBLIC KEY-----`;
const LICENSE_GRACE_DAYS = 7;
const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const BACKUP_RETENTION = 30;
const SESSION_HOURS = 8;
const MAX_LOGIN_ATTEMPTS = 7;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map();

function getLanIPv4() {
  const os = require('os');
  let interfaces;
  try { interfaces=os.networkInterfaces(); } catch { return 'YOUR-LAN-IP'; }
  for (const entries of Object.values(interfaces)) {
    for (const entry of (entries || [])) {
      if (entry.family === 'IPv4' && !entry.internal && entry.address) return entry.address;
    }
  }
  return 'YOUR-LAN-IP';
}

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'school-management.db'));
db.pragma('journal_mode = WAL');
try { db.exec("ALTER TABLE sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'live'"); } catch (e) {}


db.exec(`
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  mode TEXT NOT NULL DEFAULT 'live',
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  details TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);
`);

const ROLES = ['admin','staff','teacher','finance','librarian'];
const ROLE_LABELS = { admin:'Administrator', staff:'Staff', teacher:'Teacher', finance:'Finance Officer', librarian:'Librarian' };

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}
function clientIp(req){ return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim(); }
function audit(req, action, details=''){
  try { db.prepare('INSERT INTO audit_log(user_id,username,action,details,ip_address) VALUES (?,?,?,?,?)').run(req.user?.id||null,req.user?.username||null,action,String(details||''),clientIp(req)); } catch {}
}
function loginAllowed(ip){
  const now=Date.now(); const row=loginAttempts.get(ip);
  if(!row || now-row.first>LOGIN_WINDOW_MS){ loginAttempts.set(ip,{first:now,count:0}); return true; }
  return row.count < MAX_LOGIN_ATTEMPTS;
}
function recordLoginFailure(ip){
  const now=Date.now(); let row=loginAttempts.get(ip);
  if(!row || now-row.first>LOGIN_WINDOW_MS) row={first:now,count:0};
  row.count++; loginAttempts.set(ip,row);
}
function clearLoginFailures(ip){ loginAttempts.delete(ip); }

function verifyPassword(password, stored) {
  try {
    const [salt, key] = String(stored).split(':');
    if (!salt || !key) return false;
    const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(key,'hex'), Buffer.from(derived,'hex'));
  } catch { return false; }
}
function seedAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count === 0) {
    db.prepare('INSERT INTO users(username,full_name,role,password_hash) VALUES (?,?,?,?)')
      .run('admin','System Administrator','admin',hashPassword('Admin@1234'));
    console.log('Default administrator created: username=admin password=Admin@1234 (change it after first login).');
  }
}
seedAdmin();

function currentUser(req) {
  const token = req.get('x-session-token') || req.query.token;
  if (!token) return null;
  const row = db.prepare(`SELECT u.id,u.username,u.full_name,u.role,u.active,s.expires_at,s.mode
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND s.expires_at>? AND u.active=1`).get(token, Date.now());
  return row || null;
}
function requireAuth(req,res,next) {
  const user=currentUser(req);
  if (!user) return res.status(401).json({error:'Authentication required'});
  req.user=user; next();
}
function requireAdmin(req,res,next){ if(req.user.mode==='demo') return res.status(403).json({error:'This administration function is disabled in Demo Mode'}); if(req.user.role!=='admin') return res.status(403).json({error:'Administrator access required'}); next(); }
function canAccess(role, section){
  if(role==='admin') return true;
  if(section==='finance') return role==='finance';
  if(section==='library') return role==='librarian';
  if(section==='admin') return false;
  return ['staff','teacher','finance','librarian'].includes(role);
}

app.use('/api/backups/json/restore', express.json({ limit: '100mb' }));
app.use(express.json({ limit: '25mb' }));
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','SAMEORIGIN');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  next();
});
// Certificates and host-only files must never be served as public assets.
app.use((req,res,next)=>{
  const publicFiles=new Set(['','MR RONO TECH SCHOOL MANAGEMENT.html','offline-client.js','offline-sw.js','manifest.webmanifest','icon-192.png','icon-512.png']);
  if(req.path.startsWith('/api/')||req.path==='/')return next();
  let file;try{file=decodeURIComponent(req.path.slice(1));}catch{return res.sendStatus(400);}
  if(!publicFiles.has(file))return res.sendStatus(404);
  next();
});
app.use(express.static(__dirname, { extensions: ['html'] }));

function b64url(buf){ return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function unb64url(str){ str=String(str).replace(/-/g,'+').replace(/_/g,'/'); while(str.length%4) str+='='; return Buffer.from(str,'base64'); }
function verifyLicenseKey(key){
  const parts=String(key||'').trim().split('.'); if(parts.length!==2) throw new Error('Invalid license format');
  const payload=JSON.parse(unb64url(parts[0]).toString('utf8')); const sig=unb64url(parts[1]);
  if(!crypto.verify(null,Buffer.from(parts[0]),crypto.createPublicKey(LICENSE_PUBLIC_KEY),sig)) throw new Error('Invalid license signature');
  if(!payload.licenseNo||!payload.schoolId||!payload.schoolName||!payload.expiresAt) throw new Error('Incomplete license'); return payload;
}
function getStateValue(key){const row=db.prepare('SELECT value FROM app_state WHERE key=?').get(key);return row?row.value:null;}
function setStateValue(key,value){db.prepare(`INSERT INTO app_state(key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).run(key,value);}
function getLicense(){const raw=getStateValue('LICENSE');if(!raw)return null;try{return JSON.parse(raw)}catch{return null;}}
function licenseStatus(){const lic=getLicense();if(!lic)return {activated:false,status:'not_activated'};const days=Math.ceil((new Date(lic.expiresAt).getTime()-Date.now())/86400000);return {...lic,activated:true,daysRemaining:days,status:days<0?(Math.abs(days)<=LICENSE_GRACE_DAYS?'grace':'expired'):(days<=30?'expiring':'active')};}
app.get('/api/bootstrap',(_req,res)=>res.json({setupComplete:getStateValue('SETUP_COMPLETE')==='1',license:licenseStatus(),product:'RonoTech School Management'}));
app.post('/api/setup',(req,res)=>{try{const {school={},licenseKey,admin={}}=req.body||{};if(getStateValue('SETUP_COMPLETE')==='1')return res.status(409).json({error:'Initial setup has already been completed'});const lic=verifyLicenseKey(licenseKey);if(String(lic.schoolName).trim().toLowerCase()!==String(school.name||'').trim().toLowerCase())throw new Error('The license is issued to a different school name');if(new Date(lic.expiresAt).getTime()<Date.now())throw new Error('This license has expired');if(!String(admin.username||'').trim()||String(admin.password||'').length<8)throw new Error('Administrator username and password (8+ characters) are required');saveSchoolProfile({...school,logo:school.logo||''});const existing=db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();if(existing)db.prepare("UPDATE users SET username=?,full_name=?,role='admin',active=1,password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(String(admin.username).trim(),String(admin.fullName||admin.username).trim(),hashPassword(admin.password),existing.id);else db.prepare("INSERT INTO users(username,full_name,role,password_hash) VALUES (?,?, 'admin',?)").run(String(admin.username).trim(),String(admin.fullName||admin.username).trim(),hashPassword(admin.password));setStateValue('LICENSE',JSON.stringify(lic));setStateValue('SETUP_COMPLETE','1');res.json({ok:true,school:getSchoolProfile(),license:licenseStatus()});}catch(e){res.status(400).json({error:e.message||'Setup failed'});}});
app.post('/api/license/activate',requireAuth,requireAdmin,(req,res)=>{try{const lic=verifyLicenseKey(req.body?.licenseKey);const current=getLicense();if(current){if(String(lic.schoolId).trim().toLowerCase()!==String(current.schoolId).trim().toLowerCase())throw new Error('This license belongs to a different school/site');if(String(lic.schoolName).trim().toLowerCase()!==String(current.schoolName).trim().toLowerCase())throw new Error('This license belongs to a different school name');}if(new Date(lic.expiresAt).getTime()<Date.now())throw new Error('License has expired');setStateValue('LICENSE',JSON.stringify(lic)); audit(req,'LICENSE_ACTIVATED',`License ${lic.licenseNo} activated/renewed for ${lic.schoolName}`); res.json({ok:true,license:licenseStatus()});}catch(e){res.status(400).json({error:e.message||'Activation failed'});}});
app.get('/api/license/status',requireAuth,requireAdmin,(_req,res)=>res.json({license:licenseStatus()}));
function createBackupFile(){const dir=path.join(dataDir,'backups');fs.mkdirSync(dir,{recursive:true});const filename=`school-management-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.db`;const target=path.join(dir,filename);return db.backup(target).then(()=>{const files=fs.readdirSync(dir).filter(f=>f.endsWith('.db')).sort().reverse();files.slice(BACKUP_RETENTION).forEach(f=>{try{fs.unlinkSync(path.join(dir,f))}catch{}});return target;});}
const { exportJsonBackup, validateJsonBackup, restoreJsonBackup } = require('./json-backup');
app.get('/api/backups/json/download',requireAuth,requireAdmin,(req,res)=>{
  try {
    const backup=exportJsonBackup(db);
    const filename='RonoTech_Full_Backup_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Disposition',`attachment; filename="${filename}"`);
    res.type('application/json').send(JSON.stringify(backup,null,2));
  } catch(e){res.status(500).json({error:'JSON backup failed: '+e.message});}
});
app.post('/api/backups/json/restore',requireAuth,requireAdmin,async(req,res)=>{
  try {
    const backup=validateJsonBackup(req.body);
    const safetyBackup=await createBackupFile();
    restoreJsonBackup(db,backup);
    audit(req,'JSON_BACKUP_RESTORED','Restored '+backup.createdAt+'; safety backup: '+path.basename(safetyBackup));
    res.json({ok:true,message:'All saved details restored. Please sign in again using an account from the backup.',safetyBackup:path.basename(safetyBackup)});
  } catch(e){res.status(400).json({error:'JSON restore failed: '+e.message});}
});
app.get('/api/backups',requireAuth,requireAdmin,(_req,res)=>{const dir=path.join(dataDir,'backups');fs.mkdirSync(dir,{recursive:true});const backups=fs.readdirSync(dir).filter(f=>f.endsWith('.db')).sort().reverse().map(f=>({filename:f,size:fs.statSync(path.join(dir,f)).size,modified:fs.statSync(path.join(dir,f)).mtime.toISOString()}));res.json({backups});});
app.post('/api/backups/create',requireAuth,requireAdmin,async(_req,res)=>{try{const target=await createBackupFile(); audit(_req,'BACKUP_CREATED',path.basename(target)); res.json({ok:true,filename:path.basename(target)});}catch(e){res.status(500).json({error:'Backup failed'});}});
app.get('/api/backups/download/:filename',requireAuth,requireAdmin,(req,res)=>{const name=path.basename(req.params.filename),target=path.join(dataDir,'backups',name);if(!fs.existsSync(target))return res.status(404).json({error:'Backup not found'});res.download(target,name);});
app.post('/api/backups/restore',requireAuth,requireAdmin,(req,res)=>{const name=path.basename(String(req.body?.filename||'')),target=path.join(dataDir,'backups',name);if(!name||!fs.existsSync(target))return res.status(404).json({error:'Backup not found'});try{db.close();fs.copyFileSync(target,path.join(dataDir,'school-management.db'));audit(req,'BACKUP_RESTORED',name); res.json({ok:true,message:'Backup restored. The server will restart shortly.'});setTimeout(()=>process.exit(0),700);}catch(e){res.status(500).json({error:'Restore failed: '+e.message});}});


app.get('/api/health', (_req, res) => res.json({ ok:true, service:'Rono School Management System', database:'sqlite', time:new Date().toISOString() }));

const DEFAULT_SCHOOL_PROFILE = {
  name:'Your School Name', shortName:'School', address:'', phone:'', email:'', motto:'', logo:'', website:'', academicYear:new Date().getFullYear()
};
function getSchoolProfile(mode='live'){
  const row=db.prepare('SELECT value FROM app_state WHERE key=?').get(mode==='demo'?'DEMO_SCHOOL_PROFILE':'SCHOOL_PROFILE');
  try { return {...DEFAULT_SCHOOL_PROFILE, ...(row ? JSON.parse(row.value) : {})}; } catch { return {...DEFAULT_SCHOOL_PROFILE}; }
}
function saveSchoolProfile(profile,mode='live'){
  const value=JSON.stringify({...DEFAULT_SCHOOL_PROFILE,...profile});
  const key=mode==='demo'?'DEMO_SCHOOL_PROFILE':'SCHOOL_PROFILE';
  db.prepare(`INSERT INTO app_state(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`).run(key,value);
  return JSON.parse(value);
}
app.get('/api/school-profile',requireAuth,(req,res)=>res.json({profile:getSchoolProfile(req.user.mode)}));
app.put('/api/school-profile',requireAuth,requireAdmin,(req,res)=>{
  const p=req.body||{};
  if(!String(p.name||'').trim()) return res.status(400).json({error:'School name is required'});
  const profile=saveSchoolProfile(p,req.user.mode);
  audit(req,'SCHOOL_PROFILE_UPDATED','School profile updated');
  res.json({ok:true,profile});
});

app.post('/api/auth/login',(req,res)=>{
  const ip=clientIp(req);
  if(!loginAllowed(ip)) return res.status(429).json({error:'Too many failed login attempts. Please wait 15 minutes and try again.'});
  const {username,password}=req.body||{}; const cleanUsername=String(username||'').trim(); const user=db.prepare('SELECT * FROM users WHERE username=?').get(cleanUsername);
  if(!user||!user.active||!verifyPassword(password,user.password_hash)){ recordLoginFailure(ip); return res.status(401).json({error:'Invalid username or password'}); }
  const ls=licenseStatus(); if(getStateValue('SETUP_COMPLETE')==='1' && !(ls.activated && ['active','expiring','grace'].includes(ls.status))) return res.status(402).json({error:'License activation required or license expired',license:ls});
  clearLoginFailures(ip);
  const token=crypto.randomBytes(32).toString('hex'); db.prepare('INSERT INTO sessions(token,user_id,expires_at,mode) VALUES (?,?,?,?)').run(token,user.id,Date.now()+SESSION_HOURS*60*60*1000,'live');
  audit({user},'LOGIN','Successful sign-in');
  res.json({token,user:{id:user.id,username:user.username,full_name:user.full_name,role:user.role,roleLabel:ROLE_LABELS[user.role]||user.role,mode:'live'}});
});
app.post('/api/auth/demo',(_req,res)=>{const user=db.prepare("SELECT * FROM users WHERE username='admin'").get();const token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions(token,user_id,expires_at,mode) VALUES (?,?,?,?)').run(token,user.id,Date.now()+2*60*60*1000,'demo');if(!getStateValue('DEMO_SCHOOL_PROFILE'))setStateValue('DEMO_SCHOOL_PROFILE',JSON.stringify({...DEFAULT_SCHOOL_PROFILE,name:'DEMO SCHOOL',shortName:'DEMO SCHOOL',motto:'Demonstration Mode'}));res.json({token,user:{id:user.id,username:'demo',full_name:'Demo Administrator',role:'admin',roleLabel:'Demo Administrator',mode:'demo'}});});
app.post('/api/auth/logout',requireAuth,(req,res)=>{ audit(req,'LOGOUT','User signed out'); const token=req.get('x-session-token'); db.prepare('DELETE FROM sessions WHERE token=?').run(token); res.json({ok:true}); });
app.post('/api/auth/change-password',requireAuth,(req,res)=>{
  if(req.user.mode==='demo') return res.status(403).json({error:'Password changes are disabled in Demo Mode'});
  const {currentPassword,newPassword}=req.body||{};
  if(!String(newPassword||'') || String(newPassword).length<8) return res.status(400).json({error:'New password must be at least 8 characters'});
  const user=db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if(!user || !verifyPassword(currentPassword,user.password_hash)) return res.status(401).json({error:'Current password is incorrect'});
  db.prepare('UPDATE users SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(hashPassword(newPassword),req.user.id);
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').run(req.user.id,req.get('x-session-token')||'');
  audit(req,'PASSWORD_CHANGED','Password changed by account owner');
  res.json({ok:true,message:'Password changed. Other active sessions were signed out.'});
});
app.get('/api/auth/me',requireAuth,(req,res)=>res.json({user:{id:req.user.id,username:req.user.username,full_name:req.user.full_name,role:req.user.role,roleLabel:ROLE_LABELS[req.user.role]||req.user.role,mode:req.user.mode}}));

app.get('/api/users',requireAuth,requireAdmin,(req,res)=>{
  const rows=db.prepare('SELECT id,username,full_name,role,active,created_at,updated_at FROM users ORDER BY username').all();
  res.json({users:rows.map(u=>({...u,roleLabel:ROLE_LABELS[u.role]||u.role}))});
});
app.post('/api/users',requireAuth,requireAdmin,(req,res)=>{
  const {username,full_name,password,role='staff',active=true}=req.body||{};
  if(!username||!full_name||!password||!ROLES.includes(role)) return res.status(400).json({error:'Username, full name, password and valid role are required'});
  if(String(password).length<8) return res.status(400).json({error:'Password must be at least 8 characters'});
  try {
    const info=db.prepare('INSERT INTO users(username,full_name,role,password_hash,active) VALUES (?,?,?,?,?)').run(String(username).trim(),String(full_name).trim(),role,hashPassword(password),active?1:0);
    audit(req,'USER_CREATED',`Created user ${String(username).trim()} with role ${role}`);
    res.json({ok:true,id:info.lastInsertRowid});
  } catch(e){ res.status(400).json({error:e.message.includes('UNIQUE')?'Username already exists':'Unable to create user'}); }
});
app.put('/api/users/:id',requireAuth,requireAdmin,(req,res)=>{
  const id=Number(req.params.id); const existing=db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if(!existing) return res.status(404).json({error:'User not found'});
  const {full_name,role,active,password}=req.body||{};
  if(role && !ROLES.includes(role)) return res.status(400).json({error:'Invalid role'});
  if(id===req.user.id && active===false) return res.status(400).json({error:'You cannot deactivate your own administrator account'});
  const nextRole=role||existing.role, nextName=String(full_name||existing.full_name).trim(), nextActive=active===undefined?existing.active:(active?1:0);
  if(password){ if(String(password).length<8) return res.status(400).json({error:'Password must be at least 8 characters'}); db.prepare('UPDATE users SET full_name=?,role=?,active=?,password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(nextName,nextRole,nextActive,hashPassword(password),id); }
  else db.prepare('UPDATE users SET full_name=?,role=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(nextName,nextRole,nextActive,id);
  audit(req,'USER_UPDATED',`Updated user ${existing.username}`);
  res.json({ok:true});
});
app.delete('/api/users/:id',requireAuth,requireAdmin,(req,res)=>{ const id=Number(req.params.id); if(id===req.user.id) return res.status(400).json({error:'You cannot delete your own account'}); db.prepare('DELETE FROM users WHERE id=?').run(id); audit(req,'USER_DELETED',`Deleted user ${existing?.username||id}`); res.json({ok:true}); });

app.get('/api/audit-log',requireAuth,requireAdmin,(req,res)=>{
  const limit=Math.min(Math.max(Number(req.query.limit)||100,1),500);
  const rows=db.prepare('SELECT id,username,action,details,ip_address,created_at FROM audit_log ORDER BY id DESC LIMIT ?').all(limit);
  res.json({logs:rows});
});

const {mergeOffline}=require('./offline-merge');
const {hideOperations,protectOperations,validateOperations}=require('./operations-policy');
require('./timetable-generator-routes')(app,db,requireAuth,requireAdmin,audit);
require('./teacher-management').register(app,db,requireAuth,requireAdmin,audit);
function offlineVisible(value,user,key){
  if(!value)return null;
  const data=JSON.parse(value);
  if(key==='SMS_V4_DATABASE'||key==='DEMO_SMS_V4_DATABASE'){
    hideOperations(data,user.role);
    if(user.role!=='admin'&&user.role!=='finance') ['feeStructures','invoices','payments','bursaries','expenses'].forEach(k=>data[k]=[]);
    if(user.role!=='admin'&&user.role!=='librarian') ['books','issues'].forEach(k=>data[k]=[]);
  }
  return data;
}
app.post('/api/offline/sync',requireAuth,(req,res)=>{
  try{
    let {key,base,value}=req.body||{};
    if(!['SMS_V4_DATABASE','MABASI_EXAM_ANALYZER'].includes(key)||typeof value!=='string'||(base!==null&&typeof base!=='string'))return res.status(400).json({error:'Invalid offline change'});
    if(req.user.mode==='demo')key=key==='SMS_V4_DATABASE'?'DEMO_SMS_V4_DATABASE':'DEMO_MABASI_EXAM_ANALYZER';
    const result=db.transaction(()=>{
      const row=db.prepare('SELECT value FROM app_state WHERE key=?').get(key);
      const current=row?.value||null,visible=offlineVisible(current,req.user,key);
      const local=JSON.parse(value),original=base===null?null:JSON.parse(base);
      if(!local||typeof local!=='object'||Array.isArray(local))throw new Error('Invalid offline data');
      let merged=mergeOffline(original,local,visible);
      if((key==='SMS_V4_DATABASE'||key==='DEMO_SMS_V4_DATABASE')&&req.user.role!=='admin'&&current){
        const full=JSON.parse(current);
        if(req.user.role!=='finance') ['feeStructures','invoices','payments','bursaries','expenses'].forEach(k=>{if(full[k]!==undefined)merged[k]=full[k];});
        if(req.user.role!=='librarian') ['books','issues'].forEach(k=>{if(full[k]!==undefined)merged[k]=full[k];});
      }
      if(key==='SMS_V4_DATABASE'||key==='DEMO_SMS_V4_DATABASE'){protectOperations(merged,current?JSON.parse(current):{},req.user.role);validateOperations(merged);}
      if(key.endsWith('EXAM_ANALYZER'))merged.updatedAt=Date.now();
      const saved=JSON.stringify(merged);
      db.prepare('INSERT INTO app_state(key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').run(key,saved);
      return {ok:true,value:JSON.stringify(offlineVisible(saved,req.user,key))};
    })();
    res.json(result);
  }catch(e){res.status(e.status||400).json({error:e.message||'Offline sync failed'});}
});
app.get('/api/state',requireAuth,(req,res)=>{
  let key=String(req.query.key||''); if(['RONO_ADMIN_TIMETABLE_GENERATOR','RONO_ADMIN_TEACHING_ALLOCATIONS'].includes(key)&&(req.user.role!=='admin'||req.user.mode==='demo'))return res.status(403).json({error:'Administrator access required'}); if(!key) return res.status(400).json({error:'Missing key'});
  if(req.user.mode==='demo'&&key==='SMS_V4_DATABASE')key='DEMO_SMS_V4_DATABASE';
  const row=db.prepare('SELECT value FROM app_state WHERE key=?').get(key);
  if(!row) return res.json({value:null});
  if(key==='SMS_V4_DATABASE'||key==='DEMO_SMS_V4_DATABASE') {
    try {
      const data=JSON.parse(row.value);
      hideOperations(data,req.user.role);
      if(req.user.role!=='admin' && req.user.role!=='finance') { data.feeStructures=[]; data.invoices=[]; data.payments=[]; data.bursaries=[]; data.expenses=[]; }
      if(req.user.role!=='admin' && req.user.role!=='librarian') { data.books=[]; data.issues=[]; }
      return res.json({value:JSON.stringify(data)});
    } catch(e) { return res.json({value:row.value}); }
  }
  res.json({value:row.value});
});
app.post('/api/state',requireAuth,(req,res)=>{
  let key=String(req.body?.key||''); if(['RONO_ADMIN_TIMETABLE_GENERATOR','RONO_ADMIN_TEACHING_ALLOCATIONS'].includes(key))return res.status(403).json({error:'Use the administrator timetable generator settings endpoint'}); const value=req.body?.value; if(req.user.mode==='demo'&&key==='SMS_V4_DATABASE')key='DEMO_SMS_V4_DATABASE';
  if(!key||typeof value!=='string') return res.status(400).json({error:'Invalid state payload'});
  let finalValue=value;
  if((key==='SMS_V4_DATABASE'||key==='DEMO_SMS_V4_DATABASE') && req.user.role!=='admin') {
    try {
      const incoming=JSON.parse(value);
      const existingRow=db.prepare('SELECT value FROM app_state WHERE key=?').get(key);
      const existing=existingRow?JSON.parse(existingRow.value):{};
      const financeFields=['feeStructures','invoices','payments','bursaries','expenses'];
      const libraryFields=['books','issues'];
      if(req.user.role!=='finance') financeFields.forEach(k=>{ if(existing[k]!==undefined) incoming[k]=existing[k]; });
      if(req.user.role!=='librarian') libraryFields.forEach(k=>{ if(existing[k]!==undefined) incoming[k]=existing[k]; });
      protectOperations(incoming,existing,req.user.role);
      validateOperations(incoming);
      finalValue=JSON.stringify(incoming);
    } catch(e) { return res.status(400).json({error:'Invalid database state'}); }
  }
  if((key==='SMS_V4_DATABASE'||key==='DEMO_SMS_V4_DATABASE') && req.user.role==='admin'){try{validateOperations(JSON.parse(finalValue));}catch(e){return res.status(e.status||400).json({error:e.message});}}
  db.prepare(`INSERT INTO app_state(key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).run(key,finalValue);
  res.json({ok:true});
});
app.delete('/api/state',requireAuth,requireAdmin,(req,res)=>{ let key=String(req.query.key||''); if(!key) return res.status(400).json({error:'Missing key'}); db.prepare('DELETE FROM app_state WHERE key=?').run(key); res.json({ok:true}); });
app.get('/api/exam-analyzer',requireAuth,(req,res)=>{
  const examKey=req.user.mode==='demo'?'DEMO_MABASI_EXAM_ANALYZER':'MABASI_EXAM_ANALYZER'; const row=db.prepare('SELECT value,updated_at FROM app_state WHERE key=?').get(examKey);
  res.json({value: row ? row.value : null, updated_at: row ? row.updated_at : null});
});
app.post('/api/exam-analyzer',requireAuth,(req,res)=>{
  const value=req.body?.value;
  if(typeof value!=='string') return res.status(400).json({error:'Invalid exam analyzer payload'});
  try { JSON.parse(value); } catch(e) { return res.status(400).json({error:'Invalid exam analyzer JSON'}); }
  db.prepare(`INSERT INTO app_state(key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).run(req.user.mode==='demo'?'DEMO_MABASI_EXAM_ANALYZER':'MABASI_EXAM_ANALYZER',value);
  res.json({ok:true,updated_at:new Date().toISOString()});
});
app.get('/api/backup',requireAuth,requireAdmin,async(_req,res)=>{try{const target=await createBackupFile();res.download(target,path.basename(target));}catch(e){res.status(500).json({error:'Backup failed'});}});
setTimeout(()=>createBackupFile().catch(()=>{}),5000);setInterval(()=>createBackupFile().catch(()=>{}),BACKUP_INTERVAL_MS);

app.get('/',(_req,res)=>res.sendFile(path.join(__dirname,'MR RONO TECH SCHOOL MANAGEMENT.html')));

function startServer(port) {
  const onListen=() => {
    const lanIp = getLanIPv4();
    try { fs.writeFileSync(PORT_FILE, String(port), 'utf8'); } catch {}
    console.log('');
    console.log('==============================================');
    console.log(' MABASI COMPREHENSIVE SCHOOL MANAGEMENT SYSTEM');
    console.log('==============================================');
    console.log(` Local:  ${SERVER_SCHEME}://localhost:${port}`);
    console.log(` LAN:    ${SERVER_SCHEME}://${lanIp}:${port}`);
    console.log(` Port:   ${port}`);
    console.log(' Database: data/school-management.db');
    console.log(' Default admin: admin / Admin@1234');
    console.log('==============================================');
  };
  const server=HTTPS_ENABLED
    ? https.createServer(PFX_ENABLED?{pfx:fs.readFileSync(path.join(TLS_DIR,'server.pfx')),passphrase:fs.readFileSync(path.join(TLS_DIR,'server-passphrase.txt'),'utf8').trim(),minVersion:'TLSv1.2'}:{key:fs.readFileSync(path.join(TLS_DIR,'server-key.pem')),cert:fs.readFileSync(path.join(TLS_DIR,'server-cert.pem')),minVersion:'TLSv1.2'},app).listen(port,HOST,onListen)
    : app.listen(port,HOST,onListen);
  server.on('error', (err) => {
    if ((err.code === 'EACCES' || err.code === 'EADDRINUSE') && port < DEFAULT_PORT + 9) {
      console.log(`Port ${port} is unavailable (${err.code}). Trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error(`Unable to start the school server on port ${port}:`, err.message);
      process.exit(1);
    }
  });
  return server;
}

process.on('exit', () => { try { if (fs.existsSync(PORT_FILE)) fs.unlinkSync(PORT_FILE); } catch {} });
startServer(DEFAULT_PORT);
