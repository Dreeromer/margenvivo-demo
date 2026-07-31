/* =========================================================================
   PANEL DEL DUEÑO
   ========================================================================= */
let chart3d = true, diaSel = null;

function semanasPresentes(){ return [...new Set(VENTAS.map(v=>weekStart(v.ts)))].sort((a,b)=>b-a); }
function ventasFiltradas(){
  let v = (panelSemana==='all'||panelSemana==null) ? VENTAS : VENTAS.filter(x=>weekStart(x.ts)===panelSemana);
  if(diaSel!=null) v = v.filter(x=>dayStart(x.ts)===diaSel);
  return v;
}

function renderPanel(){
  const semanas = semanasPresentes();
  if(panelSemana===null) panelSemana = semanas.length?semanas[0]:'all';
  const sel = g('semSel');
  sel.innerHTML = `<option value="all">Todo el histórico</option>`+semanas.map(w=>`<option value="${w}">Semana ${weekLabel(w)}</option>`).join('');
  sel.value = String(panelSemana);

  const all = ventasFiltradas();
  const venta = all.reduce((s,v)=>s+v.venta,0), util = all.reduce((s,v)=>s+v.util,0);
  const tickets = new Set(all.map(v=>v.ticket)).size;
  const mg = venta?util/venta*100:0;
  const bajos = all.filter(v=>v.tipo!=='servicio' && v.margen<CFG.pisoMargen).length;
  const lowStock = PRODUCTS.filter(p=>{const s=stockStatus(p);return s==='low'||s==='out';}).length;
  const porPedir = repoRows().filter(r=>r.pedir>0).length;
  const porCobrar = creditAccounts().reduce((s,a)=>s+(a.saldo>0?a.saldo:0),0);

  g('panelSub').innerHTML =
    (panelSemana==='all'?'Todo el histórico':'Semana '+weekLabel(panelSemana))
    + (diaSel!=null ? ` · <b>${fullDay(diaSel)}</b> <button class="btn sm ghost" onclick="verTodaLaSemana()">quitar filtro</button>` : '')
    + ` · ${tickets} tickets`;

  g('panelKpis').innerHTML = [
    {kl:'Venta', kv:kf(venta), c:'br'},
    {kl:'Utilidad', kv:kf(util), c:'good'},
    {kl:'Margen', kv:mg.toFixed(1)+'%'},
    {kl:'Tickets', kv:tickets.toLocaleString('es-PE')},
    {kl:'Ticket promedio', kv:money0(tickets?venta/tickets:0)},
    {kl:'Bajo piso', kv:bajos, c:bajos?'warn':''},
    {kl:'Stock bajo', kv:lowStock, c:lowStock?'warn':'', click:"abrirInventario('low')"},
    {kl:'Por pedir', kv:porPedir, c:porPedir?'warn':'', click:"abrirInventario('repo')"},
    {kl:'Por cobrar', kv:kf(porCobrar), c:porCobrar>0?'bad':'', click:'abrirCreditos()'},
  ].map(k=>`<div class="kpi ${k.c||''} ${k.click?'act':''}"${k.click?` onclick="${k.click}" title="Ver detalle"`:''}>
      <div class="kl">${k.kl}</div><div class="kv num">${k.kv}</div></div>`).join('');

  renderSemana3D();
  renderCaja();
  renderCategorias(all);
  renderTop(all);
  renderInsight(all, {venta, util, mg, porCobrar});
  renderTickets(all);
}
function onSemana(v){ panelSemana = v==='all'?'all':Number(v); diaSel=null; renderPanel(); }
function verTodaLaSemana(){ diaSel=null; renderPanel(); }

/* ── gráfica 3D de la semana: cada columna es un día, se puede tocar ── */
function toggle3d(){ chart3d=!chart3d; renderSemana3D();
  g('btn3d').textContent = chart3d ? 'Ver plano' : 'Ver en 3D'; }

function renderSemana3D(){
  const ws = (panelSemana==='all'||panelSemana==null) ? weekStart(Date.now()) : panelSemana;
  g('semLbl').textContent = 'Semana '+weekLabel(ws);
  const dias = Array.from({length:7}, (_,i)=>({ i, ts: ws+i*86400000, venta:0, util:0, tickets:new Set() }));
  VENTAS.forEach(v=>{ if(weekStart(v.ts)!==ws) return;
    const d = dias[(new Date(v.ts).getDay()+6)%7];
    d.venta += v.venta; d.util += v.util; d.tickets.add(v.ticket); });
  const mx = Math.max(1, ...dias.map(d=>d.venta));
  const H = 150;
  const hoy = dayStart(Date.now());
  g('stage').className = 'stage'+(chart3d?'':' flat');
  g('stage').innerHTML = dias.map(d=>{
    const h = Math.max(3, Math.round(d.venta/mx*H));
    const on = diaSel===dayStart(d.ts);
    return `<div class="col3 ${on?'on':''}" data-i="${d.i}"
      onmouseenter="tipDia(event,${d.i})" onmousemove="tipMove(event)" onmouseleave="tipOff()"
      onclick="filtrarDia(${dayStart(d.ts)})" title="${DIAS[d.i]} · ${money(d.venta)}"
      style="height:${h}px">
      <span class="val num" style="bottom:${h+6}px">${d.venta?kf(d.venta):''}</span>
      <span class="face" style="height:${h}px"></span>
      <span class="side" style="height:${h}px"></span>
      <span class="top" style="bottom:${h}px"></span>
      <span class="cap">${DIAS[d.i]}${dayStart(d.ts)===hoy?' •':''}</span></div>`;
  }).join('');
  const tot = dias.reduce((s,d)=>s+d.venta,0), ut = dias.reduce((s,d)=>s+d.util,0);
  const mejor = dias.slice().sort((a,b)=>b.venta-a.venta)[0];
  g('semLeg').innerHTML = `<span>Semana: <b class="num">${money0(tot)}</b></span>`
    + `<span>Margen: <b class="num">${tot?(ut/tot*100).toFixed(1):'0'}%</b></span>`
    + (mejor.venta?`<span>Mejor día: <b>${DIAS[mejor.i]}</b> con <b class="num">${money0(mejor.venta)}</b></span>`:'')
    + `<span class="dim">Toca un día para filtrar</span>`;
  _dias = dias;
}
let _dias = [];
function filtrarDia(ts){ diaSel = (diaSel===ts) ? null : ts; renderPanel(); }
function tipDia(ev, i){
  const d = _dias[i]; if(!d) return;
  const mg = d.venta ? d.util/d.venta*100 : 0;
  mostrarTip(`<div class="tt">${fullDay(d.ts)}</div>
    <div class="tr"><span>Venta</span><b class="num">${money(d.venta)}</b></div>
    <div class="tr"><span>Utilidad</span><b class="num">${money(d.util)}</b></div>
    <div class="tr"><span>Margen</span><b class="num">${mg.toFixed(1)}%</b></div>
    <div class="tr"><span>Tickets</span><b class="num">${d.tickets.size}</b></div>`, ev);
}
function mostrarTip(html, ev){ const t=g('tip'); t.innerHTML=html; t.classList.add('on'); tipMove(ev); }
function tipMove(ev){ const t=g('tip');
  t.style.left = Math.min(window.innerWidth-250, ev.clientX+16)+'px';
  t.style.top  = Math.max(10, ev.clientY-14)+'px'; }
function tipOff(){ g('tip').classList.remove('on'); }

/* ── caja del día: dona interactiva por forma de pago ── */
const COLOR_PAGO = { efectivo:'var(--green)', yape:'#7B2FBF', tarjeta:'var(--steel)',
                     transferencia:'var(--br)', credito:'var(--amber)' };
function renderCaja(){
  const hoy = dayStart(Date.now());
  const dias = [...new Set(VENTAS.map(v=>dayStart(v.ts)))].sort((a,b)=>b-a);
  if(panelDia===null) panelDia = dias.includes(hoy) ? hoy : (dias[0]||hoy);
  const sel = g('cajaSel');
  sel.innerHTML = dias.slice(0,60).map(d=>`<option value="${d}">${fullDay(d)}${d===hoy?' · hoy':''}</option>`).join('');
  sel.value = String(panelDia);

  const c = cajaDe(panelDia);
  const partes = METODOS.map(([k,lbl])=>({k, lbl, v:c.porMetodo[k]||0})).filter(p=>p.v>0);
  const total = partes.reduce((s,p)=>s+p.v,0);

  const R = 52, GR = 13, C = 2*Math.PI*R;
  let off = 0;
  const arcos = partes.map(p=>{
    const frac = total ? p.v/total : 0, len = frac*C;
    const el = `<circle class="seg-arc" r="${R}" cx="70" cy="70" fill="none"
      stroke="${COLOR_PAGO[p.k]}" stroke-width="${GR}"
      stroke-dasharray="${len.toFixed(2)} ${(C-len).toFixed(2)}"
      stroke-dashoffset="${(-off).toFixed(2)}"
      onmouseenter="mostrarTip('<div class=\\'tt\\'>${p.lbl}</div><div class=\\'tr\\'><span>Monto</span><b>${money(p.v)}</b></div><div class=\\'tr\\'><span>Del día</span><b>${(frac*100).toFixed(0)}%</b></div>',event)"
      onmousemove="tipMove(event)" onmouseleave="tipOff()"></circle>`;
    off += len;
    return el;
  }).join('');

  g('cajaChart').innerHTML = total ? `
    <svg width="140" height="140" viewBox="0 0 140 140" style="transform:rotate(-90deg)">
      <circle r="${R}" cx="70" cy="70" fill="none" stroke="var(--sunken)" stroke-width="${GR}"></circle>
      ${arcos}
    </svg>
    <div class="dleg">${partes.map(p=>`
      <div class="dleg-r" onmouseenter="mostrarTip('<div class=\\'tt\\'>${p.lbl}</div><div class=\\'tr\\'><span>Monto</span><b>${money(p.v)}</b></div>',event)" onmousemove="tipMove(event)" onmouseleave="tipOff()">
        <i style="background:${COLOR_PAGO[p.k]}"></i><span class="dn">${p.lbl}</span>
        <span class="dv num">${money0(p.v)}</span></div>`).join('')}</div>`
    : `<div class="dim" style="padding:26px 0;font-size:13px">Sin movimiento este día.</div>`;

  g('cajaSub').textContent = `${c.tickets} tickets · ${money(c.total)} vendido`;
  g('cajaEfe').innerHTML = `<div class="payline sum"><span>💵</span>
    <span class="pl">Efectivo que debe haber en caja</span>
    <span class="pv num">${money(c.porMetodo.efectivo||0)}</span></div>`
    + ((c.porMetodo.credito||0) > 0 ? `<div class="payline"><span>📒</span>
    <span class="pl">Se fio hoy (no entró plata)</span>
    <span class="pv num txt-warn">${money(c.porMetodo.credito)}</span></div>` : '');
}
function onCajaDia(v){ panelDia = Number(v); renderCaja(); }

/* ── categorías y top ── */
function renderCategorias(all){
  const by = {};
  all.forEach(v=>{ (by[v.cat]=by[v.cat]||{venta:0,util:0}); by[v.cat].venta+=v.venta; by[v.cat].util+=v.util; });
  const cats = Object.entries(by).map(([n,d])=>({n, venta:d.venta, util:d.util, mg:d.venta?d.util/d.venta*100:0}))
    .sort((a,b)=>b.mg-a.mg);
  const mx = Math.max(1,...cats.map(c=>c.mg));
  g('panelCat').innerHTML = cats.map(c=>{
    const cls = c.mg>=35?'good':(c.mg>=20?'warn':'bad');
    return `<div class="bar-row" onmouseenter="mostrarTip('<div class=\\'tt\\'>${esc(c.n)}</div><div class=\\'tr\\'><span>Vendido</span><b>${money(c.venta)}</b></div><div class=\\'tr\\'><span>Utilidad</span><b>${money(c.util)}</b></div>',event)" onmousemove="tipMove(event)" onmouseleave="tipOff()">
      <span class="bar-l">${esc(c.n)}</span>
      <span class="bar-t"><span class="bar-f ${cls}" style="width:${Math.max(5,c.mg/mx*100)}%"></span></span>
      <span class="bar-v num">${c.mg.toFixed(1)}%</span></div>`;
  }).join('') || vacio();
}
function setTop(m){ topMetric=m;
  g('topByV').classList.toggle('active', m==='venta');
  g('topByC').classList.toggle('active', m==='cant');
  renderTop(ventasFiltradas()); }
function renderTop(all){
  const by = {};
  all.forEach(v=>{ (by[v.producto]=by[v.producto]||{venta:0,cant:0,util:0,unidad:v.unidad});
    by[v.producto].venta+=v.venta; by[v.producto].cant+=v.cant; by[v.producto].util+=v.util; });
  const arr = Object.entries(by).map(([n,d])=>({n,...d})).sort((a,b)=>b[topMetric]-a[topMetric]).slice(0,8);
  const mx = Math.max(1,...arr.map(x=>x[topMetric]));
  g('panelTop').innerHTML = arr.map(x=>
    `<div class="bar-row" onmouseenter="mostrarTip('<div class=\\'tt\\'>${esc(x.n)}</div><div class=\\'tr\\'><span>Vendido</span><b>${money(x.venta)}</b></div><div class=\\'tr\\'><span>Cantidad</span><b>${un(x.cant)} ${esc(x.unidad)}</b></div><div class=\\'tr\\'><span>Utilidad</span><b>${money(x.util)}</b></div>',event)" onmousemove="tipMove(event)" onmouseleave="tipOff()">
     <span class="bar-l">${esc(x.n)}</span>
     <span class="bar-t"><span class="bar-f" style="width:${Math.max(5,x[topMetric]/mx*100)}%"></span></span>
     <span class="bar-v num">${topMetric==='cant'? un(x.cant)+' '+esc(x.unidad) : kf(x.venta)}</span></div>`
  ).join('') || vacio();
}

function renderInsight(all, k){
  const box = g('panelInsight');
  if(!all.length){ box.innerHTML = `<span class="i">!</span><div>No hay ventas en este periodo. Cambia de semana arriba.</div>`; return; }
  const rows = repoRows();
  const urgentes = rows.filter(r=>repoNivel(r)==='urgente').sort((a,b)=>b.demSem-a.demSem);
  const durm = dormidosOf(rows), capital = durm.reduce((s,r)=>s+r.capital,0);
  const by={};
  all.forEach(v=>{ (by[v.cat]=by[v.cat]||{venta:0,util:0}); by[v.cat].venta+=v.venta; by[v.cat].util+=v.util; });
  const cats = Object.entries(by).map(([n,d])=>({n,mg:d.venta?d.util/d.venta*100:0}));
  const mejor = cats.slice().sort((a,b)=>b.mg-a.mg)[0], peor = cats.slice().sort((a,b)=>a.mg-b.mg)[0];
  const p = [`Vendiste <b>${money0(k.venta)}</b> y te quedó <b>${money0(k.util)}</b> (${k.mg.toFixed(1)}%).`];
  if(mejor && peor && mejor.n!==peor.n)
    p.push(`Lo que más deja es <b>${esc(mejor.n)}</b> (${mejor.mg.toFixed(0)}%); lo que menos, <b>${esc(peor.n)}</b> (${peor.mg.toFixed(0)}%).`);
  if(urgentes.length) p.push(`<b>${urgentes.length} productos</b> se acaban antes de que llegue el próximo pedido, empezando por <b>${esc(urgentes[0].nombre)}</b>.`);
  if(capital>0) p.push(`Hay <b>${money0(capital)}</b> parados en ${durm.length} productos que no rotan.`);
  if(k.porCobrar>0) p.push(`Te deben <b>${money0(k.porCobrar)}</b>.`);
  box.innerHTML = `<span class="i">!</span><div>${p.join(' ')}</div>`;
}

function renderTickets(all){
  const porT = {};
  all.forEach(v=>{ const t = porT[v.ticket] = porT[v.ticket] ||
    {nro:v.ticket, ts:v.ts, cliente:v.cliente, pago:v.pago, desc:v.desc, venta:0, util:0, n:0};
    t.venta+=v.venta; t.util+=v.util; t.n++; });
  const arr = Object.values(porT).sort((a,b)=>b.ts-a.ts).slice(0,200);
  g('ticketCount').textContent = Object.keys(porT).length.toLocaleString('es-PE')+' tickets';
  g('ticketsBody').innerHTML = arr.map(t=>{
    const mg = t.venta?t.util/t.venta*100:0;
    const cls = mg<CFG.pisoMargen*100 ? 'bad' : (mg<25?'warn':'good');
    const met = (METODOS.find(m=>m[0]===t.pago)||['','—'])[1];
    return `<tr><td>${ddmm(t.ts)} <span class="dim">${hhmm(t.ts)}</span></td>
      <td class="num">${t.nro}</td>
      <td>${esc(t.cliente||'—')}</td>
      <td>${esc(met)}${t.desc?` <span class="pill warn" style="font-size:10px">−${t.desc}%</span>`:''}</td>
      <td class="num">${t.n}</td><td class="num" style="font-weight:600">${money(t.venta)}</td>
      <td><span class="pill ${cls}">${mg.toFixed(1)}%</span></td></tr>`;
  }).join('') || `<tr><td colspan="7" class="dim" style="text-align:center;padding:22px">Sin ventas en este periodo.</td></tr>`;
}
function vacio(){ return `<div class="dim" style="font-size:13px;padding:10px 0">Sin datos todavía.</div>`; }

/* ===== exportar ===== */
function exportarCSV(){
  const rows = ventasFiltradas();
  if(!rows.length){ toast('No hay ventas para exportar','bad'); return; }
  const head = ['Fecha','Hora','Ticket','Cliente','Documento','Lista','Pago','Desc %','Código','Producto',
                'Categoría','Unidad','Cantidad','Precio','Venta','Costo unit.','Costo total','Utilidad','Margen %'];
  const lines = [head.join(';')];
  rows.slice().sort((a,b)=>a.ts-b.ts).forEach(v=>lines.push([
    ddmm(v.ts), hhmm(v.ts), v.ticket, v.cliente||'Público', v.clienteDoc||'',
    v.tipoCliente==='mayorista'?'Mayorista':'Público', (METODOS.find(m=>m[0]===v.pago)||['',''])[1],
    v.desc||0, v.sku, v.producto, v.cat, v.unidad, un(v.cant), dec2(v.precio), dec2(v.venta),
    dec2(v.costo), dec2(v.costoT), dec2(v.util), (v.margen*100).toFixed(1).replace('.',',')
  ].map(csvCell).join(';')));
  bajar('﻿'+lines.join('\r\n'), 'FerreteriaSantaRosa_ventas.csv');
  toast('Exportado','good');
}
function csvCell(x){ x=String(x); return /[";\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x; }
function bajar(txt, nombre){
  const blob = new Blob([txt],{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href=url; a.download=nombre; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1500);
}
