const crypto=require('crypto');

const APP_ID=process.env.META_APP_ID||'1805154580678772';
const APP_SECRET=process.env.META_APP_SECRET;
const CONFIG_ID=process.env.META_LOGIN_CONFIG_ID||'1095585502945574';
const REDIRECT_URI=process.env.META_REDIRECT_URI||'https://kina-social-radar.netlify.app/.netlify/functions/meta-callback';

function makeState(){
  if(!APP_SECRET) throw new Error('META_APP_SECRET ontbreekt');
  const payload=Buffer.from(JSON.stringify({t:Date.now(),n:crypto.randomBytes(18).toString('hex')})).toString('base64url');
  const sig=crypto.createHmac('sha256',APP_SECRET).update(payload).digest('base64url');
  return payload+'.'+sig;
}

exports.handler=async()=>{
  try{
    const u=new URL('https://www.facebook.com/v26.0/dialog/oauth');
    u.searchParams.set('client_id',APP_ID);
    u.searchParams.set('redirect_uri',REDIRECT_URI);
    u.searchParams.set('config_id',CONFIG_ID);
    u.searchParams.set('response_type','code');
    u.searchParams.set('override_default_response_type','true');
    u.searchParams.set('state',makeState());

    return {
      statusCode:302,
      headers:{Location:u.toString(),'Cache-Control':'no-store'},
      body:''
    };
  }catch(e){
    return {
      statusCode:302,
      headers:{Location:'https://kina-social-radar.netlify.app/?meta=missing_secret','Cache-Control':'no-store'},
      body:''
    };
  }
};
