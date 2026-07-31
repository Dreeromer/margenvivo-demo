/* ===== estado de la interfaz ===== */
let ROL = null;                      // 'recepcion' | 'dueno'
let CART = nuevoCarrito();
let SEL = null;                      // producto elegido en el buscador
let panelDia = null, panelSemana = null, invTab='exist', invFilter='track', repoFilter='pedir';
let topMetric='venta', credSel=null, ultimoTicket=null;

function nuevoCarrito(){
  return { cliente:'Público general', doc:'', tipoCliente:'publico', items:[], desc:0,
           autorizado:false, pago:'efectivo', recibido:0 };
}

/* ===== arranque ===== */
function entrar(rol){ ROL = rol; render(); }
function salir(){ ROL = null; CART = nuevoCarrito(); render(); }

function render(){
  ['loginView','posView','panelView'].forEach(id=>document.getElementById(id).classList.add('hidden'));
  const right = document.getElementById('topRight');
  if(!ROL){ document.getElementById('loginView').classList.remove('hidden'); right.innerHTML=''; return; }
  const quien = ROL==='recepcion' ? 'Milagros · Recepción' : 'Don Aurelio · Dueño';
  right.innerHTML = `<span class="rolechip">${ROL==='recepcion'?'Mostrador':'Dueño'}</span> ${esc(quien)}`
    + ` <button class="btn sm ghost" onclick="salir()">Cambiar</button>`;
  if(ROL==='recepcion'){ document.getElementById('posView').classList.remove('hidden'); renderPos(); }
  else { document.getElementById('panelView').classList.remove('hidden'); renderPanel(); }
}

/* =========================================================================
   MOSTRADOR — lo que ve quien atiende.
   El precio sale del catálogo; no se teclea. Solo se puede descontar hasta
   el tope; pasado eso hace falta que el dueño autorice.
   No ve costos, utilidades ni márgenes.
   ========================================================================= */
function renderPos(){
  document.getElementById('posCliente').value = CART.cliente;
  document.getElementById('posDoc').value = CART.doc;
  document.querySelectorAll('#tipoCli .seg-b').forEach(b=>b.classList.toggle('active', b.dataset.t===CART.tipoCliente));
  const saldo = saldoOf(CART.cliente);
  document.getElementById('cliHint').innerHTML = saldo>0
    ? `<span class="pill warn">Debe ${money(saldo)}</span> <button class="btn sm" onclick="abrirAbono('${esc(CART.cliente).replace(/'/g,"\\'")}')">Registrar abono</button>`
    : '';
  renderBusqueda();
  renderSeleccion();
  renderCarrito();
}

function renderBusqueda(){
  const q = document.getElementById('posBuscar').value.trim().toUpperCase();
  const box = document.getElementById('posResultados');
  if(!q){ box.innerHTML=''; return; }
  const hits = PRODUCTS.filter(p => p.nombre.includes(q) || p.cat.includes(q) || p.sku.includes(q)).slice(0,7);
  if(!hits.length){ box.innerHTML = `<div class="res-empty">Nada con «${esc(q)}»</div>`; return; }
  box.innerHTML = hits.map(p=>{
    const precio = precioDe(p, CART.tipoCliente);
    const st = p.tipo==='servicio' ? '<span class="dim">servicio</span>'
      : (p.stock<=0 ? '<span class="pill bad">agotado</span>'
      : (p.stock<=p.stock_min ? `<span class="pill warn">quedan ${un(p.stock)}</span>` : `<span class="dim">${un(p.stock)} ${p.unidad}</span>`));
    return `<button class="res" onclick="elegir('${p.sku}')">
      <span class="res-n">${esc(p.nombre)}<span class="res-c">${esc(p.cat)} · ${esc(p.unidad)}</span></span>
      <span class="res-p num">${money(precio)}</span><span class="res-s">${st}</span></button>`;
  }).join('');
}

function elegir(sku){
  SEL = BY_SKU[sku] || null;
  document.getElementById('posBuscar').value='';
  document.getElementById('posResultados').innerHTML='';
  document.getElementById('posCant').value = 1;
  renderSeleccion();
  const c = document.getElementById('posCant'); if(c) c.focus();
}

function renderSeleccion(){
  const box = document.getElementById('posSel');
  if(!SEL){ box.innerHTML = `<div class="sel-empty">Busca un producto para empezar</div>`; return; }
  const p = SEL, precio = precioDe(p, CART.tipoCliente);
  const cant = Math.max(1, parseFloat(document.getElementById('posCant').value)||1);
  const st = stockStatus(p);
  const alerta = p.tipo==='servicio' ? ''
    : (st==='out' ? `<div class="warn-line bad">Sin stock en sistema. Puedes venderlo igual, pero quedará en negativo.</div>`
    : (st==='low' ? `<div class="warn-line warn">Quedan ${un(p.stock)} ${esc(p.unidad)} · conviene reponer</div>` : ''));
  box.innerHTML = `
    <div class="sel-top"><div><div class="sel-n">${esc(p.nombre)}</div>
      <div class="sel-c">${esc(p.cat)} · se vende por ${esc(p.unidad)} · cód. ${esc(p.sku)}</div></div>
      <button class="btn sm ghost" onclick="SEL=null;renderSeleccion()">Quitar ✕</button></div>
    <div class="sel-price"><span class="sel-pl">Precio ${CART.tipoCliente==='mayorista'?'de lista':'al público'}</span>
      <span class="sel-pv num">${money(precio)}</span><span class="sel-pu">por ${esc(p.unidad)}</span></div>
    ${alerta}
    <div class="sel-sub">${un(cant)} × ${money(precio)} = <b class="num">${money(cant*precio)}</b></div>`;
}

function agregar(){
  if(!SEL){ toast('Primero busca un producto','bad'); return; }
  const cant = Math.max(0, parseFloat(document.getElementById('posCant').value)||0);
  if(!(cant>0)){ toast('Escribe la cantidad','bad'); return; }
  const precio = precioDe(SEL, CART.tipoCliente);
  const ya = CART.items.find(i=>i.sku===SEL.sku);
  if(ya) ya.cant += cant;
  else CART.items.push({ sku:SEL.sku, nombre:SEL.nombre, cat:SEL.cat, unidad:SEL.unidad, tipo:SEL.tipo, cant, precio });
  SEL = null;
  document.getElementById('posCant').value = 1;
  renderSeleccion(); renderCarrito();
  document.getElementById('posBuscar').focus();
}
function quitarItem(i){ CART.items.splice(i,1); renderCarrito(); }
function cambiarCant(i, v){ const n=Math.max(0,parseFloat(v)||0); if(!n){ quitarItem(i); return; } CART.items[i].cant=n; renderCarrito(); }
function vaciar(){ if(!CART.items.length) return; CART = Object.assign(nuevoCarrito(), {cliente:CART.cliente, doc:CART.doc, tipoCliente:CART.tipoCliente}); renderPos(); }

function setTipoCli(t){
  CART.tipoCliente = t;
  CART.items.forEach(i=>{ const p=BY_SKU[i.sku]; if(p) i.precio = precioDe(p,t); });   // el precio se recalcula solo
  CART.autorizado = false;
  renderPos();
}
function onCliente(){
  CART.cliente = document.getElementById('posCliente').value;
  const c = CLIENTES_DEMO.find(x=>cliKey(x[0])===cliKey(CART.cliente));
  if(c){ document.getElementById('posDoc').value = c[1]; CART.doc = c[1];
         if(c[2]!==CART.tipoCliente){ setTipoCli(c[2]); return; } }
  renderPos();
}
function setDesc(v){
  CART.desc = Math.min(100, Math.max(0, parseFloat(v)||0));
  CART.autorizado = false;
  renderCarrito();
}
function autorizar(){ CART.autorizado = true; renderCarrito(); toast('Descuento autorizado por el dueño','good'); }
function setPago(m){ CART.pago = m; renderCarrito(); }
function setRecibido(v){ CART.recibido = Math.max(0, parseFloat(v)||0); renderVuelto(); }

function totalesCart(){
  const bruto = CART.items.reduce((s,i)=>s+i.cant*i.precio,0);
  const descS = Math.round(bruto*(CART.desc/100)*100)/100;
  return { bruto, descS, total: Math.round((bruto-descS)*100)/100 };
}

function renderCarrito(){
  const t = totalesCart();
  const tb = document.getElementById('cartBody');
  tb.innerHTML = CART.items.length ? CART.items.map((i,ix)=>
    `<tr><td>${esc(i.nombre)}<div class="dim" style="font-size:11px">${money(i.precio)} / ${esc(i.unidad)}</div></td>
     <td><input type="number" min="0" step="1" value="${i.cant}" onchange="cambiarCant(${ix},this.value)" style="width:72px"></td>
     <td class="num"><b>${money(i.cant*i.precio)}</b></td>
     <td><button class="icon-btn" title="Quitar" onclick="quitarItem(${ix})">🗑</button></td></tr>`
  ).join('') : `<tr><td colspan="4" class="dim" style="text-align:center;padding:18px">El carrito está vacío</td></tr>`;

  const est = estadoDesc(CART.desc, CART.tipoCliente), tope = topeDesc(CART.tipoCliente);
  const bloqueado = est==='autorizar' && !CART.autorizado;
  document.getElementById('descHint').innerHTML =
    !CART.desc ? `<span class="dim">Hasta ${tope}% sin autorización</span>`
    : (est==='autorizar'
        ? (CART.autorizado
            ? `<span class="pill good">Autorizado por el dueño</span>`
            : `<span class="pill bad">Pasa del ${tope}% permitido</span> <button class="btn sm" onclick="autorizar()">El dueño autoriza</button>`)
        : (est==='limite' ? `<span class="pill warn">En el límite (${tope}%)</span>` : `<span class="pill good">Dentro de lo permitido</span>`));

  document.getElementById('cartBruto').textContent = money(t.bruto);
  document.getElementById('cartDescRow').classList.toggle('hidden', !CART.desc);
  document.getElementById('cartDesc').textContent = '− '+money(t.descS);
  document.getElementById('cartTotal').textContent = money(t.total);

  document.querySelectorAll('#pagoBtns .pay').forEach(b=>b.classList.toggle('active', b.dataset.m===CART.pago));
  document.getElementById('efectivoBox').classList.toggle('hidden', CART.pago!=='efectivo');
  renderVuelto();

  const btn = document.getElementById('btnCobrar');
  btn.disabled = !CART.items.length || bloqueado;
  btn.textContent = CART.pago==='credito' ? `Anotar al fiado · ${money(t.total)}` : `Cobrar · ${money(t.total)}`;
}
function renderVuelto(){
  const t = totalesCart(), v = CART.recibido - t.total;
  const box = document.getElementById('vueltoBox');
  if(CART.pago!=='efectivo' || !CART.recibido){ box.innerHTML=''; return; }
  box.innerHTML = v>=0
    ? `<div class="vuelto"><span>Vuelto</span><b class="num">${money(v)}</b></div>`
    : `<div class="vuelto falta"><span>Falta</span><b class="num">${money(-v)}</b></div>`;
}

function cobrar(){
  if(!CART.items.length) return;
  const t = totalesCart();
  if(estadoDesc(CART.desc, CART.tipoCliente)==='autorizar' && !CART.autorizado){
    toast('Ese descuento necesita autorización del dueño','bad'); return;
  }
  if(CART.pago==='efectivo' && CART.recibido && CART.recibido < t.total){
    toast('El efectivo recibido no alcanza','bad'); return;
  }
  if(CART.pago==='credito' && cliKey(CART.cliente)===cliKey('Público general')){
    toast('Para fiar necesitas el nombre del cliente','bad'); return;
  }
  SEQ++; saveSeq();
  const ts = Date.now();
  const nuevas = CART.items.map((i,ix)=>{
    const p = BY_SKU[i.sku];
    return mkVenta({ id:'v'+ts+'-'+ix, ticket:SEQ, ts, prod:Object.assign({},p,{costo:p.costo}), cant:i.cant,
      precio: Math.round(i.precio*(1-CART.desc/100)*100)/100, cliente:CART.cliente,
      tipoCliente:CART.tipoCliente, pago:CART.pago, desc:CART.desc, cajero:'Milagros' });
  });
  VENTAS = VENTAS.concat(nuevas);
  // descontar stock (los servicios no tienen)
  CART.items.forEach(i=>{ const p=BY_SKU[i.sku]; if(p && p.tipo!=='servicio' && p.track) p.stock = Math.round((p.stock - i.cant)*100)/100; });
  saveVentas(); saveCat();
  ultimoTicket = { nro:SEQ, ts, items:CART.items.slice(), cliente:CART.cliente, doc:CART.doc,
                   tipoCliente:CART.tipoCliente, pago:CART.pago, desc:CART.desc, ...t,
                   recibido:CART.recibido, vuelto: CART.pago==='efectivo'&&CART.recibido ? CART.recibido-t.total : 0 };
  const cli = CART.cliente, doc = CART.doc, tc = CART.tipoCliente;
  CART = Object.assign(nuevoCarrito(), {cliente:cli, doc, tipoCliente:tc});
  renderPos();
  mostrarTicket();
  toast('Venta registrada · ticket '+SEQ,'good');
}

/* ===== ticket ===== */
function mostrarTicket(){
  const t = ultimoTicket; if(!t) return;
  const n = CFG.negocio;
  const metodo = (METODOS.find(m=>m[0]===t.pago)||['','—'])[1];
  document.getElementById('ticketBox').innerHTML = `
    <div class="tk">
      <div class="tk-h">${esc(n.nombre)}</div>
      <div class="tk-s">RUC ${esc(n.ruc)}<br>${esc(n.dir)}<br>Tel. ${esc(n.tel)}</div>
      <div class="tk-sep"></div>
      <div class="tk-r"><span>Ticket N°</span><b>${t.nro}</b></div>
      <div class="tk-r"><span>Fecha</span><span>${ddmm(t.ts)}/${new Date(t.ts).getFullYear()} ${hhmm(t.ts)}</span></div>
      <div class="tk-r"><span>Cliente</span><span>${esc(t.cliente)}</span></div>
      ${t.doc?`<div class="tk-r"><span>RUC/DNI</span><span>${esc(t.doc)}</span></div>`:''}
      <div class="tk-r"><span>Lista</span><span>${t.tipoCliente==='mayorista'?'Mayorista':'Público'}</span></div>
      <div class="tk-sep"></div>
      <table class="tk-t"><tbody>${t.items.map(i=>`<tr>
        <td>${esc(i.nombre)}<br><span class="tk-d">${un(i.cant)} ${esc(i.unidad)} × ${money(i.precio)}</span></td>
        <td class="num">${money(i.cant*i.precio)}</td></tr>`).join('')}</tbody></table>
      <div class="tk-sep"></div>
      <div class="tk-r"><span>Subtotal</span><span class="num">${money(t.bruto)}</span></div>
      ${t.desc?`<div class="tk-r"><span>Descuento ${t.desc}%</span><span class="num">− ${money(t.descS)}</span></div>`:''}
      <div class="tk-r tk-tot"><span>TOTAL</span><span class="num">${money(t.total)}</span></div>
      <div class="tk-r"><span>Forma de pago</span><span>${esc(metodo)}</span></div>
      ${t.pago==='efectivo'&&t.recibido?`<div class="tk-r"><span>Recibí</span><span class="num">${money(t.recibido)}</span></div>
      <div class="tk-r"><span>Vuelto</span><span class="num">${money(t.vuelto)}</span></div>`:''}
      ${t.pago==='credito'?`<div class="tk-fi">PENDIENTE DE PAGO</div>`:''}
      <div class="tk-sep"></div>
      <div class="tk-f">${esc(n.banco)} ${esc(n.cuenta)}<br>Yape ${esc(n.yape)}<br><br>¡Gracias por su compra!</div>
    </div>`;
  document.getElementById('ticketModal').classList.remove('hidden');
}
function cerrarTicket(){ document.getElementById('ticketModal').classList.add('hidden'); }
function imprimirTicket(){ window.print(); }

/* =========================================================================
   PANEL DEL DUEÑO
   ========================================================================= */
function semanasPresentes(){ return [...new Set(VENTAS.map(v=>weekStart(v.ts)))].sort((a,b)=>b-a); }
function ventasFiltradas(){
  if(panelSemana==='all'||panelSemana==null) return VENTAS;
  return VENTAS.filter(v=>weekStart(v.ts)===panelSemana);
}

function renderPanel(){
  const semanas = semanasPresentes();
  if(panelSemana===null) panelSemana = semanas.length?semanas[0]:'all';
  const sel = document.getElementById('semSel');
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

  document.getElementById('panelSub').textContent =
    (panelSemana==='all'?'Histórico completo':'Semana '+weekLabel(panelSemana))+` · ${tickets} tickets · ${all.length} líneas`;
  document.getElementById('panelKpis').innerHTML = [
    {kl:'Venta', kv:kf(venta)},
    {kl:'Utilidad', kv:kf(util), c:'good'},
    {kl:'Margen', kv:mg.toFixed(1)+'%'},
    {kl:'Tickets', kv:tickets},
    {kl:'Ticket prom.', kv:money0(tickets?venta/tickets:0)},
    {kl:'Bajo piso', kv:bajos, c:bajos?'warn':''},
    {kl:'Stock bajo', kv:lowStock, c:lowStock?'warn':'', click:"abrirInventario('low')"},
    {kl:'Por pedir', kv:porPedir, c:porPedir?'warn':'', click:"abrirInventario('repo')"},
    {kl:'Por cobrar', kv:kf(porCobrar), c:porCobrar>0?'warn':'', click:'abrirCreditos()'},
  ].map(k=>`<div class="kpi"${k.click?` style="cursor:pointer" onclick="${k.click}" title="Ver detalle"`:''}>
      <div class="kl">${k.kl}</div><div class="kv ${k.c||''} num">${k.kv}</div></div>`).join('');

  renderCaja();
  renderCategorias(all);
  renderTop(all);
  renderDias();
  renderInsight(all, {venta, util, mg, bajos, porPedir, porCobrar});
  renderTickets(all);
}

function renderCaja(){
  const hoy = dayStart(Date.now());
  const dias = [...new Set(VENTAS.map(v=>dayStart(v.ts)))].sort((a,b)=>b-a);
  if(panelDia===null) panelDia = dias.includes(hoy) ? hoy : (dias[0]||hoy);
  const sel = document.getElementById('cajaSel');
  sel.innerHTML = dias.slice(0,60).map(d=>`<option value="${d}">${fullDay(d)}${d===hoy?' (hoy)':''}</option>`).join('');
  sel.value = String(panelDia);
  const c = cajaDe(panelDia);
  document.getElementById('cajaBody').innerHTML = METODOS.map(([k,lbl,ic])=>{
    const m = c.porMetodo[k]||0;
    return `<div class="pay-row"><span class="pay-i">${ic}</span><span class="pay-l">${lbl}</span>
      <span class="pay-v num ${k==='credito'&&m>0?'warn':''}">${money(m)}</span></div>`;
  }).join('') + `<div class="pay-row tot"><span class="pay-i"></span><span class="pay-l">Efectivo que debe haber en caja</span>
      <span class="pay-v num">${money(c.porMetodo.efectivo||0)}</span></div>`;
  document.getElementById('cajaSub').textContent = `${c.tickets} tickets · ${money(c.total)} vendido · ${money(c.cobrado)} cobrado`;
}
function onCajaDia(v){ panelDia = Number(v); renderCaja(); }

function renderCategorias(all){
  const by = {};
  all.forEach(v=>{ (by[v.cat]=by[v.cat]||{venta:0,util:0}); by[v.cat].venta+=v.venta; by[v.cat].util+=v.util; });
  const cats = Object.entries(by).map(([n,d])=>({n, venta:d.venta, mg:d.venta?d.util/d.venta*100:0})).sort((a,b)=>b.mg-a.mg);
  const mx = Math.max(1,...cats.map(c=>c.mg));
  document.getElementById('panelCat').innerHTML = cats.map(c=>{
    const cls = c.mg>=35?'good':(c.mg>=20?'warn':'bad');
    return `<div class="bar-row"><span class="bar-l" title="${esc(c.n)}">${esc(c.n)}</span>
      <span class="bar-t"><span class="bar-f ${cls}" style="width:${Math.max(6,c.mg/mx*100)}%"></span></span>
      <span class="bar-v num" title="${money(c.venta)} vendidos">${c.mg.toFixed(1)}%</span></div>`;
  }).join('') || vacio();
}
function setTop(m){ topMetric=m;
  document.getElementById('topByV').classList.toggle('active', m==='venta');
  document.getElementById('topByC').classList.toggle('active', m==='cant');
  renderTop(ventasFiltradas()); }
function renderTop(all){
  const by = {};
  all.forEach(v=>{ (by[v.producto]=by[v.producto]||{venta:0,cant:0,unidad:v.unidad}); by[v.producto].venta+=v.venta; by[v.producto].cant+=v.cant; });
  const arr = Object.entries(by).map(([n,d])=>({n,...d})).sort((a,b)=>b[topMetric]-a[topMetric]).slice(0,8);
  const mx = Math.max(1,...arr.map(x=>x[topMetric]));
  document.getElementById('panelTop').innerHTML = arr.map(x=>
    `<div class="bar-row"><span class="bar-l" title="${esc(x.n)}">${esc(x.n)}</span>
     <span class="bar-t"><span class="bar-f" style="width:${Math.max(6,x[topMetric]/mx*100)}%"></span></span>
     <span class="bar-v num">${topMetric==='cant'? un(x.cant)+' '+esc(x.unidad) : kf(x.venta)}</span></div>`
  ).join('') || vacio();
}
function renderDias(){
  const ws = (panelSemana==='all'||panelSemana==null) ? weekStart(Date.now()) : panelSemana;
  document.getElementById('diaLbl').textContent = 'Semana '+weekLabel(ws);
  const tot = new Array(7).fill(0);
  VENTAS.forEach(v=>{ if(weekStart(v.ts)===ws) tot[(new Date(v.ts).getDay()+6)%7] += v.venta; });
  const mx = Math.max(1,...tot);
  const hoyIdx = weekStart(Date.now())===ws ? (new Date().getDay()+6)%7 : -1;
  document.getElementById('panelDias').innerHTML = tot.map((t,i)=>
    `<div class="daycol ${i===hoyIdx?'today':''}"><span class="dv">${t?kf(t):''}</span>`+
    `<span class="db" style="height:${t?Math.max(4,t/mx*100):0}%"></span><span class="dl">${DIAS[i]}</span></div>`).join('');
}
function renderInsight(all, k){
  const box = document.getElementById('panelInsight');
  if(!all.length){ box.innerHTML = `<span class="i">!</span><div>No hay ventas en este periodo.</div>`; return; }
  const rows = repoRows();
  const urgentes = rows.filter(r=>repoNivel(r)==='urgente').sort((a,b)=>b.demSem-a.demSem);
  const durm = dormidosOf(rows), capital = durm.reduce((s,r)=>s+r.capital,0);
  const by={};
  all.forEach(v=>{ (by[v.cat]=by[v.cat]||{venta:0,util:0}); by[v.cat].venta+=v.venta; by[v.cat].util+=v.util; });
  const cats = Object.entries(by).map(([n,d])=>({n,mg:d.venta?d.util/d.venta*100:0,venta:d.venta}));
  const mejor = cats.slice().sort((a,b)=>b.mg-a.mg)[0], peor = cats.slice().sort((a,b)=>a.mg-b.mg)[0];
  const partes = [];
  partes.push(`Vendiste <b>${money0(k.venta)}</b> con <b>${k.mg.toFixed(1)}%</b> de margen.`);
  if(mejor && peor && mejor.n!==peor.n) partes.push(`<b>${esc(mejor.n)}</b> es lo que más deja (${mejor.mg.toFixed(0)}%) y <b>${esc(peor.n)}</b> lo que menos (${peor.mg.toFixed(0)}%).`);
  if(urgentes.length) partes.push(`<b>${urgentes.length} productos</b> se agotan antes de que llegue el próximo pedido, empezando por <b>${esc(urgentes[0].nombre)}</b>.`);
  if(capital>0) partes.push(`Tienes <b>${money0(capital)}</b> dormidos en ${durm.length} productos que no rotan.`);
  if(k.porCobrar>0) partes.push(`Te deben <b>${money0(k.porCobrar)}</b>.`);
  box.innerHTML = `<span class="i">!</span><div>${partes.join(' ')}</div>`;
}
function renderTickets(all){
  const porTicket = {};
  all.forEach(v=>{ const t = porTicket[v.ticket] = porTicket[v.ticket] || {nro:v.ticket, ts:v.ts, cliente:v.cliente, pago:v.pago, desc:v.desc, venta:0, util:0, n:0};
    t.venta+=v.venta; t.util+=v.util; t.n++; });
  const arr = Object.values(porTicket).sort((a,b)=>b.ts-a.ts).slice(0,200);
  document.getElementById('ticketCount').textContent = Object.keys(porTicket).length+' tickets';
  document.getElementById('ticketsBody').innerHTML = arr.map(t=>{
    const mg = t.venta?t.util/t.venta*100:0;
    const cls = mg<CFG.pisoMargen*100 ? 'bad' : (mg<25?'warn':'good');
    const met = (METODOS.find(m=>m[0]===t.pago)||['','—'])[1];
    return `<tr><td>${ddmm(t.ts)} ${hhmm(t.ts)}</td><td><b>${t.nro}</b></td><td>${esc(t.cliente)}</td>
      <td>${esc(met)}${t.desc?` <span class="pill warn" style="font-size:10px;padding:1px 6px">−${t.desc}%</span>`:''}</td>
      <td class="num">${t.n}</td><td class="num">${money(t.venta)}</td>
      <td><span class="pill ${cls}">${mg.toFixed(1)}%</span></td></tr>`;
  }).join('') || `<tr><td colspan="7" class="dim" style="text-align:center;padding:20px">Sin ventas en este periodo.</td></tr>`;
}
function onSemana(v){ panelSemana = v==='all'?'all':Number(v); renderPanel(); }
function vacio(){ return `<div class="dim" style="font-size:13px;padding:8px 0">Sin datos todavía.</div>`; }

/* ===== exportar ===== */
function exportarCSV(){
  const rows = ventasFiltradas();
  if(!rows.length){ toast('No hay ventas para exportar','bad'); return; }
  const head = ['Fecha','Hora','Ticket','Cliente','Lista','Pago','Desc %','Código','Producto','Categoría','Unidad','Cantidad','Precio','Venta','Costo unit.','Costo total','Utilidad','Margen %'];
  const lines = [head.join(';')];
  rows.slice().sort((a,b)=>a.ts-b.ts).forEach(v=>lines.push([
    ddmm(v.ts), hhmm(v.ts), v.ticket, v.cliente, v.tipoCliente==='mayorista'?'Mayorista':'Público',
    (METODOS.find(m=>m[0]===v.pago)||['',''])[1], v.desc||0, v.sku, v.producto, v.cat, v.unidad,
    un(v.cant), dec2(v.precio), dec2(v.venta), dec2(v.costo), dec2(v.costoT), dec2(v.util),
    (v.margen*100).toFixed(1).replace('.',',')
  ].map(csvCell).join(';')));
  bajar('﻿'+lines.join('\r\n'), 'FerreteriaSantaRosa_ventas.csv');
  toast('Exportado ✓','good');
}
function csvCell(x){ x=String(x); return /[";\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x; }
function bajar(txt, nombre){
  const blob = new Blob([txt],{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href=url; a.download=nombre; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1500);
}

/* ===== toast ===== */
let toastT;
function toast(msg, kind, action){
  const t = document.getElementById('toast');
  t.innerHTML = esc(msg) + (action?` <span class="tundo">${esc(action.label)}</span>`:'');
  t.style.background = kind==='bad'?'var(--bad)':'var(--good)';
  if(action) t.querySelector('.tundo').onclick = ()=>{ action.fn(); t.classList.remove('show'); };
  t.classList.add('show'); clearTimeout(toastT);
  toastT = setTimeout(()=>t.classList.remove('show'), action?5000:2200);
}
