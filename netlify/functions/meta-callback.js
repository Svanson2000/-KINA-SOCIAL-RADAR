const crypto=require('crypto');

const API='https://graph.facebook.com/v26.0';
const APP_ID=process.env.META_APP_ID||'1805154580678772';
const APP_SECRET=process.env.META_APP_SECRET;
const PAGE_ID=process.env.META_PAGE_ID||'1509553589301906';
const IG_ID=process.env.IG_USER_ID||'17841400332636068';
const REDIRECT_URI=process.env.META_REDIRECT_URI||'https://kina-social-radar.netlify.app/.netlify/functions/meta-callback';
const HOME='https://kina-social-radar.netlify.app/';

function verifyState(state){
  try{
    if(!APP_SECRET||!state) return false;
    const [payload,sig]=String(state).split('.');
    if(!payload||!sig) return false;
    const expected=crypto.createHmac('sha256',APP_SECRET).update(payload).digest('base64url');
    const a=Buffer.from(sig),b=Buffer.from(expected);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b)) return false;
    const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    return Number.isFinite(data.t)&&Date.now()-data.t>=0&&Date.now()-data.t<15*60*1000;
  }catch(_){return false}
}
function key(){
  if(!APP_SECRET) throw new Error('META_APP_SECRET ontbreekt');
  return crypto.createHash('sha256').update(APP_SECRET+':'+APP_ID+':kina-social-radar').digest();
}
function encrypt(value){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);
  const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return JSON.stringify({v:1,iv:iv.toString('base64'),tag:tag.toString('base64'),data:data.toString('base64')});
}
async function json(url){
  const r=await fetch(url,{headers:{Accept:'application/json'}});
  let j={};
  try{j=await r.json()}catch(_){}
  if(!r.ok||j.error) throw new Error(j.error?.message||('Meta API fout '+r.status));
  return j;
}
function go(code){
  return {
    statusCode:302,
    headers:{Location:HOME+'?meta='+encodeURIComponent(code),'Cache-Control':'no-store'},
    body:''
  };
}

exports.handler=async(event)=>{
  let stage='start';
  try{
    if(!APP_SECRET) return go('missing_secret');
    const q=event.queryStringParameters||{};
    if(q.error) return go('cancelled');
    if(!q.code) return go('missing_code');
    if(!verifyState(q.state)) return go('state_error');

    stage='token_exchange';
    const tokenUrl=new URL(API+'/oauth/access_token');
    tokenUrl.searchParams.set('client_id',APP_ID);
    tokenUrl.searchParams.set('client_secret',APP_SECRET);
    tokenUrl.searchParams.set('redirect_uri',REDIRECT_URI);
    tokenUrl.searchParams.set('code',q.code);
    const short=await json(tokenUrl);
    if(!short.access_token) return go('token_missing');

    let userToken=short.access_token;
    stage='long_token';
    try{
      const longUrl=new URL(API+'/oauth/access_token');
      longUrl.searchParams.set('grant_type','fb_exchange_token');
      longUrl.searchParams.set('client_id',APP_ID);
      longUrl.searchParams.set('client_secret',APP_SECRET);
      longUrl.searchParams.set('fb_exchange_token',short.access_token);
      const long=await json(longUrl);
      if(long.access_token) userToken=long.access_token;
    }catch(_){}

    stage='page_lookup';
    const accountsUrl=new URL(API+'/me/accounts');
    accountsUrl.searchParams.set('fields','id,name,access_token,instagram_business_account');
    accountsUrl.searchParams.set('limit','100');
    accountsUrl.searchParams.set('access_token',userToken);
    const accounts=await json(accountsUrl);
    const page=(accounts.data||[]).find(p=>p.id===PAGE_ID||p.instagram_business_account?.id===IG_ID);
    if(!page?.access_token) return go('page_not_found');

    stage='instagram_verify';
    const verifyUrl=new URL(API+'/'+IG_ID);
    verifyUrl.searchParams.set('fields','id,username');
    verifyUrl.searchParams.set('access_token',page.access_token);
    const ig=await json(verifyUrl);
    if(ig.id!==IG_ID) return go('wrong_instagram');

    stage='storage';
    const {getStore}=await import('@netlify/blobs');
    const store=getStore({name:'kina-social-radar-auth',consistency:'strong'});
    await store.set('meta-page-token',encrypt(page.access_token),{
      metadata:{pageId:page.id,instagramId:ig.id,username:ig.username||'',connectedAt:new Date().toISOString()}
    });

    stage='storage_verify';
    const saved=await store.get('meta-page-token',{consistency:'strong'});
    if(!saved) return go('storage_error');

    return go('connected');
  }catch(e){
    const safe=['token_exchange','long_token','page_lookup','instagram_verify','storage','storage_verify'].includes(stage)?stage:'failed';
    return go('failed_'+safe);
  }
};
