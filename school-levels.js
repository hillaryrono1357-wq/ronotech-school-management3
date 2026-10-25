const LEVELS=['Foundation','Lower Primary','Upper Primary','Junior School'];
function classLevel(value){const t=String(value||'').trim().toLowerCase().replace(/[-_]/g,' ');if(/^(?:pp|pre\s*primary)\s*[12](?:\s*[a-z])?$/.test(t))return LEVELS[0];const m=/^(?:grade|class|g)?\s*([1-9])(?:\s*[a-z])?$/.exec(t);return m?LEVELS[+m[1]<=3?1:+m[1]<=6?2:3]:null;}
module.exports={LEVELS,classLevel};
