const crypto=require('crypto');

const API='https://graph.facebook.com/v26.0';
const APP_ID=process.env.META_APP_ID||'1805154580678772';
const APP_SECRET=process.env.META_APP_SECRET;
const PAGE_ID=process.env.META_PAGE_ID||'1509553589301906';
const IG_ID=process.env.IG_USER_ID||'17841400332636068';
const REDIRECT_URI=process.env.META_REDIRECT_URI||'https://kina-social-radar.netlify.app/.netlify/functions/meta-callback';
const HOME='https://kina-social-radar.netlify.app/';

function cookies(header=''){
  return Object.fromEntries(header.split(';').map(x=>x.trim()).filter(Boolean).map(x=>{
    const i=x.indexOf('=');
    return i<0?[x,'']:[x.slice(0,i),decodeURIComponent(x.slice(i+1))];
  }));
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
  const j=await r.json();
  if(!r.ok||j.error) throw new Error(j.error?.message||'Meta API error');
  return j;
}
function go(code){
  return {
    statusCode:302,
    multiValueHeaders:{'Set-Cookie':['kina_meta_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0']},
    headers:{Location:HOME+'?meta='+encodeURIComponent(code),'Cache-Control':'no-store'},
    body:''
  };
}

exports.handler=async(event)=>{
  try{
    if(!APP_SECRET) return go('missing_secret');
    const q=event.queryStringParameters||{};
    if(q.error||!q.code) return go('cancelled');

    const stateCookie=cookies(event.headers?.cookie||event.headers?.Cookie||'').kina_meta_state;
    if(!q.state||!stateCookie||q.state!==stateCookie) return go('state_error');

    const tokenUrl=new URL(API+'/oauth/access_token');
    tokenUrl.searchParams.set('client_id',APP_ID);
    tokenUrl.searchParams.set('client_secret',APP_SECRET);
    tokenUrl.searchParams.set('redirect_uri',REDIRECT_URI);
    tokenUrl.searchParams.set('code',q.code);
    const short=await json(tokenUrl);

    let userToken=short.access_token;
    try{
      const longUrl=new URL(API+'/oauth/access_token');
      longUrl.searchParams.set('grant_type','fb_exchange_token');
      longUrl.searchParams.set('client_id',APP_ID);
      longUrl.searchParams.set('client_secret',APP_SECRET);
      longUrl.searchParams.set('fb_exchange_token',short.access_token);
      const long=await json(longUrl);
      if(long.access_token) userToken=long.access_token;
    }catch(_){}

    const accountsUrl=new URL(API+'/me/accounts');
    accountsUrl.searchParams.set('fields','id,name,access_token,instagram_business_account');
    accountsUrl.searchParams.set('limit','100');
    accountsUrl.searchParams.set('access_token',userToken);
    const accounts=await json(accountsUrl);

    const page=(accounts.data||[]).find(p=>p.id===PAGE_ID||p.instagram_business_account?.id===IG_ID);
    if(!page?.access_token) return go('page_not_found');

    const verifyUrl=new URL(API+'/'+IG_ID);
    verifyUrl.searchParams.set('fields','id,username');
    verifyUrl.searchParams.set('access_token',page.access_token);
    const ig=await json(verifyUrl);
    if(ig.id!==IG_ID) return go('wrong_instagram');

    const {getStore}=await import('@netlify/blobs');
    const store=getStore({name:'kina-social-radar-auth',consistency:'strong'});
    await store.set('meta-page-token',encrypt(page.access_token),{
      metadata:{pageId:page.id,instagramId:ig.id,username:ig.username||'',connectedAt:new Date().toISOString()}
    });

    return go('connected');
  }catch(e){
    return go('failed');
  }
};
