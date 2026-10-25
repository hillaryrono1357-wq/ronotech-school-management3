/* Device-local saved records and durable reconnect queue. */
const RonoOffline={
  busy:false,message:'Connecting...',
  owner(){const user=CURRENT_USER||JSON.parse(sessionStorage.getItem('rono_offline_user')||'null');return user?String(user.id)+':'+(user.mode||'live'):null;},
  storageKey(key){const owner=this.owner();if(!owner)throw new Error('Sign in online before using offline records.');return 'rono_offline_v1:'+owner+':'+key;},
  entry(key){return JSON.parse(localStorage.getItem(this.storageKey(key))||'null');},
  store(key,entry){localStorage.setItem(this.storageKey(key),JSON.stringify(entry));},
  status(message){this.message=message;let box=document.getElementById('rono-offline-status');if(!box){box=document.createElement('div');box.id='rono-offline-status';box.setAttribute('role','status');box.style.cssText='position:fixed;bottom:12px;right:12px;z-index:190;background:white;color:#172554;border:2px solid #1e40af;border-radius:8px;padding:10px;max-width:360px;font:13px sans-serif;box-shadow:0 2px 8px #0003';document.body.appendChild(box);}
    box.replaceChildren();const label=document.createElement('div');label.textContent=message;box.appendChild(label);
    for(const [text,action] of [['Sync now',()=>this.flush()],['Sign in',()=>openLogin()],['Download pending copy',()=>this.downloadPending()]]){const button=document.createElement('button');button.textContent=text;button.style.cssText='margin:6px 8px 0 0;text-decoration:underline;cursor:pointer';button.onclick=action;box.appendChild(button);}
    if(message.startsWith('Sync conflict:')){const button=document.createElement('button');button.textContent='Keep host records';button.style.cssText='margin-top:6px;text-decoration:underline;cursor:pointer';button.onclick=()=>this.keepHostRecords();box.appendChild(button);}
    box.style.display=SESSION_TOKEN?'block':'none';
  },
  queue(key,value){let entry=this.entry(key);if(!entry){this.read(key);entry=this.entry(key);}if(!entry)throw new Error('Load these records from the host before editing offline.');this.store(key,{base:entry.base,value,pending:true});this.status('Saved on this device. Waiting to sync with host.');this.flush();return {ok:true,offline:true};},
  accept(key,value){const old=this.entry(key);if(old?.pending)return old.value;this.store(key,{base:value,value,pending:false});return value;},
  read(key){const cached=this.entry(key);if(cached?.pending)return cached.value;
    try{const xhr=new XMLHttpRequest();xhr.open('GET','/api/state?key='+encodeURIComponent(key),false);xhr.setRequestHeader('x-session-token',SESSION_TOKEN);xhr.send();
      if(xhr.status===200){const data=JSON.parse(xhr.responseText);return this.accept(key,data.value??null);}
      if(xhr.status===401){this.status('Sign in again to sync. Offline records are retained.');throw new Error('Sign in again to load records.');}
      if(xhr.status!==0)throw new Error('Host rejected the record request.');
    }catch(e){if(e.message.includes('Sign in again')||e.message.includes('rejected'))throw e;}
    if(cached){this.status('Offline: using records saved on this device.');return cached.value;}
    throw new Error('No offline copy is available. Connect to the host and load this page first.');
  },
  async api(url,options={}){
    const method=(options.method||'GET').toUpperCase(),parsed=new URL(url,location.origin);
    let key=parsed.pathname==='/api/exam-analyzer'?'MABASI_EXAM_ANALYZER':parsed.pathname==='/api/state'?(method==='GET'?parsed.searchParams.get('key'):JSON.parse(options.body||'{}').key):null;
    if(key && ['SMS_V4_DATABASE','MABASI_EXAM_ANALYZER'].includes(key)){
      if(method==='POST')return this.queue(key,JSON.parse(options.body).value);
      if(method==='GET'){
        const cached=this.entry(key);if(cached?.pending)return {value:cached.value};
        try{const response=await this.request(url,options);response.value=this.accept(key,response.value??null);return response;}
        catch(e){if(e.network && cached){this.status('Offline: using saved records.');return {value:cached.value};}throw e;}
      }
    }
    if(method==='GET' && ['/api/auth/me','/api/school-profile'].includes(parsed.pathname)){
      try{const data=await this.request(url,options);sessionStorage.setItem('rono_offline_'+parsed.pathname,JSON.stringify(data));if(data.user)sessionStorage.setItem('rono_offline_user',JSON.stringify(data.user));if(data.profile)localStorage.setItem('rono_remembered_profile',JSON.stringify(data));return data;}
      catch(e){const saved=sessionStorage.getItem('rono_offline_'+parsed.pathname);if(e.network && (saved||localStorage.getItem('rono_remembered_session')) && SESSION_TOKEN){this.status('Offline session: reconnect to verify and sync.');if(saved)return JSON.parse(saved);const remembered=JSON.parse(localStorage.getItem('rono_remembered_session'));return parsed.pathname==='/api/auth/me'?{user:remembered.user}:JSON.parse(localStorage.getItem('rono_remembered_profile')||'{"profile":{}}');}throw e;}
    }
    return this.request(url,options);
  },
  async request(url,options={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
    let response;
    try{response=await fetch(url,{...options,signal:controller.signal,headers:{'Content-Type':'application/json',...(options.headers||{}),'x-session-token':SESSION_TOKEN}});}
    catch(e){const error=new Error('Host unavailable. Saved offline changes will sync after reconnecting.');error.network=true;throw error;}
    finally{clearTimeout(timer);}
    const data=await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(data.error||'Request failed');error.status=response.status;throw error;}
    return data;
  },
  async flush(){
    if(this.busy||!SESSION_TOKEN||!this.owner())return;
    this.busy=true;
    try{
      for(const key of ['SMS_V4_DATABASE','MABASI_EXAM_ANALYZER']){
        const sent=this.entry(key);if(!sent?.pending)continue;
        this.status('Syncing saved changes with host...');
        const result=await this.request('/api/offline/sync',{method:'POST',body:JSON.stringify({key,base:sent.base,value:sent.value})});
        const latest=this.entry(key);
        if(latest.value===sent.value){
          this.store(key,{base:result.value,value:result.value,pending:false});
          if(key==='SMS_V4_DATABASE' && JSON.stringify(SMS_DB)===sent.value)SMS_DB=JSON.parse(result.value);
        }else{
          // Another edit was saved while this request was in flight: retain it for the next retry.
          this.store(key,{...latest,base:sent.value,pending:true});
        }
      }
      const pending=['SMS_V4_DATABASE','MABASI_EXAM_ANALYZER'].some(key=>this.entry(key)?.pending);
      if(pending)this.status('New changes saved locally. Next sync will run automatically.');
      else{await this.request('/api/auth/me');this.status('Connected to host. All saved changes synced.');}
    }catch(e){this.status(e.status===409?'Sync conflict: '+e.message:e.status===401?'Sign in online again to sync. Pending changes are retained.':e.network?'Offline: saved changes are retained on this device.':e.message);}
    finally{this.busy=false;}
  },
  async keepHostRecords(){
    if(!confirm('Keep the host versions for all pending records on this device? A copy of your offline changes will be downloaded first. Review that copy before re-entering any changes you still need.'))return;
    try{
      this.downloadPending();const replacements=[];
      for(const key of ['SMS_V4_DATABASE','MABASI_EXAM_ANALYZER'])if(this.entry(key)?.pending){const data=await this.request('/api/state?key='+encodeURIComponent(key));replacements.push([key,data.value??null]);}
      for(const [key,value] of replacements)this.store(key,{base:value,value,pending:false});
      location.reload();
    }catch(e){this.status(e.message);}
  },
  downloadPending(){try{const records={};for(const key of ['SMS_V4_DATABASE','MABASI_EXAM_ANALYZER']){const e=this.entry(key);if(e?.pending)records[key]=e;}const blob=new Blob([JSON.stringify({format:'RonoTech.PendingOfflineChanges',createdAt:new Date().toISOString(),records},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='RonoTech_Pending_Offline_Changes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}catch(e){alert(e.message);}}
};
window.addEventListener('online',()=>RonoOffline.flush());
setInterval(()=>RonoOffline.flush(),15000);
if('serviceWorker' in navigator && window.isSecureContext)navigator.serviceWorker.register('/offline-sw.js').catch(e=>console.warn('Offline app cache:',e.message));

let ronoInstallPrompt=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();ronoInstallPrompt=event;const button=document.createElement('button');button.textContent='Install RonoTech App';button.style.cssText='position:fixed;bottom:110px;right:12px;z-index:190;background:#172554;color:white;padding:12px;border-radius:8px';button.onclick=async()=>{await ronoInstallPrompt.prompt();await ronoInstallPrompt.userChoice;button.remove();ronoInstallPrompt=null;};document.body.appendChild(button);});
