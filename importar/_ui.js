/* ===== pantalla del analizador ===== */
const g = id => document.getElementById(id);
const S_ = n => 'S/ ' + Math.round(Number(n)||0).toLocaleString('es-PE');
const S2 = n => 'S/ ' + (Number(n)||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
const kS = n => {
  const a = Math.abs(n);
  if(a >= 1e6) return 'S/ ' + (n/1e6).toFixed(a>=1e7?1:2) + ' M';
  if(a >= 1000) return 'S/ ' + (n/1000).toFixed(a>=1e4?0:1) + 'k';
  return S_(n);
};
const esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const nUn = n => Math.abs(n)>=10 ? Math.round(n).toLocaleString('es-PE') : (Math.round(n*10)/10).toString().replace('.',',');
const fecha = ts => ts ? new Date(ts).toLocaleDateString('es-PE',{day:'2-digit',month:'short',year:'numeric'}) : '—';

let LIBRO = null, EXTRA = null, ANAL = null, NOMBRE = '', agrup = 'producto';

function iniciar(){
  const d = g('drop');
  ['dragenter','dragover'].forEach(e=>d.addEventListener(e, ev=>{ ev.preventDefault(); d.classList.add('on'); }));
  ['dragleave','drop'].forEach(e=>d.addEventListener(e, ev=>{ ev.preventDefault(); d.classList.remove('on'); }));
  d.addEventListener('drop', ev=>{ if(ev.dataTransfer.files.length) elegido(ev.dataTransfer.files); });
  // soltar en cualquier parte de la página también sirve
  document.addEventListener('dragover', e=>e.preventDefault());
  document.addEventListener('drop', e=>{ e.preventDefault();
    if(!g('vacio').classList.contains('hidden') && e.dataTransfer.files.length) elegido(e.dataTransfer.files); });
}

function estado(cual){
  ['vacio','cargando','listo'].forEach(k=>g(k).classList.toggle('hidden', k!==cual));
  g('btnOtro').classList.toggle('hidden', cual!=='listo');
}
function reiniciar(){ LIBRO=EXTRA=ANAL=null; g('file').value=''; estado('vacio'); window.scrollTo(0,0); }

async function elegido(files){
  const f = files[0]; if(!f) return;
  NOMBRE = f.name;
  estado('cargando');
  g('cargandoTxt').textContent = 'Leyendo ' + f.name + '…';
  try{
    const buf = await f.arrayBuffer();
    LIBRO = await leerArchivo(f.name, buf);
    g('cargandoTxt').textContent = 'Ordenando ' + LIBRO.hojas.length + (LIBRO.hojas.length===1?' hoja…':' hojas…');
    await new Promise(r=>setTimeout(r,30));
    procesar();
  }catch(e){
    console.error(e);
    estado('vacio');
    alert('No pude leer el archivo.\n\n' + (e.message||e) +
          '\n\nSi el problema sigue, ábrelo en Excel y guárdalo como CSV.');
  }
}

function procesar(opciones){
  EXTRA = extraer(LIBRO, opciones);
  ANAL = analizar(EXTRA.lineas);
  pintar();
  estado('listo');
  window.scrollTo(0,0);
}

function pintar(){
  const A = ANAL, E = EXTRA;
  g('resArchivo').textContent = NOMBRE;
  g('resSub').innerHTML = A.lineas
    ? `${E.hojasUsadas.length} ${E.hojasUsadas.length===1?'hoja':'hojas'} · ${fecha(A.desde)} a ${fecha(A.hasta)}`
      + (A.semanas?` · ${A.semanas} semanas`:'')
    : 'No encontré líneas de venta en este archivo.';

  g('resKpis').innerHTML = [
    {kl:'Venta del periodo', kv:kS(A.venta), c:'br', ks:`${A.lineas.toLocaleString('es-PE')} líneas`},
    {kl:'Venta por semana', kv:kS(A.ventaSemanal), ks:A.semanas?`sobre ${A.semanas} semanas`:'sin fechas'},
    {kl:'Tickets', kv:A.tickets.toLocaleString('es-PE'), ks:A.tickets?`${A.itemsPorVenta.toFixed(2)} ítems por venta`:'sin número de venta'},
    {kl:'Ticket promedio', kv:S_(A.ticketProm)},
    {kl:'Productos', kv:A.productos.length.toLocaleString('es-PE'), ks:`${A.productos.filter(p=>p.abc==='A').length} hacen el 80%`},
    {kl:'Clientes', kv:A.totalClientes.toLocaleString('es-PE')},
    A.margen!=null
      ? {kl:'Margen', kv:(A.margen*100).toFixed(1)+'%', c:'good', ks:S_(A.util)+' de utilidad'}
      : {kl:'Margen', kv:'—', c:'warn', ks:'falta el costo'},
  ].map(k=>`<div class="kpi ${k.c||''}"><div class="kl">${k.kl}</div><div class="kv num">${k.kv}</div>${
      k.ks?`<div class="ks">${k.ks}</div>`:''}</div>`).join('');

  // avisos honestos sobre lo que no se pudo hacer
  const avisos = [];
  if(A.margen == null) avisos.push({t:'warn', h:
    `<b>No puedo decirte cuánto ganas.</b> Tu archivo registra lo que vendes, pero no lo que te costó. Con una columna de costo — o cargando el costo de cada producto una sola vez — todo lo de esta pantalla se convierte en utilidad y margen, no solo en venta.`});
  else if(A.coberturaCosto < 0.9) avisos.push({t:'warn', h:
    `<b>Solo el ${(A.coberturaCosto*100).toFixed(0)}% de las líneas trae costo.</b> El margen que ves está calculado sobre esa parte; el resto queda fuera.`});
  if(E.descartadas.sinProducto + E.descartadas.basura + E.descartadas.sinImporte > 0) avisos.push({t:'info', h:
    `<b>Dejé fuera ${(E.descartadas.sinProducto+E.descartadas.basura+E.descartadas.sinImporte).toLocaleString('es-PE')} filas</b> que no son ventas: `
    + [E.descartadas.sinProducto?`${E.descartadas.sinProducto} sin producto`:'',
       E.descartadas.basura?`${E.descartadas.basura} de totales`:'',
       E.descartadas.sinImporte?`${E.descartadas.sinImporte} sin importe`:''].filter(Boolean).join(', ') + '.'});
  if(E.unificados.length) avisos.push({t:'info', h:
    `<b>Uní ${E.unificados.length} nombres</b> que estaban escritos de más de una forma, como ${
      E.unificados.slice(0,2).map(u=>`«${esc(u.de)}» → «${esc(u.a)}»`).join(' y ')}.`});
  g('resAvisos').innerHTML = avisos.map(a=>
    `<div class="aviso ${a.t}"><span>${a.t==='warn'?'⚠':'✓'}</span><div>${a.h}</div></div>`).join('');

  // cómo se entendió el archivo
  const h0 = E.hojasUsadas[0];
  g('mapHojas').textContent = E.hojasUsadas.length + (E.hojasUsadas.length===1?' hoja':' hojas');
  g('mapaResumen').innerHTML = h0
    ? 'Tomé la fila <b>'+(h0.encabezado+1)+'</b> como encabezado y leí: '
      + Object.entries(h0.columnas).map(([k,v])=>`<b>${k}</b> = columna ${letraCol(v)}`).join(' · ')
    : 'No reconocí ninguna columna de producto.';
  pintarMapa(h0);

  setAgrup(agrup, true);
  pintarRotacion();
  pintarDudas();
  pintarLineas();
}

const letraCol = i => { let s=''; i=i+1; while(i>0){ const r=(i-1)%26; s=String.fromCharCode(65+r)+s; i=Math.floor((i-1)/26);} return s; };

function pintarMapa(h0){
  if(!h0){ g('mapCampos').innerHTML=''; return; }
  const hoja = LIBRO.hojas.find(x=>x.nombre===h0.nombre) || LIBRO.hojas[0];
  const enc = (hoja.filas[h0.encabezado]||[]).map(c=>String(c==null?'':c).replace(/\s+/g,' ').trim());
  const campos = ['producto','cantidad','precio','importe','costo','fecha','cliente','ticket','categoria','marca'];
  g('mapCampos').innerHTML = campos.map(c=>
    `<div><label for="mc_${c}">${c}</label><select id="mc_${c}">
      <option value="">— ninguna —</option>
      ${enc.map((e,i)=>`<option value="${i}" ${h0.columnas[c]===i?'selected':''}>${letraCol(i)} · ${esc(e||'(sin título)')}</option>`).join('')}
    </select></div>`).join('');
}
function toggleMapa(){
  const m = g('mapa'), oculto = m.classList.contains('hidden');
  m.classList.toggle('hidden', !oculto);
  g('btnMapa').textContent = oculto ? 'Ocultar' : 'Corregir columnas';
}
function reAnalizar(){
  const cols = {};
  ['producto','cantidad','precio','importe','costo','fecha','cliente','ticket','categoria','marca'].forEach(c=>{
    const v = g('mc_'+c).value;
    if(v !== '') cols[c] = +v;
  });
  if(cols.producto == null){ alert('Hace falta decir cuál es la columna del producto.'); return; }
  const h0 = EXTRA.hojasUsadas[0];
  procesar({ columnas: cols, filaEncabezado: h0 ? h0.encabezado : 0 });
}

function setAgrup(a, callado){
  agrup = a;
  ['agProd','agCat','agCli'].forEach(id=>g(id).classList.remove('primary'));
  g(a==='producto'?'agProd':(a==='cat'?'agCat':'agCli')).classList.add('primary');
  const filas = a==='producto' ? ANAL.productos.slice(0,12).map(p=>({n:p.nombre, venta:p.venta, part:p.part, acum:p.acum}))
    : a==='cat' ? ANAL.categorias.slice(0,12)
    : ANAL.topClientes.slice(0,12).map((c,i,arr)=>{
        const tot = ANAL.venta; let acc=0;
        return {n:c.n, venta:c.venta, part:tot?c.venta/tot:0, acum:null, tickets:c.tickets}; });
  if(a==='cliente'){ let acc=0; filas.forEach(f=>{ acc+=f.venta; f.acum = ANAL.venta?acc/ANAL.venta:0; }); }
  const mx = Math.max(0.0001, ...filas.map(f=>f.part));
  const vitales = a==='producto' ? ANAL.productos.filter(p=>p.abc==='A').length : null;
  g('parNota').innerHTML = !filas.length ? 'Sin datos para agrupar.'
    : (a==='producto' ? `<b>${vitales}</b> de ${ANAL.productos.length} productos hacen el 80% de la venta.`
    : a==='cat' ? (ANAL.categorias.length===1 && ANAL.categorias[0].n==='(sin dato)'
        ? 'Tu archivo no trae una columna de rubro o categoría.'
        : `${ANAL.categorias.length} rubros distintos.`)
    : `${ANAL.totalClientes} clientes. Los primeros concentran la venta.`);
  g('parBody').innerHTML = filas.map((f,i)=>
    `<div class="par ${f.acum!=null && f.acum<=0.80?'vital':''}">
      <span class="par-i">${String(i+1).padStart(2,'0')}</span>
      <span class="par-n">${esc(f.n)}${f.acum!=null?`<small>Acumulado ${(f.acum*100).toFixed(1)}%</small>`:''}</span>
      <span class="par-t"><span class="par-f" style="width:${Math.max(3,f.part/mx*100)}%"></span></span>
      <span class="par-v num">${kS(f.venta)}<small>${(f.part*100).toFixed(1)}%</small></span>
    </div>`).join('') || '<p class="dim">Sin datos.</p>';
  if(!callado) return;
}

function pintarRotacion(){
  const filas = ANAL.productos.slice().sort((a,b)=>b.porSemana-a.porSemana).slice(0,12);
  g('rotBody').innerHTML = filas.map(p=>
    `<tr><td>${esc(p.nombre)}</td>
      <td class="num">${ANAL.semanas?nUn(p.porSemana):'—'}</td>
      <td class="num">${kS(p.venta)}</td>
      <td><span class="pill ${p.abc==='A'?'good':(p.abc==='B'?'warn':'flat')}">${p.abc}</span></td></tr>`
  ).join('') || '<tr><td colspan="4" class="dim" style="text-align:center;padding:16px">Sin datos.</td></tr>';
}

function pintarDudas(){
  const d = EXTRA.dudosos.slice(0,12);
  g('cardDudas').classList.toggle('hidden', !d.length);
  g('dudTag').textContent = EXTRA.dudosos.length + (EXTRA.dudosos.length===1?' pareja':' parejas');
  g('dudBody').innerHTML = d.map(x=>
    `<div class="dud"><span>${esc(x.a)}</span><span class="flecha">≈</span><span>${esc(x.b)}</span>
      <span class="pill ${x.similitud>=0.88?'warn':'flat'}">${(x.similitud*100).toFixed(0)}%</span></div>`).join('');
}

function pintarLineas(){
  const l = EXTRA.lineas.slice(0,300);
  g('lineTag').textContent = EXTRA.lineas.length.toLocaleString('es-PE') + ' líneas'
    + (EXTRA.lineas.length>300 ? ' · se muestran las primeras 300' : '');
  g('lineBody').innerHTML = l.map(x=>
    `<tr><td>${esc(x.producto)}${x.productoOriginal!==x.producto?`<div class="dim" style="font-size:10.5px">venía como «${esc(x.productoOriginal)}»</div>`:''}</td>
      <td class="num">${nUn(x.cant)}</td><td class="num">${S2(x.precio)}</td><td class="num">${S2(x.venta)}</td>
      <td>${esc(x.cliente||'—')}</td><td class="num">${x.ts?fecha(x.ts):'—'}</td><td class="dim">${esc(x.hoja)}</td></tr>`
  ).join('') || '<tr><td colspan="7" class="dim" style="text-align:center;padding:16px">Sin líneas.</td></tr>';
}

function exportarLimpio(){
  if(!EXTRA || !EXTRA.lineas.length) return;
  const cab = ['Fecha','Ticket','Cliente','Producto','ProductoOriginal','Cantidad','Precio','Venta','Costo','Rubro','Marca','Hoja','FilaOriginal'];
  const cell = x => { x=String(x==null?'':x); return /[";\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x; };
  const dec = n => n==null ? '' : Number(n).toFixed(2).replace('.',',');
  const filas = EXTRA.lineas.map(l=>[
    l.ts?new Date(l.ts).toLocaleDateString('es-PE'):'', l.ticket, l.cliente, l.producto, l.productoOriginal,
    dec(l.cant), dec(l.precio), dec(l.venta), dec(l.costo), l.cat, l.marca, l.hoja, l.fila
  ].map(cell).join(';'));
  const blob = new Blob(['﻿'+[cab.join(';')].concat(filas).join('\r\n')], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = NOMBRE.replace(/\.[^.]+$/,'') + ' - limpio.csv';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1500);
}
