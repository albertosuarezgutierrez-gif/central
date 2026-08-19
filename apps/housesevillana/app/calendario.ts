// apps/housesevillana/app/calendario.ts
//
// Calendario de disponibilidad de la portada. Vive fuera de `route.ts` a propósito: ese fichero
// lo reescribe sola el agente SEO de sivra cada lunes por la GitHub Contents API, así que cuanto
// menos texto propio le metamos, menos superficie de choque. Aquí solo entra por cuatro líneas
// interpoladas.
//
// 🚨 NADA DE COMILLAS INVERTIDAS en el contenido de estas constantes, ni siquiera dentro de un
// comentario CSS: todo esto acaba dentro del template literal de `route.ts` y una backtick lo
// cierra y rompe el build.
//
// 🚨 La invariante que sostiene todo esto: una celda NACE en `sindato` y solo se pisa a `libre`
// con un dato explícito. Un fallo de red va al estado `error`, NUNCA a un calendario en verde.
// Enseñar libre una noche que está vendida es la forma más cara de mentir que tiene esta web.

import { MOTOR_RESERVAS } from './reservas'

/** Marca de la sección + leyenda + los tres estados (cargando, error, ok). */
export const CALENDARIO_HTML = `
<!-- CALENDARIO DE DISPONIBILIDAD -->
<section class="cal-sec" id="disponibilidad" data-estado="cargando" aria-busy="true">
  <div class="wrap">

    <div class="cal-head">
      <div class="cal-head-txt">
        <div class="tag">Calendario</div>
        <h2 class="cal-h">Noches libres de un vistazo</h2>
      </div>
      <div class="cal-nav">
        <button type="button" class="cal-btn" id="cal-prev" aria-label="Meses anteriores" aria-controls="cal-meses" disabled>
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7"/></svg>
        </button>
        <button type="button" class="cal-btn" id="cal-next" aria-label="Meses siguientes" aria-controls="cal-meses">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 5 7 7-7 7"/></svg>
        </button>
      </div>
    </div>

    <p class="s-sub cal-intro">Orientativo: el precio y las condiciones exactas de tus fechas se confirman en el motor de reservas.</p>

    <div class="cal-cargando" role="status">
      <p class="cal-esperando">Consultando disponibilidad&hellip;</p>
      <div class="cal-esq" aria-hidden="true"></div>
      <div class="cal-esq" aria-hidden="true"></div>
      <div class="cal-esq" aria-hidden="true"></div>
    </div>

    <div class="cal-error" role="alert">
      <svg class="ico cal-error-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2 1.8 20.8h20.4L12 3.2Z"/><path d="M12 9.6v4.8"/><path d="M12 17.8h.01"/></svg>
      <div class="cal-error-txt">
        <strong>No hemos podido consultar el calendario</strong>
        <p>No sabemos qu&eacute; noches est&aacute;n libres ahora mismo, as&iacute; que preferimos no ense&ntilde;arte un calendario que podr&iacute;a estar equivocado. El motor de reservas s&iacute; tiene la disponibilidad real.</p>
      </div>
      <a class="btn-p cal-error-cta" href="${MOTOR_RESERVAS}" target="_blank" rel="noopener">Ver disponibilidad real</a>
    </div>

    <div class="cal-cuerpo">
      <div class="cal-meses" id="cal-meses"></div>

      <ul class="cal-leyenda">
        <li class="cal-lg">
          <span class="cal-lg-sw" data-estado="libre" aria-hidden="true"><span class="cal-t"><span class="cal-num">9</span></span></span>
          <span class="cal-lg-t" data-estado="libre">Noche libre</span>
        </li>
        <li class="cal-lg">
          <span class="cal-lg-sw" data-estado="ocupada" aria-hidden="true"><span class="cal-t"><span class="cal-num">9</span></span></span>
          <span class="cal-lg-t" data-estado="ocupada">Noche ocupada</span>
        </li>
        <li class="cal-lg">
          <span class="cal-lg-sw" data-estado="sindato" aria-hidden="true"><span class="cal-t"><span class="cal-num">9</span></span></span>
          <span class="cal-lg-t" data-estado="sindato">Sin confirmar</span>
        </li>
        <li class="cal-lg">
          <span class="cal-lg-sw" data-estado="pasada" aria-hidden="true"><span class="cal-t"><span class="cal-num">9</span></span></span>
          <span class="cal-lg-t" data-estado="pasada">Fecha pasada</span>
        </li>
      </ul>

      <p class="cal-pie">
        <span class="cal-frescura" id="cal-frescura" data-txt="Disponibilidad actualizada el"></span>
        <a href="${MOTOR_RESERVAS}" class="cal-link" target="_blank" rel="noopener">Elegir fechas y ver precio &#8594;</a>
      </p>
    </div>

    <noscript><p class="cal-noscript">Activa JavaScript para ver el calendario de disponibilidad, o consulta las fechas directamente en el motor de reservas.</p></noscript>
  </div>
</section>`

/** Plantillas inertes que el JS clona. Van al final del body. */
export const CALENDARIO_PLANTILLAS = `
<template id="cal-tpl-mes">
  <div class="cal-mes-card">
    <table class="cal-mes">
      <caption class="cal-cap"></caption>
      <thead>
        <tr class="cal-dow">
          <th scope="col"><abbr></abbr></th><th scope="col"><abbr></abbr></th><th scope="col"><abbr></abbr></th>
          <th scope="col"><abbr></abbr></th><th scope="col"><abbr></abbr></th><th scope="col"><abbr></abbr></th>
          <th scope="col"><abbr></abbr></th>
        </tr>
      </thead>
      <tbody class="cal-body"></tbody>
    </table>
  </div>
</template>
<template id="cal-tpl-dia">
  <td class="cal-d" data-estado="sindato"><span class="cal-t"><span class="cal-num"></span></span></td>
</template>`

/**
 * CSS del calendario. Entra dentro del <style> de la portada.
 *
 * Usa los tokens que la landing YA tiene (--night, --cream, --clay, --accent-warm, --serif,
 * --sans, --r) en vez de inventar una paleta nueva.
 */
export const CALENDARIO_CSS = `
/* CALENDARIO DE DISPONIBILIDAD
   Vive en la MISMA banda oscura que #reserva: esta seccion se come el padding superior del
   .book-sec siguiente y deja una sola hairline entre ambos, para que se lea como una pieza y
   no como un widget pegado encima.
   Cuatro estados por noche, distinguibles SIN color: macizo (libre), rayado y tachado
   (ocupada), contorno discontinuo con interrogacion (sin dato) y plano sin caja (pasada).
   SIN DATO no se parece a LIBRE a proposito: significa que no lo sabemos, no que este
   disponible.
   OJO: esto vive dentro de un template literal de JS. Nada de comillas invertidas, ni siquiera
   en este comentario: cierran la plantilla y rompen el build. */
.cal-sec{background:var(--night);background-image:radial-gradient(ellipse 70% 50% at 50% -5%,rgba(196,87,31,.11) 0%,transparent 60%);padding:6rem 2.5rem 3rem}
.cal-sec + .book-sec{background-image:none;padding-top:0}
.cal-sec + .book-sec > .wrap{border-top:1px solid rgba(255,255,255,.07);padding-top:3.5rem}
.cal-sec .tag{color:rgba(244,164,122,.75)}
.cal-h{font-family:var(--serif);font-size:clamp(1.7rem,3vw,2.4rem);font-weight:400;color:var(--white);line-height:1.15;letter-spacing:-.01em}
.cal-head{display:flex;align-items:flex-end;justify-content:space-between;gap:1.5rem;flex-wrap:wrap}
.cal-intro{color:rgba(255,255,255,.5);margin:1rem 0 2rem;max-width:560px}
.cal-nav{display:flex;gap:.5rem;flex-shrink:0}
.cal-btn{width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.13);color:rgba(255,255,255,.72);display:flex;align-items:center;justify-content:center;font-size:1.15rem;cursor:pointer;transition:background .2s,border-color .2s,color .2s}
.cal-btn:hover:not(:disabled){background:rgba(255,255,255,.09);border-color:rgba(255,255,255,.22);color:var(--white)}
.cal-btn:disabled{opacity:.3;cursor:default}
.cal-cargando,.cal-error,.cal-cuerpo{display:none}
.cal-sec[data-estado="cargando"] .cal-cargando{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}
.cal-sec[data-estado="error"] .cal-error{display:flex}
.cal-sec[data-estado="ok"] .cal-cuerpo{display:block}
.cal-esperando{grid-column:1/-1;font-size:.8rem;color:rgba(255,255,255,.4);letter-spacing:.05em;text-transform:uppercase;margin-bottom:.25rem}
.cal-esq{height:296px;border-radius:var(--r);border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.035);background-image:linear-gradient(100deg,rgba(255,255,255,0) 20%,rgba(255,255,255,.05) 50%,rgba(255,255,255,0) 80%);background-size:220% 100%;animation:cal-brillo 1.5s linear infinite}
@keyframes cal-brillo{from{background-position:120% 0}to{background-position:-120% 0}}
/* ERROR: visible, honesto y con salida al motor de reservas. */
.cal-error{align-items:center;gap:1.25rem;flex-wrap:wrap;text-align:left;background:rgba(196,87,31,.09);border:1px solid rgba(196,87,31,.30);border-radius:var(--r);padding:1.5rem}
.cal-error-ico{font-size:1.75rem;color:var(--accent-warm);align-self:flex-start}
.cal-error-txt{flex:1 1 260px;min-width:0}
.cal-error-txt strong{display:block;color:var(--white);font-size:.975rem;font-weight:600;letter-spacing:-.015em;margin-bottom:.35rem}
.cal-error-txt p{font-size:.875rem;color:rgba(255,255,255,.55);line-height:1.65;font-weight:300}
.cal-error-cta{flex-shrink:0;min-height:44px;display:inline-flex;align-items:center}
.cal-meses{display:grid;grid-template-columns:1fr;gap:1rem}
.cal-mes-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:var(--r);padding:1.25rem 1rem 1.4rem}
.cal-mes{width:100%;border-collapse:collapse;table-layout:fixed}
.cal-cap{font-family:var(--serif);font-size:1.3rem;font-weight:400;color:var(--white);text-align:left;text-transform:capitalize;letter-spacing:.01em;padding-bottom:.9rem}
.cal-dow th{font-size:.63rem;font-weight:500;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.34);padding-bottom:.5rem}
.cal-dow abbr{text-decoration:none;border:none;cursor:default}
/* La CELDA es el objetivo tactil (44px minimo); el azulejo visible va dentro, con 2px de aire. */
.cal-d{position:relative;height:44px;padding:0;text-align:center}
.cal-t{position:absolute;inset:2px;display:flex;align-items:center;justify-content:center;border-radius:10px}
.cal-num{font-size:.82rem;font-weight:400;font-variant-numeric:tabular-nums;line-height:1;letter-spacing:0}
/* LIBRE: el unico macizo. Sin color ya se distingue de los otros tres. */
.cal-sec [data-estado="libre"]>.cal-t{background:var(--cream)}
.cal-sec [data-estado="libre"] .cal-num{color:var(--text);font-weight:500}
/* OCUPADA: trama diagonal + numero tachado. */
.cal-sec [data-estado="ocupada"]>.cal-t{background-color:rgba(255,255,255,.05);background-image:repeating-linear-gradient(45deg,rgba(255,255,255,0) 0 3px,rgba(255,255,255,.10) 3px 5px)}
.cal-sec [data-estado="ocupada"] .cal-num{color:rgba(255,255,255,.62);text-decoration:line-through;text-decoration-thickness:1px;text-decoration-color:rgba(255,255,255,.5)}
/* SIN DATO: hueco, borde discontinuo e interrogacion. Es lo CONTRARIO de libre. */
.cal-sec [data-estado="sindato"]>.cal-t{background:none;border:1px dashed rgba(255,255,255,.42)}
.cal-sec [data-estado="sindato"] .cal-num{color:rgba(255,255,255,.62)}
.cal-sec [data-estado="sindato"]>.cal-t::after{content:'?';position:absolute;top:2px;right:4px;font-size:.6rem;line-height:1;font-weight:600;color:rgba(255,255,255,.62)}
/* PASADA: sin caja de ningun tipo, se retira del plano. */
.cal-sec [data-estado="pasada"]>.cal-t{background:none;border:none}
.cal-sec [data-estado="pasada"] .cal-num{color:rgba(255,255,255,.45)}
.cal-d[data-hoy]>.cal-t{box-shadow:0 0 0 1.5px var(--clay)}
.cal-fuera{visibility:hidden}
.cal-d[data-estado="libre"]{cursor:pointer}
.cal-d[data-estado="libre"]:hover>.cal-t{box-shadow:0 0 0 2px var(--accent-warm)}
/* LEYENDA: usa los MISMOS azulejos, no cuadritos de color aparte. */
.cal-leyenda{list-style:none;display:flex;flex-wrap:wrap;gap:.6rem 1.5rem;margin-top:1.5rem;padding-top:1.25rem;border-top:1px solid rgba(255,255,255,.06)}
.cal-lg{display:flex;align-items:center;gap:.55rem}
.cal-lg-sw{position:relative;display:inline-block;width:28px;height:28px;flex-shrink:0}
.cal-lg-t{font-size:.78rem;color:rgba(255,255,255,.55);font-weight:300;letter-spacing:-.01em}
.cal-pie{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-top:1.25rem}
.cal-frescura{font-size:.762rem;color:rgba(255,255,255,.34);font-weight:300}
.cal-link{font-size:.875rem;color:var(--accent-warm);font-weight:500;letter-spacing:-.01em;display:inline-flex;align-items:center;min-height:44px;transition:color .2s}
.cal-link:hover{color:var(--white)}
.cal-noscript{font-size:.875rem;color:rgba(255,255,255,.55);line-height:1.65;font-weight:300;border-left:2px solid rgba(244,164,122,.4);padding-left:1rem}
.cal-sec :focus-visible{outline:2px solid var(--accent-warm);outline-offset:2px;border-radius:4px}
@media(min-width:721px){.cal-meses{grid-template-columns:repeat(2,1fr)}}
@media(min-width:1025px){.cal-meses{grid-template-columns:repeat(3,1fr)}.cal-d{height:48px}}
@media(max-width:768px){
  .cal-sec{padding:3.5rem 1.25rem 2rem}
  .cal-sec + .book-sec > .wrap{padding-top:2.5rem}
  .cal-head{align-items:center}
  .cal-intro{margin-bottom:1.5rem}
  .cal-sec[data-estado="cargando"] .cal-cargando{grid-template-columns:1fr}
  .cal-esq:nth-of-type(n+2){display:none}
  .cal-error{padding:1.25rem}
  .cal-error-cta{width:100%;justify-content:center}
  .cal-pie{flex-direction:column;align-items:flex-start;gap:.25rem}
}
@media(max-width:720px){
  /* Un mes por pantalla en movil; las flechas desplazan la ventana de uno en uno. */
  .cal-meses>.cal-mes-card:nth-child(n+2){display:none}
}
@media(max-width:400px){
  /* A 320px, 7 celdas de 44px son 308px: no cabe ni un pixel de padding lateral. La rejilla se
     sale del wrap y la tarjeta del mes pierde bordes y radio para dejar exactamente esos 308. */
  .cal-meses{margin-inline:-1.25rem}
  .cal-mes-card{border-left:none;border-right:none;border-radius:0;padding:1rem .375rem 1.1rem}
  .cal-cap,.cal-dow th:first-child{padding-left:.25rem}
  .cal-num{font-size:.78rem}
}
@media(prefers-reduced-motion:reduce){.cal-esq{animation:none;background-image:none}}`

/** Origen del endpoint público de disponibilidad (apps/plataforma). */
const API_DISPONIBILIDAD =
  'https://plataforma-ten-flame.vercel.app/api/publico/disponibilidad?piso=house-sevillana&meses=12'

/**
 * Script del calendario. Va al final del body, dentro de un <script>.
 *
 * Las tres invariantes que NO se pueden tocar, por orden de lo caro que sale romperlas:
 *
 *   1. Toda celda nace en 'sindato' y solo pasa a 'libre' con un dato explícito de la API. Si
 *      la respuesta cubre 12 de 90 noches, las otras 78 salen huecas, no libres.
 *   2. Un fallo de red va al estado 'error'. NUNCA a 'ok' con todo en sindato: son cosas
 *      distintas y pintarlas igual convierte una caída en un calendario aparentemente vacío.
 *   3. 'pasada' gana a todo lo demás.
 */
export const CALENDARIO_JS = `
(function(){
  var sec = document.getElementById('disponibilidad');
  if (!sec) return;

  var LANG = document.documentElement.lang || 'es';
  var tplMes = document.getElementById('cal-tpl-mes');
  var tplDia = document.getElementById('cal-tpl-dia');
  var cont = document.getElementById('cal-meses');
  var elFrescura = document.getElementById('cal-frescura');
  var btnPrev = document.getElementById('cal-prev');
  var btnNext = document.getElementById('cal-next');

  // Las etiquetas de estado se LEEN de la leyenda en vez de repetirse aquí: así el aria-label
  // de cada celda queda traducido por el mismo diccionario que traduce la leyenda, sin duplicar
  // ni una cadena en este script.
  function etiqueta(estado){
    var el = sec.querySelector('.cal-lg-t[data-estado="' + estado + '"]');
    return el ? el.textContent.trim() : estado;
  }

  var fMes = new Intl.DateTimeFormat(LANG, { month:'long', year:'numeric' });
  var fDiaLargo = new Intl.DateTimeFormat(LANG, { day:'numeric', month:'long', year:'numeric' });
  var fCorto = new Intl.DateTimeFormat(LANG, { weekday:'short' });
  var fLargo = new Intl.DateTimeFormat(LANG, { weekday:'long' });

  // Primer día de la semana según el idioma (lunes en es/it, domingo en en-US...). Si el
  // navegador no expone weekInfo, lunes.
  var primerDia = 1;
  try {
    var loc = new Intl.Locale(LANG);
    var wi = loc.weekInfo || (loc.getWeekInfo && loc.getWeekInfo());
    if (wi && wi.firstDay) primerDia = wi.firstDay;
  } catch (e) {}

  function iso(d){
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var isoHoy = iso(hoy);
  var primerMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  var VENTANA_MESES = 12;
  var desplazamiento = 0;

  // Los dos cubos NEGATIVOS. Una noche es libre solo si NO está en ninguno, y eso solo puede
  // pasar cuando la API ha respondido: hasta entonces todo está en sinDato.
  var ocupadas = null, sinDato = null;

  function estadoDe(fechaIso){
    if (fechaIso < isoHoy) return 'pasada';
    if (!ocupadas) return 'sindato';
    if (ocupadas[fechaIso]) return 'ocupada';
    if (sinDato[fechaIso]) return 'sindato';
    return 'libre';
  }

  function pintar(){
    cont.textContent = '';
    for (var i = 0; i < 3; i++) {
      var base = new Date(primerMes.getFullYear(), primerMes.getMonth() + desplazamiento + i, 1);
      cont.appendChild(mes(base));
    }
    btnPrev.disabled = desplazamiento === 0;
    btnNext.disabled = desplazamiento + paso() >= VENTANA_MESES;
  }

  function paso(){
    return window.matchMedia('(max-width:720px)').matches ? 1 : 3;
  }

  function mes(base){
    var frag = tplMes.content.cloneNode(true);
    frag.querySelector('.cal-cap').textContent = fMes.format(base);

    var ths = frag.querySelectorAll('.cal-dow abbr');
    for (var d = 0; d < 7; d++) {
      // 2026-01-04 fue domingo: sirve de ancla para nombrar los días sin depender del mes.
      var ref = new Date(2026, 0, 4 + ((primerDia + d) % 7));
      ths[d].textContent = fCorto.format(ref);
      ths[d].setAttribute('title', fLargo.format(ref));
    }

    var body = frag.querySelector('.cal-body');
    var dias = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    var offset = (base.getDay() - primerDia + 7) % 7;
    var fila = document.createElement('tr');

    for (var h = 0; h < offset; h++) fila.appendChild(hueco());

    for (var dia = 1; dia <= dias; dia++) {
      if (fila.children.length === 7) { body.appendChild(fila); fila = document.createElement('tr'); }
      fila.appendChild(celda(new Date(base.getFullYear(), base.getMonth(), dia)));
    }
    while (fila.children.length < 7) fila.appendChild(hueco());
    body.appendChild(fila);
    return frag;
  }

  function hueco(){
    // Sin data-estado a propósito: un relleno de mes no es una noche y no debe leerse como tal.
    var td = document.createElement('td');
    td.className = 'cal-d cal-fuera';
    return td;
  }

  function celda(fecha){
    var frag = tplDia.content.cloneNode(true);
    var td = frag.querySelector('td');
    var f = iso(fecha);
    var estado = estadoDe(f);
    td.setAttribute('data-estado', estado);
    td.querySelector('.cal-num').textContent = String(fecha.getDate());
    var texto = fDiaLargo.format(fecha) + ': ' + etiqueta(estado);
    td.setAttribute('aria-label', texto);
    td.setAttribute('title', texto);
    if (f === isoHoy) { td.setAttribute('data-hoy',''); td.setAttribute('aria-current','date'); }
    if (estado === 'libre') {
      td.setAttribute('role','link');
      td.setAttribute('tabindex','0');
      td.addEventListener('click', function(){ abrirMotor(fecha); });
      td.addEventListener('keydown', function(ev){
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrirMotor(fecha); }
      });
    }
    return frag;
  }

  function abrirMotor(fecha){
    // El motor de Smoobu espera dd/mm/yyyy, NO ISO — al contrario que su API. Si algún día
    // dejara de aceptar el parámetro, esto degrada a abrir el motor sin fecha, que es lo que
    // hacía el botón antes: por eso se puede intentar sin haberlo verificado en vivo.
    var dd = String(fecha.getDate()).padStart(2,'0');
    var mm = String(fecha.getMonth()+1).padStart(2,'0');
    var url = '${MOTOR_RESERVAS}' + '&arrivalDate=' + dd + '/' + mm + '/' + fecha.getFullYear() + '&loadForCurrentDate=true';
    window.open(url, '_blank', 'noopener');
  }

  function estado(nuevo){
    sec.setAttribute('data-estado', nuevo);
    sec.setAttribute('aria-busy', nuevo === 'cargando' ? 'true' : 'false');
  }

  btnPrev.addEventListener('click', function(){
    desplazamiento = Math.max(0, desplazamiento - paso()); pintar();
  });
  btnNext.addEventListener('click', function(){
    desplazamiento = Math.min(VENTANA_MESES - paso(), desplazamiento + paso()); pintar();
  });

  fetch('${API_DISPONIBILIDAD}', { headers: { 'Accept':'application/json' } })
    .then(function(r){ if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
    .then(function(d){
      if (!d || !Array.isArray(d.ocupadas) || !Array.isArray(d.sinDato)) throw new Error('respuesta ilegible');
      ocupadas = {}; sinDato = {};
      d.ocupadas.forEach(function(f){ ocupadas[f] = true; });
      d.sinDato.forEach(function(f){ sinDato[f] = true; });
      if (d.fuente === 'snapshot' && d.actualizado) {
        var f = new Date(d.actualizado);
        elFrescura.textContent = etiquetaFrescura(f);
      }
      pintar();
      estado('ok');
    })
    .catch(function(){
      // Aquí NO se pinta nada. Un fallo de red no es un calendario vacío: es no saberlo, y lo
      // honesto es decirlo y mandar al motor, que sí tiene la disponibilidad real.
      estado('error');
    });

  function etiquetaFrescura(f){
    // El texto sale del atributo data-txt del propio elemento, que SI pasa por el diccionario
    // (traducir() sustituye sobre todo el documento, atributos incluidos). Si estuviera aquí
    // dentro, la version inglesa lo serviria en castellano.
    var txt = elFrescura.getAttribute('data-txt') || '';
    return (txt + ' ' + new Intl.DateTimeFormat(LANG, { day:'numeric', month:'long' }).format(f)).trim();
  }
})();`
