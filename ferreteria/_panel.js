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
  const R = resumen(all);
  const venta = R.venta, util = R.util, tickets = R.tickets, mg = R.margen*100;
  const semanasPeriodo = (panelSemana==='all'||panelSemana==null)
    ? Math.max(1, new Set(VENTAS.map(v=>weekStart(v.ts))).size) : 1;
  const IND = indicadoresInv(all, diaSel!=null ? semanasPeriodo/5 : semanasPeriodo);
  const bajos = all.filter(v=>v.tipo!=='servicio' && v.margen<CFG.pisoMargen).length;
  const lowStock = PRODUCTS.filter(p=>{const s=stockStatus(p);return s==='low'||s==='out';}).length;
  const porPedir = repoRows().filter(r=>r.pedir>0).length;
  const porCobrar = creditAccounts().reduce((s,a)=>s+(a.saldo>0?a.saldo:0),0);

  g('panelSub').innerHTML =
    (panelSemana==='all'?'Todo el histórico':'Semana '+weekLabel(panelSemana))
    + (diaSel!=null ? ` · <b>${fullDay(diaSel)}</b> <button class="btn sm ghost" onclick="verTodaLaSemana()">quitar filtro</button>` : '')
    + ` · ${tickets} tickets`;

  const kpis = [
    {kl:'Venta', kv:kf(venta), c:'br'},
    {kl:'Utilidad', kv:kf(util), c:'good'},
    {kl:'Margen', kv:mg.toFixed(1)+'%'},
    {kl:'Tickets', kv:tickets.toLocaleString('es-PE')},
    {kl:'Ticket promedio', kv:money0(R.ticketProm)},
    {kl:'Ítems por venta', kv:R.itemsPorVenta.toFixed(2),
     tip:'Cuántos productos distintos se lleva cada cliente. Subirlo es la forma más barata de vender más: se le vende al que ya está en el mostrador.'},
    {kl:'GMROI', kv:IND.gmroi.toFixed(2),
     tip:`Por cada S/ 1 invertido en mercadería ganas S/ ${IND.gmroi.toFixed(2)} al año. Calculado sobre el inventario de hoy (${money0(IND.inventario)}) — se afina cuando haya historial semanal.`},
    {kl:'Bajo piso', kv:bajos, c:bajos?'warn':''},
    {kl:'Stock bajo', kv:lowStock, c:lowStock?'warn':'', click:"abrirInventario('low')"},
    {kl:'Por pedir', kv:porPedir, c:porPedir?'warn':'', click:"abrirInventario('repo')"},
    {kl:'Por cobrar', kv:kf(porCobrar), c:porCobrar>0?'bad':'', click:'abrirCreditos()'},
  ];
  // los textos de ayuda se guardan aparte: meterlos dentro del atributo obliga a
  // anidar comillas y ahí es donde se rompe el HTML
  _kpiTips = kpis.map(k=>k.tip ? {t:k.kl, d:k.tip} : null);
  g('panelKpis').innerHTML = kpis.map((k,i)=>
    `<div class="kpi ${k.c||''} ${k.click?'act':''}"${k.click?` onclick="${k.click}" title="Ver detalle"`:''}`
    + `${k.tip?` onmouseenter="tipKpi(event,${i})" onmousemove="tipMove(event)" onmouseleave="tipOff()"`:''}>`
    + `<div class="kl">${k.kl}</div><div class="kv num">${k.kv}</div></div>`).join('');

  renderAcciones();
  renderSemana3D();
  renderDobleRanking(all);
  renderPareto(all);
  renderCaja();
  renderCategorias(all);
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
  // la semana anterior, para comparar día contra día
  const prevWs = ws - SEM_MS;
  const prev = new Array(7).fill(0);
  VENTAS.forEach(v=>{ if(weekStart(v.ts)===prevWs) prev[(new Date(v.ts).getDay()+6)%7] += v.venta; });
  const mx = Math.max(1, ...dias.map(d=>d.venta), ...prev);
  const H = 150;
  const hoy = dayStart(Date.now());
  _prev = prev;
  g('stage').className = 'stage'+(chart3d?'':' flat');
  g('stage').innerHTML = dias.map(d=>{
    const h = Math.max(3, Math.round(d.venta/mx*H));
    const hp = prev[d.i] ? Math.max(2, Math.round(prev[d.i]/mx*H)) : 0;
    const on = diaSel===dayStart(d.ts);
    return `<div class="col3 ${on?'on':''}" data-i="${d.i}"
      onmouseenter="tipDia(event,${d.i})" onmousemove="tipMove(event)" onmouseleave="tipOff()"
      onclick="filtrarDia(${dayStart(d.ts)})" title="${DIAS[d.i]} · ${money(d.venta)}"
      style="height:${h}px">
      <span class="val num" style="bottom:${h+6}px">${d.venta?kf(d.venta):''}</span>
      <span class="face" style="height:${h}px"></span>
      <span class="side" style="height:${h}px"></span>
      <span class="top" style="bottom:${h}px"></span>
      ${hp?`<span class="ghost" style="bottom:${hp}px" title="semana anterior"></span>`:''}
      <span class="cap">${DIAS[d.i]}${dayStart(d.ts)===hoy?' •':''}</span></div>`;
  }).join('');
  const tot = dias.reduce((s,d)=>s+d.venta,0), ut = dias.reduce((s,d)=>s+d.util,0);
  const totPrev = prev.reduce((s,x)=>s+x,0);
  const mejor = dias.slice().sort((a,b)=>b.venta-a.venta)[0];
  let cmp = '';
  if(totPrev>0){ const dif=(tot-totPrev)/totPrev*100, sube=dif>=0;
    cmp = `<span>vs. semana anterior: <b class="${sube?'txt-good':'txt-bad'}">${sube?'▲':'▼'} ${Math.abs(dif).toFixed(0)}%</b>
           <span class="dim num">(${money0(totPrev)})</span></span>`; }
  g('semLeg').innerHTML = `<span>Semana: <b class="num">${money0(tot)}</b></span>`
    + `<span>Margen: <b class="num">${tot?(ut/tot*100).toFixed(1):'0'}%</b></span>`
    + cmp
    + (mejor.venta?`<span>Mejor día: <b>${DIAS[mejor.i]}</b> con <b class="num">${money0(mejor.venta)}</b></span>`:'')
    + `<span class="dim">${totPrev>0?'La línea punteada es la semana anterior. ':''}Toca un día para filtrar</span>`;
  _dias = dias;
}
let _dias = [], _prev = [], _kpiTips = [];
function tipKpi(ev, i){ const t=_kpiTips[i]; if(!t) return;
  mostrarTip('<div class="tt">'+esc(t.t)+'</div><div style="opacity:.85;line-height:1.45">'+esc(t.d)+'</div>', ev); }
function filtrarDia(ts){ diaSel = (diaSel===ts) ? null : ts; renderPanel(); }
function tipDia(ev, i){
  const d = _dias[i]; if(!d) return;
  const mg = d.venta ? d.util/d.venta*100 : 0;
  const p = _prev[i]||0;
  const cmp = p>0 ? `<div class="tr"><span>Semana anterior</span><b class="num">${money(p)}</b></div>
    <div class="tr"><span>Diferencia</span><b class="num">${d.venta>=p?'▲':'▼'} ${Math.abs((d.venta-p)/p*100).toFixed(0)}%</b></div>` : '';
  mostrarTip(`<div class="tt">${fullDay(d.ts)}</div>
    <div class="tr"><span>Venta</span><b class="num">${money(d.venta)}</b></div>
    <div class="tr"><span>Utilidad</span><b class="num">${money(d.util)}</b></div>
    <div class="tr"><span>Margen</span><b class="num">${mg.toFixed(1)}%</b></div>
    <div class="tr"><span>Tickets</span><b class="num">${d.tickets.size}</b></div>${cmp}`, ev);
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

/* =========================================================================
   Lo que más sale vs. lo que más deja.
   Puestos uno al lado del otro porque casi nunca son la misma lista, y ver
   esa diferencia es lo que cambia la forma de comprar.
   ========================================================================= */
function fichaProducto(x, i, metrica){
  const cob = repoRows().find(r=>r.sku===x.sku);
  const sem = (cob && cob.demSem>0 && cob.track)
    ? `<span class="pill ${repoNivel(cob)==='urgente'?'bad':(repoNivel(cob)==='pronto'?'warn':'good')}">${cob.cobertura===Infinity?'∞':un(cob.cobertura)+' sem'}</span>`
    : '';
  const mgCls = x.margen<CFG.pisoMargen ? 'txt-bad' : (x.margen<0.25 ? 'txt-warn' : 'txt-good');
  return `<div class="rk ${i===0?'top':''}">
    <div class="rk-h"><span class="rk-i">${i===0?'★':String(i+1).padStart(2,'0')}</span>
      <span class="rk-n">${esc(x.nombre)}<small>${esc(x.sku||'')} · ${esc(x.cat||'')}</small></span>${sem}</div>
    <div class="rk-g">
      <div><span class="rk-l">Venta</span><b class="num">${money0(x.venta)}</b></div>
      <div><span class="rk-l">Utilidad</span><b class="num">${money0(x.util)}</b></div>
      <div><span class="rk-l">Margen</span><b class="num ${mgCls}">${(x.margen*100).toFixed(1)}%</b></div>
      <div><span class="rk-l">Cantidad</span><b class="num">${un(x.cant)} ${esc(x.unidad||'')}</b></div>
    </div>
    <div class="rk-b"><span class="rk-l">Participación de venta</span>
      <span class="bar-t"><span class="bar-f" style="width:${Math.max(3, Math.min(100, x.part/(metrica||1)*100))}%"></span></span>
      <span class="num">${(x.part*100).toFixed(1)}%</span></div>
  </div>`;
}
function renderDobleRanking(all){
  const R = rankingProductos(all);
  const maxPart = Math.max(0.01, ...R.porVenta.slice(0,5).map(x=>x.part));
  g('rkVenta').innerHTML = R.porVenta.slice(0,5).map((x,i)=>fichaProducto(x,i,maxPart)).join('') || vacio();
  g('rkUtil').innerHTML  = R.porUtilidad.slice(0,5).map((x,i)=>fichaProducto(x,i,maxPart)).join('') || vacio();
  // el hallazgo: cuántos de los que más venden NO están entre los que más dejan
  const topV = R.porVenta.slice(0,5).map(x=>x.sku);
  const topU = R.porUtilidad.slice(0,5).map(x=>x.sku);
  const fuera = topV.filter(s=>topU.indexOf(s)<0).length;
  g('rkNota').innerHTML = R.porVenta.length
    ? (fuera
      ? `<span class="i">!</span><div><b>${fuera} de tus 5 productos más vendidos no están entre los 5 que más utilidad dejan.</b> Mueves mucha mercadería que deja poco: ahí es donde conviene revisar el precio o negociar el costo con el proveedor.</div>`
      : `<span class="i">!</span><div>Lo que más vendes también es lo que más te deja. Es raro y es buena señal: tu mezcla está bien armada.</div>`)
    : `<span class="i">!</span><div>Sin ventas en este periodo.</div>`;
}

/* ── Pareto por marca o por rubro, con acumulado ── */
let paretoCampo = 'marca';
function setPareto(c){ paretoCampo = c;
  g('parByM').classList.toggle('active', c==='marca');
  g('parByC').classList.toggle('active', c==='cat');
  renderPareto(ventasFiltradas()); }
function renderPareto(all){
  const P = paretoPor(all, paretoCampo);
  const filas = P.filas.slice(0,12);
  const mx = Math.max(0.01, ...filas.map(f=>f.part));
  g('parTitulo').textContent = paretoCampo==='marca' ? `${P.filas.length} marcas` : `${P.filas.length} rubros`;
  // cuántos hacen el 80% de la venta: el número que ordena las compras
  const vitales = P.filas.filter(f=>f.acum<=0.80).length + (P.filas.length?1:0);
  g('parNota').innerHTML = P.filas.length
    ? `<b>${Math.min(vitales,P.filas.length)}</b> de ${P.filas.length} ${paretoCampo==='marca'?'marcas':'rubros'} hacen el 80% de tu venta.`
    : '';
  g('parBody').innerHTML = filas.map((f,i)=>
    `<div class="par ${f.acum<=0.80?'vital':''}" onmouseenter="tipPareto(event,'${esc(f.n).replace(/"/g,'')}',${f.venta},${f.util},${f.part},${f.acum})" onmousemove="tipMove(event)" onmouseleave="tipOff()">
      <span class="par-i">${String(i+1).padStart(2,'0')}</span>
      <span class="par-n">${esc(f.n)}<small>Acumulado ${(f.acum*100).toFixed(1)}%</small></span>
      <span class="par-t"><span class="par-f" style="width:${Math.max(3,f.part/mx*100)}%"></span></span>
      <span class="par-v num">${money0(f.venta)}<small>${(f.part*100).toFixed(1)}%</small></span>
    </div>`).join('') || vacio();
}
function tipPareto(ev, n, venta, util, part, acum){
  mostrarTip(`<div class="tt">${esc(n)}</div>
    <div class="tr"><span>Venta</span><b class="num">${money(venta)}</b></div>
    <div class="tr"><span>Utilidad</span><b class="num">${money(util)}</b></div>
    <div class="tr"><span>Margen</span><b class="num">${venta?(util/venta*100).toFixed(1):'0'}%</b></div>
    <div class="tr"><span>Participación</span><b class="num">${(part*100).toFixed(1)}%</b></div>
    <div class="tr"><span>Acumulado</span><b class="num">${(acum*100).toFixed(1)}%</b></div>`, ev);
}

/* ── Qué hacer esta semana: la parte que la competencia no muestra ── */
function renderAcciones(){
  const rows = repoRows();
  const pedir = rows.filter(r=>r.pedir>0).sort((a,b)=>(b.pedir*b.costo)-(a.pedir*a.costo));
  const compra = pedir.reduce((s,r)=>s+r.pedir*r.costo,0);
  const urgentes = rows.filter(r=>repoNivel(r)==='urgente');
  const durm = dormidosOf(rows), capital = durm.reduce((s,r)=>s+r.capital,0);
  const inv = valorInventario();

  g('accKpis').innerHTML = [
    {kl:'Comprar esta semana', kv:money0(compra), c:'br', sub:`${pedir.length} productos`},
    {kl:'Se agotan ya', kv:urgentes.length, c:urgentes.length?'bad':'', sub:'antes del próximo pedido'},
    {kl:'Capital dormido', kv:money0(capital), c:capital>0?'warn':'', sub:`${durm.length} productos parados`},
    {kl:'Inventario al costo', kv:money0(inv), sub:'plata puesta en mercadería'},
  ].map(k=>`<div class="kpi ${k.c||''}"><div class="kl">${k.kl}</div>
      <div class="kv num">${k.kv}</div><div class="ks">${k.sub}</div></div>`).join('');

  g('accLista').innerHTML = pedir.length
    ? pedir.slice(0,6).map(r=>{
        const nv = repoNivel(r);
        return `<div class="acc">
          <span class="acc-n">${esc(r.nombre)}<small>${esc(r.cat)} · sale ${un(r.demSem)} ${esc(r.unidad)}/sem · quedan ${un(r.stock)}</small></span>
          <span class="pill ${nv==='urgente'?'bad':(nv==='pronto'?'warn':'good')}">${r.cobertura===Infinity?'∞':un(r.cobertura)+' sem'}</span>
          <span class="acc-p"><b class="num">${un(r.pedir)} ${esc(r.unidad)}</b><small class="num">${money0(r.pedir*r.costo)}</small></span>
        </div>`; }).join('')
    : `<div class="dim" style="font-size:13px;padding:12px 0">No hay nada por pedir con el stock de hoy.</div>`;
}
