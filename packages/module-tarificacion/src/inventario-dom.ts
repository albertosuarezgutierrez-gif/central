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
/** 0.3.14: el `onclick` llega al saneado con ≤200 car. (worker) y se conserva entero hasta ahí: uno recortado a 80 bloqueaba (`onclick_truncado`) los manejadores JSF normales (`mojarra.jsfcljs(…)`). Más de 200 sigue recortado = no se pulsa. */
const MAX_ONCLICK = 200

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
  /**
   * `<a href>` normal (28/10/2026, explorador): SOLO la ruta del enlace, sin query ni fragmento (`/EVT21_NSE_FWEB/oferta.jsp`); de
   * otro origen, `origen + ruta`. La miran `bloqueoAvance` (un `/contratar.do` es emisión) y la regla de enlaces avanzables.
   */
  hrefRuta?: string
  requerido?: true
  deshabilitado?: true
  opciones?: OpcionInventario[]
  opcionesTotal?: number
  /** ¿El control tiene ya ALGÚN valor? Solo el booleano: el valor nunca sale del navegador. */
  conValor?: boolean
  /** ¿El portal marca el control como INVÁLIDO (aria-invalid, `ng-invalid`, error NDBX)? Solo el booleano (14/10/2026). */
  invalido?: true
  /**
   * Texto del MENSAJE de error que el portal pinta junto a un control INVÁLIDO (28/10/2026, ePAC: el NIF del tomador volvía inválido
   * sin saber por qué). Saneado como cualquier texto (con forma de dato personal → fuera). Solo con `invalido`.
   */
  mensajeError?: string
  /** ¿El control AUTOCOMPLETA (aria-autocomplete list/both/inline o `list` de datalist)? Solo el booleano (14/10/2026): su
   *  `rellenar` puede repintar la sección, y el worker lo deja para el final del lote (`ordenarLote`). */
  autocompletar?: true
  /**
   * Título accesible del DIÁLOGO/MODAL que contiene al control (14/10/2026; el más cercano: `SELECTOR_DIALOGO` de guard.ts),
   * saneado. Solo si el crudo lo trae. Sirve para el «Guardar» de un modal autorizado por entrada (`guardadosEnDialogo`).
   */
  dialogo?: string
}

/** Un importe visible de la pantalla (`m<marco>p<índice crudo>`): SOLO el número en euros, nunca el texto. */
export type ImporteInventario = { ref: string; eur: number; etiqueta?: string }

export type MarcoInventario = {
  url: string
  nombre: string | null
  elementos: ElementoInventario[]
  ilegible?: true
  /** Encabezados visibles (h1-h3, legend, th…), saneados. Solo si el crudo los trae. Sirven para PARAR (emisión). */
  titulos?: string[]
  /** Subconjunto de `titulos` que el crudo marcó como TÍTULO DE PANTALLA (h1-h6, legend: `{ texto, tag }`), nunca un `th`
   *  de tabla ni un texto sin etiqueta. SOLO estos autorizan un «Aceptar» de exploración (fail-closed: sin etiqueta, no). */
  titulosPantalla?: string[]
  /** Importes visibles (pantalla de resultado). Solo si el crudo los trae. */
  importes?: ImporteInventario[]
  /**
   * AVISOS de error del portal en el marco (28/10/2026): filas de error del «INFORME DE AVISO E INCIDENCIAS» de ePAC y mensajes de error
   * de PrimeFaces/Bootstrap. Saneados (sin datos personales), ≤5. Sirven para saber POR QUÉ un campo vuelve inválido.
   */
  avisosPortal?: string[]
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
/** Etiquetas que cuentan como TÍTULO DE PANTALLA (no `th`, no `caption`, no texto suelto). */
const TAGS_TITULO_PANTALLA = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'legend'])
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

/** Aprende los nombres de mediador («209-C/12/0000 - Nombre Apellidos») de una lista de textos, para quitarlos donde reaparezcan. */
export function aprenderNombresMediador(textos: Iterable<unknown>, destino: Set<string> = new Set<string>()): Set<string> {
  for (const v of textos) {
    if (typeof v !== 'string') continue
    for (const m of v.replace(/\s+/g, ' ').matchAll(PATRON_MEDIADOR)) {
      const n = (m[2] ?? '').trim()
      if (n.length >= 4) destino.add(n.toLowerCase())
    }
  }
  return destino
}

/** ¿Es cabecera personal del portal (mediador, «Último acceso: fecha» o un nombre de mediador ya aprendido)? */
export function esCabeceraPersonal(t: string, nombresMediador: ReadonlySet<string> = new Set<string>()): boolean {
  if (MEDIADOR.test(t)) return true
  const ua = ULTIMO_ACCESO.exec(t)
  if (ua && /\d/.test(ua[2] ?? '')) return true
  const bajo = t.toLowerCase()
  for (const n of nombresMediador) if (bajo.includes(n)) return true
  return false
}

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
  const aprender = (v: unknown) => { aprenderNombresMediador([v], nombresMediador) }
  for (const m of c.marcos.slice(0, MAX_MARCOS_INVENTARIO)) {
    const mo = obj(m)
    if (!mo) continue
    if (Array.isArray(mo.titulos)) mo.titulos.slice(0, MAX_TITULOS_MARCO * 2).forEach((t) => aprender(obj(t)?.texto ?? t))
    if (Array.isArray(mo.titulosPantalla)) mo.titulosPantalla.slice(0, MAX_TITULOS_MARCO * 2).forEach(aprender)
    for (const e of Array.isArray(mo.elementos) ? mo.elementos.slice(0, MAX_ELEMENTOS_MARCO_INVENTARIO) : []) {
      const eo = obj(e)
      if (eo) for (const k of ['texto', 'etiqueta', 'ariaLabel', 'placeholder', 'onclick', 'dialogo']) aprender(eo[k])
    }
  }
  const texto = (v: unknown, max: number): string | undefined => {
    if (typeof v !== 'string' && typeof v !== 'number') return undefined
    const plano = String(v).replace(/\s+/g, ' ').trim()
    if (!plano) return undefined
    // Se mira el texto ENTERO (antes de truncar): un NIF partido por el corte no se escapa.
    if (pareceDatoPersonalInventario(plano) || esCabeceraPersonal(plano, nombresMediador)) {
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
      pon('onclick', texto(eo.onclick, MAX_ONCLICK))
      pon('hrefRuta', texto(eo.hrefRuta, MAX_ATRIBUTO))
      pon('dialogo', texto(eo.dialogo, MAX_TEXTO_INVENTARIO))
      if (eo.requerido === true) el.requerido = true
      if (eo.deshabilitado === true) el.deshabilitado = true
      if (typeof eo.conValor === 'boolean' && (tag === 'input' || tag === 'select' || tag === 'textarea')) el.conValor = eo.conValor
      if (eo.invalido === true && (tag === 'input' || tag === 'select' || tag === 'textarea')) el.invalido = true
      if (el.invalido === true) pon('mensajeError', texto(eo.mensajeError, 160))
      if (eo.autocompletar === true && (tag === 'input' || tag === 'textarea')) el.autocompletar = true
      // Elemento que MUESTRA el usuario/mediador (cabecera: id/name/aria «usuario», «mediador», «perfil»…): su texto fuera.
      if (el.texto !== undefined && tag !== 'input' && tag !== 'select' && tag !== 'textarea'
        && [eo.id, eo.name, eo.ariaLabel].some((x) => typeof x === 'string' && PATRON_ELEMENTO_USUARIO.test(x))) {
        delete el.texto
        descartados++
      }
      if ((tag === 'select' || tag === 'nx-dropdown') && Array.isArray(eo.opciones)) {
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
    if (Array.isArray(mo.avisosPortal)) {
      const avisos: string[] = []
      for (const a of mo.avisosPortal.slice(0, 20)) {
        const t = texto(a, 160)
        if (t !== undefined && !avisos.includes(t)) avisos.push(t)
        if (avisos.length >= 5) break
      }
      if (avisos.length > 0) marco.avisosPortal = avisos
    }
    if (Array.isArray(mo.titulos)) {
      // Crudo del worker: texto suelto o `{ texto, tag }`. Segunda pasada (asegura): `titulos` en texto + `titulosPantalla`.
      const titulos: string[] = []
      const dePantalla: string[] = []
      const ponPantalla = (s: string) => {
        if (!dePantalla.includes(s) && dePantalla.length < MAX_TITULOS_MARCO) dePantalla.push(s)
      }
      for (const t of mo.titulos.slice(0, MAX_TITULOS_MARCO * 2)) {
        const to = obj(t)
        const s = texto(to ? to.texto : t, MAX_TEXTO_INVENTARIO)
        if (s === undefined) continue
        if (!titulos.includes(s)) titulos.push(s)
        const tag = typeof to?.tag === 'string' ? to.tag.toLowerCase() : ''
        if (TAGS_TITULO_PANTALLA.has(tag)) ponPantalla(s)
        if (titulos.length >= MAX_TITULOS_MARCO) break
      }
      // Un título de pantalla solo vale si TAMBIÉN está (saneado) en `titulos`: no se cuela uno que no se vea en la lista.
      if (Array.isArray(mo.titulosPantalla)) {
        for (const t of mo.titulosPantalla.slice(0, MAX_TITULOS_MARCO * 2)) {
          if (typeof t !== 'string' || !titulos.includes(t.replace(/\s+/g, ' ').trim())) continue
          const s = texto(t, MAX_TEXTO_INVENTARIO)
          if (s !== undefined && titulos.includes(s)) ponPantalla(s)
        }
      }
      marco.titulos = titulos
      if (dePantalla.length > 0) marco.titulosPantalla = dePantalla
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

// ─── Redacción de los valores CONOCIDOS de una exploración con datos reales (13/10/2026) ──────────────────────────────
// El saneado de arriba quita lo que TIENE FORMA de dato personal (NIF, correo, teléfono…), pero un nombre o una calle son
// texto llano: si el portal repite en una etiqueta el nombre o la dirección del tomador que el worker acaba de escribir,
// se escaparía a la IA y a `tarificador_exploracion_pasos.inventario`. Aquí se quitan los VALORES concretos que se saben
// (los del riesgo del trabajo y el contacto de entorno). Igual que arriba: el texto que los contiene se QUITA, no se tapa.

/** Valores más cortos que esto no se buscan (un «1» o «A» casaría con todo). */
export const MIN_VALOR_REDACTAR = 3

/** Minúsculas, sin acentos, espacios colapsados. */
export function normalizarParaRedactar(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}
/** Solo letras y dígitos, ya sin acentos (sin `\p{L}`: asegura compila con target ES2017) (para valores con dígitos: «1234 ABC» = «1234-abc», «15/01/1980» = «15.01.1980»). */
const compacto = (s: string) => normalizarParaRedactar(s).replace(/[^a-z0-9]/g, '')
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** ¿El texto contiene alguno de los valores? Con dígitos se compara en compacto; sin dígitos, por palabra completa. */
export function contieneValorSensible(texto: string, valores: readonly string[]): boolean {
  const n = normalizarParaRedactar(texto)
  const c = compacto(texto)
  for (const v of valores) {
    const nv = normalizarParaRedactar(v)
    if (nv.length < MIN_VALOR_REDACTAR) continue
    if (/\d/.test(nv)) {
      const cv = compacto(v)
      if (cv.length >= MIN_VALOR_REDACTAR && c.includes(cv)) return true
    } else if (new RegExp(`(^|[^a-z0-9])${escapar(nv)}($|[^a-z0-9])`).test(n)) return true
  }
  return false
}

// 0.3.7 (revisión de seguridad): también `mensajeError` (texto del portal junto a un campo inválido) y `hrefRuta` (ruta de un enlace).
// TODA clave de texto nueva de `ElementoInventario` tiene que estar aquí (lo vigila un test que recorre las claves del saneado).
export const CLAVES_ELEMENTO_TEXTO = ['id', 'name', 'type', 'role', 'ariaLabel', 'placeholder', 'formControlName', 'etiqueta', 'texto', 'onclick', 'hrefRuta', 'mensajeError', 'dialogo'] as const

/**
 * Copia del inventario SIN ningún texto que contenga uno de `valores` (normalizado; se ignoran los < 3 caracteres). Cuenta
 * lo quitado en `textosDescartados`. Pura; nunca muta la entrada. Las `ref` y el `tag` no se tocan (son del inventario).
 */
export function redactarValoresInventario(inv: InventarioDom, valores: readonly string[]): InventarioDom {
  const vs = valores.filter((v) => typeof v === 'string' && normalizarParaRedactar(v).length >= MIN_VALOR_REDACTAR)
  if (vs.length === 0) return inv
  let quitados = 0
  const limpio = (t: string | null | undefined): t is string => {
    if (typeof t !== 'string') return false
    if (!contieneValorSensible(t, vs)) return true
    quitados++
    return false
  }
  const marcos = inv.marcos.map((m): MarcoInventario => {
    const elementos = m.elementos.map((e) => {
      const el: ElementoInventario = { ...e }
      for (const k of CLAVES_ELEMENTO_TEXTO) if (el[k] !== undefined && !limpio(el[k])) delete el[k]
      if (el.opciones) {
        el.opciones = el.opciones
          .map((o) => ({ valor: limpio(o.valor) ? o.valor : null, texto: limpio(o.texto) ? o.texto : null }))
          .filter((o) => o.valor !== null || o.texto !== null)
      }
      return el
    })
    const out: MarcoInventario = { ...m, url: limpio(m.url) ? m.url : '', nombre: limpio(m.nombre) ? m.nombre : null, elementos }
    if (m.titulos) out.titulos = m.titulos.filter(limpio)
    if (m.titulosPantalla) out.titulosPantalla = m.titulosPantalla.filter(limpio)
    if (m.avisosPortal) {
      const a = m.avisosPortal.filter(limpio)
      if (a.length > 0) out.avisosPortal = a
      else delete out.avisosPortal
    }
    if (m.importes) out.importes = m.importes.map((i) => (i.etiqueta === undefined || limpio(i.etiqueta) ? i : { ref: i.ref, eur: i.eur }))
    return out
  })
  return { ...inv, marcos, textosDescartados: inv.textosDescartados + quitados }
}

/** Claves del riesgo (sin mayúsculas ni `_`) cuyo valor es de la PERSONA o de SU dirección/vehículo. `tipoVia` no está. */
const CLAVES_RIESGO_SENSIBLES = new Set([
  'nombre', 'nombrecompleto', 'apellido', 'apellido1', 'apellido2', 'apellidos', 'razonsocial',
  'direccion', 'domicilio', 'via', 'nombrevia', 'calle', 'codigopostal', 'cp', 'poblacion', 'municipio', 'localidad',
  'fechanacimiento', 'fechacarne', 'matricula', 'nif', 'documentoidentidad', 'dni', 'nie', 'documento', 'email', 'correo', 'telefono', 'movil',
])

/**
 * Los valores sensibles de un `riesgo` (cualquier forma: auto, hogar, comunidades): recorre el objeto y recoge los textos
 * y números de las claves de `CLAVES_RIESGO_SENSIBLES`. Una fecha ISO añade también su forma dd/mm/aaaa.
 */
export function valoresSensiblesDeRiesgo(riesgo: unknown): string[] {
  const out = new Set<string>()
  const pon = (v: string) => {
    const t = v.trim()
    if (t.length < MIN_VALOR_REDACTAR || t.length > 200) return
    out.add(t)
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
    if (iso) out.add(`${iso[3]}/${iso[2]}/${iso[1]}`)
  }
  const andar = (v: unknown, prof: number) => {
    if (prof > 8 || out.size > 500) return
    if (Array.isArray(v)) return v.slice(0, 50).forEach((x) => andar(x, prof + 1))
    const o = obj(v)
    if (!o) return
    for (const [k, x] of Object.entries(o)) {
      if (CLAVES_RIESGO_SENSIBLES.has(k.toLowerCase().replace(/_/g, ''))) {
        if (typeof x === 'string') pon(x)
        else if (typeof x === 'number' && Number.isFinite(x)) pon(String(x))
      }
      andar(x, prof + 1)
    }
  }
  andar(riesgo, 0)
  return [...out]
}
