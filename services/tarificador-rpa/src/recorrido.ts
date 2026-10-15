// Recorrido del trabajo (15/10/2026): captura LIGERA de cada pantalla/paso y, sobre todo, de cada diálogo/modal EN EL
// MOMENTO en que aparece. Antes el `inventarioDom` solo se tomaba al fallar (en Mapfre, con el diálogo ya cerrado) y cada
// prueba real descubría UNA pantalla desconocida. Capa COMÚN (runner): ningún adaptador toca esto.
//
// SOLO LECTURA: nada de clics, escritura ni navegación. NUNCA se lee el `.value` de un input/textarea ni las opciones de un
// `<select>`; de un campo solo su ETIQUETA. Todo lo que sale de la página pasa por `sanearCaptura` (@central/module-tarificacion):
// redactor del trabajo (secretos + documento/nombre del tomador), valores del riesgo, NIF/NIE/CIF, IBAN, correo, teléfono,
// matrícula, fechas y nombres tras «tomador/asegurado/titular/nombre». Topes: ~4 KB por captura, ~60 KB por trabajo.
//
// Dos fuentes:
//   · EN LA PÁGINA (init script en todos los marcos, también los de otro origen): un MutationObserver que, EN EL MISMO
//     MICROTAREA en que aparece un diálogo (antes de que nadie espere o actúe), toma la captura y la manda por un binding;
//     y otra al cambiar la firma de la pantalla (SPA sin navegación).
//   · DESDE EL RUNNER: `capturar(motivo, paso)` en cada transición (paso de la traza, tras el login, tras un avance, al
//     navegar y al fallar).

import { crearColectorRecorrido, type ColectorRecorrido, type MotivoCaptura, type Recorrido } from '@central/module-tarificacion'
import type { BrowserContext, Frame, Page } from 'playwright'

const NOMBRE_BINDING = '__rpaRecorrido'
const MAX_MARCOS = 6
const MAX_JSON_BINDING = 64 * 1024

/**
 * Cuerpo de la función que corre EN EL MARCO y devuelve la captura cruda. Va como TEXTO (tsx envuelve las funciones con
 * nombre en `__name`, que no existe en la página). Visible = con caja y sin `display:none`/`visibility:hidden`.
 */
const CUERPO_CAPTURA = `
  var corta = function (s, n) { return s == null ? null : (String(s).replace(/\\s+/g, ' ').trim().slice(0, n) || null); };
  var visible = function (el) {
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    var r = el.getBoundingClientRect();
    return !(r.width === 0 && r.height === 0);
  };
  var texto = function (el) { return corta(el.innerText || el.textContent || '', 80); };
  // Dentro de tablas/listas/opciones puede haber NOMBRES DE TERCEROS (homónimos del diálogo de tomador): de ahí solo se cuenta, no se lee.
  var SEL_LISTA = 'table,tr,li,ul,ol,select,datalist,[role=row],[role=grid],[role=table],[role=listitem],[role=list],[role=option],[role=listbox],[role=treeitem],[role=gridcell],mat-option,mat-list-item,mat-row,.mat-mdc-option,.mat-option';
  var enLista = function (el) { return !!el.closest(SEL_LISTA); };
  var SEL_DLG = 'dialog,[role=dialog],[role=alertdialog],[aria-modal=true],mat-dialog-container,.modal-dialog,.modal,.ui-dialog,.cdk-overlay-pane';
  var out = { url: location.href, titulo: corta(document.title, 80), encabezados: [], etiquetas: [], botones: [], enlaces: [], dialogos: [], tablas: [], campos: 0 };
  var hs = document.querySelectorAll('h1,h2,h3,h4,legend');
  for (var i = 0; i < hs.length && out.encabezados.length < 16; i++) { if (visible(hs[i]) && !enLista(hs[i])) { var t = texto(hs[i]); if (t) out.encabezados.push(t); } }
  var cs2 = document.querySelectorAll('input,select,textarea');
  for (var j = 0; j < cs2.length && j < 400; j++) {
    var c = cs2[j];
    var ty = (c.getAttribute('type') || '').toLowerCase();
    if (ty === 'hidden' || ty === 'password') continue;
    if (ty === 'button' || ty === 'submit' || ty === 'reset') { if (visible(c) && !enLista(c) && out.botones.length < 40) { var bt = corta(c.getAttribute('value'), 80); if (bt) out.botones.push(bt); } continue; }
    if (!visible(c) && !(c.labels && c.labels.length)) continue;
    out.campos++;
    if (out.etiquetas.length >= 60 || enLista(c)) continue;
    var et = null;
    if (c.labels && c.labels.length) et = corta(Array.prototype.map.call(c.labels, function (l) { return l.innerText || l.textContent || ''; }).join(' '), 80);
    if (!et) et = corta(c.getAttribute('aria-label'), 80);
    if (!et && c.getAttribute('aria-labelledby')) et = corta(c.getAttribute('aria-labelledby').split(/\\s+/).map(function (id) { var x = document.getElementById(id); return x ? (x.innerText || x.textContent || '') : ''; }).join(' '), 80);
    if (!et) et = corta(c.getAttribute('placeholder'), 80);
    if (et) out.etiquetas.push(et);
  }
  var bs = document.querySelectorAll('button,[role=button],[role=tab],[role=menuitem]');
  for (var k = 0; k < bs.length && k < 400 && out.botones.length < 40; k++) { if (visible(bs[k]) && !enLista(bs[k])) { var tb = texto(bs[k]); if (tb) out.botones.push(tb); } }
  // Tarjetas/filas de AngularJS (ng-click) con texto corto, fuera de tablas y listas (podrían ser nombres de clientes).
  var ngs = document.querySelectorAll('[ng-click],[data-ng-click]');
  for (var q = 0; q < ngs.length && q < 200 && out.botones.length < 40; q++) {
    var ng = ngs[q];
    if (enLista(ng) || !visible(ng)) continue;
    var tn = texto(ng);
    if (tn && tn.length <= 40) out.botones.push(tn);
  }
  var as = document.querySelectorAll('a');
  for (var m = 0; m < as.length && m < 400 && out.enlaces.length < 40; m++) { if (visible(as[m]) && !enLista(as[m])) { var ta = texto(as[m]); if (ta) out.enlaces.push(ta); } }
  var ds = document.querySelectorAll(SEL_DLG);
  for (var d = 0; d < ds.length && out.dialogos.length < 6; d++) {
    var dl = ds[d];
    if (!visible(dl)) continue;
    if (dl.parentElement && dl.parentElement.closest(SEL_DLG)) continue;
    var tit = corta(dl.getAttribute('aria-label'), 80);
    if (!tit && dl.getAttribute('aria-labelledby')) { var lb = document.getElementById(dl.getAttribute('aria-labelledby').split(/\\s+/)[0]); if (lb && !enLista(lb)) tit = texto(lb); }
    if (!tit) { var hhs = dl.querySelectorAll('h1,h2,h3,h4,h5,[class*=title],[class*=header]'); for (var hi = 0; hi < hhs.length; hi++) { if (!enLista(hhs[hi])) { tit = texto(hhs[hi]); break; } } }
    var bd = [];
    var dbs = dl.querySelectorAll('button,[role=button],input[type=button],input[type=submit]');
    for (var e = 0; e < dbs.length && bd.length < 10; e++) { if (visible(dbs[e]) && !enLista(dbs[e])) { var tdb = texto(dbs[e]) || corta(dbs[e].getAttribute('value'), 80); if (tdb) bd.push(tdb); } }
    out.dialogos.push({ rol: dl.getAttribute('role') || dl.tagName.toLowerCase(), id: dl.id || null, clase: corta(String(dl.getAttribute('class') || ''), 120), titulo: tit, botones: bd });
  }
  var ts = document.querySelectorAll('table');
  for (var u = 0; u < ts.length && out.tablas.length < 10; u++) { if (visible(ts[u])) out.tablas.push(ts[u].querySelectorAll('tbody tr, :scope > tr').length || ts[u].rows.length); }
  return out;
`

/** Extractor para `Frame.evaluate`. */
export const EXTRACTOR_CAPTURA = `(function () {${CUERPO_CAPTURA}})()`

/**
 * Init script (TEXTO) que corre en TODOS los marcos antes que el portal. Observa el DOM: cuando aparece un diálogo visible
 * (firma nueva), toma la captura en ese mismo microtarea y la manda al binding; cuando cambia la firma de la pantalla
 * (título + encabezados), manda otra tras 350 ms de calma. Nunca lanza; como mucho 40 capturas por marco.
 */
export const INIT_SCRIPT_RECORRIDO = `(function () {
  try {
    if (window.__rpaRecorridoOn) return;
    window.__rpaRecorridoOn = true;
    var snap = function () {${CUERPO_CAPTURA}};
    var enviar = function (motivo) {
      try {
        var f = window.${NOMBRE_BINDING};
        if (typeof f !== 'function') return;
        var c = snap(); c.motivo = motivo;
        f(JSON.stringify(c));
      } catch (e) {}
    };
    var SEL = 'dialog,[role=dialog],[role=alertdialog],[aria-modal=true],mat-dialog-container,.modal-dialog,.modal,.ui-dialog,.cdk-overlay-pane';
    var visible = function (el) {
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      var r = el.getBoundingClientRect();
      return !(r.width === 0 && r.height === 0);
    };
    var firmaDlg = function () {
      var out = [], ds = document.querySelectorAll(SEL);
      for (var i = 0; i < ds.length && out.length < 6; i++) if (visible(ds[i])) out.push((ds[i].id || '') + '|' + String(ds[i].getAttribute('class') || '').slice(0, 60) + '|' + ((ds[i].textContent || '').length));
      return out.join(';');
    };
    var firmaPantalla = function () {
      var hs = document.querySelectorAll('h1,h2,h3,legend'), out = [document.title];
      for (var i = 0; i < hs.length && out.length < 6; i++) out.push((hs[i].textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40));
      return out.join('|');
    };
    var ultDlg = '', ultPant = '', pend = false, n = 0, temporizador = null, ultVigilar = 0;
    var vigilar = function () {
      pend = false;
      ultVigilar = Date.now();
      try {
        var fd = firmaDlg();
        if (fd !== ultDlg) { ultDlg = fd; if (fd !== '' && n < 40) { n++; enviar('dialogo'); } }
        if (temporizador === null) temporizador = setTimeout(function () {
          temporizador = null;
          try { var fp = firmaPantalla(); if (fp !== ultPant) { ultPant = fp; if (n < 40) { n++; enviar('pantalla'); } } } catch (e) {}
        }, 350);
      } catch (e) {}
    };
    var arrancar = function () {
      if (!document.documentElement) { setTimeout(arrancar, 50); return; }
      new MutationObserver(function () {
        if (pend) return;
        pend = true;
        // Throttle ~250 ms: el primer cambio tras una calma se mira en el mismo microtarea (un diálogo no se escapa); los siguientes, diferidos.
        var dt = Date.now() - ultVigilar;
        if (dt >= 250) queueMicrotask(vigilar); else setTimeout(vigilar, 250 - dt);
      })
        .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'open', 'hidden', 'aria-hidden'] });
    };
    arrancar();
  } catch (e) {}
})();`

const conTope = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms).unref?.())])

type CrudoCaptura = {
  url?: unknown; titulo?: unknown; encabezados?: unknown[]; etiquetas?: unknown[]; botones?: unknown[]; enlaces?: unknown[]; dialogos?: unknown[]; tablas?: unknown[]; campos?: unknown
}
const lista = (x: unknown): unknown[] => (Array.isArray(x) ? x : [])

/** Une las capturas crudas de varios marcos (el principal primero) en UNA. Puro. */
export function unirMarcos(marcos: CrudoCaptura[]): CrudoCaptura | null {
  const [principal, ...resto] = marcos
  if (!principal) return null
  const todos = [principal, ...resto]
  return {
    url: principal.url,
    titulo: principal.titulo,
    encabezados: todos.flatMap((m) => lista(m.encabezados)),
    etiquetas: todos.flatMap((m) => lista(m.etiquetas)),
    botones: todos.flatMap((m) => lista(m.botones)),
    enlaces: todos.flatMap((m) => lista(m.enlaces)),
    dialogos: todos.flatMap((m) => lista(m.dialogos)),
    tablas: todos.flatMap((m) => lista(m.tablas)),
    campos: todos.reduce((n: number, m) => n + (typeof m.campos === 'number' ? m.campos : 0), 0),
  }
}

export type OpcionesRecorrido = {
  redactar?: (t: string) => string
  /** Valores concretos del riesgo (`valoresSensiblesDeRiesgo`): un texto que los contiene se quita. */
  valores?: readonly string[]
  log?: (m: string, d?: Record<string, unknown>) => void
  ahora?: () => number
}

export type CapturadorRecorrido = {
  colector: ColectorRecorrido
  /** Instala el binding y el init script en el contexto (ANTES de abrir páginas). Nunca lanza. */
  instalar: (context: BrowserContext) => Promise<void>
  /** Captura de las páginas del contexto (la más reciente primero). Nunca lanza; tope ~4 s. */
  capturar: (context: BrowserContext, motivo: MotivoCaptura, paso?: string) => Promise<void>
  recorrido: () => Recorrido
}

/**
 * Un capturador por TRABAJO (acumula los dos intentos en el mismo colector, con el tope de 60 KB). La captura nunca rompe
 * ni retrasa de forma apreciable el trabajo: todo con tope de tiempo y `catch`.
 */
export function crearCapturadorRecorrido(o: OpcionesRecorrido): CapturadorRecorrido {
  const colector = crearColectorRecorrido({ redactar: o.redactar, valores: o.valores, ahora: o.ahora })
  const instalar: CapturadorRecorrido['instalar'] = async (context) => {
    try {
      await context.exposeBinding(NOMBRE_BINDING, (_src, json: unknown) => {
        try {
          if (typeof json !== 'string' || json.length > MAX_JSON_BINDING) return
          colector.anadir(JSON.parse(json))
        } catch { /* una captura ilegible no rompe nada */ }
      })
      await context.addInitScript({ content: INIT_SCRIPT_RECORRIDO })
    } catch (e) {
      o.log?.('recorrido_no_instalado', { error: e instanceof Error ? e.name : typeof e })
    }
  }
  const capturar: CapturadorRecorrido['capturar'] = async (context, motivo, paso) => {
    try {
      const paginas = context.pages().filter((p: Page) => !p.isClosed())
      const pagina = paginas.at(-1)
      if (!pagina) return
      const fin = Date.now() + 4_000
      const crudos: CrudoCaptura[] = []
      for (const f of pagina.frames().slice(0, MAX_MARCOS) as Frame[]) {
        if (f.isDetached()) continue
        const resta = fin - Date.now()
        if (resta <= 0) break
        const c = await conTope(f.evaluate(EXTRACTOR_CAPTURA) as Promise<CrudoCaptura>, Math.min(1_500, resta))
        if (c && typeof c === 'object') crudos.push(c)
      }
      const unida = unirMarcos(crudos)
      if (unida) colector.anadir({ ...unida, motivo, ...(paso ? { paso } : {}) })
    } catch { /* la captura es accesoria */ }
  }
  return { colector, instalar, capturar, recorrido: () => colector.recorrido() }
}
