/*******************************************************
 * Endpoint Petropack – Merge NO Destructivo (Respuestas)
 * Congela score, avgArea, pctArea y timestamp si ya tienen valor
 *******************************************************/
const SPREADSHEET_ID = '1gdjNTLBojiW19-T2yREqdCiZ0peN3IhvdsZO3XjI7MA';
const SHEET_NAME     = 'Respuestas';

// Claves que identifican unívocamente cada fila (AJUSTADAS a tu payload actual)
const KEY_FIELDS = ['teamKey','person','index'];

// Columnas que NO se deben sobreescribir si ya tienen valor en la hoja
const NON_DESTRUCTIVE = new Set(['score','avgArea','pctArea','timestamp']);

// ===== Utilidades =====
function openSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('No existe la hoja "Respuestas"');
  return sh;
}
function getHeaders_(sh) {
  const lastCol = sh.getLastColumn();
  if (lastCol === 0) throw new Error('La hoja no tiene encabezados');
  const headers = sh.getRange(1,1,1,lastCol).getValues()[0].map(h => String(h).trim());
  return headers;
}
function colIndexMap_(headers) {
  const m = {};
  headers.forEach((h,i)=>{ m[h] = i; });
  return m; // base 0
}
function hasValue_(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'number') return !isNaN(v);
  const s = String(v).trim();
  return s !== '';
}
function buildKey_(obj) {
  return KEY_FIELDS.map(k => String(obj[k] ?? '').trim()).join('||');
}

// Construye índice clave -> nro de fila (2..N)
function buildKeyIndex_(sh, headers) {
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  const idxMap = colIndexMap_(headers);
  const keyIdxs = KEY_FIELDS.map(k => {
    const ix = idxMap[k];
    if (ix === undefined) throw new Error(`Falta la columna clave "${k}" en los encabezados`);
    return ix;
  });
  const map = new Map();
  if (lastRow < 2) return map;

  const data = sh.getRange(2,1,lastRow-1,lastCol).getValues();
  data.forEach((row, i) => {
    const key = keyIdxs.map(ix => String(row[ix] ?? '').trim()).join('||');
    if (key) map.set(key, i+2);
  });
  return map;
}

// ===== Lógica de upsert con MERGE NO DESTRUCTIVO =====
function upsertRecords_(records) {
  const lock = LockService.getDocumentLock();
  lock.tryLock(30000);
  try {
    const sh = openSheet_();
    const headers = getHeaders_(sh);
    const lastCol = headers.length;
    const idx = colIndexMap_(headers);
    const keyToRow = buildKeyIndex_(sh, headers);

    // Validación mínima de encabezados clave
    KEY_FIELDS.forEach(k => {
      if (!(k in idx)) throw new Error(`La hoja "Respuestas" no tiene la columna requerida: ${k}`);
    });

    // Procesamos uno por uno (volumen típicamente bajo/moderado)
    for (const rec of records) {
      const key = buildKey_(rec);
      if (!key || KEY_FIELDS.some(k => !hasValue_(rec[k]))) {
        // Si el registro no trae claves completas, lo ignoramos
        continue;
      }

      const rowNum = keyToRow.get(key);
      if (!rowNum) {
        // No existe: APPEND respetando no destructivos (si vienen vacíos, quedan vacíos)
        const newRow = new Array(lastCol).fill('');
        headers.forEach((h, i) => {
          if (h === 'timestamp') {
            // Si viene timestamp lo usamos, si no, set actual
            newRow[i] = hasValue_(rec.timestamp) ? rec.timestamp : new Date();
          } else if (hasValue_(rec[h])) {
            newRow[i] = rec[h];
          } else {
            newRow[i] = ''; // vacío explícito al crear
          }
        });
        sh.appendRow(newRow);
        const newR = sh.getLastRow();
        keyToRow.set(key, newR);
      } else {
        // Sí existe: MERGE NO DESTRUCTIVO
        const rowRange = sh.getRange(rowNum, 1, 1, lastCol);
        const current = rowRange.getValues()[0];

        const merged = headers.map((h, i) => {
          const incomingDefined = Object.prototype.hasOwnProperty.call(rec, h);
          const incoming = incomingDefined ? rec[h] : undefined;
          const cur = current[i];

          if (NON_DESTRUCTIVE.has(h)) {
            // Si ya hay valor en la hoja, lo conservamos SIEMPRE
            if (hasValue_(cur)) return cur;

            // Si está vacío en la hoja y viene algo nuevo, lo escribimos
            return incomingDefined ? incoming : cur;
          }

          // timestamp también está en NON_DESTRUCTIVE, pero por claridad:
          if (h === 'timestamp') {
            if (hasValue_(cur)) return cur;
            return incomingDefined && hasValue_(incoming) ? incoming : new Date();
          }

          // Para el resto: si viene algo definido, lo usamos; si no, dejamos lo que hay
          return incomingDefined ? incoming : cur;
        });

        rowRange.setValues([merged]);
      }
    }

    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ====== HTTP Handlers ======
function doPost(e) {
  try {
    // Acepta text/plain o application/json
    const raw = e.postData && e.postData.contents ? e.postData.contents : '{}';
    const payload = JSON.parse(raw);
    const records = Array.isArray(payload.records) ? payload.records : [];

    if (!records.length) {
      return ContentService.createTextOutput(JSON.stringify({ ok:false, error:'Sin records' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const res = upsertRecords_(records);
    return ContentService.createTextOutput(JSON.stringify(res))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok:false, error:String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput('OK');
}
