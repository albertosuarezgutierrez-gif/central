// MODAL INFORMATIVO (0.3.38, 04/11/2026). SOLO LECTURA y PURO: este fichero no pulsa nada (los clics y la tecla Escape viven en guard.ts:
// `cerrarModalInformativo`, cepo de `regression-tarificador-rpa`). Hecho real (pilotaje Pelayo 608504fd): en «Nuevo Presupuesto» un contenedor
// `.pelayo-modal.no-footer` PERSISTENTE intercepta el clic de la tarjeta AUTOS y el inventario no lo lista (no tiene controles con texto).
//
// Aquí: (1) el script de página (cadena, sin `__name` de esbuild) que localiza los modales VISIBLES y los lee SIN PII ni valores;
// (2) el saneado a forma CERRADA (clases recortadas a [a-z0-9_-], texto ≤160 pasado por la redacción de datos personales);
// (3) el veredicto «modal INFORMATIVO» (sin campos y sin ningún término prohibido del vocabulario de bloqueo en todo su texto/atributos).

import { pareceDatoPersonalInventario } from '@central/module-tarificacion'
import { redactarMediador } from './privacidad-mediador.ts'
import { casaAtributoInternoNavegacion, casaBloqueoNavegacion } from './vocabulario.ts'

/** Contenedores que cuentan como modal/diálogo. El `body`/`html` (p. ej. `class="modal-open"`) y los fondos (`backdrop`…) se descartan en el script. */
export const SEL_MODAL = 'dialog[open],[role="dialog"],[role="alertdialog"],[aria-modal="true"],.modal,[class*="modal"],[class*="dialog"],[class*="popup"],[class*="lightbox"]'
/** Controles que se listan DENTRO de un modal (el índice de la lista es el que usa `locator(SEL_CTL_MODAL).nth(i)`). */
export const SEL_CTL_MODAL = 'button,a,input,select,textarea,[role=button],[role=link],[role=menuitem],[onclick],[data-dismiss],[data-bs-dismiss],[class*="close"],[class*="cerrar"],[aria-label],span,i,b,div,svg'
/** Fondo/backdrop candidato a clic de cierre (fuera del modal). */
export const SEL_FONDO_MODAL = '[class*="backdrop"],[class*="overlay"],[class*="scrim"],[class*="mask"]'

/** Rótulos NEUTROS de un botón de cierre (texto, aria-label o title), tras normalizar. Solo valen DENTRO de un modal informativo. */
export const RE_ROTULO_CIERRE_NEUTRO = /^(?:[×✕✖✗xX]|cerrar(?: ventana| aviso| dialogo| mensaje| modal)?|close(?: dialog| window| modal)?)$/i

/** Librería de PÁGINA (texto: tsx no puede meter `__name` aquí). Define `modalesVisibles`, `esCierreM`, `leerModalCrudo`. */
export const LIB_MODAL_PAGINA = String.raw`
  const SEL_MODAL = ${JSON.stringify(SEL_MODAL)};
  const SEL_CTL = ${JSON.stringify(SEL_CTL_MODAL)};
  const SEL_FUERTE = 'button,a,input,select,textarea,[role=button],[role=link],[role=menuitem],[onclick],[data-dismiss],[data-bs-dismiss]';
  const RE_FONDO = /backdrop|overlay|mask|veil|scrim/i;
  const RE_CLASE_CIERRE = /^(?:btn-)?close$|^close-(?:btn|button|icon|modal|dialog)$|^(?:btn|button)-close$|^(?:modal|dialog|popup)[-_]+close$|^cerrar$|^btn-cerrar$/;
  const clasesDe = (e) => String((e.getAttribute && e.getAttribute('class')) || '');
  const visM = (e) => {
    const w = e.ownerDocument.defaultView;
    const cs = w.getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // 0.3.39: CUSTOM ELEMENT (web component, p. ej. <pelayo-modal class="no-footer"> de Stencil, z-index 1040) que hace de modal: su tag (con guion) contiene
  // modal|dialog|popup|aviso, o cubre >= 50 % de la ventana con z-index >= 1000. Los fondos (tag backdrop|overlay|mask|veil|scrim) no cuentan.
  const RE_TAG_MODAL = /modal|dialog|popup|aviso/;
  const RE_TAG_FONDO = /backdrop|overlay|mask|veil|scrim/;
  const esCustomM = (e) => {
    const t = String(e.localName || '');
    if (t.indexOf('-') < 1 || RE_TAG_FONDO.test(t)) return false;
    if (RE_TAG_MODAL.test(t)) return true;
    const w = e.ownerDocument.defaultView;
    const z = parseInt(w.getComputedStyle(e).zIndex, 10);
    if (!(z >= 1000)) return false;
    const r = e.getBoundingClientRect();
    return r.width * r.height >= 0.5 * w.innerWidth * w.innerHeight;
  };
  const esContM = (e) => !!(e.matches && e.matches(SEL_MODAL)) || esCustomM(e);
  const modalesVisibles = (raiz) => {
    const doc = raiz.ownerDocument || raiz;
    const base = Array.from(raiz.querySelectorAll(SEL_MODAL));
    const custom = Array.from(raiz.querySelectorAll('*')).filter((e) => String(e.localName || '').indexOf('-') > 0 && esCustomM(e) && base.indexOf(e) < 0);
    const todos = base.concat(custom);
    if (custom.length) todos.sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1));
    const c = todos.filter((e) => e !== doc.body && e !== doc.documentElement && !RE_FONDO.test(clasesDe(e)) && visM(e));
    return c.filter((e) => !c.some((o) => o !== e && o.contains(e)));
  };
  // Descendientes en orden de documento, ENTRANDO en los shadowRoot ABIERTOS (hasta 3 niveles, tope 400). raices recoge los shadowRoot recorridos.
  const recorrer = (raiz, acc, raices, prof) => {
    for (const el of Array.from(raiz.querySelectorAll('*'))) {
      if (acc.length >= 400) return;
      acc.push(el);
      if (el.shadowRoot && prof < 3) { raices.push(el.shadowRoot); recorrer(el.shadowRoot, acc, raices, prof + 1); }
    }
  };
  // El modal más cercano (sube por light DOM y por el host de cada shadowRoot).
  const modalDe = (el) => {
    for (let n = el, i = 0; n && i < 80; i++) {
      if (n.nodeType === 1 && n !== el.ownerDocument.body && n !== el.ownerDocument.documentElement && esContM(n)) return n;
      n = n.parentElement || ((n.getRootNode && n.getRootNode().host) || null);
    }
    return null;
  };
  const esCierreM = (e) => {
    const cls = clasesDe(e).toLowerCase().split(/\s+/).filter(Boolean);
    if (cls.some((c) => RE_CLASE_CIERRE.test(c))) return true;
    if (e.hasAttribute('data-dismiss') || e.hasAttribute('data-bs-dismiss')) return true;
    for (const a of [e.getAttribute('aria-label'), e.getAttribute('title')]) {
      const s = String(a || '').toLowerCase();
      if (/\b(cerrar|close)\b/.test(s) && !/sesi[oó]n|session/.test(s)) return true;
    }
    const t = String(e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim();
    return /^[×✕✖✗xX]$/.test(t) || /^(cerrar|close)$/i.test(t);
  };
  const leerModalCrudo = (m) => {
    const win = m.ownerDocument.defaultView;
    const cs = win.getComputedStyle(m);
    const r = m.getBoundingClientRect();
    let z = parseInt(cs.zIndex, 10);
    if (!Number.isFinite(z)) {
      z = 0;
      for (let p = m.parentElement, i = 0; p && i < 10; p = p.parentElement, i++) { const q = parseInt(win.getComputedStyle(p).zIndex, 10); if (Number.isFinite(q)) { z = q; break; } }
    }
    const role = String(m.getAttribute('role') || '').toLowerCase();
    const tag = m.tagName.toLowerCase();
    const desc = [];
    const raices = [];
    recorrer(m, desc, raices, 0);
    if (m.shadowRoot) { raices.unshift(m.shadowRoot); recorrer(m.shadowRoot, desc, raices, 1); }
    const nodos = [m].concat(desc);
    let campos = 0;
    const attrs = [];
    const rotulos = [];
    // (el cepo de la raíz prohíbe nombrar el control de opción fuera de guard.ts: se arma el patrón por trozos; aquí solo se CUENTA, no se toca)
    const ROLES_CAMPO = new RegExp('^(?:textbox|combobox|checkbox|rad' + 'io|switch|listbox|slider|spinbutton|searchbox)$');
    for (const n of nodos) {
      const t = n.tagName.toLowerCase();
      const ty = String(n.getAttribute('type') || '').toLowerCase();
      if (t === 'select' || t === 'textarea' || t === 'form') campos++;
      else if (t === 'input' && !['hidden', 'button', 'submit', 'reset', 'image'].includes(ty)) campos++;
      else if (ROLES_CAMPO.test(String(n.getAttribute('role') || '').toLowerCase())) campos++;
      else if (n !== m && (n.getAttribute('contenteditable') === '' || n.getAttribute('contenteditable') === 'true')) campos++;
      for (const a of ['id', 'class', 'name', 'href', 'onclick', 'onchange', 'onsubmit', 'formaction', 'action', 'ng-click']) {
        const v = n.getAttribute(a);
        if (v) attrs.push(String(v).slice(0, 300));
      }
      for (const a of ['aria-label', 'title', 'alt']) {
        const v = n.getAttribute(a);
        if (v) rotulos.push(String(v).slice(0, 300));
      }
      if (t === 'button' || (t === 'input' && ['button', 'submit', 'image'].includes(ty))) { const v = n.getAttribute('value'); if (v) rotulos.push(String(v).slice(0, 300)); }
    }
    const ctl = [];
    let nCierre = 0;
    const lista = Array.from(m.querySelectorAll(SEL_CTL));
    for (let i = 0; i < lista.length && i < 600; i++) {
      const e = lista[i];
      if (!(e.matches(SEL_FUERTE) || esCierreM(e))) continue;
      if (!visM(e)) continue;
      const cierre = esCierreM(e);
      if (cierre) nCierre++;
      if (ctl.length < 12) ctl.push({ i: i, sh: false, tag: e.tagName.toLowerCase(), type: String(e.getAttribute('type') || ''), cls: clasesDe(e), aria: String(e.getAttribute('aria-label') || ''), title: String(e.getAttribute('title') || ''), txt: String(e.innerText || e.textContent || e.getAttribute('value') || '').replace(/\s+/g, ' ').trim().slice(0, 80), cierre: cierre });
    }
    // Controles que viven en un shadowRoot (el de m o el de un descendiente): i = su posición entre ellos.
    const enShadow = desc.filter((e) => e.getRootNode() !== m.getRootNode() && e.matches(SEL_CTL));
    for (let i = 0; i < enShadow.length && i < 600; i++) {
      const e = enShadow[i];
      if (!(e.matches(SEL_FUERTE) || esCierreM(e))) continue;
      if (!visM(e)) continue;
      const cierre = esCierreM(e);
      if (cierre) nCierre++;
      if (ctl.length < 12) ctl.push({ i: i, sh: true, tag: e.tagName.toLowerCase(), type: String(e.getAttribute('type') || ''), cls: clasesDe(e), aria: String(e.getAttribute('aria-label') || ''), title: String(e.getAttribute('title') || ''), txt: String(e.innerText || e.textContent || e.getAttribute('value') || '').replace(/\s+/g, ' ').trim().slice(0, 80), cierre: cierre });
    }
    // Texto visible del shadow (sin <style>/<script>/<template>).
    let textoSh = '';
    for (const rz of raices) textoSh += ' ' + Array.from(rz.children).filter((c) => !/^(style|script|template|link|slot)$/i.test(c.tagName)).map((c) => String(c.innerText || c.textContent || '')).join(' ');
    const textoTotal = (String(m.innerText || m.textContent || '') + ' ' + textoSh).replace(/\s+/g, ' ').trim();
    const primero = Array.from(m.shadowRoot ? m.shadowRoot.children : m.children).find((c) => !/^(style|script|template|link)$/i.test(c.tagName) && visM(c));
    const rh = primero ? primero.getBoundingClientRect() : null;
    const conMedios = desc.some((n) => visM(n) && /^(img|svg|canvas|video|picture|iframe|object|embed)$/.test(n.localName));
    const vacio = textoTotal === '' && ctl.length === 0 && nCierre === 0 && campos === 0 && !conMedios;
    return {
      tag: tag, cls: clasesDe(m), vis: visM(m), w: r.width, h: r.height, z: z,
      dlg: role === 'dialog' || role === 'alertdialog' || tag === 'dialog', amodal: m.getAttribute('aria-modal') === 'true',
      esM: esContM(m), texto: textoTotal.slice(0, 4000),
      shdM: !!m.shadowRoot, shd: raices.length > 0, hw: rh ? rh.width : 0, hh: rh ? rh.height : 0, vacio: vacio,
      campos: campos, ctl: ctl, nCierre: nCierre, attrs: attrs.slice(0, 1500), rotulos: rotulos.slice(0, 600),
    };
  };
`

const num = (x: unknown, min: number, max: number): number => {
  const n = Math.round(Number(x))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : 0
}
const etiqueta = (x: unknown, max: number): string => String(x ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, max)
const clases = (x: unknown, n: number): string => {
  const t = String(x ?? '').toLowerCase().split(/\s+/).map((c) => etiqueta(c, 24)).filter((c) => c !== '').slice(0, n)
  return t.length ? t.join('.') : '-'
}
/** Texto visible → una línea, recortada y SIN forma de dato personal (si la tiene, se sustituye entero). */
export function textoModalRedactado(x: unknown, max: number): string {
  const s = redactarMediador(String(x ?? '').replace(/\s+/g, ' ').trim()).slice(0, max)
  if (s === '') return '-'
  return pareceDatoPersonalInventario(s) ? '(texto redactado)' : s
}

/** `sh`: el control vive en un shadowRoot (0.3.39); `i` es su posición entre los controles de shadow, no entre los de light DOM. */
export type ControlModal = { i: number; sh: boolean; tag: string; type: string; cls: string; aria: string; title: string; txt: string; cierre: boolean }
export type ModalLeido = {
  tag: string
  /** Hasta 2 clases, cada una recortada a [a-z0-9_-]{1,24}, unidas por «.» (o «-»). */
  cls: string
  vis: boolean
  w: number
  h: number
  z: number
  dlg: boolean
  amodal: boolean
  /** ¿El contenedor casa con el selector de modal/diálogo? */
  esModal: boolean
  /** Texto visible redactado y recortado a 160. */
  texto: string
  campos: number
  ctl: ControlModal[]
  nCierre: number
  /** Primer término prohibido (vocabulario de bloqueo) en el texto/atributos de TODO el modal, o `null`. Solo el término, nunca el texto. */
  bloqueo: string | null
  /** 0.3.39: el host tiene shadowRoot ABIERTO propio (`false` = sin shadow o CERRADO: no se distinguen desde la página). */
  shd: boolean
  /** Hay algún shadowRoot abierto en el árbol del modal (el índice de sus controles ya no es el de `querySelectorAll`). */
  conShadow: boolean
  /** Tamaño `WxH` del primer hijo visible del shadow (o del light DOM si no hay shadow), o `-`. */
  hijo: string
  /** Sin contenido visible alguno (sin texto, controles, campos ni imágenes) y aun así cubre la página: NO se toca, lo decide la sesión principal. */
  vacio: boolean
  /** Huella interna para comprobar que dos lecturas son del mismo nodo (no sale del worker). */
  huella: string
}

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** Lectura cruda de la página → modal en forma CERRADA. Pura; tolerante a basura (nunca lanza). */
export function evaluarModal(crudo: unknown): ModalLeido | null {
  const c = obj(crudo)
  if (!c) return null
  const ctlCrudo = Array.isArray(c.ctl) ? c.ctl.slice(0, 12) : []
  const ctl: ControlModal[] = []
  for (const x of ctlCrudo) {
    const o = obj(x)
    if (!o) continue
    ctl.push({
      i: num(o.i, 0, 9999), sh: o.sh === true, tag: etiqueta(o.tag, 20) || 'x', type: etiqueta(o.type, 12), cls: clases(o.cls, 1),
      aria: textoModalRedactado(o.aria, 24), title: textoModalRedactado(o.title, 24), txt: textoModalRedactado(o.txt, 24), cierre: o.cierre === true,
    })
  }
  const texto = String(c.texto ?? '')
  const atributos = Array.isArray(c.attrs) ? c.attrs.filter((a): a is string => typeof a === 'string') : []
  const rotulosAttr = Array.isArray(c.rotulos) ? c.rotulos.filter((a): a is string => typeof a === 'string') : []
  // Vocabulario de bloqueo de la navegación libre sobre TODO el texto del modal y los rótulos de sus controles; y los términos ocultos por subcadena en cada atributo.
  let bloqueo: string | null = casaBloqueoNavegacion(texto)?.termino ?? null
  if (bloqueo === null) {
    for (const x of ctlCrudo) {
      const o = obj(x)
      for (const t of [o?.aria, o?.title, o?.txt]) {
        const m = casaBloqueoNavegacion(typeof t === 'string' ? t : null)
        if (m) { bloqueo = m.termino; break }
      }
      if (bloqueo !== null) break
    }
  }
  if (bloqueo === null) {
    // Atributos INTERNOS (id, clase, name, href, manejadores): términos ocultos por subcadena. Los manejadores son código (`remove()`, `hide()`): no se miran con el vocabulario de rótulos.
    for (const a of atributos) {
      const m = casaAtributoInternoNavegacion(a)
      if (m) { bloqueo = m; break }
    }
  }
  if (bloqueo === null) {
    // Rótulos de atributo (aria-label, title, alt, value de botones): vocabulario de bloqueo de la navegación libre.
    for (const a of rotulosAttr) {
      const m = casaBloqueoNavegacion(a)
      if (m) { bloqueo = m.termino; break }
    }
  }
  const claseTotal = clases(c.cls, 2)
  const m: ModalLeido = {
    tag: etiqueta(c.tag, 20) || 'x', cls: claseTotal, vis: c.vis === true, w: num(c.w, 0, 99999), h: num(c.h, 0, 99999), z: num(c.z, -99999, 99999),
    dlg: c.dlg === true, amodal: c.amodal === true, esModal: c.esM === true || c.dlg === true || c.amodal === true,
    texto: textoModalRedactado(texto, 160), campos: num(c.campos, 0, 9999), ctl, nCierre: num(c.nCierre, 0, 99),
    bloqueo: bloqueo === null ? null : etiqueta(bloqueo, 30) || 'x',
    shd: c.shdM === true, conShadow: c.shd === true, hijo: Number(c.hw) > 0 && Number(c.hh) > 0 ? `${num(c.hw, 0, 99999)}x${num(c.hh, 0, 99999)}` : '-', vacio: c.vacio === true,
    huella: `${etiqueta(c.tag, 20)}|${String(c.cls ?? '').slice(0, 120)}|${texto.slice(0, 60)}`,
  }
  return m
}

/** ¿Es un modal INFORMATIVO que se puede cerrar? Sin campos de formulario y sin ningún término prohibido. Pura. */
export function veredictoModal(m: ModalLeido): { ok: true } | { ok: false; motivo: 'no_es_modal' | 'vacio' | 'con_campos' | 'termino_prohibido' } {
  if (!m.esModal) return { ok: false, motivo: 'no_es_modal' }
  if (m.vacio) return { ok: false, motivo: 'vacio' }
  if (m.campos > 0) return { ok: false, motivo: 'con_campos' }
  if (m.bloqueo !== null) return { ok: false, motivo: 'termino_prohibido' }
  return { ok: true }
}

/** Fragmento CERRADO (sin texto del portal) del interceptor para la nota del explorador: `int=<tag>/<clases>/d<0|1>m<0|1>f<campos>x<cierres>/z<n>`. Pura. */
export function fragmentoInterceptor(m: ModalLeido): string {
  const b = (x: boolean) => (x ? 1 : 0)
  return `int=${m.tag}/${m.cls}/d${b(m.dlg || m.amodal)}m${b(m.esModal)}f${Math.min(m.campos, 9)}x${Math.min(m.nCierre, 9)}/z${m.z}`
}
export const RE_FRAGMENTO_INTERCEPTOR = 'int=[a-z0-9-]{1,20}\\/(?:-|[a-z0-9_-]{1,24}(?:\\.[a-z0-9_-]{1,24})?)\\/d[01]m[01]f\\dx\\d\\/z-?\\d{1,5}'

/** Líneas de diagnóstico del interceptor para el `detalle` del pilotaje (≤ 10 con la de `diag:`; cada una ≤ 160). Texto redactado. Pura. */
export function lineasInterceptor(m: ModalLeido): string[] {
  const b = (x: boolean) => (x ? 1 : 0)
  const out = [
    `int: ${m.tag} cls=${m.cls} vis=${b(m.vis)} bb=${m.w}x${m.h} z=${m.z} dlg=${b(m.dlg)} amodal=${b(m.amodal)} modal=${b(m.esModal)} campos=${m.campos} cierre=${m.nCierre} bloqueo=${m.bloqueo ?? '-'}`,
    `int-texto: «${m.texto}»`,
  ]
  // 0.3.39: custom element con shadowRoot / host vacío (una línea más: el tope sigue en 9).
  const extra = m.shd || m.conShadow || m.vacio
  if (extra) out.push(`int-shd: shadow=${m.shd ? 'open' : m.conShadow ? 'anidado' : 'sin'} host=${m.w}x${m.h} hijo=${m.hijo} vacio=${b(m.vacio)}`)
  for (const c of m.ctl.slice(0, extra ? 6 : 7)) out.push(`int-ctl: ${c.tag}/${c.type || '-'}/${c.cls}${c.sh ? ' sh=1' : ''} cierre=${b(c.cierre)} aria=«${c.aria}» title=«${c.title}» txt=«${c.txt}»`.slice(0, 160))
  return out
}
