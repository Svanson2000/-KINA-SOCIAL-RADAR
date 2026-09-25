const crypto = require('crypto');

const API = 'https://graph.facebook.com/v26.0';
const APP_ID = process.env.META_APP_ID || '1805154580678772';
const APP_SECRET = process.env.META_APP_SECRET;
const IG = process.env.IG_USER_ID || '17841400332636068';
const FALLBACK_TOKEN = process.env.META_ACCESS_TOKEN;

function encryptionKey() {
  if (!APP_SECRET) return null;
  return crypto.createHash('sha256').update(APP_SECRET + ':' + APP_ID + ':kina-social-radar').digest();
}

function decrypt(value) {
  try {
    if (!value) return null;
    const key = encryptionKey();
    if (!key) return null;
    const obj = JSON.parse(value);
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(obj.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(obj.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(obj.data, 'base64')),
      decipher.final()
    ]).toString('utf8');
  } catch {
    return null;
  }
}

async function savedToken() {
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore({
      name: 'kina-social-radar-auth',
      consistency: 'strong'
    });
    const encrypted = await store.get('meta-page-token', {
      consistency: 'strong'
    });
    return decrypt(encrypted);
  } catch (error) {
    console.error('TOKEN STORAGE:', error);
    return null;
  }
}

async function graph(path, token) {
  const url = new URL(API + '/' + path);
  url.searchParams.set('access_token', token);
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok || json.error) {
    throw new Error(json.error?.message || 'Meta API error');
  }
  return json;
}

async function loadAccount(token) {
  const account = await graph(
    IG + '?fields=id,username,name,followers_count,media_count',
    token
  );
  const feed = await graph(
    IG + '/media?fields=id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count&limit=25',
    token
  );
  return { account, feed };
}

exports.handler = async () => {
  try {
    const stored = await savedToken();
    const tokens = [stored, FALLBACK_TOKEN].filter(
      (token, index, array) => token && array.indexOf(token) === index
    );

    if (!tokens.length) {
      return {
        statusCode: 503,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        },
        body: JSON.stringify({
          error: 'Instagram is nog niet verbonden.'
        })
      };
    }

    let token;
    let account;
    let feed;
    let lastError;

    for (const candidate of tokens) {
      try {
        const result = await loadAccount(candidate);
        token = candidate;
        account = result.account;
        feed = result.feed;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!token) {
      throw lastError || new Error('Meta-verbinding ongeldig');
    }

    const media = await Promise.all(
      (feed.data || []).map(async item => {
        let insights = {};
        try {
          const result = await graph(
            item.id + '/insights?metric=reach,views,likes,comments,shares,saved',
            token
          );
          for (const metric of result.data || []) {
            insights[metric.name] = metric.values?.[0]?.value || 0;
          }
        } catch {}

        return {
          ...item,
          reach: insights.reach || 0,
          views: insights.views || 0,
          likes: insights.likes ?? item.like_count ?? 0,
          comments: insights.comments ?? item.comments_count ?? 0,
          shares: insights.shares || 0,
          saved: insights.saved || 0
        };
      })
    );

    const totals = media.reduce(
      (total, item) => {
        for (const key of [
          'reach',
          'views',
          'likes',
          'comments',
          'shares',
          'saved'
        ]) {
          total[key] += Number(item[key] || 0);
        }
        return total;
      },
      {
        reach: 0,
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saved: 0
      }
    );

    const top = [...media].sort((a, b) => b.views - a.views).slice(0, 3);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private,no-store'
      },
      body: JSON.stringify({
        account,
        media,
        totals,
        top,
        updatedAt: new Date().toISOString(),
        connection: stored && token === stored ? 'persistent' : 'fallback'
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({
        error: error.message
      })
    };
  }
};
