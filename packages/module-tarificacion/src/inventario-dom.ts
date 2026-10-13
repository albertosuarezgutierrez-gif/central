// Inventario de la ESTRUCTURA de una pantalla de portal (13/10/2026). Allianz ePAC carga AUTOS Turismos en el iframe
// `appArea` desde OTRO origen (puente SSO → app Angular `ngx-motor-azs`) y el grabador de Alberto no lo puede leer. Con
// su OK, cuando un adaptador declara un HUECO de mapa (`ErrorMapaIncompleto`), el worker lee la estructura de TODOS los
// marcos (Playwright sí entra en los de otro origen) y la adjunta al error para mapear sin grabación humana.
//
// Esto es lo PURO: el saneado del inventario crudo que devuelve el navegador. Lo usan el worker (antes de mandarlo) y
// asegura (otra vez, al recibirlo: defensa en profundidad). Solo ESTRUCTURA:
//   · se copian únicamente las claves de la lista blanca (nunca `value` de un input/textarea: no hay clave para él);
//   · cada texto se colapsa, se trunca y, si tiene forma de dato personal, se DESCARTA (no se tapa: se quita);
//   · la URL de cada marco va sin query ni fragmento, y redactada;
//   · tope de tamaño total con recorte EXPLÍCITO (`recortado`).

import { redactarDatosPersonales } from './formador.ts'
import { pareceDatoPersonalEnDescripcion } from './formulario-auto.ts'
import { PATRON_ELEMENTO_USUARIO, PATRON_MEDIADOR, PATRON_ULTIMO_ACCESO } from './grabador.ts'

/** Tope del inventario serializado (JSON, bytes UTF-8). */
export const MAX_BYTES_INVENTARIO_DOM = 60 * 1024
/** Máximo de marcos y de elementos por marco que se aceptan del crudo (antes del tope de bytes). */
export const MAX_MARCOS_INVENTARIO = 30
export const MAX_ELEMENTOS_MARCO_INVENTARIO = 600
/** Primeras opciones de un `<select>` que se guardan (el total va aparte). */
export const MAX_OPCIONES_INVENTARIO = 40
/** Truncado de los textos visibles (botones, pestañas, etiquetas, opciones). */
export const MAX_TEXTO_INVENTARIO = 60
/** Truncado de identificadores y atributos (id, name, onclick…). */
const MAX_ATRIBUTO = 80

export type OpcionInventario = { valor: string | null; texto: string | null }

export type ElementoInventario = {
  /** Referencia ESTABLE del elemento dentro de ESTE inventario (`m<marco>e<índice crudo>`); solo con `refs: true`. La
   *  usa el explorador IA: la IA contesta con refs y el worker las re-resuelve contra su propia lista. */
  ref?: string
  tag: string
  id?: string
  name?: string
  type?: string
  role?: string
  ariaLabel?: string
  placeholder?: string
  /** Angular reactive forms: el nombre del control (estructura, no dato). */
  formControlName?: string
  /** Texto de su `<label>` (o `aria-labelledby`). */
  etiqueta?: string
  /** Texto visible: SOLO de botones, pestañas, enlaces-botón, celdas con onclick y labels. */
  texto?: string
  onclick?: string
  requerido?: true
  deshabilitado?: true
  opciones?: OpcionInventario[]
  opcionesTotal?: number
  /** ¿El control tiene ya ALGÚN valor? Solo el booleano: el valor nunca sale del navegador. */
  conValor?: boolean
}

/** Un importe visible de la pantalla (`m<marco>p<índice crudo>`): SOLO el número en euros, nunca el texto. */
export type ImporteInventario = { ref: string; eur: number; etiqueta?: string }

export type MarcoInventario = {
  url: string
  nombre: string | null
  elementos: ElementoInventario[]
  ilegible?: true
  /** Encabezados visibles (h1-h3, legend, th…), saneados. Solo si el crudo los trae. */
  titulos?: string[]
  /** Importes visibles (pantalla de resultado). Solo si el crudo los trae. */
  importes?: ImporteInventario[]
}

export type OpcionesSaneado = {
  /** Asigna `ref` a cada elemento/importe. Conserva la que traiga el crudo si tiene la forma exacta y no se repite (la
   *  segunda pasada, en asegura, no debe renumerar lo que numeró el worker). */
  refs?: boolean
}

/** Máximo de títulos e importes por marco. */
export const MAX_TITULOS_MARCO = 20
export const MAX_IMPORTES_MARCO = 40
const RE_REF_ELEMENTO = /^m\d{1,2}e\d{1,3}$/
const RE_REF_IMPORTE = /^m\d{1,2}p\d{1,3}$/
/** Importe en formato español (o con punto decimal), con € opcional delante o detrás. Nada más en el texto. */
const RE_IMPORTE = /^(?:€\s*)?(-?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|-?\d+(?:[.,]\d{1,2})?)\s*(?:€|eur(?:os)?)?$/i
/** El texto con forma de importe lleva € o decimales: «2019» suelto no es un importe. */
export function leerImporteEur(texto: unknown): number | null {
  if (typeof texto !== 'string' && typeof texto !== 'number') return null
  const t = String(texto).replace(/\s+/g, ' ').trim()
  if (t.length > 30) return null
  const m = RE_IMPORTE.exec(t)
  if (!m || !(/€|eur/i.test(t) || /,\d{1,2}$/.test(m[1]))) return null
  const plano = /,/.test(m[1]) || /^\-?\d{1,3}(\.\d{3})+$/.test(m[1]) ? m[1].replace(/\./g, '').replace(',', '.') : m[1]
  const n = Number(plano)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/** Copia sin el flag `g` (un `test` con /g arrastra `lastIndex` entre llamadas). */
const sinG = (r: RegExp) => new RegExp(r.source, r.flags.replace('g', ''))
const MEDIADOR = sinG(PATRON_MEDIADOR)
const ULTIMO_ACCESO = sinG(PATRON_ULTIMO_ACCESO)

export type InventarioDom = {
  version: 1
  marcos: MarcoInventario[]
  totalElementos: number
  /** `null` = completo. Si no, cuántos elementos se quitaron por el tope de bytes (y textos descartados por dato personal). */
  recortado: { elementosDescartados: number; maxBytes: number } | null
  /** Textos/atributos quitados por tener forma de dato personal (solo la cuenta, nunca el valor). */
  textosDescartados: number
}

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** ¿Tiene forma de dato personal? Los dos filtros del módulo: el de la descripción del vehículo y el redactor general. */
export function pareceDatoPersonalInventario(texto: string): boolean {
  return pareceDatoPersonalEnDescripcion(texto) || redactarDatosPersonales(texto) !== texto
}

/** URL sin query ni fragmento, con los datos personales tapados. `about:blank` y similares tal cual. */
export function urlSinQuery(url: unknown): string {
  if (typeof url !== 'string') return ''
  const sinQ = url.split(/[?#]/, 1)[0] ?? ''
  return redactarDatosPersonales(sinQ).slice(0, 300)
}

const TAG = /^[a-z][a-z0-9-]{0,40}$/

/**
 * Sanea el inventario CRUDO (lo que devuelve el extractor del navegador, o lo que llega por el cable). `null` si no tiene
 * forma de inventario. Nunca lanza.
 */
export function sanearInventarioDom(crudo: unknown, maxBytes: number = MAX_BYTES_INVENTARIO_DOM, opciones: OpcionesSaneado = {}): InventarioDom | null {
  const c = obj(crudo)
  if (!c || !Array.isArray(c.marcos)) return null
  let descartados = 0
  // CABECERA DEL PORTAL (13/10/2026): ePAC pinta «209-C/12/0000 - Nombre Apellidos» (código y nombre del mediador) y
  // «Último acceso: <fecha>». El código no tiene forma de NIF ni de teléfono y el nombre es texto llano: se escapaban.
  // Primera pasada: se APRENDEN los nombres de mediador de cualquier texto del crudo, para quitarlos donde reaparezcan.
  const nombresMediador = new Set<string>()
  const aprender = (v: unknown) => {
    if (typeof v !== 'string') return
    for (const m of v.replace(/\s+/g, ' ').matchAll(PATRON_MEDIADOR)) {
      const n = (m[2] ?? '').trim()
      if (n.length >= 4) nombresMediador.add(n.toLowerCase())
    }
  }
  for (const m of c.marcos.slice(0, MAX_MARCOS_INVENTARIO)) {
    const mo = obj(m)
    if (!mo) continue
    if (Array.isArray(mo.titulos)) mo.titulos.slice(0, MAX_TITULOS_MARCO * 2).forEach(aprender)
    for (const e of Array.isArray(mo.elementos) ? mo.elementos.slice(0, MAX_ELEMENTOS_MARCO_INVENTARIO) : []) {
      const eo = obj(e)
      if (eo) for (const k of ['texto', 'etiqueta', 'ariaLabel', 'placeholder', 'onclick']) aprender(eo[k])
    }
  }
  const esCabeceraPersonal = (t: string): boolean => {
    if (MEDIADOR.test(t)) return true
    const ua = ULTIMO_ACCESO.exec(t)
    if (ua && /\d/.test(ua[2] ?? '')) return true
    const bajo = t.toLowerCase()
    for (const n of nombresMediador) if (bajo.includes(n)) return true
    return false
  }
  const texto = (v: unknown, max: number): string | undefined => {
    if (typeof v !== 'string' && typeof v !== 'number') return undefined
    const plano = String(v).replace(/\s+/g, ' ').trim()
    if (!plano) return undefined
    // Se mira el texto ENTERO (antes de truncar): un NIF partido por el corte no se escapa.
    if (pareceDatoPersonalInventario(plano) || esCabeceraPersonal(plano)) {
      descartados++
      return undefined
    }
    return plano.length > max ? plano.slice(0, max - 1) + '…' : plano
  }
  const refsUsadas = new Set<string>()
  const ponerRef = (propuesta: unknown, re: RegExp, porDefecto: string): string | null => {
    // Ref del cable con la forma exacta: se conserva; si se repite, el elemento es ambiguo → fuera (null).
    const r = typeof propuesta === 'string' && re.test(propuesta) ? propuesta : porDefecto
    if (refsUsadas.has(r)) return null
    refsUsadas.add(r)
    return r
  }
  const marcos: MarcoInventario[] = []
  for (const [im, m] of c.marcos.slice(0, MAX_MARCOS_INVENTARIO).entries()) {
    const mo = obj(m)
    if (!mo) continue
    const elementos: ElementoInventario[] = []
    const lista = Array.isArray(mo.elementos) ? mo.elementos.slice(0, MAX_ELEMENTOS_MARCO_INVENTARIO) : []
    for (const [ie, e] of lista.entries()) {
      const eo = obj(e)
      const tag = typeof eo?.tag === 'string' ? eo.tag.toLowerCase() : ''
      if (!eo || !TAG.test(tag)) continue
      // LISTA BLANCA de claves. `value`/`valor` de un control NO está: aunque el crudo lo trajera, no se copia.
      const el: ElementoInventario = { tag }
      if (opciones.refs) {
        const r = ponerRef(eo.ref, RE_REF_ELEMENTO, `m${im}e${ie}`)
        if (r === null) continue // ref repetida: el elemento no se puede señalar sin ambigüedad → fuera
        el.ref = r
      }
      const pon = (k: keyof ElementoInventario, v: string | undefined) => {
        if (v !== undefined) (el as Record<string, unknown>)[k] = v
      }
      pon('id', texto(eo.id, MAX_ATRIBUTO))
      pon('name', texto(eo.name, MAX_ATRIBUTO))
      pon('type', texto(eo.type, 30))
      pon('role', texto(eo.role, 30))
      pon('ariaLabel', texto(eo.ariaLabel, MAX_TEXTO_INVENTARIO))
      pon('placeholder', texto(eo.placeholder, MAX_TEXTO_INVENTARIO))
      pon('formControlName', texto(eo.formControlName, MAX_ATRIBUTO))
      pon('etiqueta', texto(eo.etiqueta, MAX_TEXTO_INVENTARIO))
      pon('texto', texto(eo.texto, MAX_TEXTO_INVENTARIO))
      pon('onclick', texto(eo.onclick, MAX_ATRIBUTO))
      if (eo.requerido === true) el.requerido = true
      if (eo.deshabilitado === true) el.deshabilitado = true
      if (typeof eo.conValor === 'boolean' && (tag === 'input' || tag === 'select' || tag === 'textarea')) el.conValor = eo.conValor
      // Elemento que MUESTRA el usuario/mediador (cabecera: id/name/aria «usuario», «mediador», «perfil»…): su texto fuera.
      if (el.texto !== undefined && tag !== 'input' && tag !== 'select' && tag !== 'textarea'
        && [eo.id, eo.name, eo.ariaLabel].some((x) => typeof x === 'string' && PATRON_ELEMENTO_USUARIO.test(x))) {
        delete el.texto
        descartados++
      }
      if (tag === 'select' && Array.isArray(eo.opciones)) {
        const opciones: OpcionInventario[] = []
        for (const o of eo.opciones.slice(0, MAX_OPCIONES_INVENTARIO)) {
          const oo = obj(o)
          if (!oo) continue
          const valor = texto(oo.valor, MAX_ATRIBUTO) ?? null
          const t = texto(oo.texto, MAX_TEXTO_INVENTARIO) ?? null
          if (valor !== null || t !== null) opciones.push({ valor, texto: t })
        }
        el.opciones = opciones
        const total = typeof eo.opcionesTotal === 'number' && Number.isFinite(eo.opcionesTotal) ? Math.max(0, Math.floor(eo.opcionesTotal)) : opciones.length
        el.opcionesTotal = Math.min(total, 100_000)
      }
      elementos.push(el)
    }
    const marco: MarcoInventario = {
      url: urlSinQuery(mo.url),
      nombre: texto(mo.nombre, MAX_ATRIBUTO) ?? null,
      elementos,
      ...(mo.ilegible === true ? { ilegible: true as const } : {}),
    }
    if (Array.isArray(mo.titulos)) {
      const titulos: string[] = []
      for (const t of mo.titulos.slice(0, MAX_TITULOS_MARCO * 2)) {
        const s = texto(t, MAX_TEXTO_INVENTARIO)
        if (s !== undefined && !titulos.includes(s)) titulos.push(s)
        if (titulos.length >= MAX_TITULOS_MARCO) break
      }
      marco.titulos = titulos
    }
    if (Array.isArray(mo.importes)) {
      const importes: ImporteInventario[] = []
      for (const [ip, i] of mo.importes.slice(0, MAX_IMPORTES_MARCO).entries()) {
        const io = obj(i)
        // Número ya saneado (segunda pasada, en asegura) o texto del portal (primera, en el worker).
        const eur = typeof io?.eur === 'number' && Number.isFinite(io.eur) && Math.abs(io.eur) < 1e9 ? Math.round(io.eur * 100) / 100 : leerImporteEur(io?.texto)
        if (!io || eur === null) continue
        const ref = ponerRef(io.ref, RE_REF_IMPORTE, `m${im}p${ip}`)
        if (ref === null) continue
        const etiqueta = texto(io.etiqueta, MAX_TEXTO_INVENTARIO)
        importes.push({ ref, eur, ...(etiqueta !== undefined ? { etiqueta } : {}) })
      }
      marco.importes = importes
    }
    marcos.push(marco)
  }

  // Tope de bytes: se quitan elementos del FINAL del marco con más elementos hasta caber (recorte explícito).
  // TextEncoder (no Buffer): el index del módulo también llega al navegador.
  const cod = new TextEncoder()
  const bytes = (v: unknown) => cod.encode(JSON.stringify(v)).length
  const armar = (rec: InventarioDom['recortado']): InventarioDom => ({
    version: 1,
    marcos,
    totalElementos: marcos.reduce((n, m) => n + m.elementos.length, 0),
    recortado: rec,
    textosDescartados: descartados,
  })
  const tope = Math.max(1024, maxBytes)
  // Reserva para la cabecera y el propio objeto `recortado`.
  let total = bytes(armar({ elementosDescartados: 0, maxBytes: tope })) + 16
  if (total <= tope) return armar(null)
  let quitados = 0
  while (total > tope) {
    const m = marcos.reduce<MarcoInventario | null>((a, b) => (b.elementos.length > (a?.elementos.length ?? 0) ? b : a), null)
    if (!m) break
    const e = m.elementos.pop()!
    total -= bytes(e) + 1
    quitados++
  }
  // Ni sin elementos cabe (URLs/marcos de sobra): fuera marcos del final.
  while (bytes(armar({ elementosDescartados: quitados, maxBytes: tope })) > tope && marcos.length > 0) {
    quitados += marcos.pop()!.elementos.length
  }
  return armar({ elementosDescartados: quitados, maxBytes: tope })
}
