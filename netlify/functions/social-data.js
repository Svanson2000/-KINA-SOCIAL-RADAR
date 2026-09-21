const crypto=require('crypto');
const API='https://graph.facebook.com/v26.0';
const APP_ID=process.env.META_APP_ID||'1805154580678772';
const IG=process.env.IG_USER_ID||'17841400332636068';
const FALLBACK_TOKEN=process.env.META_ACCESS_TOKEN;

function key(){
  const secret=process.env.META_APP_SECRET;
  if(!secret) return null;
  return crypto.createHash('sha256').update(secret+':'+APP_ID+':kina-social-radar').digest();
}
function decrypt(payload){
  const k=key();
  if(!k||!payload) return null;
  const p=JSON.parse(payload);
  const decipher=crypto.createDecipheriv('aes-256-gcm',k,Buffer.from(p.iv,'base64'));
  decipher.setAuthTag(Buffer.from(p.tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(p.data,'base64')),decipher.final()]).toString('utf8');
}
async function storedToken(){
  try{
    const {getStore}=await import('@netlify/blobs');
    const store=getStore({name:'kina-social-radar-auth',consistency:'strong'});
    const payload=await store.get('meta-page-token',{consistency:'strong'});
    return decrypt(payload);
  }catch(_){
    return null;
  }
}
async function graph(path,token){
  const u=new URL(API+'/'+path);
  u.searchParams.set('access_token',token);
  const r=await fetch(u);
  const j=await r.json();
  if(!r.ok||j.error) throw new Error(j.error?.message||'Meta API error');
  return j;
}
async function baseData(token){
  const account=await graph(IG+'?fields=id,username,name,followers_count,media_count',token);
  const feed=await graph(IG+'/media?fields=id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count&limit=25',token);
  return {account,feed};
}

exports.handler=async()=>{
  try{
    const connected=await storedToken();
    const candidates=[connected,FALLBACK_TOKEN].filter((x,i,a)=>x&&a.indexOf(x)===i);
    if(!candidates.length){
      return {statusCode:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({error:'Instagram is nog niet verbonden.'})};
    }

    let token,account,feed,lastError;
    for(const candidate of candidates){
      try{
        const base=await baseData(candidate);
        token=candidate; account=base.account; feed=base.feed; break;
      }catch(e){lastError=e}
    }
    if(!token) throw lastError||new Error('Meta-verbinding ongeldig');

    const media=await Promise.all((feed.data||[]).map(async m=>{
      let x={};
      try{
        const ins=await graph(m.id+'/insights?metric=reach,views,likes,comments,shares,saved',token);
        for(const a of ins.data||[]) x[a.name]=a.values?.[0]?.value||0;
      }catch(_){}
      return {...m,reach:x.reach||0,views:x.views||0,likes:x.likes??m.like_count??0,comments:x.comments??m.comments_count??0,shares:x.shares||0,saved:x.saved||0};
    }));

    const totals=media.reduce((a,m)=>{
      for(const k of ['reach','views','likes','comments','shares','saved']) a[k]+=Number(m[k]||0);
      return a;
    },{reach:0,views:0,likes:0,comments:0,shares:0,saved:0});

    const top=[...media].sort((a,b)=>b.views-a.views).slice(0,3);
    return {
      statusCode:200,
      headers:{'Content-Type':'application/json','Cache-Control':'private,no-store'},
      body:JSON.stringify({account,media,totals,top,updatedAt:new Date().toISOString(),authSource:connected&&token===connected?'connected':'fallback'})
    };
  }catch(e){
    return {statusCode:500,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({error:e.message})};
  }
};
