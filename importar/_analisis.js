/* =====================================================================
   Del Excel crudo a un análisis. Tres problemas reales que resolver:
   1. cada empresa nombra sus columnas distinto
   2. los datos de cabecera (fecha, cliente, ticket) suelen estar solo en la
      primera fila de cada venta y el resto queda vacío
   3. el mismo producto aparece escrito de varias formas
   ===================================================================== */

const norm = s => String(s==null?'':s).toUpperCase()
  .normalize('NFD').replace(/[̀-ͯ]/g,'')
  .replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();

const esVacio = v => v===null || v===undefined || String(v).trim()==='';
function aNumero(v){
  if(typeof v === 'number') return v;
  if(esVacio(v)) return null;
  const s = String(v).replace(/[^\d,.\-]/g,'').replace(/\.(?=\d{3}\b)/g,'').replace(',','.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/* ── qué es cada columna ── */
// Se puntúa cada encabezado contra varias pistas. Gana la de más puntaje.
const PISTAS = {
  producto:  ['descripcion','producto','detalle','articulo','item','mercaderia','nombre','material','concepto'],
  cantidad:  ['cantidad','cant','unidades','und','qty','unid','nro unid'],
  precio:    ['precio','p unit','punit','precio unitario','valor unitario','pu','p u'],
  importe:   ['total x und','importe','subtotal','total linea','valor venta','venta','monto','total'],
  costo:     ['costo','c unit','costo unitario','cunit','costo unit'],
  fecha:     ['fecha','dia','date','f emision','fec'],
  cliente:   ['cliente','razon social','nombre cliente','señor','sr','destinatario'],
  ticket:    ['nro','numero','ticket','comprobante','boleta','factura','documento','n doc','serie'],
  codigo:    ['codigo','cod','sku','clave','referencia'],
  categoria: ['categoria','familia','linea','rubro','grupo','tipo'],
  marca:     ['marca','proveedor','fabricante'],
  vendedor:  ['vendedor','vendedora','cajero','atendio','asesor'],
};
function detectarColumnas(encabezados){
  const cols = {};
  const usadas = new Set();
  const puntaje = (h, pistas) => {
    const n = norm(h);
    if(!n) return 0;
    let mejor = 0;
    pistas.forEach(p=>{
      const np = norm(p);
      if(n === np) mejor = Math.max(mejor, 100);
      else if(n.startsWith(np) || n.endsWith(np)) mejor = Math.max(mejor, 80);
      else if(n.includes(np)) mejor = Math.max(mejor, 60 + np.length);
    });
    return mejor;
  };
  // el orden importa: primero lo más específico, para que "TOTAL X UND" no se
  // lleve la columna que en realidad es "TOTAL" del ticket
  ['producto','cantidad','precio','costo','fecha','cliente','ticket','codigo','categoria','marca','vendedor','importe']
    .forEach(campo=>{
      let mejorI = -1, mejorP = 0;
      encabezados.forEach((h,i)=>{
        if(usadas.has(i)) return;
        const p = puntaje(h, PISTAS[campo]);
        if(p > mejorP){ mejorP = p; mejorI = i; }
      });
      if(mejorI >= 0 && mejorP >= 60){ cols[campo] = mejorI; usadas.add(mejorI); }
    });
  return cols;
}

/* ── dónde empieza la tabla ── */
// Muchos Excel traen títulos o logos arriba. La fila de encabezado es la que
// más texto distinto tiene y va seguida de filas con datos.
function hallarEncabezado(filas){
  let mejor = {i:0, p:-1};
  const tope = Math.min(filas.length, 20);
  for(let i = 0; i < tope; i++){
    const f = filas[i] || [];
    const textos = f.filter(c => !esVacio(c) && typeof c !== 'number').length;
    const llenas = f.filter(c => !esVacio(c)).length;
    if(llenas < 2) continue;
    const sig = filas[i+1] || [];
    const sigLlenas = sig.filter(c=>!esVacio(c)).length;
    const p = textos*2 + llenas + (sigLlenas>=2 ? 5 : 0);
    if(p > mejor.p) mejor = {i, p};
  }
  return mejor.i;
}

/* ── parecido entre nombres ── */
function trigramas(s){
  const t = ' '+norm(s)+' ';
  const g = new Set();
  for(let i = 0; i < t.length-2; i++) g.add(t.slice(i,i+3));
  return g;
}
// Distancia de edición, con corte temprano: solo importa si es chica.
function distancia(a, b, corte){
  if(a === b) return 0;
  if(Math.abs(a.length-b.length) > corte) return corte+1;
  let prev = Array.from({length:b.length+1}, (_,j)=>j);
  for(let i = 1; i <= a.length; i++){
    const fila = [i];
    let mejorFila = i;
    for(let j = 1; j <= b.length; j++){
      const c = a[i-1] === b[j-1] ? 0 : 1;
      fila[j] = Math.min(prev[j]+1, fila[j-1]+1, prev[j-1]+c);
      if(fila[j] < mejorFila) mejorFila = fila[j];
    }
    if(mejorFila > corte) return corte+1;
    prev = fila;
  }
  return prev[b.length];
}
// Dice sobre trigramas + distancia de edición. Lo segundo pesa en nombres
// cortos, donde una letra cambiada (ACASIA/ACACIA) casi no mueve los trigramas.
function similitud(a, b){
  const A = norm(a), B = norm(b);
  if(!A || !B) return 0;
  if(A === B) return 1;
  const gA = trigramas(A), gB = trigramas(B);
  let comunes = 0;
  gA.forEach(x=>{ if(gB.has(x)) comunes++; });
  const dice = gA.size+gB.size ? 2*comunes/(gA.size+gB.size) : 0;
  const largo = Math.max(A.length, B.length);
  if(largo <= 24 && Math.abs(A.length-B.length) <= 4){
    const d = distancia(A, B, 4);
    if(d <= 4) return Math.max(dice, (1 - d/largo) * 0.95);
  }
  return dice;
}

/* Agrupa descripciones parecidas.
   Solo une automáticamente lo que es casi seguro (una tilde, un espacio de más).
   Lo que se parece pero podría ser otro producto — TUBO 2" y TUBO 3" difieren
   en un carácter — se devuelve como duda para que la resuelva una persona. */
function agruparNombres(conteo, umbral, umbralDuda){
  umbral = umbral || 0.92;
  umbralDuda = umbralDuda || 0.70;
  const nombres = Object.keys(conteo).sort((a,b)=>conteo[b]-conteo[a]);
  const rapido = nombres.length > 2500;          // catálogos enormes: sin dudas
  const canon = [], alias = {}, dudosos = [];
  nombres.forEach(n=>{
    let unir = null, duda = null, mejorDuda = 0;
    for(const c of canon){
      const s = similitud(n, c);
      if(s >= umbral){ unir = c; break; }
      if(!rapido && s >= umbralDuda && s > mejorDuda){ mejorDuda = s; duda = c; }
    }
    if(unir) alias[n] = unir;
    else {
      canon.push(n); alias[n] = n;
      if(duda) dudosos.push({ a:n, b:duda, similitud:mejorDuda, veces:conteo[n] });
    }
  });
  dudosos.sort((x,y)=>y.similitud-x.similitud);
  return { canon, alias, dudosos };
}

/* ── filas que no son ventas ── */
const BASURA = /^(TOTAL|TOTALES|SUBTOTAL|SUB TOTAL|SUMA|RESUMEN|SALDO|VENTA TOTAL|ACUMULADO)\b/;
function esBasura(nombre){
  const n = norm(nombre);
  return !n || BASURA.test(n) || n.length < 2;
}

/* =====================================================================
   Convierte las hojas en líneas de venta limpias.
   ===================================================================== */
function extraer(libro, opciones){
  const o = opciones || {};
  const lineas = [];
  const descartadas = { sinProducto:0, basura:0, sinImporte:0 };
  const hojasUsadas = [];

  libro.hojas.forEach(hoja=>{
    const filas = hoja.filas || [];
    if(filas.length < 2) return;
    const iEnc = o.filaEncabezado != null ? o.filaEncabezado : hallarEncabezado(filas);
    const enc = (filas[iEnc]||[]).map(c => String(c==null?'':c).replace(/\s+/g,' ').trim());
    const cols = o.columnas || detectarColumnas(enc);
    if(cols.producto == null) return;
    hojasUsadas.push({ nombre: hoja.nombre, encabezado: iEnc, columnas: cols, filas: filas.length-iEnc-1 });

    // arrastre: fecha, cliente y ticket suelen venir solo en la primera fila
    // de cada venta; sin esto el 90% de las líneas quedaría huérfano
    let ultFecha = null, ultCliente = null, ultTicket = null;

    for(let r = iEnc+1; r < filas.length; r++){
      const f = filas[r] || [];
      const crudo = cols.producto != null ? f[cols.producto] : null;

      const fv = cols.fecha    != null ? f[cols.fecha]   : null;
      const cv = cols.cliente  != null ? f[cols.cliente] : null;
      const tv = cols.ticket   != null ? f[cols.ticket]  : null;
      if(!esVacio(fv)) ultFecha   = fv;
      if(!esVacio(cv)) ultCliente = cv;
      if(!esVacio(tv)) ultTicket  = tv;

      if(esVacio(crudo)){ descartadas.sinProducto++; continue; }
      const nombre = String(crudo).replace(/\s+/g,' ').trim();
      if(esBasura(nombre)){ descartadas.basura++; continue; }

      const cant   = aNumero(cols.cantidad != null ? f[cols.cantidad] : null);
      const precio = aNumero(cols.precio   != null ? f[cols.precio]   : null);
      let importe  = aNumero(cols.importe  != null ? f[cols.importe]  : null);
      if(importe == null && cant != null && precio != null) importe = cant*precio;
      if(importe == null || importe === 0){ descartadas.sinImporte++; continue; }

      let ts = null;
      if(ultFecha != null){
        if(typeof ultFecha === 'number' && pareceFecha(ultFecha)) ts = serialAFecha(ultFecha).getTime();
        else { const d = new Date(ultFecha); if(!isNaN(d)) ts = d.getTime(); }
      }
      const costo = aNumero(cols.costo != null ? f[cols.costo] : null);
      lineas.push({
        hoja: hoja.nombre, fila: r+1,
        producto: nombre,
        cant: cant != null ? cant : 1,
        precio: precio != null ? precio : (cant ? importe/cant : importe),
        venta: importe,
        costo: costo,
        costoT: costo != null && cant != null ? costo*cant : null,
        cat: cols.categoria != null && !esVacio(f[cols.categoria]) ? String(f[cols.categoria]).trim() : '',
        marca: cols.marca != null && !esVacio(f[cols.marca]) ? String(f[cols.marca]).trim() : '',
        cliente: ultCliente != null ? String(ultCliente).trim() : '',
        ticket: ultTicket != null ? String(ultTicket).trim() : '',
        vendedor: cols.vendedor != null && !esVacio(f[cols.vendedor]) ? String(f[cols.vendedor]).trim() : '',
        ts,
      });
    }
  });

  // unificar nombres parecidos
  const conteo = {};
  lineas.forEach(l=>{ conteo[l.producto] = (conteo[l.producto]||0)+1; });
  const { canon, alias, dudosos } = agruparNombres(conteo, o.umbral);
  lineas.forEach(l=>{ l.productoOriginal = l.producto; l.producto = alias[l.producto] || l.producto; });

  const unificados = Object.keys(conteo).filter(n => alias[n] !== n)
    .map(n => ({ de:n, a:alias[n], veces:conteo[n] }))
    .sort((a,b)=>b.veces-a.veces);

  return { lineas, descartadas, hojasUsadas, productosDistintos: canon.length, unificados, dudosos };
}

/* =====================================================================
   El análisis que se le muestra al dueño.
   ===================================================================== */
function analizar(lineas){
  const venta = lineas.reduce((s,l)=>s+l.venta,0);
  const conCosto = lineas.filter(l=>l.costoT != null);
  const costo = conCosto.reduce((s,l)=>s+l.costoT,0);
  const utilCon = conCosto.reduce((s,l)=>s+(l.venta-l.costoT),0);
  const ventaCon = conCosto.reduce((s,l)=>s+l.venta,0);
  const tickets = new Set(lineas.map(l=>l.ticket).filter(Boolean)).size;
  const fechas = lineas.map(l=>l.ts).filter(Boolean).sort((a,b)=>a-b);
  const semanas = fechas.length
    ? Math.max(1, new Set(fechas.map(t=>{ const d=new Date(t); d.setHours(0,0,0,0);
        d.setDate(d.getDate()-((d.getDay()+6)%7)); return d.getTime(); })).size) : 0;

  const porProd = {};
  lineas.forEach(l=>{
    const p = porProd[l.producto] = porProd[l.producto] ||
      { nombre:l.producto, venta:0, cant:0, util:0, conCosto:false, lineas:0, cat:l.cat, marca:l.marca, semanas:new Set() };
    p.venta += l.venta; p.cant += l.cant; p.lineas++;
    if(l.costoT != null){ p.util += l.venta - l.costoT; p.conCosto = true; }
    if(l.ts){ const d=new Date(l.ts); d.setHours(0,0,0,0); d.setDate(d.getDate()-((d.getDay()+6)%7)); p.semanas.add(d.getTime()); }
  });
  const productos = Object.values(porProd).map(p=>({
    ...p, margen: p.conCosto && p.venta ? p.util/p.venta : null,
    part: venta ? p.venta/venta : 0,
    porSemana: semanas ? p.cant/semanas : 0,
  })).sort((a,b)=>b.venta-a.venta);

  let acc = 0;
  productos.forEach(p=>{ const prev = venta?acc/venta:0; acc += p.venta;
    p.acum = venta?acc/venta:0; p.abc = prev<0.80?'A':(prev<0.95?'B':'C'); });

  const agrupar = campo => {
    const m = {};
    lineas.forEach(l=>{ const k = l[campo] || '(sin dato)';
      (m[k] = m[k] || {n:k, venta:0, util:0, conCosto:false});
      m[k].venta += l.venta;
      if(l.costoT != null){ m[k].util += l.venta-l.costoT; m[k].conCosto = true; } });
    const arr = Object.values(m).sort((a,b)=>b.venta-a.venta);
    let a2 = 0;
    arr.forEach(x=>{ x.part = venta?x.venta/venta:0; a2 += x.venta; x.acum = venta?a2/venta:0;
                     x.margen = x.conCosto && x.venta ? x.util/x.venta : null; });
    return arr;
  };

  const clientes = {};
  lineas.forEach(l=>{ if(!l.cliente) return;
    (clientes[l.cliente] = clientes[l.cliente] || {n:l.cliente, venta:0, tickets:new Set()});
    clientes[l.cliente].venta += l.venta;
    if(l.ticket) clientes[l.cliente].tickets.add(l.ticket); });
  const topClientes = Object.values(clientes)
    .map(c=>({...c, tickets:c.tickets.size})).sort((a,b)=>b.venta-a.venta);

  return {
    venta, costo, tickets, lineas: lineas.length,
    util: utilCon, margen: ventaCon ? utilCon/ventaCon : null,
    coberturaCosto: lineas.length ? conCosto.length/lineas.length : 0,
    ticketProm: tickets ? venta/tickets : 0,
    itemsPorVenta: tickets ? lineas.length/tickets : 0,
    desde: fechas[0] || null, hasta: fechas[fechas.length-1] || null, semanas,
    ventaSemanal: semanas ? venta/semanas : 0,
    productos,
    porVenta: productos.slice(0,10),
    porUtilidad: productos.filter(p=>p.conCosto).sort((a,b)=>b.util-a.util).slice(0,10),
    sinCosto: productos.filter(p=>!p.conCosto),
    categorias: agrupar('cat'), marcas: agrupar('marca'),
    topClientes: topClientes.slice(0,10), totalClientes: Object.keys(clientes).length,
  };
}
