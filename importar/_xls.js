/* =====================================================================
   Lector de Excel y CSV — sin librerías externas.
   Un .xlsx es un ZIP con XML adentro. Se descomprime con la API nativa del
   navegador (DecompressionStream) y se lee el XML con expresiones regulares,
   que además funcionan igual en Node para poder probarlo.
   ===================================================================== */

/* ── ZIP ── */
function u16(d,o){ return d[o] | (d[o+1]<<8); }
function u32(d,o){ return (d[o] | (d[o+1]<<8) | (d[o+2]<<16) | (d[o+3]<<24)) >>> 0; }

// Devuelve {nombre: {metodo, offset, tam}} leyendo el directorio central.
function zipIndice(d){
  let eocd = -1;
  for(let i = d.length-22; i >= Math.max(0, d.length-66000); i--){
    if(u32(d,i) === 0x06054b50){ eocd = i; break; }
  }
  if(eocd < 0) throw new Error('El archivo no parece un Excel (.xlsx) válido.');
  const total = u16(d, eocd+10);
  let p = u32(d, eocd+16);
  const out = {};
  for(let n = 0; n < total; n++){
    if(u32(d,p) !== 0x02014b50) break;
    const metodo = u16(d, p+10);
    const tamComp = u32(d, p+20);
    const lnNombre = u16(d, p+28), lnExtra = u16(d, p+30), lnCom = u16(d, p+32);
    const local = u32(d, p+42);
    const nombre = new TextDecoder().decode(d.subarray(p+46, p+46+lnNombre));
    out[nombre] = { metodo, local, tamComp };
    p += 46 + lnNombre + lnExtra + lnCom;
  }
  return out;
}
async function zipLeer(d, entrada){
  if(!entrada) return null;
  const p = entrada.local;
  if(u32(d,p) !== 0x04034b50) throw new Error('Entrada dañada dentro del archivo.');
  const ini = p + 30 + u16(d, p+26) + u16(d, p+28);
  const crudo = d.subarray(ini, ini + entrada.tamComp);
  if(entrada.metodo === 0) return new TextDecoder().decode(crudo);
  if(entrada.metodo !== 8) throw new Error('El Excel usa una compresión que no puedo leer. Guárdalo como CSV.');
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter(); w.write(crudo); w.close();
  const buf = await new Response(ds.readable).arrayBuffer();
  return new TextDecoder().decode(new Uint8Array(buf));
}

/* ── XML ── */
const desXml = s => String(s)
  .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
  .replace(/&apos;/g,"'").replace(/&#(\d+);/g, (m,n)=>String.fromCharCode(+n))
  .replace(/&amp;/g,'&');

// A1 -> 0, B1 -> 1, AA1 -> 26
function colDeRef(ref){
  let n = 0;
  for(let i = 0; i < ref.length; i++){
    const c = ref.charCodeAt(i);
    if(c < 65 || c > 90) break;
    n = n*26 + (c-64);
  }
  return n-1;
}
const EXCEL_EPOCA = Date.UTC(1899,11,30);
const serialAFecha = n => new Date(EXCEL_EPOCA + Math.round(n*86400000));
// Excel guarda las fechas como número de días. No hay forma barata de saber si
// un número "es" fecha sin leer los estilos, así que se decide por el rango:
// 1990-2100 en serial. Fuera de ahí se trata como número normal.
const pareceFecha = n => typeof n === 'number' && n > 32800 && n < 73000;

/* ── libro ── */
// Devuelve { hojas:[{nombre, filas:[[celda,...]]}] }
async function leerXlsx(arrayBuffer){
  const d = new Uint8Array(arrayBuffer);
  const idx = zipIndice(d);

  let compartidas = [];
  if(idx['xl/sharedStrings.xml']){
    const xml = await zipLeer(d, idx['xl/sharedStrings.xml']);
    compartidas = (xml.match(/<si[\s>][\s\S]*?<\/si>|<si\/>/g) || []).map(si => {
      const partes = si.match(/<t[^>]*\/>|<t[^>]*>([\s\S]*?)<\/t>/g) || [];
      return partes.map(t => desXml(t.replace(/<[^>]+>/g,''))).join('');
    });
  }

  const rels = {};
  const relsXml = await zipLeer(d, idx['xl/_rels/workbook.xml.rels']);
  if(relsXml) (relsXml.match(/<Relationship\b[^>]*>/g)||[]).forEach(r=>{
    const id = (/Id="([^"]+)"/.exec(r)||[])[1];
    let t = (/Target="([^"]+)"/.exec(r)||[])[1];
    if(id && t){ t = t.replace(/^\//,'').replace(/^worksheets\//,'xl/worksheets/');
                 rels[id] = t.startsWith('xl/') ? t : 'xl/'+t; }
  });

  const wbXml = await zipLeer(d, idx['xl/workbook.xml']);
  const hojasDef = (wbXml.match(/<sheet\b[^>]*\/?>/g)||[]).map(s=>({
    nombre: desXml((/name="([^"]*)"/.exec(s)||[])[1] || 'Hoja'),
    rid: (/r:id="([^"]+)"/.exec(s)||[])[1]
  })).filter(h=>h.rid);

  const hojas = [];
  for(const h of hojasDef){
    const ruta = rels[h.rid];
    const ent = idx[ruta] || idx[ruta && ruta.replace('xl/','')];
    if(!ent) continue;
    const xml = await zipLeer(d, ent);
    hojas.push({ nombre: h.nombre, filas: filasDeHoja(xml, compartidas) });
  }
  return { hojas };
}

function filasDeHoja(xml, compartidas){
  const filas = [];
  const bloques = xml.match(/<row\b[^>]*\/>|<row\b[^>]*>[\s\S]*?<\/row>/g) || [];
  bloques.forEach(b => {
    const fila = [];
    const celdas = b.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || [];
    celdas.forEach(c => {
      const ref = (/r="([A-Z]+\d+)"/.exec(c)||[])[1];
      const t = (/\bt="([^"]+)"/.exec(c)||[])[1];
      const i = ref ? colDeRef(ref) : fila.length;
      let val = null;
      if(t === 'inlineStr'){
        const ts = c.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
        val = ts.map(x=>desXml(x.replace(/<[^>]+>/g,''))).join('');
      } else {
        const v = /<v[^>]*>([\s\S]*?)<\/v>/.exec(c);
        if(v){
          if(t === 's') val = compartidas[+v[1]] ?? '';
          else if(t === 'str' || t === 'e') val = desXml(v[1]);
          else { const n = parseFloat(v[1]); val = isNaN(n) ? desXml(v[1]) : n; }
        }
      }
      fila[i] = val;
    });
    for(let k = 0; k < fila.length; k++) if(fila[k] === undefined) fila[k] = null;
    filas.push(fila);
  });
  return filas;
}

/* ── CSV ── */
function leerCsv(texto){
  const t = texto.replace(/^﻿/, '');
  const primera = t.split(/\r?\n/)[0] || '';
  // el separador se deduce contando cuál aparece más en el encabezado
  const cand = [';', ',', '\t', '|'];
  const sep = cand.reduce((a,b)=> (primera.split(b).length > primera.split(a).length ? b : a), ';');
  const filas = [];
  let fila = [], campo = '', entre = false;
  for(let i = 0; i < t.length; i++){
    const c = t[i];
    if(entre){
      if(c === '"'){ if(t[i+1] === '"'){ campo += '"'; i++; } else entre = false; }
      else campo += c;
    } else if(c === '"') entre = true;
    else if(c === sep){ fila.push(campo); campo = ''; }
    else if(c === '\n'){ fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if(c !== '\r') campo += c;
  }
  if(campo.length || fila.length){ fila.push(campo); filas.push(fila); }
  // números: lo que parece número, se convierte (respetando la coma decimal)
  const num = s => {
    const x = String(s).trim();
    if(!x || !/^-?[\d.,\s]+$/.test(x)) return s;
    const limpio = x.replace(/\s/g,'').replace(/\.(?=\d{3}\b)/g,'').replace(',', '.');
    const n = parseFloat(limpio);
    return isNaN(n) ? s : n;
  };
  return { hojas: [{ nombre:'CSV', filas: filas.map(f=>f.map(num)) }] };
}

async function leerArchivo(nombre, arrayBuffer){
  if(/\.csv$|\.txt$/i.test(nombre)) return leerCsv(new TextDecoder().decode(new Uint8Array(arrayBuffer)));
  return leerXlsx(arrayBuffer);
}
