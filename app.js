const buttons=[...document.querySelectorAll('nav button')],views=[...document.querySelectorAll('.view')];
function go(id){buttons.forEach(b=>b.classList.toggle('active',b.dataset.view===id));views.forEach(v=>v.classList.toggle('active',v.id===id))}
buttons.forEach(b=>b.onclick=()=>go(b.dataset.view));document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));
const file=document.getElementById('file');file.onchange=()=>{if(file.files.length){document.getElementById('boostResult').classList.remove('hidden');document.getElementById('drop').querySelector('h3').textContent=file.files[0].name}};
const fmt=n=>new Intl.NumberFormat('nl-BE',{notation:n>=10000?'compact':'standard',maximumFractionDigits:1}).format(n||0);
const esc=s=>(s||'Zonder caption').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function load(){
 const status=document.getElementById('status');
 try{
  const r=await fetch('/.netlify/functions/social-data',{cache:'no-store'}); const d=await r.json(); if(!r.ok) throw new Error(d.error||'Meta-data niet beschikbaar');
  status.classList.add('live');status.querySelector('span').textContent='Live • @'+d.account.username;
  document.getElementById('views').textContent=fmt(d.totals.views);document.getElementById('reach').textContent=fmt(d.totals.reach);document.getElementById('likes').textContent=fmt(d.totals.likes);document.getElementById('shares').textContent=fmt(d.totals.shares);
  document.getElementById('followers').textContent=fmt(d.account.followers_count);document.getElementById('mediaCount').textContent=fmt(d.account.media_count);document.getElementById('accountName').textContent='@'+d.account.username;document.getElementById('updated').textContent='Bijgewerkt '+new Date(d.updatedAt).toLocaleString('nl-BE');
  const score=Math.min(100,Math.round((d.totals.reach?d.totals.views/d.totals.reach:0)*25+(d.totals.views?(d.totals.likes+d.totals.comments*2+d.totals.shares*3+d.totals.saved*3)/d.totals.views*500:0)));
  document.getElementById('growScore').innerHTML=score+'<span>/100</span>';document.getElementById('scoreNote').textContent=d.media.length+' recente posts geanalyseerd';
  document.getElementById('heroTitle').textContent=d.top[0]?'Je sterkste recente post: '+fmt(d.top[0].views)+' views':'Live Instagram-data verbonden';
  document.getElementById('heroText').textContent='Score combineert bereik, views en interactie van je recente content. Meer data maakt het signaal sterker.';
  const rows=d.top.map((m,i)=>'<div class="signal"><b>0'+(i+1)+'</b><span><strong>'+esc((m.caption||'Zonder caption').slice(0,48))+'</strong><small>'+fmt(m.views)+' views • '+fmt(m.reach)+' bereik</small></span></div>').join('');
  document.getElementById('topContent').innerHTML=rows||'<p class="muted">Geen recente media gevonden.</p>';
  document.getElementById('radarList').innerHTML=d.media.slice(0,10).map(m=>'<div><strong>'+esc((m.caption||m.media_product_type).slice(0,55))+'</strong><span>'+fmt(m.views)+' VIEWS • '+fmt(m.reach)+' REACH • '+fmt(m.shares)+' SHARES</span></div>').join('');
  const best=d.top[0];document.getElementById('growthActions').innerHTML='<article class="card"><b>01</b><h3>Herhaal wat scoort</h3><p>'+(best?'Je beste recente item haalt '+fmt(best.views)+' views. Gebruik onderwerp, tempo en hook als referentie.':'Publiceer meer content om patronen te herkennen.')+'</p></article><article class="card"><b>02</b><h3>Stuur op shares</h3><p>'+fmt(d.totals.shares)+' shares in de geanalyseerde reeks. Maak content die mensen naar vrienden willen doorsturen.</p></article><article class="card"><b>03</b><h3>Meet, niet gok</h3><p>Nieuwe posts worden automatisch meegenomen wanneer het dashboard ververst.</p></article>';
 }catch(e){status.classList.add('error');status.querySelector('span').textContent='Setup nodig';document.getElementById('heroTitle').textContent='Backend nog niet verbonden';document.getElementById('heroText').textContent=e.message+' • Zet META_ACCESS_TOKEN als Netlify environment variable.'}
}
load();