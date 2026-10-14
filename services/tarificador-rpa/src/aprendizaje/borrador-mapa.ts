// BORRADOR de mapa desde la evidencia de un fallo (14/10/2026, Fase 3 de TARIFICADOR-OPTIMIZACION-AUDITORIA).
//
// Entrada: el `ariaSnapshot` REDACTADO que Fase 1 guarda en la sección `<!-- tarificador:aria … -->` del HTML de
// evidencia. Salida: el texto de un .ts con un `CAMPOS_<PANTALLA>` propuesto (localizadores Playwright robustos) para que un
// humano lo revise y lo meta en un PR. Determinista, SIN IA, SIN navegador, FUERA del camino del worker (solo lo usa el CLI).
//
// PRIVACIDAD: jamás se leen ni se emiten los valores de los campos (lo que va tras los «:» de textbox/combobox/…), ni la
// opción preseleccionada de un desplegable (es un valor): se descartan en el parseo.

export type TipoControl = 'campo' | 'checkbox' | 'radio' | 'boton' | 'enlace' | 'dialogo' | 'mensaje'

export interface MarcoRuta { nombre: string | null; indice: number }

export interface Control {
  clave: string
  tipo: TipoControl
  /** Rol ARIA (textbox, combobox, checkbox, radio, spinbutton, searchbox, button, link, dialog, alert…). */
  rol: string
  nombre: string | null
  requerido: boolean
  deshabilitado: boolean
  marcos: MarcoRuta[]
  /** Nombre del diálogo que lo contiene (si está dentro de una ventana emergente). */
  dialogo: string | null
  /** Posición entre los de mismo marco+ámbito+rol+nombre (solo si hay duplicados). */
  nth: number | null
  /** Combobox: nombres de las opciones. Diálogo: filas/opciones que muestra. */
  opciones: string[]
  /** Mensajes (alert/status/texto con «obligatorio»…): el texto de la pantalla. */
  texto: string | null
  /** Radios: nombre del grupo (o null). */
  grupo: string | null
  localizador: string | null
  avisos: string[]
}

export interface Borrador {
  compania: string
  ramo: string
  pantalla: string
  fecha: string
  controles: Control[]
}

interface Nodo { rol: string; nombre: string | null; attrs: string[]; texto: string | null; hijos: Nodo[]; sangria: number }

const ROL_CAMPO = new Set(['textbox', 'combobox', 'spinbutton', 'searchbox', 'slider'])
const ROL_VALOR = ROL_CAMPO
const RE_LINEA = /^(\s*)-\s+([A-Za-z][\w-]*)((?:\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'))?)((?:\s*\[[^\]]*\])*)\s*(?::(.*))?$/
const RE_MENSAJE = /obligatori|\berror|inv[aá]lid|incorrect|requerid|no\s+(?:es\s+)?v[aá]lid|debe\s+(?:introducir|indicar|seleccionar)/i
const MAX_TEXTO = 200
const MAX_OPCIONES = 40
const MAX_ENLACES = 40

function nombreDe(crudo: string): string | null {
  const t = crudo.trim()
  if (!t) return null
  const r = t[0] === '"' ? t.slice(1, -1).replace(/\\(.)/g, '$1') : t.slice(1, -1).replace(/''/g, "'")
  return r.trim() === '' ? null : r
}

/** Árbol del YAML del snapshot. Las líneas que no son nodos (continuaciones, `/url:`) se ignoran. */
function parsear(snapshot: string): Nodo[] {
  const raices: Nodo[] = []
  const pila: Nodo[] = []
  for (const linea of String(snapshot).split('\n')) {
    const m = RE_LINEA.exec(linea)
    if (!m) continue
    const rol = m[2]
    const attrs = [...m[4].matchAll(/\[([^\]]*)\]/g)].map((a) => a[1])
    // El valor tras «:» de un campo NO se guarda jamás.
    const texto = ROL_VALOR.has(rol) || m[5] === undefined || m[5].trim() === '' ? null : m[5].trim().replace(/^["']|["']$/g, '')
    const nodo: Nodo = { rol, nombre: nombreDe(m[3]), attrs, texto, hijos: [], sangria: m[1].length }
    while (pila.length && pila[pila.length - 1].sangria >= nodo.sangria) pila.pop()
    if (pila.length) pila[pila.length - 1].hijos.push(nodo)
    else raices.push(nodo)
    pila.push(nodo)
  }
  return raices
}

function limpiar(t: string | null): string | null {
  if (t === null) return null
  const r = t.replace(/«valor»/g, '').replace(/\s+/g, ' ').trim()
  return r === '' ? null : r.length > MAX_TEXTO ? `${r.slice(0, MAX_TEXTO)}…` : r
}

function textoDescendiente(n: Nodo): string[] {
  const out: string[] = []
  const t = limpiar(n.texto) ?? limpiar(n.nombre)
  if (t) out.push(t)
  for (const h of n.hijos) out.push(...textoDescendiente(h))
  return out
}

interface Ctx { marcos: MarcoRuta[]; dialogo: string | null; enMensaje: boolean; grupoRadio: string | null; contadores: Map<string, number> }

function nuevo(base: Partial<Control> & { tipo: TipoControl; rol: string }, ctx: Ctx): Control {
  return {
    clave: '', nombre: null, requerido: false, deshabilitado: false, marcos: ctx.marcos, dialogo: ctx.dialogo, nth: null,
    opciones: [], texto: null, grupo: null, localizador: null, avisos: [], ...base,
  }
}

function recolectar(nodos: Nodo[], ctx: Ctx, out: Control[]): void {
  for (let i = 0; i < nodos.length; i++) {
    const n = nodos[i]
    const req = n.attrs.includes('required')
    const dis = n.attrs.includes('disabled')
    const comun = { rol: n.rol, nombre: n.nombre, requerido: req, deshabilitado: dis }
    if (n.rol === 'iframe') {
      const k = ctx.marcos.map((m) => `${m.nombre ?? ''}#${m.indice}`).join('>')
      const indice = ctx.contadores.get(k) ?? 0
      ctx.contadores.set(k, indice + 1)
      recolectar(n.hijos, { ...ctx, marcos: [...ctx.marcos, { nombre: n.nombre, indice }] }, out)
      continue
    }
    if (ROL_CAMPO.has(n.rol) && n.rol !== 'combobox') {
      const c = nuevo({ ...comun, tipo: 'campo' }, ctx)
      pista(c, nodos, i)
      out.push(c)
    } else if (n.rol === 'combobox') {
      const c = nuevo({ ...comun, tipo: 'campo', opciones: n.hijos.filter((h) => h.rol === 'option').map((h) => h.nombre ?? '').filter(Boolean).slice(0, MAX_OPCIONES) }, ctx)
      pista(c, nodos, i)
      out.push(c)
    } else if (n.rol === 'checkbox' || n.rol === 'switch') {
      const c = nuevo({ ...comun, tipo: 'checkbox' }, ctx)
      pista(c, nodos, i)
      out.push(c)
    } else if (n.rol === 'radio') {
      out.push(nuevo({ ...comun, tipo: 'radio', grupo: ctx.grupoRadio ?? `\u0000${ctx.marcos.length}:${ctx.dialogo ?? ''}:${grupoImplicito(nodos)}` }, ctx))
    } else if (n.rol === 'radiogroup') {
      recolectar(n.hijos, { ...ctx, grupoRadio: n.nombre ?? `(sin nombre ${grupoImplicito(nodos)})` }, out)
      continue
    } else if (n.rol === 'button') {
      out.push(nuevo({ ...comun, tipo: 'boton' }, ctx))
    } else if (n.rol === 'link') {
      if (n.nombre) out.push(nuevo({ ...comun, tipo: 'enlace' }, ctx))
    } else if (n.rol === 'dialog' || n.rol === 'alertdialog') {
      const filas = n.hijos.length ? filasDe(n) : []
      out.push(nuevo({ ...comun, tipo: 'dialogo', opciones: filas.slice(0, MAX_OPCIONES) }, ctx))
      recolectar(n.hijos, { ...ctx, dialogo: n.nombre ?? '', enMensaje: ctx.enMensaje }, out)
      continue
    } else if (n.rol === 'alert' || n.rol === 'status') {
      const t = limpiar(textoDescendiente(n).join(' · '))
      if (t) out.push(nuevo({ ...comun, tipo: 'mensaje', texto: t }, ctx))
      continue
    } else if (!ctx.enMensaje && ['text', 'paragraph', 'generic', 'listitem', 'strong', 'emphasis'].includes(n.rol)) {
      const t = limpiar(n.texto) ?? limpiar(n.nombre)
      if (t && RE_MENSAJE.test(t)) out.push(nuevo({ ...comun, tipo: 'mensaje', texto: t, nombre: null }, ctx))
    }
    recolectar(n.hijos, ctx, out)
  }
}

/** Grupo implícito de radios: la lista de hermanos (identidad por posición del primer radio). */
function grupoImplicito(hermanos: Nodo[]): number {
  return hermanos.findIndex((h) => h.rol === 'radio')
}

function filasDe(n: Nodo): string[] {
  const out: string[] = []
  for (const h of n.hijos) {
    if (['row', 'option', 'listitem', 'menuitem'].includes(h.rol) && h.nombre) out.push(h.nombre)
    else if (h.rol !== 'dialog') out.push(...filasDe(h))
  }
  return out
}

/** Etiqueta cercana de un control sin nombre: el `- text:` hermano inmediatamente anterior. */
function pista(c: Control, hermanos: Nodo[], i: number): void {
  if (c.nombre) return
  for (let j = i - 1; j >= 0; j--) {
    const h = hermanos[j]
    if (h.rol === 'text' && h.texto) { const t = limpiar(h.texto); if (t) c.avisos.push(`etiqueta cercana en pantalla: «${t}»`); return }
    if (!['text', 'generic'].includes(h.rol)) return
  }
}

const q = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ')}'`

function cadenaMarcos(marcos: MarcoRuta[]): string {
  let r = 'page'
  for (const m of marcos) r += m.nombre ? `.frameLocator(${q(`iframe[name="${m.nombre.replace(/"/g, '\\"')}"]`)})` : `.frameLocator('iframe').nth(${m.indice})`
  return r
}

function localizador(c: Control): string | null {
  if (!c.nombre) return null
  let r = cadenaMarcos(c.marcos)
  if (c.dialogo !== null && c.tipo !== 'dialogo') r += c.dialogo ? `.getByRole('dialog', { name: ${q(c.dialogo)}, exact: true })` : `.getByRole('dialog')`
  r += `.getByRole(${q(c.rol)}, { name: ${q(c.nombre)}, exact: true })`
  if (c.nth !== null) r += `.nth(${c.nth})`
  return r
}

function palabras(s: string): string[] {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean)
}

export function claveCamel(texto: string, prefijo = ''): string {
  const p = [...palabras(prefijo), ...palabras(texto).slice(0, 6)]
  if (!p.length) return ''
  let r = p.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('')
  if (/^\d/.test(r)) r = `c${r}`
  return r.slice(0, 48)
}

const PREFIJO: Partial<Record<TipoControl, string>> = { boton: 'boton', enlace: 'enlace', dialogo: 'dialogo', mensaje: 'mensaje' }

/** PURA. Extrae los controles del snapshot y propone localizadores y claves. */
export function borradorMapaDesdeAria(snapshot: string, opts: { compania: string; ramo: string; pantalla: string; fecha?: Date }): Borrador {
  const out: Control[] = []
  recolectar(parsear(snapshot), { marcos: [], dialogo: null, enMensaje: false, grupoRadio: null, contadores: new Map() }, out)
  // Enlaces: solo los primeros (las pantallas de menú traen cientos y no son campos).
  let enlaces = 0
  const controles = out.filter((c) => c.tipo !== 'enlace' || ++enlaces <= MAX_ENLACES)

  // Duplicados por marco + ámbito + rol + nombre.
  const clavesDup = new Map<string, Control[]>()
  for (const c of controles) {
    if (!c.nombre || c.tipo === 'mensaje') continue
    const k = `${cadenaMarcos(c.marcos)}|${c.dialogo ?? ''}|${c.rol}|${c.nombre}`
    clavesDup.set(k, [...(clavesDup.get(k) ?? []), c])
  }
  for (const grupo of clavesDup.values()) {
    if (grupo.length < 2) continue
    grupo.forEach((c, i) => {
      c.nth = i
      c.avisos.push(`nombre duplicado (${grupo.length} controles «${c.nombre}»): se distinguen con .nth(${i}) por orden de aparición; confirmar a mano cuál es cuál`)
    })
  }

  // Claves únicas.
  const usadas = new Map<string, number>()
  let sinNombre = 0
  let mensajes = 0
  for (const c of controles) {
    c.localizador = localizador(c)
    let base: string
    if (c.tipo === 'mensaje') base = `mensaje${++mensajes}`
    else if (c.tipo === 'radio') base = claveCamel(c.nombre ?? '', 'radio') || `radio${++sinNombre}`
    else if (!c.nombre) { base = `sinNombre${c.rol[0].toUpperCase()}${c.rol.slice(1)}${++sinNombre}`; c.avisos.push('sin nombre: necesita selector CSS manual') }
    else base = claveCamel(c.nombre, PREFIJO[c.tipo] ?? '') || `${c.rol}${++sinNombre}`
    const n = (usadas.get(base) ?? 0) + 1
    usadas.set(base, n)
    c.clave = n === 1 ? base : `${base}${n}`
    if (n > 1 && c.nth === null && c.nombre) c.avisos.push(`clave repetida (${base}): renombrar`)
    if (c.tipo === 'radio' && (c.grupo === null || c.grupo.startsWith('\u0000') || c.grupo.startsWith('(sin nombre'))) {
      c.avisos.push('radio sin grupo (sin radiogroup con nombre): agruparlo a mano y comprobar la etiqueta del grupo')
    }
    if (c.tipo === 'boton' && c.deshabilitado) c.avisos.push('deshabilitado en la evidencia: puede habilitarse al completar los campos obligatorios')
  }
  return {
    compania: opts.compania, ramo: opts.ramo, pantalla: opts.pantalla,
    fecha: fechaEs(opts.fecha ?? new Date()), controles,
  }
}

function fechaEs(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

const nombrePantalla = (s: string): string => palabras(s).join('_').toUpperCase() || 'PANTALLA'
const sinSalto = (s: string): string => s.replace(/[\r\n]+/g, ' ').replace(/\*\//g, '* /').replace(/«valor»/g, '')

/** Texto del fichero .ts del borrador. PURA. */
export function renderizarBorradorTs(b: Borrador): string {
  const L: string[] = []
  L.push('// BORRADOR generado desde evidencia — revisar a mano antes de usar; no está registrado.')
  L.push(`// Compañía: ${sinSalto(b.compania)} · Ramo: ${sinSalto(b.ramo)} · Pantalla: ${sinSalto(b.pantalla)} · Fecha: ${b.fecha}`)
  L.push('// Origen: ariaSnapshot redactado (solo estructura). Los localizadores son una PROPUESTA: pruébalos con scripts/probar-formulario.ts.')
  L.push('')
  L.push("import type { Page } from 'playwright'")
  L.push('')
  L.push(`export const CAMPOS_${nombrePantalla(b.pantalla)} = {`)
  const radios = b.controles.filter((c) => c.tipo === 'radio')
  const grupos = new Map<string, Control[]>()
  for (const r of radios) grupos.set(r.grupo ?? '', [...(grupos.get(r.grupo ?? '') ?? []), r])
  const radiosHechos = new Set<string>()
  const meta = (c: Control): string => {
    const m = [c.rol, c.requerido ? 'obligatorio' : '', c.deshabilitado ? 'deshabilitado' : '', c.marcos.length ? `marco: ${c.marcos.map((x) => x.nombre ?? `iframe#${x.indice}`).join(' > ')}` : 'marco: página', c.dialogo !== null ? `dentro del diálogo «${sinSalto(c.dialogo)}»` : '']
    return sinSalto(m.filter(Boolean).join(' · '))
  }
  const linea = (c: Control, sangria: string, clave: string): void => {
    L.push(`${sangria}// ${meta(c)}`)
    if (c.tipo === 'mensaje') {
      L.push(`${sangria}// mensaje en pantalla: «${sinSalto(c.texto ?? '')}»`)
    }
    if (c.opciones.length) L.push(`${sangria}// ${c.tipo === 'dialogo' ? 'filas' : 'opciones'}: ${c.opciones.map((o) => sinSalto(o)).join(' | ')}`)
    for (const a of c.avisos) L.push(`${sangria}// TODO ${sinSalto(a)}`)
    if (c.tipo === 'mensaje') { L.push(`${sangria}// (mensaje: no es un control; sirve para reconocer el error al leer la pantalla)`); return }
    if (c.localizador) L.push(`${sangria}${clave}: (page: Page) => ${c.localizador},`)
    else L.push(`${sangria}${clave}: null, // TODO sin localizador`)
  }
  for (const c of b.controles) {
    if (c.tipo === 'radio') {
      const g = c.grupo ?? ''
      if (radiosHechos.has(g)) continue
      radiosHechos.add(g)
      const lista = grupos.get(g) ?? []
      const sinGrupo = g.startsWith('\u0000') || g.startsWith('(sin nombre')
      const claveG = sinGrupo ? `radiosSinGrupo${radiosHechos.size}` : claveCamel(g, 'grupo') || `grupo${radiosHechos.size}`
      L.push(`  // grupo de radios${sinGrupo ? '' : ` «${sinSalto(g)}»`} (${lista.length} opciones)`)
      if (sinGrupo) L.push('  // TODO radios sin grupo: ponerles nombre de grupo a mano')
      L.push(`  ${claveG}: {`)
      for (const r of lista) linea(r, '    ', r.clave)
      L.push('  },')
      continue
    }
    linea(c, '  ', c.clave)
  }
  L.push('} as const')
  L.push('')
  return L.join('\n')
}
