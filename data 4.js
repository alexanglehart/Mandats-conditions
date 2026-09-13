window.APP_DATA = {
  "version": "V1.0-demo",
  "people": [
    {"id":"demo-1","name":"Jean Tremblay","nickname":"Ti-Jean","dob":"1992-03-12","description":"Personne fictive utilisée uniquement pour tester l'application.","priority":"high","type":"mandat","status":"active","mandat":"Mandat fictif de démonstration","conditions":[],"vehicles":["Honda Civic — ABC 123"],"addresses":["123 rue Exemple, Ville fictive"],"info":"Donnée de démonstration — ne pas utiliser avec de vrais renseignements.","comments":[{"id":"c1","text":"Vérification fictive à l'adresse connue. Aucun contact.","createdAt":"2026-09-08T19:30:00"}],"photos":[]},
    {"id":"demo-2","name":"Marc Gagnon","nickname":"Marco","dob":"1988-07-24","description":"Personne fictive utilisée uniquement pour tester l'application.","priority":"medium","type":"condition","status":"active","mandat":"","conditions":["Ne pas communiquer avec une personne fictive","Condition fictive de démonstration"],"vehicles":["Toyota RAV4 — XYZ 789"],"addresses":["456 boulevard Exemple, Ville fictive"],"info":"Donnée de démonstration — ne pas utiliser avec de vrais renseignements.","comments":[{"id":"c2","text":"Note fictive ajoutée pour tester le journal.","createdAt":"2026-09-08T20:10:00"}],"photos":[]}
  ]
};

window.addEventListener('DOMContentLoaded',()=>{
  const style=document.createElement('style');
  style.textContent=`
    .tabs{grid-template-columns:repeat(3,minmax(0,1fr))}
    .tab{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .summary{display:none!important}
    .linkedPerson{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;border:1px solid #e1e3e7;background:#fff;border-radius:12px;padding:10px 11px;text-align:left;margin-top:7px}
    .linkedPerson:active{transform:scale(.995)}
    .linkedMain{min-width:0;flex:1}.linkedName{font-weight:900;overflow-wrap:anywhere}.linkedMeta{font-size:12px;color:#69717d;margin-top:2px}.linkedArrow{font-size:20px;color:#347ff0;font-weight:900}
    .linkSearch{width:100%;border:1px solid #e1e3e7;border-radius:12px;background:#fff;padding:10px 11px;outline:0}.linkResults{margin-top:5px}.linkResult{display:block;width:100%;border:1px solid #e1e3e7;background:#fff;border-radius:10px;padding:9px 10px;text-align:left;margin-top:5px}.linkResult:active{transform:scale(.995)}.linkResultName{font-weight:900}.linkResultMeta{font-size:12px;color:#69717d;margin-top:2px}.linkAddBtn{border:1px solid #111;background:#111;color:#fff;border-radius:12px;padding:10px 12px;font-weight:800;margin-top:7px}.linkEmpty{color:#69717d;font-size:14px}
    @media(max-width:420px){.tabs{gap:5px}.tab{font-size:13px;padding:10px 4px}.linkAddBtn{width:100%;padding:10px}}
  `;
  document.head.appendChild(style);
  const tabs=document.querySelector('.tabs'); if(!tabs)return;
  const interestTab=document.createElement('button'); interestTab.className='tab'; interestTab.id='interestTab'; interestTab.textContent='🔵 Intérêt 0'; tabs.appendChild(interestTab);
  const typeSelect=document.getElementById('fType');
  if(typeSelect&&!typeSelect.querySelector('option[value="interest"]')){const opt=document.createElement('option');opt.value='interest';opt.textContent='🔵 Personne d’intérêt';typeSelect.appendChild(opt)}
  function updateCategoryLabels(){const counts={mandat:people.filter(p=>p.type==='mandat'&&p.status!=='done').length,condition:people.filter(p=>p.type==='condition'&&p.status!=='done').length,interest:people.filter(p=>p.type==='interest'&&p.status!=='done').length};const m=document.getElementById('mandatsTab'),c=document.getElementById('conditionsTab');if(m)m.textContent='🔴 Mandats '+counts.mandat;if(c)c.textContent='🟠 Conditions '+counts.condition;interestTab.textContent='🔵 Intérêt '+counts.interest}
  function normalizeLinks(){people.forEach(p=>{if(!Array.isArray(p.linkedPeople))p.linkedPeople=[]});people.forEach(p=>{p.linkedPeople=p.linkedPeople.filter(id=>id!==p.id&&people.some(x=>x.id===id))})}
  function openLinkedPerson(id){if(!id)return;closeDetail();openDetail(id)}
  function addLink(fromId,toId){if(!fromId||!toId||fromId===toId)return;const a=people.find(p=>p.id===fromId),b=people.find(p=>p.id===toId);if(!a||!b)return;a.linkedPeople=Array.isArray(a.linkedPeople)?a.linkedPeople:[];b.linkedPeople=Array.isArray(b.linkedPeople)?b.linkedPeople:[];if(!a.linkedPeople.includes(toId))a.linkedPeople.push(toId);if(!b.linkedPeople.includes(fromId))b.linkedPeople.push(fromId);save();openDetail(fromId);toast('✓ Lien ajouté')}
  const originalOpenEdit=openEdit;
  openEdit=function(id=null){if(!document.getElementById('fType')?.querySelector('option[value="interest"]')){const opt=document.createElement('option');opt.value='interest';opt.textContent='🔵 Personne d’intérêt';document.getElementById('fType').appendChild(opt)}originalOpenEdit(id)};
  const originalOpenDetail=openDetail;
  openDetail=function(id){
    normalizeLinks(); originalOpenDetail(id); const p=people.find(x=>x.id===id); if(!p)return;
    const complete=document.getElementById('complete'); if(complete&&p.type==='interest')complete.textContent='✓ Personne d’intérêt traitée';
    if(p.type==='interest'&&(!p.conditions||!p.conditions.length))document.querySelectorAll('#detail .block').forEach(block=>{const h=block.querySelector('h3');if(h&&h.textContent.includes('Conditions'))block.remove()});
    document.getElementById('linkedPeopleBlock')?.remove();
    const linked=(Array.isArray(p.linkedPeople)?p.linkedPeople:[]).map(id=>people.find(x=>x.id===id)).filter(Boolean);
    const choices=people.filter(x=>x.id!==p.id).sort((a,b)=>(a.name||'').localeCompare(b.name||'','fr'));
    const linksHtml=linked.length?linked.map(x=>`<button class="linkedPerson" data-linked-id="${esc(x.id)}"><div class="linkedMain"><div class="linkedName">${esc(x.name||'Sans nom')}</div><div class="linkedMeta">${x.type==='mandat'?'🔴 Mandat':x.type==='condition'?'🟠 Conditions':x.type==='interest'?'🔵 Personne d’intérêt':'Personne'}</div></div><div class="linkedArrow">›</div></button>`).join(''):'<div class="linkEmpty">Aucune personne liée.</div>';
    const block=document.createElement('div'); block.className='block'; block.id='linkedPeopleBlock';
    block.innerHTML=`<h3>🔗 Personnes liées</h3>${linksHtml}${choices.length?`<input class="linkSearch" id="linkedPersonSearch" placeholder="🔎 Rechercher une personne…" autocomplete="off"><div class="linkResults" id="linkedPersonResults"></div>`:'<div class="linkEmpty">Aucune autre fiche disponible.</div>'}`;
    document.getElementById('detail').appendChild(block);
    document.querySelectorAll('[data-linked-id]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();openLinkedPerson(btn.dataset.linkedId)});
    const searchInput=document.getElementById('linkedPersonSearch');
    const results=document.getElementById('linkedPersonResults');
    function renderLinkResults(){
      if(!searchInput||!results)return;
      const q=searchInput.value.trim().toLowerCase();
      const filtered=choices.filter(x=>!q||(x.name||'').toLowerCase().includes(q)||(x.nickname||'').toLowerCase().includes(q)).slice(0,8);
      results.innerHTML=filtered.map(x=>`<button class="linkResult" data-link-target="${esc(x.id)}"><div class="linkResultName">${esc(x.name||'Sans nom')}</div><div class="linkResultMeta">${x.type==='mandat'?'🔴 Mandat':x.type==='condition'?'🟠 Conditions':x.type==='interest'?'🔵 Personne d’intérêt':'Personne'}${x.nickname?' · « '+esc(x.nickname)+' »':''}</div></button>`).join('') || (q?'<div class="linkEmpty">Aucune personne trouvée.</div>':'<div class="linkEmpty">Commence à taper un nom.</div>');
      results.querySelectorAll('[data-link-target]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();addLink(p.id,btn.dataset.linkTarget)});
    }
    searchInput?.addEventListener('input',renderLinkResults); renderLinkResults();
  };
  const originalCompletePerson=completePerson;
  completePerson=function(id){const p=people.find(x=>x.id===id);if(p?.type==='interest'){if(!confirm('Marquer cette personne d’intérêt comme traitée ?'))return;p.status='done';save();closeDetail();render();updateCategoryLabels();return}originalCompletePerson(id);setTimeout(updateCategoryLabels,0)};
  const originalDeletePerson=deletePerson;
  deletePerson=function(id){originalDeletePerson(id);people.forEach(p=>{if(Array.isArray(p.linkedPeople))p.linkedPeople=p.linkedPeople.filter(x=>x!==id)});save()};
  const originalRender=render;
  render=function(){normalizeLinks();originalRender();updateCategoryLabels()};
  function setView(next){view=next;document.querySelectorAll('.tabs .tab').forEach(t=>t.classList.remove('active'));const map={mandat:'mandatsTab',condition:'conditionsTab',interest:'interestTab'};document.getElementById(map[next])?.classList.add('active');render()}
  document.getElementById('mandatsTab').onclick=()=>setView('mandat');document.getElementById('conditionsTab').onclick=()=>setView('condition');interestTab.onclick=()=>setView('interest');
  normalizeLinks();render();updateCategoryLabels();
});
