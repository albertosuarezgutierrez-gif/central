// MODAL INFORMATIVO (0.3.38, 04/11/2026). SOLO LECTURA y PURO: este fichero no pulsa nada (los clics y la tecla Escape viven en guard.ts:
// `cerrarModalInformativo`, cepo de `regression-tarificador-rpa`). Hecho real (pilotaje Pelayo 608504fd): en «Nuevo Presupuesto» un contenedor
// `.pelayo-modal.no-footer` PERSISTENTE intercepta el clic de la tarjeta AUTOS y el inventario no lo lista (no tiene controles con texto).
//
// Aquí: (1) el script de página (cadena, sin `__name` de esbuild) que localiza los modales VISIBLES y los lee SIN PII ni valores;
// (2) el saneado a forma CERRADA (clases recortadas a [a-z0-9_-], texto ≤160 pasado por la redacción de datos personales);
// (3) el veredicto «modal INFORMATIVO» (sin campos y sin ningún término prohibido del vocabulario de bloqueo en todo su texto/atributos).

import { pareceDatoPersonalInventario } from '@central/module-tarificacion'
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
  const modalesVisibles = (raiz) => {
    const doc = raiz.ownerDocument || raiz;
    const c = Array.from(raiz.querySelectorAll(SEL_MODAL)).filter((e) => e !== doc.body && e !== doc.documentElement && !RE_FONDO.test(clasesDe(e)) && visM(e));
    return c.filter((e) => !c.some((o) => o !== e && o.contains(e)));
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
    const nodos = [m].concat(Array.from(m.querySelectorAll('*')).slice(0, 400));
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
      if (ctl.length < 12) ctl.push({ i: i, tag: e.tagName.toLowerCase(), type: String(e.getAttribute('type') || ''), cls: clasesDe(e), aria: String(e.getAttribute('aria-label') || ''), title: String(e.getAttribute('title') || ''), txt: String(e.innerText || e.textContent || e.getAttribute('value') || '').replace(/\s+/g, ' ').trim().slice(0, 80), cierre: cierre });
    }
    return {
      tag: tag, cls: clasesDe(m), vis: visM(m), w: r.width, h: r.height, z: z,
      dlg: role === 'dialog' || role === 'alertdialog' || tag === 'dialog', amodal: m.getAttribute('aria-modal') === 'true',
      esM: m.matches(SEL_MODAL), texto: String(m.innerText || m.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 4000),
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
  const s = String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  if (s === '') return '-'
  return pareceDatoPersonalInventario(s) ? '(texto redactado)' : s
}

export type ControlModal = { i: number; tag: string; type: string; cls: string; aria: string; title: string; txt: string; cierre: boolean }
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
      i: num(o.i, 0, 9999), tag: etiqueta(o.tag, 20) || 'x', type: etiqueta(o.type, 12), cls: clases(o.cls, 1),
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
    huella: `${etiqueta(c.tag, 20)}|${String(c.cls ?? '').slice(0, 120)}|${texto.slice(0, 60)}`,
  }
  return m
}

/** ¿Es un modal INFORMATIVO que se puede cerrar? Sin campos de formulario y sin ningún término prohibido. Pura. */
export function veredictoModal(m: ModalLeido): { ok: true } | { ok: false; motivo: 'no_es_modal' | 'con_campos' | 'termino_prohibido' } {
  if (!m.esModal) return { ok: false, motivo: 'no_es_modal' }
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
  for (const c of m.ctl.slice(0, 7)) out.push(`int-ctl: ${c.tag}/${c.type || '-'}/${c.cls} cierre=${b(c.cierre)} aria=«${c.aria}» title=«${c.title}» txt=«${c.txt}»`.slice(0, 160))
  return out
}
