/*******************************************************
 * WebApp Petropack – Merge NO Destructivo en "Respuestas"
 * SOLO completa score / avgArea / pctArea si la celda está vacía.
 * Preserva timestamp si ya existe (si no hay, lo establece al crear).
 *******************************************************/
const SPREADSHEET_ID = '1gdjNTLBojiW19-T2yREqdCiZ0peN3IhvdsZO3XjI7MA';
const SHEET_NAME     = 'Respuestas';

// Clave para ubicar filas (coincide con tu app.js)
const KEY_FIELDS = ['teamKey','person','index'];

// Columnas protegidas: si ya tienen valor en la hoja, NO se sobreescriben
const NON_DESTRUCTIVE = new Set(['score','avgArea','pctArea']);

/* ============== Utilidades ============== */
function openSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('No existe la hoja "Respuestas"');
  return sh;
}
function getHeaders_(sh) {
  const lastCol = sh.getLastColumn();
  if (!lastCol) throw new Error('La hoja no tiene encabezados');
  return sh.getRange(1,1,1,lastCol).getValues()[0].map(h => String(h).trim());
}
function idxMap_(headers) {
  const m={}; headers.forEach((h,i)=>m[h]=i); return m;
}
function hasValue_(v){
  if (v===null || v===undefined) return false;
  if (typeof v==='number') return !isNaN(v);
  return String(v).trim() !== '';
}
function buildKey_(obj){
  return KEY_FIELDS.map(k => String(obj[k] ?? '').trim()).join('||');
}
function buildKeyIndex_(sh, headers){
  const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  const map = new Map(); if (lastRow < 2) return map;
  const m = idxMap_(headers);
  const keyIdxs = KEY_FIELDS.map(k => {
    if (!(k in m)) throw new Error(`Falta columna clave "${k}" en encabezados`);
    return m[k];
  });
  const data = sh.getRange(2,1,lastRow-1,lastCol).getValues();
  data.forEach((row, i)=>{
    const key = keyIdxs.map(ix => String(row[ix] ?? '').trim()).join('||');
    if (key) map.set(key, i+2);
  });
  return map;
}

/* ============== Upsert NO DESTRUCTIVO ============== */
function upsertRecords_(records){
  const lock = LockService.getDocumentLock();
  lock.tryLock(30000);
  try {
    const sh = openSheet_();
    const headers = getHeaders_(sh);
    const m = idxMap_(headers);
    const lastCol = headers.length;
    const keyToRow = buildKeyIndex_(sh, headers);

    // Validar columnas clave
    KEY_FIELDS.forEach(k => { if (!(k in m)) throw new Error(`Falta columna ${k}`); });

    for (const rec of records){
      const key = buildKey_(rec);
      if (!key || KEY_FIELDS.some(k => !hasValue_(rec[k]))) continue;

      const rowNum = keyToRow.get(key);

      if (!rowNum){
        // No existe: APPEND. Las protegidas quedan como vengan; si no vienen, quedan vacías.
        const newRow = headers.map(h=>{
          if (h === 'timestamp') {
            // si viene timestamp lo usamos, si no, poner ahora
            return hasValue_(rec.timestamp) ? rec.timestamp : new Date();
          }
          return hasValue_(rec[h]) ? rec[h] : '';
        });
        sh.appendRow(newRow);
        keyToRow.set(key, sh.getLastRow());

      } else {
        // Existe: MERGE NO DESTRUCTIVO en protegidas; resto normal
        const range = sh.getRange(rowNum,1,1,lastCol);
        const cur = range.getValues()[0];

        const merged = headers.map((h,i)=>{
          const incomingDefined = Object.prototype.hasOwnProperty.call(rec, h);
          const incoming = incomingDefined ? rec[h] : undefined;
          const current  = cur[i];

          if (NON_DESTRUCTIVE.has(h)) {
            // Si YA hay valor en la hoja, conservar SIEMPRE
            if (hasValue_(current)) return current;
            // Si está vacía, escribir solo si viene algo
            return incomingDefined && hasValue_(incoming) ? incoming : current;
          }

          if (h === 'timestamp') {
            // Preservar timestamp si ya existe
            if (hasValue_(current)) return current;
            return incomingDefined && hasValue_(incoming) ? incoming : new Date();
          }

          // Resto: si viene dato, actualizar; si no, dejar lo que hay
          return incomingDefined ? incoming : current;
        });

        range.setValues([merged]);
      }
    }
    return {ok:true};
  } finally {
    lock.releaseLock();
  }
}

/* ============== HTTP Handlers ============== */
function doPost(e){
  try{
    const raw = e.postData && e.postData.contents ? e.postData.contents : '{}';
    const payload = JSON.parse(raw);
    const records = Array.isArray(payload.records) ? payload.records : [];
    if (!records.length) {
      return ContentService.createTextOutput(JSON.stringify({ok:false,error:'Sin records'}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const res = upsertRecords_(records);
    return ContentService.createTextOutput(JSON.stringify(res))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err){
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
function doGet(){ return ContentService.createTextOutput('OK'); }

