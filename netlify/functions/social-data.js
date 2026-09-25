const API='https://graph.facebook.com/v26.0';
const IG=process.env.IG_USER_ID||'17841400332636068';
const TOKEN=process.env.META_ACCESS_TOKEN;
async function graph(path){const u=new URL(API+'/'+path);u.searchParams.set('access_token',TOKEN);const r=await fetch(u);const j=await r.json();if(!r.ok||j.error)throw new Error(j.error?.message||'Meta API error');return j}
exports.handler=async()=>{try{
 if(!TOKEN) return {statusCode:503,headers:{'Content-Type':'application/json'},body:JSON.stringify({error:'META_ACCESS_TOKEN ontbreekt'})};
 const account=await graph(IG+'?fields=id,username,name,followers_count,media_count');
 const feed=await graph(IG+'/media?fields=id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count&limit=25');
 const media=await Promise.all((feed.data||[]).map(async m=>{let x={};try{const ins=await graph(m.id+'/insights?metric=reach,views,likes,comments,shares,saved');for(const a of ins.data||[])x[a.name]=a.values?.[0]?.value||0}catch(e){}return {...m,reach:x.reach||0,views:x.views||0,likes:x.likes??m.like_count??0,comments:x.comments??m.comments_count??0,shares:x.shares||0,saved:x.saved||0}}));
 const totals=media.reduce((a,m)=>{for(const k of ['reach','views','likes','comments','shares','saved'])a[k]+=Number(m[k]||0);return a},{reach:0,views:0,likes:0,comments:0,shares:0,saved:0});
 const top=[...media].sort((a,b)=>b.views-a.views).slice(0,3);
 return {statusCode:200,headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=300'},body:JSON.stringify({account,media,totals,top,updatedAt:new Date().toISOString()})};
 }catch(e){return {statusCode:500,headers:{'Content-Type':'application/json'},body:JSON.stringify({error:e.message})}}};