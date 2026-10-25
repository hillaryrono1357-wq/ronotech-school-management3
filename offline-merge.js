const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const object=x=>x && typeof x==='object' && !Array.isArray(x);
function mergeOffline(base,local,remote,path='$'){
  if(equal(local,base))return remote;
  if(equal(remote,base)||equal(local,remote))return local;
  if((object(base)||base===undefined)&&object(local)&&object(remote)){
    base=base||{};
    const result={};
    for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
      // These values describe UI state, not learner records.
      if(['updatedAt','classFilter','streamFilter'].includes(key)){result[key]=remote[key]??local[key];continue;}
      const value=mergeOffline(base[key],local[key],remote[key],path+'.'+key);
      if(value!==undefined)result[key]=value;
    }
    return result;
  }
  if((Array.isArray(base)||base===undefined)&&Array.isArray(local)&&Array.isArray(remote) && [...(base||[]),...local,...remote].every(x=>object(x)&&x.id!==undefined)){
    const index=rows=>{const map=new Map();for(const row of rows){const id=String(row.id);if(map.has(id))throw new Error('Duplicate record at '+path);map.set(id,row);}return map;};
    const b=index(base||[]),l=index(local),r=index(remote),result=[];
    for(const id of new Set([...r.keys(),...l.keys(),...b.keys()])){
      const value=mergeOffline(b.get(id),l.get(id),r.get(id),path+'['+id+']');
      if(value!==undefined)result.push(value);
    }
    return result;
  }
  const error=new Error('Both devices changed '+path+'. Your offline changes are retained for review.');error.status=409;throw error;
}
module.exports={mergeOffline};
