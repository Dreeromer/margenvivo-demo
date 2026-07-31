/* ===== estado de la interfaz ===== */
let ROL = null;                      // 'recepcion' | 'dueno'
let CART = nuevoCarrito();
let SEL = null;                      // producto elegido
let panelDia = null, panelSemana = null, invTab='exist', invFilter='track', repoFilter='pedir';
let topMetric='venta', credSel=null, ultimoTicket=null;
let cobroPaso = 'idle', cobroCodigo = '';

function nuevoCarrito(){
  return { clienteId:'', cliente:'', doc:'', tipoCliente:'publico', items:[], desc:0,
           autorizado:false, pago:'efectivo', recibido:0 };
}
const g = id => document.getElementById(id);

/* ===== arranque ===== */
function entrar(rol){ ROL = rol; cerrarCombos(); render(); }
function salir(){ ROL = null; CART = nuevoCarrito(); render(); }

function render(){
  ['gateView','posView','panelView'].forEach(id=>g(id).classList.add('hidden'));
  const right = g('topRight');
  if(!ROL){ g('gateView').classList.remove('hidden'); right.innerHTML=''; g('bizName').textContent=''; return; }
  g('bizName').textContent = CFG.negocio.nombre;
  right.innerHTML = ROL==='recepcion'
    ? `<span class="rolechip">Mostrador</span> Milagros <button class="btn sm ghost" onclick="salir()">Cambiar puesto</button>`
    : `<span class="rolechip own">Dueño</span> Don Aurelio <button class="btn sm ghost" onclick="salir()">Cambiar puesto</button>`;
  if(ROL==='recepcion'){ g('posView').classList.remove('hidden'); renderPos(); }
  else { g('panelView').classList.remove('hidden'); renderPanel(); }
}

/* =========================================================================
   COMBOBOX — lista desplegable con barra de desplazamiento y teclado.
   Se usa para cliente y para producto: misma mecánica, mismo aprendizaje.
   ========================================================================= */
const COMBO = { abierto:null, idx:-1, items:[] };
function cerrarCombos(){
  ['comboCli','comboProd'].forEach(id=>{ const e=g(id); if(e) e.innerHTML=''; });
  COMBO.abierto=null; COMBO.idx=-1; COMBO.items=[];
}
function comboNav(ev, cual){
  if(COMBO.abierto!==cual) return;
  const n = COMBO.items.length;
  if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){
    ev.preventDefault();
    if(!n) return;
    COMBO.idx = ev.key==='ArrowDown' ? (COMBO.idx+1)%n : (COMBO.idx-1+n)%n;
    pintarActivo(cual);
  } else if(ev.key==='Enter'){
    ev.preventDefault();
    if(!n) return;
    const i = COMBO.idx<0 ? 0 : COMBO.idx;
    COMBO.items[i].fn();
  } else if(ev.key==='Escape'){ cerrarCombos(); }
}
function pintarActivo(cual){
  const box = g(cual==='cli'?'comboCli':'comboProd'); if(!box) return;
  [...box.querySelectorAll('.opt')].forEach((el,i)=>{
    el.classList.toggle('on', i===COMBO.idx);
    if(i===COMBO.idx) el.scrollIntoView({block:'nearest'});
  });
}
// Pinta una lista y registra qué hace cada opción al elegirse.
function pintarCombo(cual, opciones, vacio){
  const box = g(cual==='cli'?'comboCli':'comboProd');
  COMBO.abierto = cual; COMBO.idx = -1; COMBO.items = opciones;
  if(!opciones.length){ box.innerHTML = vacio ? `<div class="combo-list"><div class="combo-empty">${vacio}</div></div>` : ''; return; }
  box.innerHTML = `<div class="combo-list" role="listbox">`+opciones.map((o,i)=>
    `<button class="opt ${o.nuevo?'new':''}" role="option" onmousedown="event.preventDefault()" onclick="comboElegir('${cual}',${i})">
       <span class="opt-n">${o.titulo}${o.sub?`<small>${o.sub}</small>`:''}</span>
       ${o.der?`<span class="opt-r">${o.der}</span>`:''}</button>`).join('')+`</div>`;
}
function comboElegir(cual, i){ const o=COMBO.items[i]; if(o) o.fn(); }

/* =========================================================================
   MOSTRADOR
   ========================================================================= */
function renderPos(){
  g('posCliente').value = CART.cliente;
  g('posDoc').value = CART.doc;
  document.querySelectorAll('#listaTipo .seg-b').forEach(b=>b.classList.toggle('active', b.dataset.t===CART.tipoCliente));
  const saldo = CART.clienteId ? saldoOf(CART.clienteId) : 0;
  g('cliHint').innerHTML = !CART.cliente
    ? `<span class="dim">Sin nombre se cobra como público de paso. Para fiar hace falta registrarlo.</span>`
    : (saldo>0.005
        ? `<span class="pill warn">Debe ${money(saldo)}</span> <button class="btn sm" onclick="abrirAbono('${CART.clienteId}')">Registrar abono</button>`
        : `<span class="pill good">Cliente registrado</span>`);
  renderPick();
  renderCarrito();
}

/* ── cliente ── */
function buscarCliente(){
  const q = g('posCliente').value.trim();
  CART.cliente = q; CART.clienteId = '';
  const hits = buscarClientes(q, 20);
  const ops = hits.map(c=>({
    titulo: esc(c.nombre),
    sub: (c.doc? (c.doc.length>8?'RUC ':'DNI ')+esc(c.doc) : 'sin documento') + (c.tel?' · '+esc(c.tel):''),
    der: `<span class="pill ${c.tipo==='mayorista'?'warn':'flat'}" style="font-size:10px">${c.tipo==='mayorista'?'mayorista':'público'}</span>`,
    fn: ()=>tomarCliente(c.id)
  }));
  if(q.length>2 && !clientePorNombre(q))
    ops.push({ titulo:`＋ Registrar «${esc(q)}» como cliente nuevo`, fn:()=>abrirAltaCliente(q,'') , nuevo:true });
  pintarCombo('cli', ops, q ? 'Nadie con ese nombre. Escribe al menos 3 letras para registrarlo.' : '');
}
function tomarCliente(id){
  const c = clientePorId(id); if(!c) return;
  CART.clienteId = c.id; CART.cliente = c.nombre; CART.doc = c.doc;
  if(c.tipo !== CART.tipoCliente) setListaPrecios(c.tipo, true);
  cerrarCombos(); renderPos();
  g('posBuscar').focus();
}
// Enter en el campo de documento: busca al cliente por su número.
function docEnter(ev){
  if(ev.key!=='Enter') return;
  ev.preventDefault();
  const d = g('posDoc').value.trim();
  CART.doc = d;
  if(!d) return;
  const c = clientePorDoc(d);
  if(c){ tomarCliente(c.id); toast('Cliente: '+c.nombre,'good'); return; }
  abrirAltaCliente('', d);
}
function setListaPrecios(t, callado){
  CART.tipoCliente = t;
  CART.items.forEach(i=>{ const p=BY_SKU[i.sku]; if(p) i.precio = precioDe(p,t); });
  CART.autorizado = false;
  if(!callado){ renderPos(); }
}
function cambiarLista(t){ setListaPrecios(t); }

/* ── alta rápida de cliente ── */
function abrirAltaCliente(nombre, doc){
  cerrarCombos();
  g('nc_nombre').value = nombre||'';
  g('nc_doc').value = doc||'';
  g('nc_tel').value = '';
  g('nc_tipo').value = CART.tipoCliente;
  g('altaModal').classList.remove('hidden');
  setTimeout(()=>g(nombre?'nc_doc':'nc_nombre').focus(), 40);
}
function cerrarAlta(){ g('altaModal').classList.add('hidden'); }
function guardarCliente(){
  const nombre = g('nc_nombre').value.trim();
  if(!nombre){ toast('Escribe el nombre del cliente','bad'); return; }
  const doc = g('nc_doc').value.trim();
  const otro = doc ? clientePorDoc(doc) : null;
  if(otro && cliKey(otro.nombre)!==cliKey(nombre)){
    toast(`Ese documento ya es de ${otro.nombre}`,'bad'); return;
  }
  const c = altaCliente({ nombre, doc, tipo:g('nc_tipo').value, tel:g('nc_tel').value });
  cerrarAlta();
  tomarCliente(c.id);
  toast('Cliente registrado: '+c.nombre,'good');
}

/* ── producto ── */
function buscarProducto(){
  const q = g('posBuscar').value.trim().toUpperCase();
  if(!q){ cerrarCombos(); return; }
  const hits = PRODUCTS.filter(p=>p.nombre.includes(q)||p.cat.includes(q)||p.sku.includes(q)).slice(0,25);
  const ops = hits.map(p=>{
    const st = p.tipo==='servicio' ? '<small class="dim">servicio</small>'
      : (p.stock<=0 ? '<small class="txt-bad">agotado</small>'
      : (p.stock<=p.stock_min ? `<small class="txt-warn">quedan ${un(p.stock)}</small>`
      : `<small class="dim">${un(p.stock)} ${esc(p.unidad)}</small>`));
    return { titulo: esc(p.nombre), sub: esc(p.cat)+' · por '+esc(p.unidad)+' · '+esc(p.sku),
             der: `<span class="num">${money(precioDe(p,CART.tipoCliente))}</span>${st}`,
             fn: ()=>elegir(p.sku) };
  });
  pintarCombo('prod', ops, `Nada con «${esc(q)}»`);
}
function elegir(sku){
  SEL = BY_SKU[sku] || null;
  g('posBuscar').value=''; cerrarCombos();
  g('posCant').value = 1;
  renderPick();
  setTimeout(()=>{ const c=g('posCant'); if(c){ c.focus(); c.select(); } }, 30);
}
function cantEnter(ev){ if(ev.key==='Enter'){ ev.preventDefault(); agregar(); } }

function renderPick(){
  const box = g('posPick');
  if(!SEL){ box.innerHTML = `<div class="pick-empty">Busca un producto y su precio aparece aquí</div>`; return; }
  const p = SEL, precio = precioDe(p, CART.tipoCliente);
  const cant = Math.max(0, parseFloat(g('posCant')?g('posCant').value:1)||0);
  const st = stockStatus(p);
  const nota = p.tipo==='servicio' ? ''
    : (st==='out' ? `<div class="note bad"><span>⚠</span><span>Sin stock en el sistema. Se puede vender igual, pero el inventario queda en negativo.</span></div>`
    : (st==='low' ? `<div class="note warn"><span>⚠</span><span>Quedan ${un(p.stock)} ${esc(p.unidad)}. Conviene reponer.</span></div>` : ''));
  box.innerHTML = `<div class="pick">
    <div class="pick-top">
      <div style="flex:1;min-width:0"><div class="pick-n">${esc(p.nombre)}</div>
        <div class="pick-c">${esc(p.cat)} · se vende por ${esc(p.unidad)} · código ${esc(p.sku)}</div></div>
      <button class="icon-btn" title="Quitar" onclick="SEL=null;renderPick()">✕</button></div>
    <div class="readout">
      <div class="rl">Precio ${CART.tipoCliente==='mayorista'?'de lista · mayorista':'al público'}</div>
      <div class="rv num">${money(precio)}</div>
      <div class="ru">por ${esc(p.unidad)}</div></div>
    ${nota}
    <div class="pick-calc"><span>${un(cant)} × ${money(precio)}</span><b class="num">${money(cant*precio)}</b></div>
  </div>`;
}

function agregar(){
  if(!SEL){ toast('Primero busca un producto','bad'); return; }
  const cant = Math.max(0, parseFloat(g('posCant').value)||0);
  if(!(cant>0)){ toast('Escribe la cantidad','bad'); return; }
  const precio = precioDe(SEL, CART.tipoCliente);
  const ya = CART.items.find(i=>i.sku===SEL.sku);
  if(ya) ya.cant += cant;
  else CART.items.push({ sku:SEL.sku, nombre:SEL.nombre, cat:SEL.cat, unidad:SEL.unidad, tipo:SEL.tipo, cant, precio });
  SEL = null; g('posCant').value = 1;
  renderPick(); renderCarrito();
  g('posBuscar').focus();
}
function quitarItem(i){ CART.items.splice(i,1); renderCarrito(); }
function cambiarCant(i,v){ const n=Math.max(0,parseFloat(v)||0); if(!n){ quitarItem(i); return; } CART.items[i].cant=n; renderCarrito(); }
function vaciar(){
  if(!CART.items.length) return;
  CART = Object.assign(nuevoCarrito(), {clienteId:CART.clienteId, cliente:CART.cliente, doc:CART.doc, tipoCliente:CART.tipoCliente});
  renderPos();
}
function setDesc(v){ CART.desc = Math.min(100, Math.max(0, parseFloat(v)||0)); CART.autorizado=false; renderCarrito(); }
function autorizar(){ CART.autorizado = true; renderCarrito(); toast('Descuento autorizado','good'); }
function setPago(m){ CART.pago = m; renderCarrito(); }

function totalesCart(){
  const bruto = CART.items.reduce((s,i)=>s+i.cant*i.precio,0);
  const descS = Math.round(bruto*(CART.desc/100)*100)/100;
  return { bruto, descS, total: Math.round((bruto-descS)*100)/100 };
}
function puedeCobrar(){
  if(!CART.items.length) return 'Agrega productos al ticket';
  if(estadoDesc(CART.desc, CART.tipoCliente)==='autorizar' && !CART.autorizado) return 'Falta que el dueño autorice el descuento';
  if(CART.pago==='credito' && !CART.clienteId) return 'Para fiar, elige un cliente registrado';
  return '';
}

function renderCarrito(){
  const t = totalesCart();
  g('cartBody').innerHTML = CART.items.length
    ? `<table><tbody>`+CART.items.map((i,ix)=>
      `<tr><td><div style="font-weight:600">${esc(i.nombre)}</div>
        <div class="sub2">${money(i.precio)} por ${esc(i.unidad)}</div></td>
       <td style="width:86px"><input type="number" min="0" step="1" value="${i.cant}" onchange="cambiarCant(${ix},this.value)"></td>
       <td class="num" style="font-weight:600">${money(i.cant*i.precio)}</td>
       <td style="width:34px"><button class="icon-btn" title="Quitar" onclick="quitarItem(${ix})">✕</button></td></tr>`
      ).join('')+`</tbody></table>`
    : `<div class="empty-tk">Sin productos todavía</div>`;

  const est = estadoDesc(CART.desc, CART.tipoCliente), tope = topeDesc(CART.tipoCliente);
  g('descHint').innerHTML =
    !CART.desc ? `<span class="dim">Puedes descontar hasta ${tope}% sin permiso</span>`
    : (est==='autorizar'
        ? (CART.autorizado ? `<span class="pill good">Autorizado</span>`
           : `<span class="pill bad">Pasa del ${tope}% permitido</span> <button class="btn sm" onclick="autorizar()">El dueño autoriza</button>`)
        : (est==='limite' ? `<span class="pill warn">Estás en el límite (${tope}%)</span>` : `<span class="pill good">Dentro de lo permitido</span>`));

  g('cartBruto').textContent = money(t.bruto);
  g('cartDescRow').classList.toggle('hidden', !CART.desc);
  g('cartDesc').textContent = '− '+money(t.descS);
  g('cartTotal').textContent = money(t.total);
  document.querySelectorAll('#pagos .pay').forEach(b=>b.classList.toggle('on', b.dataset.m===CART.pago));

  const falta = puedeCobrar();
  const btn = g('btnCobrar');
  btn.disabled = !!falta;
  btn.textContent = CART.pago==='credito' ? 'Anotar al fiado' : 'Cobrar '+money(t.total);
  g('cobrarHint').textContent = falta;
}

/* =========================================================================
   COBRO — cada forma de pago tiene su propio paso
   ========================================================================= */
function abrirCobro(){
  const falta = puedeCobrar();
  if(falta){ toast(falta,'bad'); return; }
  CART.recibido = 0; cobroPaso='idle'; cobroCodigo='';
  g('cobroModal').classList.remove('hidden');
  renderCobro();
  if(CART.pago==='tarjeta') enviarAlPos();
}
function cerrarCobro(){ g('cobroModal').classList.add('hidden'); cobroPaso='idle'; }

function renderCobro(){
  const t = totalesCart(), m = CART.pago;
  const nom = (METODOS.find(x=>x[0]===m)||['','—'])[1];
  g('cobroTitulo').textContent = m==='credito' ? 'Anotar al fiado' : 'Cobrar por '+nom.toLowerCase();
  g('cobroMonto').textContent = money(t.total);
  const box = g('cobroCuerpo');

  if(m==='efectivo'){
    const v = CART.recibido - t.total;
    const sug = [10,20,50,100,200].filter(x=>x>=t.total).slice(0,3);
    if(!sug.length) sug.push(Math.ceil(t.total/50)*50);
    box.innerHTML = `
      <label class="label">¿Con cuánto paga?</label>
      <input type="number" min="0" step="0.5" id="efeInput" value="${CART.recibido||''}" placeholder="0.00" oninput="setRecibido(this.value)" autofocus>
      <div class="bills">
        <button class="bill" onclick="setRecibido(${t.total})">Justo</button>
        ${sug.map(x=>`<button class="bill" onclick="setRecibido(${x})">S/ ${x}</button>`).join('')}
      </div>
      ${CART.recibido ? `<div class="change ${v>=0?'ok':'no'}"><span>${v>=0?'Vuelto':'Falta'}</span><b class="num">${money(Math.abs(v))}</b></div>` : ''}`;
    g('cobroAccion').disabled = CART.recibido>0 && CART.recibido < t.total;
    g('cobroAccion').textContent = 'Confirmar cobro';
  }

  else if(m==='yape'){
    box.innerHTML = `
      <div class="yape">
        <div class="yl">Yape / Plin</div>
        <div class="yn">${esc(CFG.negocio.nombre)}</div>
        ${qrHTML(Math.round(t.total*100))}
        <div class="ym">Que escanee y pague<b class="num">${money(t.total)}</b></div>
      </div>
      <p class="sub" style="font-size:12.5px;text-align:center">Número: <b>${esc(CFG.negocio.yape)}</b></p>`;
    g('cobroAccion').disabled = false;
    g('cobroAccion').textContent = 'Ya me llegó el pago';
  }

  else if(m==='tarjeta'){
    const estados = {
      enviando:  ['Enviando al POS','—','Conectando con el terminal…'],
      esperando: ['Monto enviado', money(t.total), 'Que inserte o acerque la tarjeta'],
      leyendo:   ['Leyendo tarjeta', money(t.total), 'Procesando con el banco…'],
      aprobado:  ['Operación aprobada', money(t.total), 'Autorización '+cobroCodigo],
    };
    const e = estados[cobroPaso] || estados.enviando;
    box.innerHTML = `
      <div class="pos-term">
        <div class="pos-scr">
          <div class="pos-l1">${e[0]}</div>
          <div class="pos-l2 num">${e[1]}</div>
          <div class="pos-l3">${cobroPaso==='aprobado' ? e[2] : `${e[2]} <span class="pos-dots"><i></i><i></i><i></i></span>`}</div>
        </div>
        <div class="pos-keys"><div class="pos-key">1</div><div class="pos-key">2</div><div class="pos-key">3</div>
          <div class="pos-key">4</div><div class="pos-key">5</div><div class="pos-key">6</div>
          <div class="pos-key">7</div><div class="pos-key">8</div><div class="pos-key">9</div></div>
      </div>
      ${cobroPaso==='aprobado' ? `<p class="sub" style="font-size:12.5px;text-align:center">El banco aprobó la operación. Al confirmar, la venta entra al sistema.</p>` : ''}`;
    g('cobroAccion').disabled = cobroPaso!=='aprobado';
    g('cobroAccion').textContent = cobroPaso==='aprobado' ? 'Confirmar e imprimir' : 'Esperando al POS…';
  }

  else if(m==='transferencia'){
    const n = CFG.negocio;
    box.innerHTML = `
      <div class="sec"><div class="st">Dale estos datos</div>
        <div class="lrow"><span>Banco</span><b>${esc(n.banco)}</b></div>
        <div class="lrow"><span>Cuenta</span><b class="num">${esc(n.cuenta)}</b></div>
        <div class="lrow"><span>Titular</span><b>${esc(n.nombre)}</b></div>
        <div class="lrow"><span>Monto</span><b class="num">${money(t.total)}</b></div>
      </div>
      <p class="sub" style="font-size:12.5px">Verifica que el dinero haya entrado antes de confirmar.</p>`;
    g('cobroAccion').disabled = false;
    g('cobroAccion').textContent = 'Ya verifiqué la transferencia';
  }

  else if(m==='credito'){
    const c = clientePorId(CART.clienteId);
    const saldo = saldoOf(CART.clienteId);
    box.innerHTML = `
      <div class="sec"><div class="st">Se anota a</div>
        <div class="lrow"><span>Cliente</span><b>${esc(c?c.nombre:'—')}</b></div>
        <div class="lrow"><span>Documento</span><b class="num">${esc(c&&c.doc?c.doc:'—')}</b></div>
        <div class="lrow"><span>Debe hasta ahora</span><b class="num ${saldo>0?'txt-warn':''}">${money(saldo)}</b></div>
        <div class="lrow"><span>Quedará debiendo</span><b class="num txt-warn">${money(saldo+t.total)}</b></div>
      </div>
      <p class="sub" style="font-size:12.5px">Queda registrado a su nombre. Los abonos se anotan desde Fiados.</p>`;
    g('cobroAccion').disabled = false;
    g('cobroAccion').textContent = 'Anotar al fiado';
  }
}
function setRecibido(v){
  CART.recibido = Math.max(0, parseFloat(v)||0);
  renderCobro();
  const e = g('efeInput'); if(e && document.activeElement!==e) e.value = CART.recibido||'';
}
// Simula el diálogo con el terminal de tarjeta.
function enviarAlPos(){
  const secuencia = [['enviando',700],['esperando',1600],['leyendo',1500],['aprobado',0]];
  let i = 0;
  const paso = () => {
    if(g('cobroModal').classList.contains('hidden')) return;
    const [estado, espera] = secuencia[i];
    cobroPaso = estado;
    if(estado==='aprobado') cobroCodigo = String(100000+Math.floor(Math.random()*899999));
    renderCobro();
    if(++i < secuencia.length) setTimeout(paso, espera);
  };
  paso();
}
// QR ficticio: patrón determinista según el monto, con los tres ojos de posición.
function qrHTML(semilla){
  const n = 25, rnd = mulberry(semilla||1);
  const m = Array.from({length:n}, ()=>Array.from({length:n}, ()=>rnd()>0.52?1:0));
  const ojo = (ox,oy) => {
    for(let y=-1;y<8;y++) for(let x=-1;x<8;x++){
      const Y=oy+y, X=ox+x; if(Y<0||X<0||Y>=n||X>=n) continue;
      m[Y][X] = (y>=0&&y<7&&x>=0&&x<7) ? ((x===0||x===6||y===0||y===6)||(x>=2&&x<=4&&y>=2&&y<=4) ? 1 : 0) : 0;
    }
  };
  ojo(0,0); ojo(n-7,0); ojo(0,n-7);
  return `<div class="qr" style="grid-template-columns:repeat(${n},1fr);grid-template-rows:repeat(${n},1fr)" aria-label="Código QR de demostración">`
    + m.flat().map(v=>`<i${v?'':' style="background:transparent"'}></i>`).join('') + `</div>`;
}

function confirmarCobro(){
  const falta = puedeCobrar();
  if(falta){ toast(falta,'bad'); return; }
  const t = totalesCart();
  if(CART.pago==='efectivo' && CART.recibido && CART.recibido < t.total){ toast('El efectivo no alcanza','bad'); return; }
  SEQ++; saveSeq();
  const ts = Date.now();
  const nuevas = CART.items.map((i,ix)=>{
    const p = BY_SKU[i.sku];
    return mkVenta({ id:'v'+ts+'-'+ix, ticket:SEQ, ts, prod:p, cant:i.cant,
      precio: Math.round(i.precio*(1-CART.desc/100)*100)/100,
      cliente:CART.cliente, clienteId:CART.clienteId, clienteDoc:CART.doc,
      tipoCliente:CART.tipoCliente, pago:CART.pago, desc:CART.desc, cajero:'Milagros' });
  });
  VENTAS = VENTAS.concat(nuevas);
  CART.items.forEach(i=>{ const p=BY_SKU[i.sku]; if(p && p.tipo!=='servicio' && p.track) p.stock = Math.round((p.stock-i.cant)*100)/100; });
  saveVentas(); saveCat();
  ultimoTicket = { nro:SEQ, ts, items:CART.items.slice(), cliente:CART.cliente, doc:CART.doc,
    tipoCliente:CART.tipoCliente, pago:CART.pago, desc:CART.desc, bruto:t.bruto, descS:t.descS, total:t.total,
    recibido:CART.recibido, vuelto: CART.pago==='efectivo'&&CART.recibido ? CART.recibido-t.total : 0,
    autorizacion: CART.pago==='tarjeta' ? cobroCodigo : '' };
  const keep = {clienteId:CART.clienteId, cliente:CART.cliente, doc:CART.doc, tipoCliente:CART.tipoCliente};
  CART = Object.assign(nuevoCarrito(), keep);
  cerrarCobro(); renderPos(); mostrarSlip();
  toast('Ticket '+SEQ+' registrado','good');
}

/* ===== ticket impreso ===== */
function mostrarSlip(){
  const t = ultimoTicket; if(!t) return;
  const n = CFG.negocio;
  const metodo = (METODOS.find(m=>m[0]===t.pago)||['','—'])[1];
  g('slipBox').innerHTML = `<div class="slip">
    <div class="slip-h">${esc(n.nombre)}</div>
    <div class="slip-s">RUC ${esc(n.ruc)}<br>${esc(n.dir)}<br>Tel. ${esc(n.tel)}</div>
    <div class="slip-sep"></div>
    <div class="slip-r"><span>Ticket</span><b>N° ${t.nro}</b></div>
    <div class="slip-r"><span>Fecha</span><span>${ddmm(t.ts)}/${new Date(t.ts).getFullYear()} ${hhmm(t.ts)}</span></div>
    <div class="slip-r"><span>Cliente</span><span>${esc(t.cliente||'Público')}</span></div>
    ${t.doc?`<div class="slip-r"><span>DNI/RUC</span><span>${esc(t.doc)}</span></div>`:''}
    <div class="slip-r"><span>Lista</span><span>${t.tipoCliente==='mayorista'?'Mayorista':'Público'}</span></div>
    <div class="slip-sep"></div>
    <table><tbody>${t.items.map(i=>`<tr><td>${esc(i.nombre)}<br><span class="d">${un(i.cant)} ${esc(i.unidad)} × ${money(i.precio)}</span></td>
      <td>${money(i.cant*i.precio)}</td></tr>`).join('')}</tbody></table>
    <div class="slip-sep"></div>
    <div class="slip-r"><span>Subtotal</span><span>${money(t.bruto)}</span></div>
    ${t.desc?`<div class="slip-r"><span>Descuento ${t.desc}%</span><span>− ${money(t.descS)}</span></div>`:''}
    <div class="slip-r slip-t"><span>TOTAL</span><span>${money(t.total)}</span></div>
    <div class="slip-r"><span>Pago</span><span>${esc(metodo)}</span></div>
    ${t.autorizacion?`<div class="slip-r"><span>Autorización</span><span>${esc(t.autorizacion)}</span></div>`:''}
    ${t.pago==='efectivo'&&t.recibido?`<div class="slip-r"><span>Recibí</span><span>${money(t.recibido)}</span></div>
      <div class="slip-r"><span>Vuelto</span><span>${money(t.vuelto)}</span></div>`:''}
    ${t.pago==='credito'?`<div class="slip-fi">PENDIENTE DE PAGO</div>`:''}
    <div class="slip-sep"></div>
    <div class="slip-f">${esc(n.banco)} ${esc(n.cuenta)}<br>Yape ${esc(n.yape)}<br><br>¡Gracias por su compra!</div>
  </div>`;
  g('slipModal').classList.remove('hidden');
}
function cerrarSlip(){ g('slipModal').classList.add('hidden'); }
function imprimirSlip(){ window.print(); }

/* ===== toast ===== */
let toastT;
function toast(msg, kind, action){
  const t = g('toast');
  t.innerHTML = esc(msg) + (action?` <span class="tundo">${esc(action.label)}</span>`:'');
  t.classList.toggle('bad', kind==='bad');
  if(action) t.querySelector('.tundo').onclick = ()=>{ action.fn(); t.classList.remove('show'); };
  t.classList.add('show'); clearTimeout(toastT);
  toastT = setTimeout(()=>t.classList.remove('show'), action?5200:2400);
}
