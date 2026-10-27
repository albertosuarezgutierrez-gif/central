// VOLCADO de un atasco / hueco de mapa (27/10/2026): que CADA parada deje en UNA vuelta todo lo necesario para cerrar el hueco.
//
// Antes: el mensaje se cortaba a ciegas a ~2000 caracteres (lo importante iba al final), el HTML a veces solo traía un marco
// y, si no cabía en 2 MB, no viajaba NADA (el documento era solo el JPG). Ahora, cuando el fallo es un hueco de mapa o un
// atasco, el runner entrega:
//   1. UN HTML por marco (la página y TODOS sus iframes, de todas las pestañas), cada uno con su URL saneada, pasado por el
//      saneador existente MÁS ESTRICTO (`redactarHtmlGrabacion` de @central/module-tarificacion) y, encima, con el valor de
//      TODO campo vaciado (`vaciarValoresCampos`). Cabe en `MAX_BYTES_VOLCADO` o se recorta POR MARCO y lo dice.
//   2. Un «resumen de pantalla» JSON pequeño (primera sección del mismo HTML, `<!-- tarificador:resumen-pantalla … -->`): textos
//      de error/validación visibles, botones y enlaces visibles (texto + si están deshabilitados), etiquetas de los campos
//      obligatorios vacíos y marcos que seguían cargando. SOLO textos de la interfaz: el extractor nunca lee `.value`.
//   3. El mensaje de error truncado conserva cabeza y cola y termina con la referencia al documento (`fallo-<8>.html`).
//
// Formato (compatible con `separarMarcos` de evidencia.ts): `<!-- tarificador:marco ruta="…" -->` por marco, y justo
// debajo `<!-- tarificador:url … -->`. Nada aquí pulsa, escribe ni navega: solo lectura.

import type { Frame, Page } from 'playwright'
import { rutaMarco } from './evidencia.ts'

const MARCA_MARCO = '<!-- tarificador:marco ruta="'
const FIN_MARCA = '" -->'
export const MARCA_RESUMEN = '<!-- tarificador:resumen-pantalla '

/** Tope del HTML del volcado (el cable admite 2 MB; deja margen para la sección de accesibilidad y el redactor final). */
export const MAX_BYTES_VOLCADO = 1_500_000
export const MAX_BYTES_RESUMEN = 24 * 1024
const MAX_TEXTO = 160
const TOPE_MARCO_MS = 5_000

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type ControlVisible = { texto: string; deshabilitado: boolean }
/** Lo que el extractor devuelve de UN marco (crudo: aún sin sanear). */
export type ResumenMarcoCrudo = {
  errores: string[]
  botones: ControlVisible[]
  enlaces: ControlVisible[]
  obligatoriosVacios: string[]
  cargando: boolean
}
export type MarcoCrudo = { ruta: string; url: string; html: string | null; resumen: ResumenMarcoCrudo | null }

export type ResumenMarco = {
  ruta: string
  url: string
  errores: string[]
  botones: ControlVisible[]
  enlaces: ControlVisible[]
  obligatoriosVacios: string[]
  cargando: boolean
}
export type ResumenPantalla = {
  version: 1
  marcos: ResumenMarco[]
  marcosCargando: string[]
  marcosIlegibles: string[]
  recortes: string[]
}
export type Volcado = { html: string; marcos: number; recortes: string[]; ilegibles: string[] }
export type Saneadores = {
  /** HTML de un marco → HTML saneado (el redactor del trabajo va DENTRO). */
  html: (html: string) => string
  /** Texto suelto de la interfaz → saneado. */
  texto: (texto: string) => string
  /** URL → saneada. */
  url: (url: string) => string
}

// ─── Saneado de valores de campos (capa extra sobre el saneador existente) ──────────────────

const MARCA_VALOR_VACIADO = '[REDACTADO]'
const RE_ATRIBUTO_VALOR = /\bvalue\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi
const RE_ATRIBUTO_MODELO = /\b(ng-reflect-(?:model|value)|data-valor)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi
const TIPOS_CON_ETIQUETA = /\btype\s*=\s*["']?(?:button|submit|reset|image)\b/i

/**
 * Vacía el VALOR de todo campo: `value` de `<input>` (salvo botones: su `value` es la etiqueta), contenido de `<textarea>`,
 * `selected` de las `<option>` y el modelo reflejado de Angular (`ng-reflect-model`). Idempotente. Se aplica ADEMÁS de
 * `redactarHtmlGrabacion`, que solo tapa los campos sensibles por nombre.
 */
export function vaciarValoresCampos(html: string): string {
  return String(html)
    .replace(/<input\b[^>]*>/gi, (tag) => (TIPOS_CON_ETIQUETA.test(tag) ? tag : tag.replace(RE_ATRIBUTO_VALOR, `value="${MARCA_VALOR_VACIADO}"`)))
    .replace(/(<textarea\b[^>]*>)([\s\S]*?)(<\/textarea\s*>)/gi, (_t, a: string, c: string, z: string) => `${a}${c.trim() === '' ? '' : MARCA_VALOR_VACIADO}${z}`)
    .replace(/<option\b[^>]*>/gi, (tag) => tag.replace(/\sselected(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?(?=[\s>/])/gi, ''))
    .replace(/<[a-zA-Z][a-zA-Z0-9-]*\s[^<>]*>/g, (tag) => (/ng-reflect-|data-valor/i.test(tag) ? tag.replace(RE_ATRIBUTO_MODELO, `$1="${MARCA_VALOR_VACIADO}"`) : tag))
}

// ─── Recorte por bytes ───────────────────────────────────────────────────────────

function bytes(s: string): number {
  return Buffer.byteLength(s)
}

function sinEstilosNiScripts(html: string): string {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
}

/** Recorta a `max` bytes UTF-8 (sin partir un carácter ni una etiqueta) y marca el recorte. */
export function recortarHtmlBytes(html: string, max: number, nota: string): string {
  if (bytes(html) <= max) return html
  const cola = `\n<!-- tarificador:recortado ${nota.replace(/--+>/g, '->')} -->`
  const corte = Math.max(0, max - bytes(cola))
  let cortado = Buffer.from(html).subarray(0, corte).toString('utf8').replace(/\uFFFD+$/, '')
  const ultimoCierre = cortado.lastIndexOf('>')
  if (ultimoCierre > cortado.length - 4096 && ultimoCierre > 0) cortado = cortado.slice(0, ultimoCierre + 1)
  return cortado + cola
}

const limpiarComentario = (s: string) => s.replace(/--+>?/g, '-').replace(/"/g, "'").replace(/[\r\n]+/g, ' ')

// ─── Resumen de pantalla ─────────────────────────────────────────────────────────

function limpiarTexto(t: unknown, san: (x: string) => string): string {
  if (typeof t !== 'string') return ''
  return san(t.replace(/\s+/g, ' ').trim()).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO).trim()
}

function listaTextos(xs: unknown, san: (x: string) => string, max: number): string[] {
  if (!Array.isArray(xs)) return []
  const out: string[] = []
  const vistos = new Set<string>()
  for (const x of xs) {
    const t = limpiarTexto(x, san)
    if (!t || vistos.has(t)) continue
    vistos.add(t)
    out.push(t)
    if (out.length >= max) break
  }
  return out
}

function listaControles(xs: unknown, san: (x: string) => string, max: number): ControlVisible[] {
  if (!Array.isArray(xs)) return []
  const out: ControlVisible[] = []
  const vistos = new Set<string>()
  for (const x of xs) {
    const c = x as Partial<ControlVisible> | null
    const texto = limpiarTexto(c?.texto, san)
    const deshabilitado = c?.deshabilitado === true
    const clave = `${texto}|${deshabilitado}`
    if (!texto || vistos.has(clave)) continue
    vistos.add(clave)
    out.push({ texto, deshabilitado })
    if (out.length >= max) break
  }
  return out
}

/** Resumen de pantalla de todos los marcos, saneado y acotado a `MAX_BYTES_RESUMEN`. PURA. */
export function construirResumen(marcos: readonly MarcoCrudo[], s: Pick<Saneadores, 'texto' | 'url'>, recortes: readonly string[] = []): ResumenPantalla {
  const out: ResumenMarco[] = []
  const ilegibles: string[] = []
  for (const m of marcos) {
    if (!m.resumen) { ilegibles.push(m.ruta || '(página)'); continue }
    out.push({
      ruta: m.ruta,
      url: s.url(m.url).slice(0, 300),
      errores: listaTextos(m.resumen.errores, s.texto, 30),
      botones: listaControles(m.resumen.botones, s.texto, 60),
      enlaces: listaControles(m.resumen.enlaces, s.texto, 60),
      obligatoriosVacios: listaTextos(m.resumen.obligatoriosVacios, s.texto, 40),
      cargando: m.resumen.cargando === true,
    })
  }
  const resumen: ResumenPantalla = { version: 1, marcos: out, marcosCargando: out.filter((m) => m.cargando).map((m) => m.ruta || '(página)'), marcosIlegibles: ilegibles, recortes: [...recortes] }
  // Tope: si pasa, se aligeran primero los enlaces y luego los botones, de atrás adelante.
  for (const clave of ['enlaces', 'botones'] as const) {
    while (bytes(JSON.stringify(resumen)) > MAX_BYTES_RESUMEN) {
      const m = [...resumen.marcos].reverse().find((x) => x[clave].length > 5)
      if (!m) break
      m[clave] = m[clave].slice(0, Math.ceil(m[clave].length / 2))
    }
  }
  return resumen
}

/** Comentario HTML con el resumen. `<` `>` escapados (`\u003c`): el JSON nunca puede cerrar el comentario. */
export function seccionResumen(r: ResumenPantalla): string {
  const json = JSON.stringify(r).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
  return `${MARCA_RESUMEN}${json} -->\n`
}

/** Deshace `seccionResumen`. `null` si no hay. */
export function leerResumen(html: string): ResumenPantalla | null {
  const i = html.indexOf(MARCA_RESUMEN)
  if (i < 0) return null
  const fin = html.indexOf(' -->', i)
  if (fin < 0) return null
  try { return JSON.parse(html.slice(i + MARCA_RESUMEN.length, fin)) as ResumenPantalla } catch { return null }
}

// ─── Construcción del volcado ────────────────────────────────────────────────────

/**
 * Un HTML por marco (página primero), cada uno saneado, con su URL; cabe en `maxBytes` recortando POR MARCO (lo que cabe en
 * su parte justa se conserva entero; el exceso se reparte) y diciéndolo (comentario `tarificador:recortado` + `recortes`
 * del resumen). Resumen de pantalla al principio. PURA.
 */
export function construirVolcado(marcos: readonly MarcoCrudo[], s: Saneadores, maxBytes = MAX_BYTES_VOLCADO): Volcado {
  const ilegibles: string[] = []
  type Parte = { ruta: string; cabecera: string; cuerpo: string }
  const partes: Parte[] = marcos.map((m, i) => {
    const ruta = i === 0 ? m.ruta : m.ruta || `#${i}`
    const cabecera = (i === 0 ? '' : `\n${MARCA_MARCO}${limpiarComentario(ruta).replace(/\n/g, ' ')}${FIN_MARCA}\n`) + `<!-- tarificador:url ${limpiarComentario(s.url(m.url))} -->\n`
    let cuerpo: string
    if (m.html === null) { ilegibles.push(ruta || '(página)'); cuerpo = '<!-- tarificador:ilegible: el marco no se pudo leer -->' }
    else cuerpo = s.html(m.html)
    return { ruta: ruta || '(página)', cabecera, cuerpo }
  })
  const recortes: string[] = []
  const margenResumen = MAX_BYTES_RESUMEN + 2048
  const fijo = partes.reduce((n, p) => n + bytes(p.cabecera), 0) + margenResumen
  const presupuesto = Math.max(0, maxBytes - fijo)
  const total = () => partes.reduce((n, p) => n + bytes(p.cuerpo), 0)
  if (total() > presupuesto) for (const p of partes) p.cuerpo = sinEstilosNiScripts(p.cuerpo)
  if (total() > presupuesto) {
    // Reparto justo: los marcos pequeños se quedan enteros y el sobrante se reparte entre los grandes.
    const orden = [...partes].sort((a, b) => bytes(a.cuerpo) - bytes(b.cuerpo))
    let resto = presupuesto
    orden.forEach((p, i) => {
      const parte = Math.floor(resto / (orden.length - i))
      const original = bytes(p.cuerpo)
      if (original > parte) {
        p.cuerpo = recortarHtmlBytes(p.cuerpo, parte, `marco="${limpiarComentario(p.ruta)}" original=${original} conservado=${parte}`)
        recortes.push(`marco «${p.ruta}»: ${original} → ${Math.min(parte, bytes(p.cuerpo))} bytes`)
      }
      resto -= Math.min(bytes(p.cuerpo), parte)
    })
  }
  const resumen = seccionResumen(construirResumen(marcos, s, recortes))
  const html = resumen + partes.map((p) => p.cabecera + p.cuerpo).join('')
  return { html, marcos: marcos.length, recortes, ilegibles }
}

// ─── Mensaje truncado con referencia al documento ──────────────────────────────────────

/** Nombre del documento del HTML del fallo (`guardarAdjunto` en asegura: `fallo-<8 hex del trabajo>.html`). */
export function nombreDocumentoVolcado(trabajoId: string): string {
  return `fallo-${trabajoId.slice(0, 8)}.html`
}

/**
 * Mensaje de error ≤ `max` caracteres que NUNCA corta a ciegas: si no cabe, conserva la CABEZA y una COLA corta, dice cuántos
 * caracteres omite, y termina con la referencia al documento del volcado (+ los recortes del volcado, si los hubo) y la
 * `cola` fija (nota de bóveda) que asegura reconoce al final. PURA.
 */
export function truncarMensajeConReferencia(mensaje: string, o: { max: number; referencia: string | null; recortes?: readonly string[]; cola?: string }): string {
  const cola = o.cola ?? ''
  const ref = o.referencia
    ? ` [volcado: ${o.referencia}${o.recortes && o.recortes.length ? `; recortado en ${o.recortes.length} marco${o.recortes.length === 1 ? '' : 's'}` : ''}]`
    : ''
  const cabecera = ref + cola
  const sitio = Math.max(0, o.max - cabecera.length)
  if (mensaje.length <= sitio) return mensaje + cabecera
  const aviso = (n: number) => ` …[${n} caracteres omitidos]… `
  const colaTexto = Math.min(250, Math.floor(sitio * 0.25))
  const cabeza = Math.max(0, sitio - colaTexto - aviso(mensaje.length).length)
  const omitidos = mensaje.length - cabeza - colaTexto
  const partida = mensaje.slice(0, cabeza) + aviso(omitidos) + (colaTexto > 0 ? mensaje.slice(mensaje.length - colaTexto) : '')
  return partida.slice(0, sitio) + cabecera
}

// ─── Captura en el navegador (solo lectura) ───────────────────────────────────────────

/**
 * Extractor que corre EN EL MARCO (como TEXTO: tsx envuelve las funciones con nombre en `__name`, que no existe en la
 * página). Devuelve SOLO textos de interfaz y booleanos. NUNCA lee `.value`/`.textContent` de un campo: de los vacíos solo se
 * mira si lo están (comparación dentro de la página) y se devuelve su ETIQUETA. No pulsa, no escribe, no navega.
 */
export const EXTRACTOR_RESUMEN = `(() => {
  const visible = (el) => {
    if (!el || !el.getClientRects || el.getClientRects().length === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const txt = (el) => ((el.innerText || '') + '').replace(/\\s+/g, ' ').trim().slice(0, 300);
  const esCampo = (el) => /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
  const deshab = (el) => !!(el.disabled || el.getAttribute('aria-disabled') === 'true' || /(^|[\\s_-])disabled([\\s_-]|$)/i.test(el.getAttribute('class') || ''));
  const etiquetaDe = (el) => {
    const id = el.getAttribute('id');
    let l = id ? document.querySelector('label[for="' + id.replace(/"/g, '') + '"]') : null;
    if (!l) l = el.closest('label');
    if (!l) { const ff = el.closest('mat-form-field,nx-formfield,.form-group,.field'); l = ff && ff.querySelector('label,mat-label,.label'); }
    if (l) {
      const c = l.cloneNode(true);
      c.querySelectorAll('input,select,textarea,option').forEach((n) => n.remove());
      const t = (c.textContent || '').replace(/\\s+/g, ' ').trim();
      if (t) return t.slice(0, 160);
    }
    const lb = el.getAttribute('aria-labelledby');
    if (lb) { const t = lb.split(/\\s+/).map((i) => { const n = document.getElementById(i); return n ? txt(n) : ''; }).join(' ').trim(); if (t) return t.slice(0, 160); }
    return (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('formcontrolname') || el.getAttribute('name') || el.getAttribute('id') || '').slice(0, 160);
  };
  const errores = [];
  const SEL_ERR = '[role=alert],[role=alertdialog],mat-error,.mat-error,.mat-mdc-form-field-error,nx-error,.error,.errors,.alert,.alert-danger,.alert-warning,.text-danger,.help-block,.invalid-feedback,.field-error,[class*=error],[class*=Error],[class*=invalid],[class*=validation],[class*=danger]';
  for (const el of document.querySelectorAll(SEL_ERR)) {
    if (esCampo(el) || !visible(el) || el.querySelector('input,select,textarea')) continue;
    const t = txt(el);
    if (t) errores.push(t);
    if (errores.length >= 60) break;
  }
  for (const el of document.querySelectorAll('[aria-invalid=true]')) {
    if (!visible(el)) continue;
    const e = etiquetaDe(el);
    if (e) errores.push('Campo inválido: ' + e);
  }
  // Texto en rojo (hojas con texto corto): señal de error aunque la clase no lo diga.
  const w = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_ELEMENT);
  let n = 0;
  while (w.nextNode() && n++ < 4000 && errores.length < 80) {
    const el = w.currentNode;
    if (el.children.length > 0 || esCampo(el) || /^(SCRIPT|STYLE|OPTION|BUTTON|A)$/.test(el.tagName)) continue;
    const t = txt(el);
    if (t.length < 3 || t.length > 200 || !visible(el)) continue;
    const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/.exec(getComputedStyle(el).color);
    if (m && +m[1] >= 150 && +m[2] <= 90 && +m[3] <= 90) errores.push(t);
  }
  const botones = [];
  for (const el of document.querySelectorAll('button,[role=button],input[type=button],input[type=submit],input[type=reset],[ng-click],[data-ng-click]')) {
    if (!visible(el)) continue;
    const esInputBoton = el.tagName === 'INPUT';
    const t = (esInputBoton ? (el.getAttribute('value') || '') : txt(el)) || el.getAttribute('aria-label') || el.getAttribute('title') || '';
    if (t) botones.push({ texto: t.slice(0, 160), deshabilitado: deshab(el) });
    if (botones.length >= 120) break;
  }
  const enlaces = [];
  for (const el of document.querySelectorAll('a[href],[role=link],[role=menuitem],[role=tab]')) {
    if (!visible(el)) continue;
    const t = txt(el) || el.getAttribute('aria-label') || el.getAttribute('title') || '';
    if (t) enlaces.push({ texto: t.slice(0, 160), deshabilitado: deshab(el) });
    if (enlaces.length >= 120) break;
  }
  const obligatoriosVacios = [];
  for (const el of document.querySelectorAll('input,select,textarea')) {
    const tipo = (el.getAttribute('type') || '').toLowerCase();
    // Solo texto, número, fecha, casilla y select: el resto (botones, ocultos, grupos de opción) no se resume.
    if ((tipo && tipo !== 'checkbox' && !/^(text|email|tel|number|search|date|password|url|time|month|week|datetime-local)$/.test(tipo)) || !visible(el)) continue;
    const req = el.required || el.getAttribute('aria-required') === 'true' || /ng-invalid-required|ng-star-inserted.*required/.test(el.getAttribute('class') || '');
    if (!req) continue;
    let vacio;
    if (tipo === 'checkbox') vacio = !el.checked;
    else if (el.tagName === 'SELECT') vacio = el.selectedIndex <= 0 && (el.value === '' || el.selectedIndex < 0);
    else vacio = el.value === '';
    if (vacio) obligatoriosVacios.push(etiquetaDe(el));
    if (obligatoriosVacios.length >= 60) break;
  }
  const cargando = document.readyState !== 'complete' || Array.from(document.querySelectorAll('[role=progressbar],mat-spinner,mat-progress-bar,mat-progress-spinner,[class*=spinner],[class*=loading],[class*=loader],[aria-busy=true]')).some(visible);
  return { errores, botones, enlaces, obligatoriosVacios, cargando };
})()`

function conTope<T>(p: Promise<T>, defecto: T, ms: number): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined
  return Promise.race([p, new Promise<T>((r) => { reloj = setTimeout(() => r(defecto), ms) })]).finally(() => clearTimeout(reloj))
}

/** Un marco: su HTML y su resumen CRUDOS (sin sanear). Nunca lanza. */
export async function leerMarcoCrudo(f: Frame, ruta: string): Promise<MarcoCrudo> {
  const url = (() => { try { return f.url() } catch { return '' } })()
  const [html, resumen] = await Promise.all([
    conTope(f.content().catch(() => null), null, TOPE_MARCO_MS),
    conTope(f.evaluate(EXTRACTOR_RESUMEN).then((r) => r as ResumenMarcoCrudo).catch(() => null), null, TOPE_MARCO_MS),
  ])
  return { ruta, url, html, resumen }
}

/**
 * Todos los marcos de todas las pestañas abiertas (la MÁS RECIENTE primero y su página con ruta ''; las demás con prefijo
 * `pestana<N>`). Solo lectura. Nunca lanza.
 */
export async function recogerMarcosCrudos(abiertas: readonly Page[]): Promise<MarcoCrudo[]> {
  const out: MarcoCrudo[] = []
  const orden = [...abiertas].reverse()
  for (const [i, p] of orden.entries()) {
    const prefijo = i === 0 ? '' : `pestana${i}`
    const principal = (() => { try { return p.mainFrame() } catch { return null } })()
    if (!principal) continue
    out.push(await leerMarcoCrudo(principal, prefijo))
    for (const f of p.frames()) {
      if (f === principal || f.isDetached()) continue
      const r = rutaMarco(f)
      out.push(await leerMarcoCrudo(f, prefijo ? `${prefijo}/${r}` : r))
    }
  }
  return out
}
