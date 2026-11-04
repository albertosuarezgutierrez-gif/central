// DIAGNÓSTICO PERSISTENTE DE UN CLIC QUE CADUCA POR ACCIONABILIDAD (0.3.37, 04/11/2026). SOLO LECTURA: este fichero no pulsa nada ni
// escribe en la página (el clic vive en guard.ts: cepo de `regression-tarificador-rpa`). Hecho real (pilotaje fc136562): las tarjetas
// `<a class="card">` AUTOS/HOGAR de Pelayo daban `Timeout 30000ms exceeded` sin que el inventario mostrara por qué.
//
// Forma CERRADA y sin PII (solo booleans, números, etiquetas HTML y UNA clase recortada a [a-z0-9_-]{1,24}); nunca texto del portal:
//   bb=<w>x<h>@<x>,<y> vis=<0|1> op=<opacidad> vs=<v|h|c|o> dp=<display> pe=<pointer-events>
//   anc=<tag>/<clase|->/<opacidad>/<pointer-events> | -     (primer ancestro con opacidad<1 o pointer-events:none)
//   hit=propio|hijo|ninguno|otro/<tag>/<clase|->            (elementFromPoint del centro)
//   cookie=<0|1> (lo que intercepta parece un banner de cookies) ifr=<0|1> shd=<0|1> anim=<animaciones en curso de la página>

import type { Locator } from 'playwright'
import { LIB_MODAL_PAGINA, RE_FRAGMENTO_INTERCEPTOR, evaluarModal, fragmentoInterceptor, type ModalLeido } from './modal-informativo.ts'

export type DiagnosticoClic = {
  /** boundingBox redondeado (coordenadas de la página principal) o `null` (sin caja). */
  bb: { w: number; h: number; x: number; y: number } | null
  vis: boolean
  op: number
  vs: 'v' | 'h' | 'c' | 'o'
  dp: string
  pe: string
  anc: { tag: string; cls: string; op: number; pe: string } | null
  hit: { rel: 'propio' | 'hijo' | 'ninguno' } | { rel: 'otro'; tag: string; cls: string }
  cookie: boolean
  ifr: boolean
  shd: boolean
  anim: number
  /** 0.3.38: el elemento que INTERCEPTA (solo si `hit.rel === 'otro'`): su contenedor modal/diálogo o él mismo, en forma cerrada y sin PII. */
  int?: ModalLeido | null
}

const num = (x: unknown, min: number, max: number): number => {
  const n = Math.round(Number(x))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : 0
}
const op2 = (x: unknown): number => {
  const n = Number(x)
  return Number.isFinite(n) ? Math.max(0, Math.min(1, Math.round(n * 100) / 100)) : 1
}
const etiqueta = (x: unknown, max: number, vacio: string): string => {
  const s = String(x ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, max)
  return s === '' ? vacio : s
}
const palabra = (x: unknown): string => {
  const s = String(x ?? '').toLowerCase().replace(/[^a-z-]/g, '').slice(0, 20)
  return s === '' ? 'x' : s
}

/** Cuerpo CERRADO del diagnóstico (lo que va a `detalle` del pilotaje y, con prefijo, a la nota del explorador). Pura. */
export function cuerpoDiagnosticoClic(d: DiagnosticoClic): string {
  const bb = d.bb ? `${num(d.bb.w, 0, 99999)}x${num(d.bb.h, 0, 99999)}@${num(d.bb.x, -99999, 99999)},${num(d.bb.y, -99999, 99999)}` : '-'
  const anc = d.anc ? `${etiqueta(d.anc.tag, 20, 'x')}/${etiqueta(d.anc.cls, 24, '-')}/${op2(d.anc.op)}/${palabra(d.anc.pe)}` : '-'
  const hit = d.hit.rel === 'otro' ? `otro/${etiqueta(d.hit.tag, 20, 'x')}/${etiqueta(d.hit.cls, 24, '-')}` : d.hit.rel
  const b = (x: boolean) => (x ? 1 : 0)
  const vs = (['v', 'h', 'c', 'o'] as const).includes(d.vs) ? d.vs : 'o'
  return `bb=${bb} vis=${b(d.vis)} op=${op2(d.op)} vs=${vs} dp=${palabra(d.dp)} pe=${palabra(d.pe)} anc=${anc} hit=${hit} cookie=${b(d.cookie)} ifr=${b(d.ifr)} shd=${b(d.shd)} anim=${num(d.anim, 0, 99)}${d.int ? ` ${fragmentoInterceptor(d.int)}` : ''}`
}

/** Forma cerrada del cuerpo (la que acepta asegura dentro de la nota y el detalle del pilotaje). */
const BASE_CUERPO_DIAGNOSTICO_CLIC = /bb=(?:-|\d{1,5}x\d{1,5}@-?\d{1,5},-?\d{1,5}) vis=[01] op=\d(?:\.\d{1,2})? vs=[vhco] dp=[a-z-]{1,20} pe=[a-z-]{1,20} anc=(?:-|[a-z0-9-]{1,20}\/(?:-|[a-z0-9_-]{1,24})\/\d(?:\.\d{1,2})?\/[a-z-]{1,20}) hit=(?:propio|hijo|ninguno|otro\/[a-z0-9-]{1,20}\/(?:-|[a-z0-9_-]{1,24})) cookie=[01] ifr=[01] shd=[01] anim=\d{1,2}/
export const RE_CUERPO_DIAGNOSTICO_CLIC = new RegExp(`^${BASE_CUERPO_DIAGNOSTICO_CLIC.source}(?: ${RE_FRAGMENTO_INTERCEPTOR})?$`)

/** Nota del explorador para la tarjeta de ramo de Pelayo que no se pudo pulsar (`ch` = se probó el clic en el hijo de texto exacto). Pura. */
export function notaClicPelayo(d: DiagnosticoClic, hijoProbado: boolean): string {
  return `clic pelayo: ch=${hijoProbado ? 1 : 0} ${cuerpoDiagnosticoClic(d)}`
}
/** Forma CERRADA de la nota (idéntica a la de asegura: `leerNotaFin`; la vigila un guardián de asegura que compara el LITERAL: no la construyas por partes). */
export const RE_NOTA_CLIC_PELAYO = /^clic pelayo: ch=[01] bb=(?:-|\d{1,5}x\d{1,5}@-?\d{1,5},-?\d{1,5}) vis=[01] op=\d(?:\.\d{1,2})? vs=[vhco] dp=[a-z-]{1,20} pe=[a-z-]{1,20} anc=(?:-|[a-z0-9-]{1,20}\/(?:-|[a-z0-9_-]{1,24})\/\d(?:\.\d{1,2})?\/[a-z-]{1,20}) hit=(?:propio|hijo|ninguno|otro\/[a-z0-9-]{1,20}\/(?:-|[a-z0-9_-]{1,24})) cookie=[01] ifr=[01] shd=[01] anim=\d{1,2}(?: int=[a-z0-9-]{1,20}\/(?:-|[a-z0-9_-]{1,24}(?:\.[a-z0-9_-]{1,24})?)\/d[01]m[01]f\dx\d\/z-?\d{1,5})?$/

/** El clic caducó por accionabilidad (invisible, inestable, tapado, pointer-events…) y no se pudo resolver por la vía estrecha. */
export class ClicNoAccionableError extends Error {
  constructor(readonly diagnostico: DiagnosticoClic | null, readonly hijoProbado: boolean) {
    super(`clic no accionable${diagnostico ? `: ${cuerpoDiagnosticoClic(diagnostico)}` : ' (sin diagnóstico)'}`)
    this.name = 'ClicNoAccionableError'
  }
}

/** ¿Es el `TimeoutError` de Playwright por accionabilidad (visible/estable/habilitado/recibe eventos)? Pura. */
export function esTimeoutAccionabilidad(e: unknown): boolean {
  const x = e as { name?: unknown; message?: unknown } | null
  if (x?.name !== 'TimeoutError') return false
  const m = typeof x.message === 'string' ? x.message : ''
  // Si el registro de Playwright llegó a EJECUTAR la acción (o a esperar la navegación que provocó), el clic YA se dio: no es de accionabilidad
  // y NO se reintenta (un segundo clic podría repetir un efecto).
  if (/performing \w+ action|action done|scheduled navigations/i.test(m)) return false
  return /waiting for element|not visible|not stable|not enabled|intercepts pointer events|receives events|resolved to|attempting \w+ action/i.test(m)
}

// Script de LECTURA (una cadena: sin `__name` de esbuild dentro de `evaluate`). Corre en el documento DEL elemento (iframe incluido).
const CUERPO_DIAGNOSTICO = LIB_MODAL_PAGINA + `
  const doc = el.ownerDocument, win = doc.defaultView;
  const limpia = (s, n) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, n);
  const clase = (e) => limpia(((e.getAttribute && e.getAttribute('class')) || '').split(/\\s+/).filter(Boolean)[0] || '', 24);
  const etq = (e) => limpia(e.tagName, 20);
  const salto = (p) => p.parentElement || ((p.getRootNode && p.getRootNode().host) || null);
  const cs = win.getComputedStyle(el);
  let anc = null;
  for (let p = salto(el), i = 0; p && i < 60; p = salto(p), i++) {
    const c = win.getComputedStyle(p);
    if (parseFloat(c.opacity) < 1 || c.pointerEvents === 'none') {
      let q = p;
      if (c.pointerEvents === 'none') { for (let j = 0; j < 60; j++) { const s = salto(q); if (s && win.getComputedStyle(s).pointerEvents === 'none') q = s; else break; } }
      const cq = win.getComputedStyle(q);
      anc = { tag: etq(q), cls: clase(q), op: parseFloat(cq.opacity), pe: cq.pointerEvents };
      break;
    }
  }
  const r = el.getBoundingClientRect();
  const raiz = el.getRootNode();
  let h = null;
  if (r.width > 0 && r.height > 0) {
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    h = (raiz && typeof raiz.elementFromPoint === 'function') ? raiz.elementFromPoint(cx, cy) : doc.elementFromPoint(cx, cy);
  }
  let hit = { rel: 'ninguno' }, cookie = false;
  if (h) {
    if (h === el) hit = { rel: 'propio' };
    else if (el.contains(h)) hit = { rel: 'hijo' };
    else {
      hit = { rel: 'otro', tag: etq(h), cls: clase(h) };
      const re = /cookie|consent|onetrust/i;
      for (let p = h, i = 0; p && i < 8; p = salto(p), i++) {
        const marca = String((p.getAttribute && p.getAttribute('class')) || '') + ' ' + String((p.getAttribute && p.getAttribute('id')) || '');
        if (re.test(marca) || (i < 4 && re.test(String(p.textContent || '').slice(0, 300)))) { cookie = true; break; }
      }
    }
  }
  // 0.3.38: el INTERCEPTOR (contenedor modal/diálogo más externo hasta 10 niveles por encima del elemento que recibe el clic, o él mismo).
  let intCrudo = null;
  if (hit.rel === 'otro' && h) {
    let cont = h;
    for (let p = h, i = 0; p && i < 10; p = salto(p), i++) { if (p !== doc.body && p !== doc.documentElement && esContM(p)) cont = p; }
    try { intCrudo = leerModalCrudo(cont); } catch (e) { intCrudo = null; }
  }
  let anim = 0;
  try { anim = doc.getAnimations().filter((a) => a.playState === 'running').length; } catch (e) { anim = 0; }
  return {
    op: parseFloat(cs.opacity), vs: cs.visibility, dp: cs.display, pe: cs.pointerEvents, anc, hit, cookie, anim, int: intCrudo,
    ifr: win.parent !== win, shd: !!(raiz && raiz.host !== undefined),
  };
`
// Función REAL (no cadena: Playwright no invoca una cadena con el elemento) creada a partir del cuerpo, sin pasar por esbuild.
const SCRIPT_DIAGNOSTICO = new Function('el', CUERPO_DIAGNOSTICO) as (el: Element) => unknown

// ─── 0.3.42: TAGS de los controles del interior del MODAL (Pelayo «Tipo de documento» que el inventario no veía) ─────────────────────
// Forma CERRADA, sin texto alguno del portal (ni rótulos, ni opciones, ni valores): por control, `tag[:type][@role][^prof][~][!]`
// (prof = nivel de shadowRoot bajo el modal, `~` = oculto, `!` = deshabilitado). Incluye los custom elements (tag con guion).

export type TagControlModal = { tag: string; type: string; role: string; prof: number; oculto: boolean; deshabilitado: boolean }
/** Máximo de controles que se listan (el resto va como `+N`) y de líneas de detalle. */
export const MAX_TAGS_MODAL = 30
const MAX_LINEAS_TAGS_MODAL = 3
const MAX_LARGO_LINEA_TAGS = 190

const CUERPO_TAGS_MODAL = LIB_MODAL_PAGINA + `
  const doc = el.ownerDocument;
  const m = modalDe(el) || (esContM(el) ? el : null) || modalesVisibles(doc)[0] || null;
  if (!m) return null;
  const out = [];
  const SEL_C = 'input,select,textarea,button,a,[role],[tabindex],[onclick],label';
  const visto = (e) => {
    const w = e.ownerDocument.defaultView, cs = w.getComputedStyle(e), r = e.getBoundingClientRect();
    return !(cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0 || (r.width <= 1 && r.height <= 1));
  };
  let total = 0;
  const andar = (raiz, prof) => {
    for (const e of Array.from(raiz.querySelectorAll('*'))) {
      const t = String(e.localName || '');
      if (t.indexOf('-') > 0 || e.matches(SEL_C)) {
        total++;
        if (out.length < 400) out.push({ tag: t, type: String(e.getAttribute('type') || ''), role: String(e.getAttribute('role') || ''), prof: prof, oculto: !visto(e), deshabilitado: e.disabled === true || e.getAttribute('aria-disabled') === 'true' });
      }
      if (e.shadowRoot && prof < 6) andar(e.shadowRoot, prof + 1);
    }
  };
  andar(m, 0);
  if (m.shadowRoot) andar(m.shadowRoot, 1);
  return { ctl: out, total: total };
`
const SCRIPT_TAGS_MODAL = new Function('el', CUERPO_TAGS_MODAL) as (el: Element) => unknown

/**
 * Lee los TAGS de los controles del modal que contiene al elemento (o del primer modal visible de su documento), entrando en los shadowRoot
 * abiertos. SOLO LECTURA; nunca lanza (`null` sin modal o sin nodo). Los textos del portal no salen de la página.
 */
export async function leerTagsModal(loc: Locator, timeoutMs = 2_000): Promise<TagControlModal[] | null> {
  try {
    const crudo = (await loc.evaluate(SCRIPT_TAGS_MODAL, undefined, { timeout: timeoutMs })) as { ctl?: unknown; total?: unknown } | null
    if (!crudo || !Array.isArray(crudo.ctl)) return null
    const ctl: TagControlModal[] = crudo.ctl.slice(0, 400).map((x) => {
      const o = (x ?? {}) as Record<string, unknown>
      return { tag: String(o.tag ?? ''), type: String(o.type ?? ''), role: String(o.role ?? ''), prof: num(o.prof, 0, 9), oculto: o.oculto === true, deshabilitado: o.deshabilitado === true }
    })
    return ctl
  } catch {
    return null
  }
}

/** Un control → `tag[:type][@role][^prof][~][!]` (alfabetos cerrados). Pura. */
export function fichaTagModal(c: TagControlModal): string {
  const tag = etiqueta(c.tag, 30, 'x')
  const type = String(c.type ?? '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)
  const role = String(c.role ?? '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 16)
  const prof = num(c.prof, 0, 9)
  return `${tag}${type ? `:${type}` : ''}${role ? `@${role}` : ''}${prof > 0 ? `^${prof}` : ''}${c.oculto ? '~' : ''}${c.deshabilitado ? '!' : ''}`
}

/**
 * Líneas `modal-ctl[ i/n]: <ficha> <ficha> …` (≤3 líneas de ≤190 car., ≤{@link MAX_TAGS_MODAL} controles; los que no caben, `+N` al final).
 * Sin truncar a unos pocos: es lo que hay en el modal. Pura.
 */
export function lineasTagsModal(ctl: readonly TagControlModal[]): string[] {
  const fichas = ctl.slice(0, MAX_TAGS_MODAL).map(fichaTagModal)
  const lineas: string[][] = [[]]
  let usados = 0
  for (const f of fichas) {
    const actual = lineas[lineas.length - 1]
    // reserva para el prefijo «modal-ctl 3/3: » y el « +NNN» final
    if ([...actual, f].join(' ').length > MAX_LARGO_LINEA_TAGS - 22) {
      if (lineas.length >= MAX_LINEAS_TAGS_MODAL) break
      lineas.push([f])
    } else actual.push(f)
    usados++
  }
  const resto = ctl.length - usados
  if (usados === 0 && resto === 0) return ['modal-ctl: -']
  if (resto > 0) lineas[lineas.length - 1].push(`+${resto}`)
  const n = lineas.length
  return lineas.map((l, i) => `modal-ctl${n > 1 ? ` ${i + 1}/${n}` : ''}: ${l.join(' ')}`)
}

/**
 * Lee el diagnóstico del control SIN pulsarlo ni desplazarlo (boundingBox, visibilidad, estilos calculados del elemento y de su primer
 * ancestro con opacidad<1 o pointer-events:none, qué hay en `elementFromPoint` del centro, iframe/shadow, animaciones en curso). Nunca
 * lanza: `null` si el nodo ya no está. Pura de efectos (solo lectura).
 */
export async function leerDiagnosticoClic(loc: Locator, timeoutMs = 2_000): Promise<DiagnosticoClic | null> {
  try {
    const crudo = (await loc.evaluate(SCRIPT_DIAGNOSTICO, undefined, { timeout: timeoutMs })) as {
      op: number; vs: string; dp: string; pe: string
      anc: { tag: string; cls: string; op: number; pe: string } | null
      hit: DiagnosticoClic['hit']; cookie: boolean; anim: number; ifr: boolean; shd: boolean; int?: unknown
    }
    const caja = await loc.boundingBox({ timeout: timeoutMs }).catch(() => null)
    const vis = await loc.isVisible({ timeout: timeoutMs }).catch(() => false)
    const vs = crudo.vs === 'visible' ? 'v' : crudo.vs === 'hidden' ? 'h' : crudo.vs === 'collapse' ? 'c' : 'o'
    return {
      bb: caja ? { w: caja.width, h: caja.height, x: caja.x, y: caja.y } : null,
      vis, op: crudo.op, vs, dp: crudo.dp, pe: crudo.pe, anc: crudo.anc, hit: crudo.hit,
      cookie: crudo.cookie === true, ifr: crudo.ifr === true, shd: crudo.shd === true, anim: crudo.anim,
      int: crudo.int ? evaluarModal(crudo.int) : null,
    }
  } catch {
    return null
  }
}
