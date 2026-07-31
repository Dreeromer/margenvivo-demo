/* ===== presentación: solo lo necesario, sin librerías ===== */
const $ = s => document.querySelector(s);
const S_ = n => 'S/ ' + Math.round(n).toLocaleString('es-PE');

/* el eje avanza con la lectura */
const avance = $('#avance');
function marcarAvance(){
  const h = document.documentElement;
  const p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
  avance.style.height = Math.min(100, p*100) + '%';
}
addEventListener('scroll', marcarAvance, {passive:true});
marcarAvance();

/* aparecer al leer */
const io = new IntersectionObserver(es=>{
  es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('on'); io.unobserve(e.target); } });
}, {threshold:.14, rootMargin:'0px 0px -8% 0px'});
document.querySelectorAll('.rev:not(.on)').forEach(e=>io.observe(e));

/* contadores: cuentan una sola vez, al entrar en pantalla */
const ioNum = new IntersectionObserver(es=>{
  es.forEach(e=>{
    if(!e.isIntersecting) return;
    ioNum.unobserve(e.target);
    const el = e.target, fin = +el.dataset.cuenta, pre = el.dataset.pre || '';
    const dur = 1300, t0 = performance.now();
    const paso = t => {
      const k = Math.min(1, (t-t0)/dur);
      const suave = 1 - Math.pow(1-k, 3);
      el.textContent = pre + Math.round(fin*suave).toLocaleString('es-PE');
      if(k < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  });
}, {threshold:.5});
document.querySelectorAll('[data-cuenta]').forEach(e=>ioNum.observe(e));

/* el corte: mover el margen mueve la franja y las cotas */
const mg = $('#mg');
function pintarCorte(){
  const m = +mg.value;
  const util = m, costo = 100-m;
  $('#bCosto').style.flexGrow = costo;
  $('#bUtil').style.flexGrow  = util;
  $('#cCosto').style.flexGrow = costo;
  $('#cUtil').style.flexGrow  = util;
  $('#tCosto').textContent = 'S/ ' + costo.toFixed(2);
  $('#tUtil').textContent  = 'S/ ' + util.toFixed(2);
  $('#corteMg').textContent = m + '% queda';
}
mg.addEventListener('input', pintarCorte);
pintarCorte();

/* calculadora: cuánto vale un punto de margen, y si eso paga el sistema */
const COSTO_ANUAL = 200 * 12;
const cv = $('#cVenta'), cm = $('#cMargen');
function pintarCalc(){
  const venta = +cv.value, margen = +cm.value;
  const anual = venta * 12;
  const utilidad = anual * margen/100;
  const punto = anual * 0.01;
  const veces = punto / COSTO_ANUAL;

  $('#cVentaVal').textContent  = S_(venta);
  $('#cMargenVal').textContent = margen + '%';
  $('#cAnual').textContent     = S_(anual);
  $('#cUtilidad').textContent  = S_(utilidad);
  $('#cResultado').textContent = S_(punto);
  $('#cUtilidad').classList.toggle('v', true);

  // honesto en los dos sentidos: si un punto no alcanza, se dice
  $('#cRetorno').innerHTML = veces >= 1.15
    ? `Un punto de margen paga el sistema <b>${veces < 10 ? veces.toFixed(1) : Math.round(veces)} veces</b>.`
    : `Con recuperar <b>${(COSTO_ANUAL/punto).toFixed(1)} puntos</b> de margen, el sistema ya se pagó solo.`;
}
cv.addEventListener('input', pintarCalc);
cm.addEventListener('input', pintarCalc);
pintarCalc();
