let DATA=null; let chart=null;
const $=(sel)=>document.querySelector(sel);
const teamSelect=$("#teamSelect"), personSelect=$("#personSelect");
const teamTitle=$("#teamTitle"), speechText=$("#speechText");
const tbody=$("#questionsTable tbody"), avgArea=$("#avgArea"), pctArea=$("#pctArea");
const radarCanvas=$("#radarChart");
const newCopyBtn=$("#newCopyBtn"), resetBtn=$("#resetBtn");
const exportCsvBtn=$("#exportCsvBtn"), exportJsonBtn=$("#exportJsonBtn");
const exportAllBtn=$("#exportAllBtn"), sendRepoBtn=$("#sendRepoBtn");

const LS_KEY=(team,person)=>`petropack_taller_${team}_${person}`;

function mean(nums){const a=nums.filter(n=>typeof n==='number' && !isNaN(n)); return a.length? a.reduce((x,y)=>x+y,0)/a.length : null;}
function pctExcellence(avg){return avg==null? null : (avg/5)*100;}
function setOptions(select, items){select.innerHTML=""; items.forEach(v=>{const o=document.createElement("option"); o.value=v; o.textContent=v; select.appendChild(o);});}
function loadState(teamKey,person){try{const raw=localStorage.getItem(LS_KEY(teamKey,person)); return raw? JSON.parse(raw):{};}catch(e){return {};}}
function saveState(teamKey,person,state){localStorage.setItem(LS_KEY(teamKey,person), JSON.stringify(state));}

function buildTable(teamKey,person){
  const team=DATA.teams[teamKey];
  teamTitle.textContent=team.title;
  speechText.textContent=team.speech;
  tbody.innerHTML="";
  const state=loadState(teamKey,person);
  team.questions.forEach((it,idx)=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${it.q}</td><td>${it.ej}</td><td>${it.kpi}</td><td><input type="number" min="1" max="5" step="1" value="${state[idx]??""}"></td>`;
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

function duplicateInterlocutor(teamKey){
  const base=personSelect.value || "Interlocutor";
  let n=2,cand=base+" (copia "+n+")";
  const set=new Set(DATA.teams[teamKey].interlocutors);
  while(set.has(cand)){n++; cand=base+" (copia "+n+")";}
  DATA.teams[teamKey].interlocutors.push(cand);
  setOptions(personSelect, DATA.teams[teamKey].interlocutors);
  personSelect.value=cand; saveState(teamKey,cand,{}); buildTable(teamKey,cand);
}

// Export CSV (single interlocutor)
function exportCSV(teamKey, person){
  const team=DATA.teams[teamKey]; const state=loadState(teamKey,person);
  let rows=[["Equipo","Interlocutor","#","Pregunta","Ejemplo","KPI","Puntaje","PromedioArea","PctExcelencia"]];
  const vals=team.questions.map((_,i)=>state[i]); const avg=mean(vals.filter(v=>typeof v==='number')), pct=pctExcellence(avg);
  team.questions.forEach((it,idx)=>{rows.push([team.title,person,idx+1,it.q,it.ej,it.kpi,state[idx]??"",avg??"",pct??""]);});
  const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
  download(csv,`diagnostico_${teamKey}_${person}.csv`,"text/csv");
}

// Export ALL (CSV across all team/person)
function exportAllCSV(){
  let rows=[["EquipoKey","Equipo","Interlocutor","#","Pregunta","Ejemplo","KPI","Puntaje","PromedioArea","PctExcelencia"]];
  for(const teamKey of Object.keys(DATA.teams)){
    const team=DATA.teams[teamKey];
    for(const person of team.interlocutors){
      const state=loadState(teamKey,person);
      const vals=team.questions.map((_,i)=>state[i]);
      const avg=mean(vals.filter(v=>typeof v==='number')), pct=pctExcellence(avg);
      team.questions.forEach((it,idx)=>{
        rows.push([teamKey,team.title,person,idx+1,it.q,it.ej,it.kpi,state[idx]??"",avg??"",pct??""]);
      });
    }
  }
  const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
  download(csv,`diagnostico_consolidado.csv`,"text/csv");
}

// QUICK no-CORS sender
async function sendAllToRepo(){
  const url=(window.CONFIG && CONFIG.ENDPOINT_URL) ? CONFIG.ENDPOINT_URL : null;
  if(!url){ alert("Configura ENDPOINT_URL en config.js"); return; }

  // payload consolidado
  const payload=[];
  for(const teamKey of Object.keys(DATA.teams)){
    const team=DATA.teams[teamKey];
    for(const person of team.interlocutors){
      const state=loadState(teamKey,person);
      const vals=team.questions.map((_,i)=>state[i]).filter(v=>typeof v==='number');
      const avg=vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
      const pct=avg==null ? null : (avg/5)*100;
      team.questions.forEach((it,idx)=>{
        payload.push({
          teamKey, teamTitle: team.title, person, index: idx+1,
          question: it.q, example: it.ej, kpi: it.kpi,
          score: state[idx] ?? null, avgArea: avg, pctArea: pct
        });
      });
    }
  }

  try{
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ records: payload, generatedAt: new Date().toISOString() })
    });
    alert("Enviado en modo no‑CORS. Verificá en la hoja 'Respuestas' del Google Sheet.");
  }catch(err){
    alert("No se pudo enviar (no‑CORS): "+err.message);
  }
}

function download(text, filename, mime){
  const blob=new Blob([text],{type:mime+";charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Events
$("#newCopyBtn").addEventListener("click", ()=> duplicateInterlocutor(teamSelect.value));
$("#resetBtn").addEventListener("click", ()=>{ if(confirm("Borrar puntajes guardados de este interlocutor?")){ saveState(teamSelect.value, personSelect.value, {}); buildTable(teamSelect.value, personSelect.value);} });
$("#exportCsvBtn").addEventListener("click", ()=> exportCSV(teamSelect.value, personSelect.value));
$("#exportJsonBtn").addEventListener("click", ()=>{
  const state=loadState(teamSelect.value, personSelect.value);
  download(JSON.stringify({teamKey:teamSelect.value, person:personSelect.value, scores:state},null,2),
           `diagnostico_${teamSelect.value}_${personSelect.value}.json`,"application/json");
});
$("#exportAllBtn").addEventListener("click", exportAllCSV);
$("#sendRepoBtn").addEventListener("click", sendAllToRepo);

$("#teamSelect").addEventListener("change", ()=>{
  const tk=teamSelect.value;
  setOptions(personSelect, DATA.teams[tk].interlocutors);
  buildTable(tk, personSelect.value);
});
$("#personSelect").addEventListener("change", ()=> buildTable(teamSelect.value, personSelect.value));

fetch("data.json").then(r=>r.json()).then(json=>{
  DATA=json;
  const keys=Object.keys(DATA.teams);
  setOptions(teamSelect, keys);
  teamSelect.value=keys[0];
  setOptions(personSelect, DATA.teams[keys[0]].interlocutors);
  buildTable(keys[0], personSelect.value);
});
