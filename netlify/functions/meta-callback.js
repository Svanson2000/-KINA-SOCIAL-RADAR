const crypto = require('crypto');

const API = 'https://graph.facebook.com/v26.0';
const APP_ID = process.env.META_APP_ID || '1805154580678772';
const APP_SECRET = process.env.META_APP_SECRET;
const PAGE_ID = process.env.META_PAGE_ID || '1509553589301906';
const IG_ID = process.env.IG_USER_ID || '17841400332636068';
const REDIRECT_URI =
  process.env.META_REDIRECT_URI ||
  'https://kina-social-radar.netlify.app/.netlify/functions/meta-callback';

const HOME = 'https://kina-social-radar.netlify.app/';

function verifyState(state) {
  try {
    if (!APP_SECRET || !state) return false;
    const [payload, sig] = String(state).split('.');
    if (!payload || !sig) return false;
    const expected = crypto.createHmac('sha256', APP_SECRET).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isFinite(data.t) && Date.now() - data.t >= 0 && Date.now() - data.t < 15 * 60 * 1000;
  } catch {
    return false;
  }
}

function encryptionKey() {
  if (!APP_SECRET) throw new Error('META_APP_SECRET ontbreekt');
  return crypto.createHash('sha256').update(APP_SECRET + ':' + APP_ID + ':kina-social-radar').digest();
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: data.toString('base64')
  });
}

async function meta(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const json = await response.json();
  if (!response.ok || json.error) throw new Error(json.error?.message || 'Meta API error');
  return json;
}

function redirect(code) {
  return {
    statusCode: 302,
    headers: {
      Location: HOME + '?meta=' + encodeURIComponent(code),
      'Cache-Control': 'no-store'
    },
    body: ''
  };
}

exports.handler = async event => {
  try {
    if (!APP_SECRET) return redirect('missing_secret');
    const q = event.queryStringParameters || {};
    if (q.error) return redirect('cancelled');
    if (!q.code) return redirect('missing_code');
    if (!verifyState(q.state)) return redirect('state_error');

    const tokenUrl = new URL(API + '/oauth/access_token');
    tokenUrl.searchParams.set('client_id', APP_ID);
    tokenUrl.searchParams.set('client_secret', APP_SECRET);
    tokenUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    tokenUrl.searchParams.set('code', q.code);
    const short = await meta(tokenUrl);

    let userToken = short.access_token;

    try {
      const longUrl = new URL(API + '/oauth/access_token');
      longUrl.searchParams.set('grant_type', 'fb_exchange_token');
      longUrl.searchParams.set('client_id', APP_ID);
      longUrl.searchParams.set('client_secret', APP_SECRET);
      longUrl.searchParams.set('fb_exchange_token', short.access_token);
      const long = await meta(longUrl);
      if (long.access_token) userToken = long.access_token;
    } catch {}

    const accountsUrl = new URL(API + '/me/accounts');
    accountsUrl.searchParams.set('fields', 'id,name,access_token,instagram_business_account');
    accountsUrl.searchParams.set('limit', '100');
    accountsUrl.searchParams.set('access_token', userToken);
    const accounts = await meta(accountsUrl);

    const page = (accounts.data || []).find(
      p => p.id === PAGE_ID || p.instagram_business_account?.id === IG_ID
    );

    if (!page?.access_token) return redirect('page_not_found');

    const verifyUrl = new URL(API + '/' + IG_ID);
    verifyUrl.searchParams.set('fields', 'id,username');
    verifyUrl.searchParams.set('access_token', page.access_token);
    const instagram = await meta(verifyUrl);

    if (instagram.id !== IG_ID) return redirect('wrong_instagram');

    const { getStore } = await import('@netlify/blobs');
    const store = getStore({
      name: 'kina-social-radar-auth',
      consistency: 'strong'
    });

    await store.set('meta-page-token', encrypt(page.access_token), {
      metadata: {
        pageId: page.id,
        instagramId: instagram.id,
        username: instagram.username || '',
        connectedAt: new Date().toISOString()
      }
    });

    return redirect('connected');
  } catch (error) {
    console.error('META CALLBACK:', error);
    return redirect('failed');
  }
};
