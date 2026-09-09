window.APP_DATA = {
  "version": "V1.0-demo",
  "people": [
    {
      "id": "demo-1",
      "name": "Jean Tremblay",
      "nickname": "Ti-Jean",
      "dob": "1992-03-12",
      "description": "Personne fictive utilisée uniquement pour tester l'application.",
      "priority": "high",
      "type": "mandat",
      "status": "active",
      "mandat": "Mandat fictif de démonstration",
      "conditions": [],
      "vehicles": ["Honda Civic — ABC 123"],
      "addresses": ["123 rue Exemple, Ville fictive"],
      "info": "Donnée de démonstration — ne pas utiliser avec de vrais renseignements.",
      "comments": [{"id":"c1","text":"Vérification fictive à l'adresse connue. Aucun contact.","createdAt":"2026-09-08T19:30:00"}],
      "photos": []
    },
    {
      "id": "demo-2",
      "name": "Marc Gagnon",
      "nickname": "Marco",
      "dob": "1988-07-24",
      "description": "Personne fictive utilisée uniquement pour tester l'application.",
      "priority": "medium",
      "type": "condition",
      "status": "active",
      "mandat": "",
      "conditions": ["Ne pas communiquer avec une personne fictive","Condition fictive de démonstration"],
      "vehicles": ["Toyota RAV4 — XYZ 789"],
      "addresses": ["456 boulevard Exemple, Ville fictive"],
      "info": "Donnée de démonstration — ne pas utiliser avec de vrais renseignements.",
      "comments": [{"id":"c2","text":"Note fictive ajoutée pour tester le journal.","createdAt":"2026-09-08T20:10:00"}],
      "photos": []
    }
  ]
};

/* Ajout de la section Personne d’intérêt sans modifier le fonctionnement V1 existant. */
window.addEventListener('DOMContentLoaded',()=>{
  const style=document.createElement('style');
  style.textContent=`
    .tabs{grid-template-columns:repeat(3,minmax(0,1fr))}
    .summary{grid-template-columns:repeat(3,minmax(0,1fr))}
    .summary button{min-width:0;padding:12px}
    .summary h3{font-size:14px;line-height:1.15}
    .summary .num{font-size:22px}
    @media(max-width:420px){
      .tabs{gap:5px}
      .tab{font-size:13px;padding:10px 5px}
      .summary{gap:6px}
      .summary button{padding:10px 8px}
      .summary .emoji{font-size:21px}
      .summary h3{font-size:12px}
      .summary .num{font-size:20px}
    }
  `;
  document.head.appendChild(style);

  const tabs=document.querySelector('.tabs');
  const summary=document.querySelector('.summary');
  if(!tabs||!summary)return;

  const interestTab=document.createElement('button');
  interestTab.className='tab';
  interestTab.id='interestTab';
  interestTab.textContent='🔵 Personnes d’intérêt';
  tabs.appendChild(interestTab);

  const interestSummary=document.createElement('button');
  interestSummary.id='summaryInterest';
  interestSummary.innerHTML='<div class="emoji">🔵</div><h3>Personnes d’intérêt</h3><div class="num" id="interestCount">0</div>';
  summary.appendChild(interestSummary);

  const typeSelect=document.getElementById('fType');
  if(typeSelect&&!typeSelect.querySelector('option[value="interest"]')){
    const opt=document.createElement('option');
    opt.value='interest';
    opt.textContent='🔵 Personne d’intérêt';
    typeSelect.appendChild(opt);
  }

  const originalOpenEdit=openEdit;
  openEdit=function(id=null){
    if(!document.getElementById('fType')?.querySelector('option[value="interest"]')){
      const opt=document.createElement('option');
      opt.value='interest';
      opt.textContent='🔵 Personne d’intérêt';
      document.getElementById('fType').appendChild(opt);
    }
    originalOpenEdit(id);
  };

  const originalOpenDetail=openDetail;
  openDetail=function(id){
    originalOpenDetail(id);
    const p=people.find(x=>x.id===id);
    if(!p)return;
    const complete=document.getElementById('complete');
    if(complete&&p.type==='interest'){
      complete.textContent='✓ Personne d’intérêt traitée';
    }
    if(p.type==='interest'&&(!p.conditions||!p.conditions.length)){
      document.querySelectorAll('#detail .block').forEach(block=>{
        const h=block.querySelector('h3');
        if(h&&h.textContent.includes('Conditions'))block.remove();
      });
    }
  };

  const originalCompletePerson=completePerson;
  completePerson=function(id){
    const p=people.find(x=>x.id===id);
    if(p?.type==='interest'){
      if(!confirm('Marquer cette personne d’intérêt comme traitée ?'))return;
      p.status='done';save();closeDetail();render();return;
    }
    originalCompletePerson(id);
  };

  render=function(){
    const counts={
      mandat:people.filter(p=>p.type==='mandat'&&p.status!=='done').length,
      condition:people.filter(p=>p.type==='condition'&&p.status!=='done').length,
      interest:people.filter(p=>p.type==='interest'&&p.status!=='done').length
    };
    const mc=document.getElementById('mandatCount');
    const cc=document.getElementById('conditionCount');
    const ic=document.getElementById('interestCount');
    if(mc)mc.textContent=counts.mandat;
    if(cc)cc.textContent=counts.condition;
    if(ic)ic.textContent=counts.interest;

    const active=activeList(), done=doneList();
    const labels={
      mandat:['Mandats actifs','Mandats exécutés'],
      condition:['Conditions actives','Conditions terminées'],
      interest:['Personnes d’intérêt actives','Personnes d’intérêt traitées']
    };
    const label=labels[view]||labels.mandat;
    let h='<div class="sectionHead"><h2>'+label[0]+'</h2><span class="muted">'+active.length+'</span></div>';
    h+=active.length?active.map(p=>card(p)).join(''):'<div class="empty">Aucune personne dans cette section.</div>';
    if(done.length){
      h+='<div class="divider"></div><div class="sectionHead"><h2>'+label[1]+'</h2><span class="muted">'+done.length+'</span></div>';
      h+=done.map(p=>card(p,true)).join('');
    }
    $('content').innerHTML=h;
    document.querySelectorAll('.person').forEach(e=>e.onclick=()=>openDetail(e.dataset.id));
  };

  function setView(next){
    view=next;
    document.querySelectorAll('.tabs .tab').forEach(t=>t.classList.remove('active'));
    const map={mandat:'mandatsTab',condition:'conditionsTab',interest:'interestTab'};
    document.getElementById(map[next])?.classList.add('active');
    render();
  }

  document.getElementById('mandatsTab').onclick=()=>setView('mandat');
  document.getElementById('conditionsTab').onclick=()=>setView('condition');
  interestTab.onclick=()=>setView('interest');
  document.getElementById('summaryMandats').onclick=()=>setView('mandat');
  document.getElementById('summaryConditions').onclick=()=>setView('condition');
  interestSummary.onclick=()=>setView('interest');

  render();
});
