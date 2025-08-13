// Taller Interactivo – Diagnóstico Estratégico Petropack 2030
// Guarda progreso en localStorage y muestra radar (Chart.js).

let DATA = null;
let chart = null;

const $ = (sel)=>document.querySelector(sel);
const teamSelect = $("#teamSelect");
const personSelect = $("#personSelect");
const teamTitle = $("#teamTitle");
const speechText = $("#speechText");
const tbody = $("#questionsTable tbody");
const avgArea = $("#avgArea");
const pctArea = $("#pctArea");
const radarCanvas = $("#radarChart");
const newCopyBtn = $("#newCopyBtn");
const resetBtn = $("#resetBtn");
const exportCsvBtn = $("#exportCsvBtn");
const exportJsonBtn = $("#exportJsonBtn");
const printBtn = $("#printBtn");

const LS_KEY = (team, person)=>`petropack_taller_${team}_${person}`;

// Util
function mean(nums){
  const arr = nums.filter(n=>typeof n==='number' && !isNaN(n));
  if(!arr.length) return null;
  return arr.reduce((a,b)=>a+b,0)/arr.length;
}
function pctExcellence(avg){ return (avg==null? null : (avg/5)*100); }

function setOptions(select, items){
  select.innerHTML = "";
  items.forEach(v=>{
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
}

function loadState(teamKey, person){
  try{
    const raw = localStorage.getItem(LS_KEY(teamKey, person));
    return raw? JSON.parse(raw) : {};
  }catch(e){ return {}; }
}

function saveState(teamKey, person, state){
  localStorage.setItem(LS_KEY(teamKey, person), JSON.stringify(state));
}

function buildTable(teamKey, person){
  const team = DATA.teams[teamKey];
  teamTitle.textContent = team.title;
  speechText.textContent = team.speech;

  tbody.innerHTML = "";
  const state = loadState(teamKey, person);
  team.questions.forEach((it, idx)=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.q}</td>
      <td>${it.ej}</td>
      <td>${it.kpi}</td>
      <td>
        <input type="number" min="1" max="5" step="1" value="${state[idx]??""}" aria-label="Puntaje pregunta ${idx+1}">
      </td>`;
    const input = tr.querySelector("input");
    input.addEventListener("input", ()=>{
      let v = parseInt(input.value,10);
      if(isNaN(v) || v<1 || v>5){ input.value=""; v=undefined; }
      const s = loadState(teamKey, person);
      s[idx] = v;
      saveState(teamKey, person, s);
      updateStatsAndChart(teamKey, person);
    });
    tbody.appendChild(tr);
  });
  updateStatsAndChart(teamKey, person);
}

function updateStatsAndChart(teamKey, person){
  const team = DATA.teams[teamKey];
  const inputs = [...tbody.querySelectorAll("input")];
  const values = inputs.map(i=>parseInt(i.value,10)).filter(v=>!isNaN(v));
  const avg = mean(values);
  const pct = pctExcellence(avg);
  avgArea.textContent = avg? avg.toFixed(2) : "—";
  pctArea.textContent = pct? (pct.toFixed(1)+"%") : "—";

  // Radar: cada eje es una pregunta; serie = puntajes; línea de excelencia = 5
  const labels = team.questions.map((_,i)=>`P${i+1}`);
  const excellence = team.questions.map(()=>5);
  const dataVals = inputs.map(i=>{
    const v = parseInt(i.value,10);
    return isNaN(v)? 0 : v;
  });

  const data = {
    labels,
    datasets: [
      {label:"Puntaje", data:dataVals, fill:true},
      {label:"Excelencia (5)", data:excellence, fill:false}
    ]
  };
  const options = {
    animation:false,
    responsive:true,
    scales:{ r:{ suggestedMin:0, suggestedMax:5, ticks:{ stepSize:1 }}},
    plugins:{ legend:{ position:"bottom"}}
  };
  if(chart){ chart.destroy(); }
  chart = new Chart(radarCanvas, {type:"radar", data, options});
}

// Export CSV
function exportCSV(teamKey, person){
  const team = DATA.teams[teamKey];
  const state = loadState(teamKey, person);
  let rows = [["Equipo","Interlocutor","#","Pregunta","Ejemplo","KPI","Puntaje"]];
  team.questions.forEach((it,idx)=>{
    rows.push([team.title, person, idx+1, it.q, it.ej, it.kpi, state[idx]??""]);
  });
  const csv = rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `diagnostico_${teamKey}_${person}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// Export JSON (toda la evaluación del interlocutor)
function exportJSON(teamKey, person){
  const state = loadState(teamKey, person);
  const payload = {
    teamKey, person, scores: state, timestamp: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `diagnostico_${teamKey}_${person}.json`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// Duplicar ejemplar (agregar una copia del interlocutor con sufijo incremental)
function duplicateInterlocutor(teamKey){
  const base = personSelect.value || "Interlocutor";
  let n = 2;
  let candidate = base + " (copia " + n + ")";
  const list = new Set(DATA.teams[teamKey].interlocutors);
  while(list.has(candidate)) { n++; candidate = base + " (copia " + n + ")"; }
  DATA.teams[teamKey].interlocutors.push(candidate);
  setOptions(personSelect, DATA.teams[teamKey].interlocutors);
  personSelect.value = candidate;
  saveState(teamKey, candidate, {});
  buildTable(teamKey, candidate);
}

// Events
teamSelect.addEventListener("change", ()=>{
  const tk = teamSelect.value;
  setOptions(personSelect, DATA.teams[tk].interlocutors);
  buildTable(tk, personSelect.value);
});
personSelect.addEventListener("change", ()=>{
  buildTable(teamSelect.value, personSelect.value);
});
newCopyBtn.addEventListener("click", ()=> duplicateInterlocutor(teamSelect.value));
resetBtn.addEventListener("click", ()=>{
  if(confirm("Esto borrará los puntajes guardados de este interlocutor. ¿Continuar?")){
    saveState(teamSelect.value, personSelect.value, {});
    buildTable(teamSelect.value, personSelect.value);
  }
});
exportCsvBtn.addEventListener("click", ()=> exportCSV(teamSelect.value, personSelect.value));
exportJsonBtn.addEventListener("click", ()=> exportJSON(teamSelect.value, personSelect.value));
printBtn.addEventListener("click", ()=> window.print());

// Init
fetch("data.json").then(r=>r.json()).then(json=>{
  DATA = json;
  const keys = Object.keys(DATA.teams);
  setOptions(teamSelect, keys);
  teamSelect.value = keys[0];
  setOptions(personSelect, DATA.teams[keys[0]].interlocutors);
  buildTable(keys[0], personSelect.value);
});
