/* =========================================================================
   INVENTARIO — Existencias · Reposición · Rotación
   ========================================================================= */
function abrirInventario(f){
  invTab = (f==='repo'||f==='rot') ? f : 'exist';
  invFilter = (f==='low') ? 'low' : 'track';
  document.getElementById('invBuscar').value='';
  document.getElementById('repoBuscar').value='';
  document.querySelectorAll('#invFiltros .seg-b').forEach(b=>b.classList.toggle('active',b.dataset.f===invFilter));
  setInvTab(invTab);
  document.getElementById('invModal').classList.remove('hidden');
}
function cerrarInventario(){ document.getElementById('invModal').classList.add('hidden'); if(ROL==='dueno') renderPanel(); }
function setInvTab(t){
  invTab = t;
  document.querySelectorAll('#invTabs .seg-b').forEach(b=>b.classList.toggle('active',b.dataset.t===t));
  [['exist','tabExist'],['repo','tabRepo'],['rot','tabRot']].forEach(([k,id])=>
    document.getElementById(id).classList.toggle('hidden', k!==t));
  if(t==='exist') renderExistencias(); else if(t==='repo') renderRepo(); else renderRotacion();
}
function setInvFiltro(f){ invFilter=f;
  document.querySelectorAll('#invFiltros .seg-b').forEach(b=>b.classList.toggle('active',b.dataset.f===f));
  renderExistencias(); }

function badgeStock(p){
  const s = stockStatus(p);
  if(s==='off') return '<span class="pill" style="background:var(--bg);color:var(--muted)">sin seguir</span>';
  if(s==='out') return '<span class="pill bad">agotado</span>';
  if(s==='low') return '<span class="pill warn">bajo</span>';
  return '<span class="pill good">ok</span>';
}
function renderExistencias(){
  const q = document.getElementById('invBuscar').value.trim().toUpperCase();
  let rows = PRODUCTS.filter(p=>p.tipo!=='servicio');
  if(invFilter==='track') rows = rows.filter(p=>p.track);
  else if(invFilter==='low') rows = rows.filter(p=>{const s=stockStatus(p);return s==='low'||s==='out';});
  if(q) rows = rows.filter(p=>p.nombre.includes(q)||p.cat.includes(q));
  document.querySelector('#tablaExist tbody').innerHTML = rows.map(p=>
    `<tr><td>${esc(p.nombre)}<div class="dim" style="font-size:11px">${esc(p.cat)} · ${esc(p.unidad)}</div></td>
     <td><input type="number" min="0" step="1" value="${p.stock}" style="width:78px" onchange="setStock('${p.sku}',this.value)"></td>
     <td><input type="number" min="0" step="1" value="${p.stock_min}" style="width:70px" onchange="setMin('${p.sku}',this.value)"></td>
     <td>${badgeStock(p)}</td>
     <td style="text-align:center"><input type="checkbox" ${p.track?'checked':''} style="width:auto" onchange="setTrack('${p.sku}',this.checked)"></td></tr>`
  ).join('') || `<tr><td colspan="5" class="dim" style="text-align:center;padding:16px">Sin resultados.</td></tr>`;
}
function setStock(sku,v){ const p=BY_SKU[sku]; if(!p)return; p.stock=Math.max(0,Math.round(parseFloat(v)||0)); p.track=true; saveCat(); renderExistencias(); }
function setMin(sku,v){ const p=BY_SKU[sku]; if(!p)return; p.stock_min=Math.max(0,Math.round(parseFloat(v)||0)); saveCat(); renderExistencias(); }
function setTrack(sku,c){ const p=BY_SKU[sku]; if(!p)return; p.track=!!c; saveCat(); renderExistencias(); }
function registrarEntrada(){
  const nom = document.getElementById('entProd').value.trim().toUpperCase();
  const cant = Math.round(parseFloat(document.getElementById('entCant').value)||0);
  const p = BY_NAME[nom];
  if(!p){ toast('Elige un producto de la lista','bad'); return; }
  if(p.tipo==='servicio'){ toast('Los servicios no tienen stock','bad'); return; }
  if(!(cant>0)){ toast('Escribe cuánto llegó','bad'); return; }
  p.stock += cant; p.track = true; saveCat();
  document.getElementById('entProd').value=''; document.getElementById('entCant').value='';
  renderExistencias();
  toast(`Entrada registrada: +${cant} ${p.nombre}`,'good');
}

function renderRepo(){
  const R = repoCfg(), rows = repoRows();
  const mueven = rows.filter(r=>r.demSem>0);
  const pedir = rows.filter(r=>r.pedir>0);
  const compra = pedir.reduce((s,r)=>s+r.pedir*r.costo,0);
  const urgentes = rows.filter(r=>repoNivel(r)==='urgente').length;
  const base = semanasBase();

  document.getElementById('repoNota').innerHTML =
    `Promedio medido sobre <b>${base} ${base===1?'semana':'semanas'}</b> con movimiento. Repone para <b>${R.cobertura} semanas</b> contando <b>${un(R.lead)}</b> de demora del proveedor. Se cambia en ⚙ Ajustes.`;
  document.getElementById('repoKpis').innerHTML = [
    {kl:'Hay que pedir', kv:pedir.length, c:pedir.length?'warn':''},
    {kl:'Compra sugerida', kv:kf(compra)},
    {kl:'Se agotan ya', kv:urgentes, c:urgentes?'bad':''},
    {kl:'Con movimiento', kv:mueven.length},
  ].map(k=>`<div class="kpi"><div class="kl">${k.kl}</div><div class="kv ${k.c||''} num">${k.kv}</div></div>`).join('');

  let list = repoFilter==='pedir'?pedir:(repoFilter==='mueve'?mueven:rows);
  const q = document.getElementById('repoBuscar').value.trim().toUpperCase();
  if(q) list = list.filter(r=>r.nombre.includes(q)||r.cat.includes(q));
  list = list.slice().sort(repoFilter==='pedir' ? (a,b)=>(b.pedir*b.costo)-(a.pedir*a.costo) : (a,b)=>b.demSem-a.demSem);

  document.querySelector('#tablaRepo tbody').innerHTML = list.slice(0,300).map(r=>{
    const nv = repoNivel(r), rt = ritmoOf(r);
    const alcanza = !r.track ? '<span class="dim">—</span>'
      : (r.demSem<=0 ? '<span class="dim">sin salida</span>'
      : `<span class="pill ${nv==='urgente'?'bad':(nv==='pronto'?'warn':'good')}">${r.cobertura===Infinity?'∞':un(r.cobertura)+' sem'}</span>`);
    const rtCls = rt==='constante'?'good':(rt==='irregular'?'warn':'');
    return `<tr><td>${esc(r.nombre)}<div class="dim" style="font-size:11px">${esc(r.cat)} · ${esc(r.unidad)}</div></td>
      <td class="num">${r.demSem>0?un(r.demSem):'<span class="dim">—</span>'}</td>
      <td>${r.demSem>0?`<span class="pill ${rtCls}" style="font-size:11px">${RITMO_LBL[rt]}</span>`:''}</td>
      <td class="num">${un(r.stock)}</td><td>${alcanza}</td>
      <td class="num">${r.minSug||'<span class="dim">—</span>'}</td>
      <td class="num">${r.pedir?`<b>${un(r.pedir)}</b><div class="dim" style="font-size:11px">${money0(r.pedir*r.costo)}</div>`:'<span class="dim">—</span>'}</td></tr>`;
  }).join('') || `<tr><td colspan="7" class="dim" style="text-align:center;padding:16px">${repoFilter==='pedir'?'Nada por pedir.':'Sin resultados.'}</td></tr>`;
}
function setRepoFiltro(f){ repoFilter=f;
  document.querySelectorAll('#repoFiltros .seg-b').forEach(b=>b.classList.toggle('active',b.dataset.f===f));
  renderRepo(); }
function aplicarMinimos(){
  const cambios = repoRows().filter(r=>r.minSug>0 && r.minSug!==r.stock_min);
  if(!cambios.length){ toast('Los mínimos ya están al día','good'); return; }
  cambios.forEach(r=>{ const p=BY_SKU[r.sku]; if(p) p.stock_min=r.minSug; });
  saveCat(); renderRepo(); renderExistencias();
  toast(`${cambios.length} productos ya tienen su mínimo calculado`,'good');
}
function exportarOrden(){
  const rows = repoRows().filter(r=>r.pedir>0).sort((a,b)=>(b.pedir*b.costo)-(a.pedir*a.costo));
  if(!rows.length){ toast('No hay nada por pedir','bad'); return; }
  const head = ['Producto','Categoría','Unidad','Sale por semana','Stock actual','Alcanza (sem)','Pedir','Costo unit.','Costo total'];
  const lines = [head.join(';')];
  rows.forEach(r=>lines.push([r.nombre,r.cat,r.unidad,dec2(r.demSem),r.stock,
    (r.cobertura===Infinity?'':dec2(r.cobertura)),r.pedir,dec2(r.costo),dec2(r.pedir*r.costo)].map(csvCell).join(';')));
  lines.push(['TOTAL','','','','','','','',dec2(rows.reduce((s,r)=>s+r.pedir*r.costo,0))].join(';'));
  bajar('﻿'+lines.join('\r\n'), 'FerreteriaSantaRosa_orden_de_compra.csv');
  toast('Orden de compra exportada ✓','good');
}

function renderRotacion(){
  const R = repoCfg(), rows = repoRows();
  const {rows:abc, total} = abcOf(rows);
  const mueven = rows.filter(r=>r.demSem>0);
  const durm = dormidosOf(rows), capital = durm.reduce((s,r)=>s+r.capital,0);
  const nA = abc.filter(r=>r.abc==='A').length;

  document.getElementById('rotKpis').innerHTML = [
    {kl:'Productos que rotan', kv:mueven.length},
    {kl:`Venta ${R.ventana} sem`, kv:kf(total)},
    {kl:'Productos A', kv:nA, c:'good'},
    {kl:'Capital dormido', kv:kf(capital), c:capital>0?'warn':''},
  ].map(k=>`<div class="kpi"><div class="kl">${k.kl}</div><div class="kv ${k.c||''} num">${k.kv}</div></div>`).join('');

  const g = {A:{n:0,v:0},B:{n:0,v:0},C:{n:0,v:0}};
  abc.forEach(r=>{ g[r.abc].n++; g[r.abc].v+=r.venta; });
  const LBL = {A:'A · lo vital', B:'B · lo intermedio', C:'C · la cola larga'}, CLS = {A:'good',B:'warn',C:'bad'};
  document.getElementById('rotAbc').innerHTML = ['A','B','C'].map(k=>{
    const share = total ? g[k].v/total*100 : 0;
    return `<div class="bar-row"><span class="bar-l">${LBL[k]}</span>
      <span class="bar-t"><span class="bar-f ${CLS[k]}" style="width:${Math.max(6,share)}%"></span></span>
      <span class="bar-v num">${g[k].n} prod · ${share.toFixed(0)}%</span></div>`;
  }).join('');

  const top = mueven.slice().sort((a,b)=>b.demSem-a.demSem).slice(0,10);
  const mx = Math.max(1,...top.map(r=>r.demSem));
  document.getElementById('rotTop').innerHTML = top.map(r=>
    `<div class="bar-row"><span class="bar-l" title="${esc(r.nombre)}">${esc(r.nombre)}</span>
     <span class="bar-t"><span class="bar-f" style="width:${Math.max(6,r.demSem/mx*100)}%"></span></span>
     <span class="bar-v num">${un(r.demSem)} ${esc(r.unidad)}/sem</span></div>`).join('') || vacio();

  const {q, mr, mm} = matrizOf(rows);
  const CUAD = [
    {k:'estrella', t:'★ Estrellas', d:'Rotan y dejan margen. Nunca deben faltar.', c:'var(--good)'},
    {k:'volumen',  t:'⟳ Volumen',   d:'Rotan pero dejan poco. Cuidado con el descuento: aquí se escapa la utilidad.', c:'var(--warn)'},
    {k:'joya',     t:'◆ Joyas dormidas', d:'Dejan buen margen pero casi no se venden. Vale la pena empujarlos.', c:'var(--primary)'},
    {k:'lastre',   t:'▼ Lastre',    d:'Ni rotan ni dejan. Candidatos a dejar de comprar.', c:'var(--bad)'},
  ];
  document.getElementById('rotMatriz').innerHTML = CUAD.map(c=>{
    const arr = q[c.k], ej = arr.slice(0,3).map(r=>esc(r.nombre)).join(' · ');
    return `<div class="qbox"><div class="qt" style="color:${c.c}">${c.t}</div><div class="qn num">${arr.length}</div>
      <div class="qd">${c.d}${ej?`<br><span style="color:var(--ink);opacity:.75">${ej}</span>`:''}</div></div>`;
  }).join('') + `<div style="grid-column:1/-1;font-size:11.5px;color:var(--muted)">Corte: rotación ${un(mr)}/sem · margen ${(mm*100).toFixed(0)}% (la mediana de tus productos).</div>`;

  document.getElementById('rotDormido').innerHTML = durm.length
    ? `<p class="sub" style="font-size:12.5px;margin:0 0 8px">Tienes <b>${money0(capital)}</b> en ${durm.length} productos con stock que no se venden hace más de ${R.dormido} días.</p>`
      + durm.slice(0,10).map(r=>
        `<div class="lrow"><span>${esc(r.nombre)} <span class="dim">· ${un(r.stock)} ${esc(r.unidad)} · ${r.dias===null?'nunca se vendió':'hace '+r.dias+' días'}</span></span>
         <b style="white-space:nowrap;color:var(--warn)">${money0(r.capital)}</b></div>`).join('')
    : `<div class="dim" style="font-size:12.5px">Nada dormido: todo lo que tiene stock se está vendiendo. 👌</div>`;
}

/* =========================================================================
   CRÉDITOS / FIADO
   ========================================================================= */
function abrirCreditos(){ credSel=null; document.getElementById('credBuscar').value=''; renderCreditos();
  document.getElementById('credModal').classList.remove('hidden'); }
function cerrarCreditos(){ document.getElementById('credModal').classList.add('hidden'); if(ROL==='dueno') renderPanel(); }
function renderCreditos(){
  const q = document.getElementById('credBuscar').value.trim().toUpperCase();
  let cuentas = creditAccounts().filter(a=>a.saldo>0.005 || a.fiado>0);
  if(q) cuentas = cuentas.filter(a=>a.cliente.toUpperCase().includes(q));
  const porCobrar = cuentas.reduce((s,a)=>s+(a.saldo>0?a.saldo:0),0);
  document.getElementById('credKpis').innerHTML = [
    {kl:'Por cobrar', kv:money0(porCobrar), c:porCobrar>0?'warn':''},
    {kl:'Deudores', kv:cuentas.filter(a=>a.saldo>0.005).length},
    {kl:'Abonado', kv:money0(cuentas.reduce((s,a)=>s+a.abonado,0)), c:'good'},
  ].map(k=>`<div class="kpi"><div class="kl">${k.kl}</div><div class="kv ${k.c||''} num">${k.kv}</div></div>`).join('');
  document.querySelector('#tablaCred tbody').innerHTML = cuentas.map(a=>
    `<tr><td>${esc(a.cliente)}</td><td class="num">${money(a.fiado)}</td><td class="num">${money(a.abonado)}</td>
     <td class="num"><b class="${a.saldo>0.005?'txt-warn':''}">${money(a.saldo)}</b></td>
     <td><button class="btn sm" onclick="verCliente('${esc(a.cliente).replace(/'/g,"\\'")}')">Ver</button>
         <button class="btn sm primary" onclick="abrirAbono('${esc(a.cliente).replace(/'/g,"\\'")}')">Abono</button></td></tr>`
  ).join('') || `<tr><td colspan="5" class="dim" style="text-align:center;padding:16px">Nadie debe nada. 👌</td></tr>`;
  renderCredDetalle();
}
function verCliente(c){ credSel = c; renderCredDetalle(); }
function renderCredDetalle(){
  const box = document.getElementById('credDetalle');
  if(!credSel){ box.innerHTML=''; return; }
  const mov = VENTAS.filter(v=>v.pago==='credito' && cliKey(v.cliente)===cliKey(credSel))
    .map(v=>({ts:v.ts, t:'cargo', d:'Ticket '+v.ticket+' · '+v.producto, m:v.venta}))
    .concat(ABONOS.filter(a=>cliKey(a.cliente)===cliKey(credSel))
    .map(a=>({ts:a.ts, t:'abono', d:'Abono · '+((METODOS.find(m=>m[0]===a.metodo)||['',''])[1])+(a.nota?' · '+a.nota:''), m:-a.monto})))
    .sort((a,b)=>a.ts-b.ts);
  let saldo = 0;
  box.innerHTML = `<div class="st">Movimientos de ${esc(credSel)}</div>` + mov.map(x=>{
    saldo += x.m;
    return `<div class="lrow"><span>${ddmm(x.ts)} · ${esc(x.d)}</span>
      <span style="white-space:nowrap"><b class="${x.t==='abono'?'txt-good':''}">${x.m<0?'−':''}${money(Math.abs(x.m))}</b>
      <span class="dim"> saldo ${money(saldo)}</span></span></div>`;
  }).join('');
}
function abrirAbono(cli){
  document.getElementById('abCliente').value = cli||'';
  document.getElementById('abMonto').value = '';
  document.getElementById('abNota').value = '';
  document.getElementById('abMetodo').value = 'efectivo';
  document.getElementById('abSaldo').textContent = cli ? 'Debe '+money(saldoOf(cli)) : '';
  document.getElementById('abonoModal').classList.remove('hidden');
}
function cerrarAbono(){ document.getElementById('abonoModal').classList.add('hidden'); }
function onAbonoCli(){ const c=document.getElementById('abCliente').value;
  document.getElementById('abSaldo').textContent = c ? 'Debe '+money(saldoOf(c)) : ''; }
function guardarAbono(){
  const cli = document.getElementById('abCliente').value.trim();
  const monto = parseFloat(document.getElementById('abMonto').value)||0;
  if(!cli){ toast('¿De quién es el abono?','bad'); return; }
  if(!(monto>0)){ toast('Escribe el monto','bad'); return; }
  ABONOS.push({ id:'a'+Date.now(), ts:Date.now(), cliente:cli, monto,
    metodo:document.getElementById('abMetodo').value, nota:document.getElementById('abNota').value.trim() });
  saveAbonos(); cerrarAbono();
  toast('Abono registrado: '+money(monto),'good');
  if(ROL==='dueno'){ renderCreditos(); renderPanel(); } else renderPos();
}

/* =========================================================================
   PRODUCTOS (catálogo y precios)
   ========================================================================= */
function abrirProductos(){ document.getElementById('prodBuscar').value=''; renderProductos();
  document.getElementById('prodModal').classList.remove('hidden'); }
function cerrarProductos(){ document.getElementById('prodModal').classList.add('hidden'); if(ROL==='dueno') renderPanel(); }
function renderProductos(){
  const q = document.getElementById('prodBuscar').value.trim().toUpperCase();
  let rows = PRODUCTS;
  if(q) rows = rows.filter(p=>p.nombre.includes(q)||p.cat.includes(q));
  document.querySelector('#tablaProd tbody').innerHTML = rows.slice(0,300).map(p=>{
    const mgP = p.publico ? (p.publico-p.costo)/p.publico*100 : 0;
    const mgL = p.lista ? (p.lista-p.costo)/p.lista*100 : 0;
    const cls = p.tipo==='servicio' ? 'good' : (mgP<15?'bad':(mgP<28?'warn':'good'));
    return `<tr><td>${esc(p.nombre)}<div class="dim" style="font-size:11px">${esc(p.cat)} · ${esc(p.unidad)}</div></td>
      <td><input type="number" min="0" step="0.01" value="${p.costo}" style="width:80px" onchange="setPrecio('${p.sku}','costo',this.value)"></td>
      <td><input type="number" min="0" step="0.01" value="${p.lista}" style="width:80px" onchange="setPrecio('${p.sku}','lista',this.value)"></td>
      <td><input type="number" min="0" step="0.01" value="${p.publico}" style="width:80px" onchange="setPrecio('${p.sku}','publico',this.value)"></td>
      <td><span class="pill ${cls}">${p.tipo==='servicio'?'100%':mgP.toFixed(0)+'%'}</span>
          <div class="dim" style="font-size:11px">may. ${p.tipo==='servicio'?'100':mgL.toFixed(0)}%</div></td></tr>`;
  }).join('') || `<tr><td colspan="5" class="dim" style="text-align:center;padding:16px">Sin resultados.</td></tr>`;
}
function setPrecio(sku, campo, v){
  const p = BY_SKU[sku]; if(!p) return;
  p[campo] = Math.max(0, Math.round((parseFloat(v)||0)*100)/100);
  saveCat(); renderProductos();
}

/* =========================================================================
   AJUSTES
   ========================================================================= */
function abrirAjustes(){
  const g = id=>document.getElementById(id), n = CFG.negocio, R = repoCfg();
  g('cf_nombre').value=n.nombre; g('cf_ruc').value=n.ruc; g('cf_dir').value=n.dir; g('cf_tel').value=n.tel;
  g('cf_banco').value=n.banco; g('cf_cuenta').value=n.cuenta; g('cf_yape').value=n.yape;
  g('cf_dpub').value=CFG.descMax.publico; g('cf_dmay').value=CFG.descMax.mayorista;
  g('cf_piso').value=Math.round(CFG.pisoMargen*100);
  g('cf_ventana').value=R.ventana; g('cf_lead').value=R.lead; g('cf_colchon').value=R.colchon;
  g('cf_cobertura').value=R.cobertura; g('cf_dormido').value=R.dormido;
  g('ajustesModal').classList.remove('hidden');
}
function cerrarAjustes(){ document.getElementById('ajustesModal').classList.add('hidden'); }
function guardarAjustes(){
  const g = id=>document.getElementById(id);
  const num = (id,min,max,def)=>{ let v=parseFloat(g(id).value); if(isNaN(v))v=def; return Math.min(max,Math.max(min,v)); };
  CFG.negocio = { nombre:g('cf_nombre').value.trim()||'Mi Negocio', ruc:g('cf_ruc').value.trim(),
    dir:g('cf_dir').value.trim(), tel:g('cf_tel').value.trim(), banco:g('cf_banco').value.trim(),
    cuenta:g('cf_cuenta').value.trim(), yape:g('cf_yape').value.trim() };
  CFG.descMax = { publico:num('cf_dpub',0,50,5), mayorista:num('cf_dmay',0,50,8) };
  CFG.pisoMargen = num('cf_piso',0,90,10)/100;
  CFG.repo = { ventana:Math.round(num('cf_ventana',2,52,8)), lead:num('cf_lead',0,12,1),
    colchon:num('cf_colchon',0,12,0.5), cobertura:Math.round(num('cf_cobertura',1,52,4)),
    dormido:Math.round(num('cf_dormido',15,365,60)) };
  saveCfg(); cerrarAjustes(); render();
  toast('Ajustes guardados','good');
}
function reiniciar(){
  toast('¿Borrar todo y volver a los datos de demostración?','bad',{label:'Sí, reiniciar', fn:()=>{
    reiniciarDemo(); CART = nuevoCarrito(); panelDia=null; panelSemana=null; render();
    toast('Demo reiniciada','good');
  }});
}

/* ===== arranque ===== */
function init(){
  cargar();
  const dl = document.getElementById('listaProductos');
  dl.innerHTML = PRODUCTS.filter(p=>p.tipo!=='servicio').map(p=>`<option value="${esc(p.nombre)}">`).join('');
  document.getElementById('listaClientes').innerHTML = CLIENTES_DEMO.map(c=>`<option value="${esc(c[0])}">`).join('');
  document.getElementById('pie').innerHTML =
    `<b>MargenVivo</b> · demostración con datos ficticios · ${PRODUCTS.length} productos · ${VENTAS.length} líneas de venta`;
  render();
}
