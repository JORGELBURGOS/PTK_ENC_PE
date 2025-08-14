
// === Perspectivas por equipo (visible) ===
const PERSPECTIVES = {
  "Dirección General / Alta Gerencia": "Dirección Estratégica",
  "Finanzas / Costos / Administración": "Sostenibilidad Económica y Gestión de Recursos",
  "Producción / Calidad / Ingeniería / Mantenimiento": "Excelencia Operativa y Productividad",
  "RRHH / Supervisores / Líderes de Turno": "Capital Humano y Cultura Organizacional",
  "Comercial / Atención al Cliente / Logística": "Desarrollo de Mercado y Relación con Clientes",
  "Medio Ambiente / Compras": "Responsabilidad Ambiental y Sostenibilidad",
  "Fundación / RSE / Comunicación": "Impacto Social y Reputación",
  "Planeamiento Estratégico Integrador": "Dirección y Cohesión Estratégica"
};

let DATA=null; let chart=null;
const $=(sel)=>document.querySelector(sel);

// Tabs / wrappers
const modeTeamBtn = $("#modeTeamBtn");
const modePersonBtn = $("#modePersonBtn");
const teamSelectWrapper = $("#teamSelectWrapper");
const personSelectWrapper = $("#personSelectWrapper");

// Modo equipo
const teamSelect=$("#teamSelect"), personSelect=$("#personSelect");

// Modo interlocutor
const personGlobalSelect=$("#personGlobalSelect");
const teamForPersonSelect=$("#teamForPersonSelect");

// Comunes
const teamTitle=$("#teamTitle"), speechText=$("#speechText");
const tbody=$("#questionsTable tbody"), avgArea=$("#avgArea"), pctArea=$("#pctArea");
const radarCanvas=$("#radarChart");
const exportAllBtn=$("#exportAllBtn"), sendRepoBtn=$("#sendRepoBtn"), sendRepoBtn2=$("#sendRepoBtn2");

const LS_KEY=(team,person)=>`petropack_taller_${team}_${person}`;

// Utils
function mean(nums){const a=nums.filter(n=>typeof n==='number' && !isNaN(n)); return a.length? a.reduce((x,y)=>x+y,0)/a.length : null;}
function pctExcellence(avg){return avg==null? null : (avg/5)*100;}
function setOptions(select, items, {getValue=(x)=>x, getLabel=(x)=>x}={}){
  select.innerHTML="";
  items.forEach(v=>{const o=document.createElement("option"); o.value=getValue(v); o.textContent=getLabel(v); select.appendChild(o);});
}
function loadState(teamKey,person){try{const raw=localStorage.getItem(LS_KEY(teamKey,person)); return raw? JSON.parse(raw):{};}catch(e){return {};}}
function saveState(teamKey,person,state){localStorage.setItem(LS_KEY(teamKey,person), JSON.stringify(state));}
function prettifyTitle(s){return String(s||"").replace(/_/g,' ').replace(/\s+/g,' ').trim();}

// Tabla

function getTeamPerspective(teamKey){
  try{
    const title = (DATA.teams[teamKey]?.title || teamKey).trim();
    if(PERSPECTIVES[title]) return PERSPECTIVES[title];
    const norm = title.replace(/\s*\/\s*/g, " / ").replace(/\s+/g," ").trim();
    if(PERSPECTIVES[norm]) return PERSPECTIVES[norm];
    for(const k of Object.keys(PERSPECTIVES)){
      if(norm.toLowerCase().includes(k.toLowerCase())) return PERSPECTIVES[k];
    }
  }catch(e){}
  return null;
}

function buildTable(teamKey,person){
  const team=DATA.teams[teamKey];
  \1
  // Renderizar Perspectiva
  const pLine = document.getElementById('perspectiveLine');
  if(pLine){
    const persp = getTeamPerspective(teamKey);
    pLine.textContent = persp ? ("Perspectiva: " + persp) : "";
    pLine.style.display = persp ? "" : "none";
  }

speechText.textContent=team.speech || "";
  tbody.innerHTML="";
  const state=loadState(teamKey,person);
  team.questions.forEach((it,idx)=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${it.q}</td><td>${it.ej}</td><td class=\"col-kpi\">${it.kpi}</td><td><input type=\"number\" min=\"1\" max=\"5\" step=\"1\" value=\"${state[idx]??""}\"></td>`;
    const input=tr.querySelector("input");
    input.addEventListener("input",()=>{
      let v=parseInt(input.value,10);
      if(isNaN(v)||v<1||v>5){input.value=""; v=undefined;}
      const s=loadState(teamKey,person); s[idx]=v; saveState(teamKey,person,s); updateStatsAndChart(teamKey,person);
    });
    tbody.appendChild(tr);
  });
  updateStatsAndChart(teamKey,person);
}

function updateStatsAndChart(teamKey,person){
  const team=DATA.teams[teamKey];
  const inputs=[...tbody.querySelectorAll("input")];
  const values=inputs.map(i=>parseInt(i.value,10)).filter(v=>!isNaN(v));
  const avg=mean(values), pct=pctExcellence(avg);
  avgArea.textContent=avg? avg.toFixed(2):"—";
  pctArea.textContent=pct? (pct.toFixed(1)+"%"):"—";

  const labels=team.questions.map((_,i)=>`P${i+1}`);
  const excellence=team.questions.map(()=>5);
  const dataVals=inputs.map(i=>{const v=parseInt(i.value,10); return isNaN(v)?0:v;});
  const data={labels, datasets:[{label:"Puntaje", data:dataVals, fill:true},{label:"Excelencia (5)", data:excellence, fill:false}]};
  const options={animation:false,responsive:true,scales:{r:{suggestedMin:0,suggestedMax:5,ticks:{stepSize:1}}},plugins:{legend:{position:"bottom"}}};
  if(chart) chart.destroy(); chart=new Chart(radarCanvas,{type:"radar",data,options});
}

// Exportación
function exportAllCSV(){
  let rows=[["EquipoKey","Equipo","Interlocutor","#","Pregunta","Ejemplo","KPI","Puntaje","PromedioArea","PctExcelencia"]];
  for(const teamKey of Object.keys(DATA.teams)){
    const team=DATA.teams[teamKey];
    for(const person of team.interlocutors){
      const state=loadState(teamKey,person);
      const vals=team.questions.map((_,i)=>state[i]);
      const avg=mean(vals.filter(v=>typeof v==='number')), pct=pctExcellence(avg);
      team.questions.forEach((it,idx)=>{
        rows.push([teamKey,prettifyTitle(team.title||teamKey),person,idx+1,it.q,it.ej,it.kpi,state[idx]??"",avg??"",pct??""]);
      });
    }
  }
  const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}); const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download='diagnostico_consolidado.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// Envío
async function sendAllToRepo(){
  const url=(window.CONFIG && CONFIG.ENDPOINT_URL) ? CONFIG.ENDPOINT_URL : null;
  if(!url){ alert("Configura ENDPOINT_URL en config.js"); return; }
  const payload=[];
  for(const teamKey of Object.keys(DATA.teams)){
    const team=DATA.teams[teamKey];
    for(const person of team.interlocutors){
      const state=loadState(teamKey,person);
      const vals=team.questions.map((_,i)=>state[i]).filter(v=>typeof v==='number');
      const avg=vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
      const pct=avg==null ? null : (avg/5)*100;
      team.questions.forEach((it,idx)=>{
        payload.push({ teamKey, teamTitle: team.title, person, index: idx+1, question: it.q, example: it.ej, kpi: it.kpi, score: state[idx] ?? null, avgArea: avg, pctArea: pct });
      });
    }
  }
  try{
    await fetch(url,{ method:"POST", mode:"no-cors", headers:{"Content-Type":"text/plain;charset=utf-8"}, body: JSON.stringify({ records: payload, generatedAt: new Date().toISOString() }) });
    alert("Enviado en modo no‑CORS. Verificá en la hoja 'Respuestas'.");
  }catch(err){ alert("No se pudo enviar (no‑CORS): "+err.message); }
}

// Helpers Modo Interlocutor
function getAllInterlocutors(){
  const set=new Set();
  for(const teamKey of Object.keys(DATA.teams)){
    (DATA.teams[teamKey].interlocutors||[]).forEach(n=> set.add(n));
  }
  return Array.from(set).sort((a,b)=> a.localeCompare(b,'es'));
}
function getTeamsForPerson(person){
  const list=[];
  for(const teamKey of Object.keys(DATA.teams)){
    const arr=DATA.teams[teamKey].interlocutors||[];
    if(arr.includes(person)) list.push(teamKey);
  }
  return list;
}

// Eventos
document.addEventListener('DOMContentLoaded', ()=>{
  // Tabs
  modeTeamBtn.addEventListener('click',()=>{
    modeTeamBtn.classList.add('active'); modeTeamBtn.setAttribute('aria-pressed','true');
    modePersonBtn.classList.remove('active'); modePersonBtn.setAttribute('aria-pressed','false');
    teamSelectWrapper.style.display='';
    personSelectWrapper.style.display='none';
    buildTable(teamSelect.value, personSelect.value);
  });
  modePersonBtn.addEventListener('click',()=>{
    modePersonBtn.classList.add('active'); modePersonBtn.setAttribute('aria-pressed','true');
    modeTeamBtn.classList.remove('active'); modeTeamBtn.setAttribute('aria-pressed','false');
    teamSelectWrapper.style.display='none';
    personSelectWrapper.style.display='';
    const person = personGlobalSelect.value;
    const teams = getTeamsForPerson(person);
    setOptions(teamForPersonSelect, teams, { getValue:(k)=>k, getLabel:(k)=> prettifyTitle(DATA.teams[k].title||k)});
    if(teams.length){ teamForPersonSelect.value=teams[0]; buildTable(teams[0], person); }
    else { tbody.innerHTML=''; teamTitle.textContent='—'; speechText.textContent=''; avgArea.textContent='—'; pctArea.textContent='—'; if(chart) chart.destroy(); }
  });

  // Export / Enviar
  exportAllBtn.addEventListener('click', exportAllCSV);
  sendRepoBtn.addEventListener('click', sendAllToRepo);
  sendRepoBtn2?.addEventListener('click', sendAllToRepo);

  // Modo equipo
  teamSelect.addEventListener('change', ()=>{
    const tk=teamSelect.value;
    setOptions(personSelect, DATA.teams[tk].interlocutors);
    buildTable(tk, personSelect.value);
  });
  personSelect.addEventListener('change', ()=> buildTable(teamSelect.value, personSelect.value));

  // Modo interlocutor
  personGlobalSelect.addEventListener('change', ()=>{
    const person = personGlobalSelect.value;
    const teams = getTeamsForPerson(person);
    setOptions(teamForPersonSelect, teams, { getValue:(k)=>k, getLabel:(k)=> prettifyTitle(DATA.teams[k].title||k)});
    if(teams.length){ teamForPersonSelect.value=teams[0]; buildTable(teams[0], person); }
    else { tbody.innerHTML=''; teamTitle.textContent='—'; speechText.textContent=''; avgArea.textContent='—'; pctArea.textContent='—'; if(chart) chart.destroy(); }
  });
  teamForPersonSelect.addEventListener('change', ()=> buildTable(teamForPersonSelect.value, personGlobalSelect.value));
});

// Init
fetch("data.json").then(r=>r.json()).then(json=>{
  DATA=json;
  const keys=Object.keys(DATA.teams);

  // Prettify labels para equipos (sin underscores), manteniendo el value como key original
  setOptions(teamSelect, keys, { getValue:(k)=>k, getLabel:(k)=> prettifyTitle(DATA.teams[k].title||k)});
  teamSelect.value=keys[0];
  setOptions(personSelect, DATA.teams[keys[0]].interlocutors);
  buildTable(keys[0], personSelect.value);

  // Interlocutores globales
  const people = getAllInterlocutors();
  setOptions(personGlobalSelect, people);
  const initialTeams = getTeamsForPerson(personGlobalSelect.value);
  setOptions(teamForPersonSelect, initialTeams, { getValue:(k)=>k, getLabel:(k)=> prettifyTitle(DATA.teams[k].title||k)});
  if(initialTeams.length && personSelectWrapper.style.display!=='none'){
    teamForPersonSelect.value = initialTeams[0];
    buildTable(initialTeams[0], personGlobalSelect.value);
  }
});