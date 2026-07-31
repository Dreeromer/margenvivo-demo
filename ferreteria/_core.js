/* ===== utilidades ===== */
const money  = n => "S/ "+(Number(n)||0).toLocaleString("es-PE",{minimumFractionDigits:2,maximumFractionDigits:2});
const money0 = n => "S/ "+Math.round(Number(n)||0).toLocaleString("es-PE");
const kf = n => Math.abs(n)>=1000 ? "S/ "+(n/1000).toFixed(n>=10000?0:1)+"k" : money0(n);
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pad = n => n<10?'0'+n:''+n;
const MES = ['ene','feb','mar','abr','may','jun','jul','ago','set','oct','nov','dic'];
const DIAS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const ddmm = ts => { const d=new Date(ts); return pad(d.getDate())+"/"+pad(d.getMonth()+1); };
const hhmm = ts => { const d=new Date(ts); return pad(d.getHours())+":"+pad(d.getMinutes()); };
const dayStart = ts => { const d=new Date(ts); d.setHours(0,0,0,0); return d.getTime(); };
const weekStart = ts => { const d=new Date(ts); d.setHours(0,0,0,0); const off=(d.getDay()+6)%7; d.setDate(d.getDate()-off); return d.getTime(); };
const weekLabel = ws => { const a=new Date(ws), b=new Date(ws+6*86400000); return `${a.getDate()} ${MES[a.getMonth()]} – ${b.getDate()} ${MES[b.getMonth()]}`; };
const fullDay = ts => { const d=new Date(ts); return `${DIAS[(d.getDay()+6)%7]} ${d.getDate()} ${MES[d.getMonth()]}`; };
const dec2 = n => Number(n).toFixed(2).replace('.',',');
const un = n => (Math.abs(n)>=10 ? Math.round(n).toLocaleString('es-PE') : (Math.round(n*10)/10).toString().replace('.',','));
const SEM_MS = 7*86400000;

/* Generador pseudoaleatorio con semilla fija: la demo se ve IGUAL en cada equipo. */
function mulberry(seed){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0;
  let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t;
  return ((t^t>>>14)>>>0)/4294967296; }; }

/* ===== catálogo ===== */
// tipo: 'producto' (tiene costo) | 'servicio' (sin costo, todo es líquido)
function marcaDe(nombre, tipo){
  if(tipo==='servicio') return 'SERVICIO PROPIO';
  for(const [re, m] of MARCAS_REGLAS) if(re.test(nombre)) return m;
  return SIN_MARCA;
}
let PRODUCTS = [], BY_SKU = {}, BY_NAME = {};
function buildCatalogo(){
  const rnd = mulberry(20260731);
  const out = [];
  let i = 0;
  const push = (row, tipo) => {
    const [nombre,cat,unidad,costo,lista,publico] = row;
    i++;
    out.push({ sku:'F'+pad(i), nombre, cat, unidad, costo, lista, publico, tipo, marca:marcaDe(nombre,tipo),
      // stock inicial: proporcional a lo que rota, con algunos quebrados a propósito
      stock:0, stock_min:0, track: tipo!=='servicio' });
  };
  SEED_PRODUCTS.forEach(r => push(r,'producto'));
  SEED_SERVICIOS.forEach(r => push(r,'servicio'));
  // popularidad: cuánto se vende cada uno (0..1). Fijación y construcción mandan.
  const peso = { 'FIJACIÓN':1.0,'CONSTRUCCIÓN':0.95,'GASFITERÍA':0.75,'ELÉCTRICOS':0.7,'PINTURAS':0.6,
                 'ABRASIVOS':0.6,'ADHESIVOS':0.5,'CERRAJERÍA':0.45,'SEGURIDAD':0.4,'HERRAMIENTAS':0.35,'SERVICIOS':0.5 };
  out.forEach(p => {
    const caro = p.publico>100 ? 0.25 : (p.publico>40 ? 0.55 : 1);
    p._pop = Math.max(0.04, (peso[p.cat]||0.5) * caro * (0.45+rnd()));
  });
  return out;
}

/* ===== historial de ventas inventado ===== */
// 14 semanas de movimiento, ~35 tickets por semana, con estacionalidad de fin de mes
// y sábados fuertes. Todo determinista.
function buildHistorial(){
  const rnd = mulberry(987654321);
  const ventas = [];
  const ahora = Date.now();
  const hoy = dayStart(ahora);
  const prods = PRODUCTS.filter(p=>p.tipo!=='servicio');
  const servs = PRODUCTS.filter(p=>p.tipo==='servicio');
  const pool = [];                                   // ruleta ponderada por popularidad
  PRODUCTS.forEach(p => { const n = Math.round(p._pop*30); for(let k=0;k<n;k++) pool.push(p); });
  let ticket = 1000, id = 0;

  for(let d = 97; d >= 0; d--){                      // ~14 semanas hacia atrás
    const ts0 = hoy - d*86400000;
    const dow = (new Date(ts0).getDay()+6)%7;        // 0=lunes
    if(dow === 6) continue;                          // domingo cerrado
    const finMes = new Date(ts0).getDate() >= 26 || new Date(ts0).getDate() <= 4;
    // una ferretería de mostrador despacha entre 30 y 60 tickets al día; sábado es el fuerte
    let tickets = Math.round((dow===5 ? 52 : 36) * (finMes?1.3:1) * (0.78+rnd()*0.42));
    for(let t=0; t<tickets; t++){
      // 2 de cada 5 tickets son de un cliente registrado; el resto, público de paso
      const registrado = rnd() < 0.42;
      const cli = registrado ? CLIENTES[Math.floor(rnd()*CLIENTES.length)] : null;
      const cliNom = cli ? cli.nombre : '';
      const cliDoc = cli ? cli.doc : '';
      const tipoCli = cli ? cli.tipo : 'publico';
      const hora = 8 + Math.floor(rnd()*11);          // 8am - 7pm
      const ts = ts0 + hora*3600000 + Math.floor(rnd()*60)*60000;
      if(ts > ahora) continue;                        // hoy: no inventar ventas que aún no ocurrieron
      ticket++;
      const nLineas = 1 + Math.floor(rnd()*(tipoCli==='mayorista'?5:3));
      // forma de pago: el mayorista fía más
      const r = rnd();
      let pago = r<0.52 ? 'efectivo' : (r<0.72 ? 'yape' : (r<0.85 ? 'tarjeta' : (r<0.93 ? 'transferencia' : 'credito')));
      if(tipoCli==='publico' && pago==='credito') pago='efectivo';
      // descuento ocasional, siempre chico
      const desc = rnd()<0.18 ? (tipoCli==='mayorista' ? 3+Math.floor(rnd()*4) : 2+Math.floor(rnd()*3)) : 0;
      const usados = {};
      for(let l=0; l<nLineas; l++){
        let p = pool[Math.floor(rnd()*pool.length)];
        if(usados[p.sku]) continue;
        usados[p.sku] = 1;
        // cantidad según la unidad: por ciento/bolsa se lleva poco, clavos por kilo varios
        let cant;
        if(p.unidad==='CTO'||p.unidad==='JGO'||p.unidad==='GLN') cant = 1+Math.floor(rnd()*3);
        else if(p.unidad==='MTR') cant = 3+Math.floor(rnd()*25);
        else if(p.unidad==='KG') cant = 1+Math.floor(rnd()*8);
        else if(p.unidad==='BLS'||p.unidad==='VAR') cant = tipoCli==='mayorista' ? 5+Math.floor(rnd()*30) : 1+Math.floor(rnd()*4);
        else if(p.unidad==='UND'&&p.publico<3) cant = 4+Math.floor(rnd()*40);
        else cant = 1+Math.floor(rnd()*4);
        const base = tipoCli==='mayorista' ? p.lista : p.publico;
        const precio = Math.round(base*(1-desc/100)*100)/100;
        ventas.push(mkVenta({ id:'h'+(id++), ticket, ts, prod:p, cant, precio, cliente:cliNom,
          clienteDoc:cliDoc, clienteId:cli?cli.id:'', tipoCliente:tipoCli, pago, desc, cajero:'Milagros' }));
      }
    }
  }
  return ventas;
}

// Arma una línea de venta con su costo congelado (snapshot): si mañana cambia el
// costo del catálogo, el histórico no se altera.
function mkVenta({id, ticket, ts, prod, cant, precio, cliente, clienteId, clienteDoc, tipoCliente, pago, desc, cajero}){
  const venta = Math.round(cant*precio*100)/100;
  const costo = prod.tipo==='servicio' ? 0 : prod.costo;
  const costoT = Math.round(cant*costo*100)/100;
  const util = Math.round((venta-costoT)*100)/100;
  return { id, ticket, ts, sku:prod.sku, producto:prod.nombre, cat:prod.cat, marca:prod.marca||SIN_MARCA, unidad:prod.unidad,
    tipo:prod.tipo, cant, precio, venta, costo, costoT, util, margen: venta?util/venta:0,
    cliente: cliente||'', clienteId: clienteId||'', clienteDoc: clienteDoc||'',
    tipoCliente, pago, desc:desc||0, cajero };
}

/* ===== clientes =====================================================
   Un cliente es un registro, no un texto suelto: así el nombre se escribe
   una sola vez y el fiado nunca se parte en dos por una tilde de más.
   El documento (DNI/RUC) es la llave rápida del mostrador. */
let CLIENTES = [];
const soloDigitos = s => String(s||'').replace(/\D/g,'');
const cliKey = s => String(s||'').trim().toUpperCase();

function buildClientes(){
  return CLIENTES_DEMO.map((c,i)=>({ id:'C'+pad(i+1), nombre:c[0], doc:c[1], tipo:c[2], tel:c[3]||'' }));
}
function clientePorDoc(doc){
  const d = soloDigitos(doc);
  return d ? CLIENTES.find(c=>soloDigitos(c.doc)===d) || null : null;
}
function clientePorNombre(nom){
  const k = cliKey(nom);
  return k ? CLIENTES.find(c=>cliKey(c.nombre)===k) || null : null;
}
function clientePorId(id){ return CLIENTES.find(c=>c.id===id) || null; }
// Busca por nombre o por documento, con o sin guiones.
function buscarClientes(q, max){
  const t = String(q||'').trim();
  if(!t) return CLIENTES.slice(0, max||8);
  const k = t.toUpperCase(), d = soloDigitos(t);
  return CLIENTES.filter(c => c.nombre.toUpperCase().includes(k) || (d && soloDigitos(c.doc).includes(d)))
                 .slice(0, max||8);
}
function altaCliente({nombre, doc, tipo, tel}){
  nombre = String(nombre||'').trim();
  if(!nombre) return null;
  const ya = clientePorNombre(nombre) || (doc ? clientePorDoc(doc) : null);
  if(ya) return ya;
  const c = { id:'C'+(CLIENTES.length+1+Math.floor(Math.random()*1000)), nombre,
              doc:String(doc||'').trim(), tipo: tipo==='mayorista'?'mayorista':'publico', tel:String(tel||'').trim() };
  CLIENTES.push(c); saveClientes();
  return c;
}

/* ===== almacenamiento (demo: solo este navegador) ===== */
const K_VENTAS='fsr_ventas', K_CAT='fsr_catalogo', K_CFG='fsr_cfg', K_ABONOS='fsr_abonos',
      K_SEQ='fsr_seq', K_CLI='fsr_clientes';
const DEFAULT_REPO = { ventana:8, lead:1, colchon:0.5, cobertura:4, dormido:60 };
const DEFAULT_CFG = {
  negocio:{ nombre:'Ferretería Santa Rosa E.I.R.L.', ruc:'20601447789',
            dir:'Av. Balta 1245 – Chiclayo', tel:'956 214 880', yape:'956 214 880',
            banco:'BCP', cuenta:'305-1234567-0-88' },
  descMax:{ publico:5, mayorista:8 },     // tope de descuento sin autorización del dueño
  pisoMargen:0.10,                        // bajo esto una venta se marca en rojo para el dueño
  repo:Object.assign({}, DEFAULT_REPO),
};
let CFG = JSON.parse(JSON.stringify(DEFAULT_CFG));
let VENTAS = [], ABONOS = [], SEQ = 1000;

function rebuildIndex(){
  BY_SKU = Object.fromEntries(PRODUCTS.map(p=>[p.sku,p]));
  BY_NAME = Object.fromEntries(PRODUCTS.map(p=>[p.nombre.toUpperCase(),p]));
}
function saveCat(){ try{ localStorage.setItem(K_CAT, JSON.stringify(PRODUCTS)); }catch(e){} }
function saveVentas(){ try{ localStorage.setItem(K_VENTAS, JSON.stringify(VENTAS)); }catch(e){} }
function saveCfg(){ try{ localStorage.setItem(K_CFG, JSON.stringify(CFG)); }catch(e){} }
function saveAbonos(){ try{ localStorage.setItem(K_ABONOS, JSON.stringify(ABONOS)); }catch(e){} }
function saveSeq(){ try{ localStorage.setItem(K_SEQ, String(SEQ)); }catch(e){} }
function saveClientes(){ try{ localStorage.setItem(K_CLI, JSON.stringify(CLIENTES)); }catch(e){} }

function sembrar(){
  PRODUCTS = buildCatalogo();
  rebuildIndex();
  CLIENTES = buildClientes();
  VENTAS = buildHistorial();
  // stock actual coherente con lo que rota: entre 1 y 6 semanas de venta, y a
  // propósito unos cuantos quebrados y otros sobrestockeados.
  const rnd = mulberry(555111);
  const dem = demandBySku(Date.now(), 8);
  const base = semanasBase(Date.now(), 8);
  PRODUCTS.forEach(p => {
    if(p.tipo==='servicio'){ p.stock=0; p.track=false; return; }
    const porSem = (dem[p.sku] ? dem[p.sku].cant : 0)/base;
    const r = rnd();
    const semanas = r<0.12 ? 0 : (r<0.28 ? 0.4 : (r<0.8 ? 2+rnd()*3 : 7+rnd()*8));
    p.stock = Math.max(0, Math.round(porSem*semanas));
    p.track = true;
  });
  // compras que se quedaron paradas: tienen stock y hace meses que nadie las pide.
  // Es el "capital dormido" que casi ninguna ferretería tiene medido.
  const DORMIDOS = ['ARNÉS DE SEGURIDAD','ESMERIL DE BANCO 6"','TANQUE ELEVADO 600L',
                    'ZAPATO DE SEGURIDAD PUNTA ACERO','JUEGO DE DADOS 40PZ','CARRETILLA BUGGY 6PIE',
                    'CERRADURA DE SOBREPONER 3 GOLPES','REFLECTOR LED 50W'];
  DORMIDOS.forEach(n => { const p=BY_NAME[n]; if(p) p.stock = 5 + Math.round(rnd()*14); });
  VENTAS = VENTAS.filter(v => DORMIDOS.indexOf(v.producto) < 0);
  SEQ = 1000 + Math.max(0, ...VENTAS.map(v=>v.ticket-1000));
  ABONOS = [];
  aplicarMinimosSilencioso();
  saveCat(); saveVentas(); saveCfg(); saveAbonos(); saveSeq(); saveClientes();
}
function cargar(){
  try{
    const c = localStorage.getItem(K_CAT), v = localStorage.getItem(K_VENTAS);
    if(!c || !v) { sembrar(); return; }
    PRODUCTS = JSON.parse(c); VENTAS = JSON.parse(v); rebuildIndex();
    migrar();
    const g = localStorage.getItem(K_CFG); if(g) CFG = Object.assign(JSON.parse(JSON.stringify(DEFAULT_CFG)), JSON.parse(g));
    const a = localStorage.getItem(K_ABONOS); ABONOS = a ? JSON.parse(a) : [];
    const s = localStorage.getItem(K_SEQ); SEQ = s ? Number(s) : 1000;
    const cl = localStorage.getItem(K_CLI); CLIENTES = cl ? JSON.parse(cl) : buildClientes();
  }catch(e){ console.error('cargar', e); sembrar(); }
}
// Los datos guardados por una versión anterior no traen todos los campos.
// Se completan al cargar para que quien ya abrió la demo no vea pantallas vacías.
function migrar(){
  let tocado = false;
  PRODUCTS.forEach(p=>{ if(!p.marca){ p.marca = marcaDe(p.nombre, p.tipo); tocado = true; } });
  if(tocado) saveCat();
  let tocadoV = false;
  VENTAS.forEach(v=>{
    if(!v.marca){ const p = BY_SKU[v.sku];
      v.marca = (p && p.marca) || marcaDe(v.producto||'', v.tipo); tocadoV = true; }
    if(v.clienteId === undefined){ v.clienteId = ''; tocadoV = true; }
  });
  if(tocadoV) saveVentas();
}
function reiniciarDemo(){
  [K_VENTAS,K_CAT,K_CFG,K_ABONOS,K_SEQ,K_CLI].forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){} });
  sembrar();
}

/* ===== precios ===== */
// El precio NO se negocia: sale del catálogo según el tipo de cliente.
const precioDe = (p, tipoCliente) => tipoCliente==='mayorista' ? p.lista : p.publico;
const topeDesc = tipoCliente => (CFG.descMax||{})[tipoCliente==='mayorista'?'mayorista':'publico'] || 0;
// Estado del descuento para quien atiende: no ve costos, solo si puede o no aplicarlo.
function estadoDesc(desc, tipoCliente){
  const tope = topeDesc(tipoCliente);
  if(!desc) return 'ok';
  if(desc > tope) return 'autorizar';
  if(desc >= tope*0.7) return 'limite';
  return 'ok';
}

/* ===== motor de rotación y reposición ===== */
const repoCfg = () => Object.assign({}, DEFAULT_REPO, CFG.repo||{});
const allVentas = () => VENTAS;

function demandBySku(now, ventana){
  const R=repoCfg(); ventana=ventana||R.ventana; now=now||Date.now();
  const desde = weekStart(now)-(ventana-1)*SEM_MS;
  const m={};
  allVentas().forEach(v=>{
    if(v.tipo==='servicio') return;
    const k=v.sku;
    const r = m[k] || (m[k]={cant:0,venta:0,util:0,semanas:new Set(),last:0});
    if(v.ts>r.last) r.last=v.ts;
    if(v.ts>=desde){ r.cant+=v.cant; r.venta+=v.venta; r.util+=v.util; r.semanas.add(weekStart(v.ts)); }
  });
  return m;
}
// Semanas con movimiento real: no se diluye el promedio si la tienda estuvo cerrada.
function semanasBase(now, ventana){
  const R=repoCfg(); ventana=ventana||R.ventana; now=now||Date.now();
  const desde = weekStart(now)-(ventana-1)*SEM_MS;
  const s=new Set();
  allVentas().forEach(v=>{ if(v.ts>=desde) s.add(weekStart(v.ts)); });
  return Math.max(1, Math.min(ventana, s.size));
}
function repoRows(now){
  const R=repoCfg(); now=now||Date.now();
  const dem=demandBySku(now,R.ventana), base=semanasBase(now,R.ventana);
  return PRODUCTS.filter(p=>p.tipo!=='servicio').map(p=>{
    const d = dem[p.sku] || {cant:0,venta:0,util:0,semanas:new Set(),last:0};
    const demSem = d.cant/base;
    const minSug = demSem>0 ? Math.max(1, Math.ceil(demSem*(R.lead+R.colchon))) : 0;
    const objetivo = demSem>0 ? Math.ceil(demSem*R.cobertura) : 0;
    const stock = Number(p.stock)||0;
    const cobertura = demSem>0 ? stock/demSem : (stock>0?Infinity:0);
    const pedir = (p.track && demSem>0) ? Math.max(0, objetivo-stock) : 0;
    return { sku:p.sku, nombre:p.nombre, cat:p.cat, unidad:p.unidad, costo:p.costo, publico:p.publico,
      track:!!p.track, stock, stock_min:Number(p.stock_min)||0, cant:d.cant, venta:d.venta, util:d.util,
      margen: d.venta?d.util/d.venta:0, demSem, semActivas:d.semanas.size, regular:d.semanas.size/base,
      base, minSug, objetivo, cobertura, pedir, dias: d.last?Math.floor((now-d.last)/86400000):null };
  });
}
function ritmoOf(r){ return r.demSem<=0?'nulo':(r.regular>=0.75?'constante':(r.regular>=0.35?'irregular':'esporadico')); }
const RITMO_LBL = {constante:'constante', irregular:'irregular', esporadico:'esporádico', nulo:'sin salida'};
function repoNivel(r){
  const R=repoCfg();
  if(!r.track || r.demSem<=0) return 'sin';
  if(r.cobertura<=R.lead) return 'urgente';
  if(r.cobertura<=R.lead+R.colchon) return 'pronto';
  return 'ok';
}
function abcOf(rows){
  const con=rows.filter(r=>r.venta>0).sort((a,b)=>b.venta-a.venta);
  const total=con.reduce((s,r)=>s+r.venta,0);
  let acc=0;
  con.forEach(r=>{ const prev=total?acc/total:0; acc+=r.venta; r.acum=total?acc/total:0;
    r.abc = prev<0.80?'A':(prev<0.95?'B':'C'); });
  return {rows:con, total};
}
function dormidosOf(rows){
  const R=repoCfg();
  return rows.filter(r=>r.stock>0 && (r.dias===null || r.dias>R.dormido))
             .map(r=>Object.assign({}, r, {capital:r.stock*r.costo}))
             .sort((a,b)=>b.capital-a.capital);
}
const median = arr => { if(!arr.length) return 0; const a=arr.slice().sort((x,y)=>x-y), m=a.length>>1; return a.length%2?a[m]:(a[m-1]+a[m])/2; };
function matrizOf(rows){
  const con=rows.filter(r=>r.venta>0 && r.demSem>0);
  const mr=median(con.map(r=>r.demSem)), mm=median(con.map(r=>r.margen));
  const q={estrella:[],volumen:[],joya:[],lastre:[]};
  con.forEach(r=>{ const rota=r.demSem>=mr, gana=r.margen>=mm;
    q[rota&&gana?'estrella':(rota?'volumen':(gana?'joya':'lastre'))].push(r); });
  Object.values(q).forEach(a=>a.sort((x,y)=>y.venta-x.venta));
  return {q, mr, mm};
}
const stockStatus = p => (!p.track||p.tipo==='servicio') ? 'off' : (p.stock<=0?'out':(p.stock<=p.stock_min?'low':'ok'));
function aplicarMinimosSilencioso(){
  repoRows().forEach(r=>{ if(r.minSug>0){ const p=BY_SKU[r.sku]; if(p) p.stock_min=r.minSug; } });
}

/* ===== indicadores de gestión =====================================
   Las fórmulas del rubro (cobertura, rotación, GMROI) trabajan sobre el
   INVENTARIO PROMEDIO AL COSTO. Todavía no guardamos fotos del inventario,
   así que se usa el valor de hoy como referencia y se marca como aproximado.
   Cuando haya historial semanal, solo cambia esta función. */
function valorInventario(){
  return PRODUCTS.reduce((s,p)=> p.tipo==='servicio' ? s : s + (Number(p.stock)||0)*(Number(p.costo)||0), 0);
}
// Resume un conjunto de ventas: lo que se usa en todos los tableros.
function resumen(ventas){
  const venta = ventas.reduce((s,v)=>s+v.venta,0);
  const util  = ventas.reduce((s,v)=>s+v.util,0);
  const costo = ventas.reduce((s,v)=>s+v.costoT,0);
  const tickets = new Set(ventas.map(v=>v.ticket)).size;
  return { venta, util, costo, tickets, lineas:ventas.length,
           margen: venta?util/venta:0,
           ticketProm: tickets?venta/tickets:0,
           // ítems por venta: con unidades mezcladas (kg, metros, bolsas) sumar
           // cantidades no significa nada; lo que sí compara es cuántos productos
           // distintos se lleva cada cliente.
           itemsPorVenta: tickets?ventas.length/tickets:0 };
}
// GMROI: cuánta utilidad deja cada sol invertido en mercadería, al año.
// Rotación: cuántas veces al año se renueva el inventario.
function indicadoresInv(ventas, semanas){
  const inv = valorInventario();
  const r = resumen(ventas);
  const anual = semanas>0 ? 52/semanas : 0;
  return { inventario:inv,
           gmroi:    inv>0 ? (r.util *anual)/inv : 0,
           rotacion: inv>0 ? (r.costo*anual)/inv : 0,
           aprox: true };
}
// Pareto: participación y acumulado por marca o por categoría.
function paretoPor(ventas, campo){
  const by = {};
  ventas.forEach(v=>{ const k = v[campo] || SIN_MARCA;
    (by[k] = by[k] || {n:k, venta:0, util:0, lineas:0});
    by[k].venta += v.venta; by[k].util += v.util; by[k].lineas++; });
  const arr = Object.values(by).sort((a,b)=>b.venta-a.venta);
  const total = arr.reduce((s,x)=>s+x.venta,0);
  let acc = 0;
  arr.forEach(x=>{ x.part = total?x.venta/total:0; acc += x.venta; x.acum = total?acc/total:0;
                   x.margen = x.venta?x.util/x.venta:0; });
  return { filas:arr, total };
}
// Los dos rankings que hay que ver juntos: lo que más sale y lo que más deja.
function rankingProductos(ventas){
  const by = {};
  ventas.forEach(v=>{ const k=v.sku||v.producto;
    (by[k] = by[k] || {sku:v.sku, nombre:v.producto, unidad:v.unidad, cat:v.cat,
                       venta:0, util:0, cant:0});
    by[k].venta+=v.venta; by[k].util+=v.util; by[k].cant+=v.cant; });
  const arr = Object.values(by);
  const total = arr.reduce((s,x)=>s+x.venta,0);
  arr.forEach(x=>{ x.margen = x.venta?x.util/x.venta:0; x.part = total?x.venta/total:0; });
  return { porVenta: arr.slice().sort((a,b)=>b.venta-a.venta),
           porUtilidad: arr.slice().sort((a,b)=>b.util-a.util), total };
}

/* ===== créditos ===== */
function creditAccounts(){
  const m={};
  const llave = x => x.clienteId || cliKey(x.cliente);
  VENTAS.forEach(v=>{ if(v.pago!=='credito') return; const k=llave(v);
    (m[k]=m[k]||{id:v.clienteId||'', cliente:v.cliente, doc:v.clienteDoc||'', fiado:0, abonado:0}).fiado += v.venta; });
  ABONOS.forEach(a=>{ const k=llave(a);
    (m[k]=m[k]||{id:a.clienteId||'', cliente:a.cliente, doc:'', fiado:0, abonado:0}).abonado += a.monto; });
  return Object.values(m).map(a=>Object.assign({}, a, {saldo:a.fiado-a.abonado}))
                         .sort((a,b)=>b.saldo-a.saldo);
}
// Acepta un id de cliente o su nombre.
function saldoOf(ref){
  if(!ref) return 0;
  const a = creditAccounts().find(x => x.id===ref || cliKey(x.cliente)===cliKey(ref));
  return a ? a.saldo : 0;
}

/* ===== caja del día ===== */
const METODOS = [['efectivo','Efectivo','💵'],['yape','Yape / Plin','📱'],['tarjeta','Tarjeta','💳'],
                 ['transferencia','Transferencia','🏦'],['credito','Fiado','📒']];
function cajaDe(dia){
  const d = dayStart(dia);
  const del = VENTAS.filter(v=>dayStart(v.ts)===d);
  const porMetodo = {};
  METODOS.forEach(([k])=>porMetodo[k]=0);
  del.forEach(v=>{ porMetodo[v.pago] = (porMetodo[v.pago]||0) + v.venta; });
  const abonosDia = ABONOS.filter(a=>dayStart(a.ts)===d);
  abonosDia.forEach(a=>{ porMetodo[a.metodo] = (porMetodo[a.metodo]||0) + a.monto; });
  const tickets = new Set(del.map(v=>v.ticket)).size;
  const total = del.reduce((s,v)=>s+v.venta,0);
  return { dia:d, porMetodo, tickets, total, lineas:del.length,
           cobrado: total - (porMetodo.credito||0) + abonosDia.reduce((s,a)=>s+a.monto,0),
           abonos: abonosDia };
}
