const crypto=require('crypto');

const APP_ID=process.env.META_APP_ID||'1805154580678772';
const CONFIG_ID=process.env.META_LOGIN_CONFIG_ID||'1095585502945574';
const REDIRECT_URI=process.env.META_REDIRECT_URI||'https://kina-social-radar.netlify.app/.netlify/functions/meta-callback';

exports.handler=async()=>{
  const state=crypto.randomBytes(24).toString('hex');
  const u=new URL('https://www.facebook.com/v26.0/dialog/oauth');
  u.searchParams.set('client_id',APP_ID);
  u.searchParams.set('redirect_uri',REDIRECT_URI);
  u.searchParams.set('config_id',CONFIG_ID);
  u.searchParams.set('response_type','code');
  u.searchParams.set('override_default_response_type','true');
  u.searchParams.set('state',state);

  return {
    statusCode:302,
    headers:{
      Location:u.toString(),
      'Cache-Control':'no-store',
      'Set-Cookie':`kina_meta_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
    },
    body:''
  };
};
