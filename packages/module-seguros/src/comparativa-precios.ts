// La COMPARATIVA de precios: agrupar por cobertura, ordenar y filtrar.
//
// Dictado por Alberto (21/09/2026) viendo 24 filas de precios seguidas en
// `/correduria/poliza/[id]/retarificar`: «aquí agrupar por cobertura» y «poner
// filtros». El problema no es la longitud: es que una lista ordenada solo por
// prima pone un Terceros de 175,89€ y un Todo Riesgo de 1.464,13€ en la misma
// columna, y eso se lee como «este es más caro» cuando no cubren lo mismo. Un
// orden que invita a una comparación falsa es peor que no ordenar.
//
// ─── Lo que se midió antes de escribir esto (21/09/2026) ────────────────────
// Sobre los 187 precios reales guardados en `seguros.tarificacion_precios`:
//   · Las etiquetas de AUTO que manda el vendor son SIETE: «Terceros»,
//     «Terceros Ampliado», «Todo Riesgo Con Franquicia Alta / Media / Baja»,
//     «Todo Riesgo Sin Franquicia» — y las manda igual Allianz, Mapfre,
//     Occident, Reale y Mutua Madrileña. En auto SÍ hay escala común.
//   · En HOGAR no la hay: Fiatc usa «Básico/Ampliado», Allianz y Fidelidade
//     «Básico/Estándar/Premium», y Mapfre Hogar llama a su tope **«Todo
//     Riesgo»** — la MISMA cadena que el tope de auto, con una prima de 84,80€.
//     Mapear «Ampliado» a «Estándar» sería inventar una equivalencia que
//     ninguna compañía ha declarado, así que NO se hace: cada etiqueta de hogar
//     es su propio grupo y la comparativa lo AVISA.
//   · **111 de los 187 precios (59 %) traen `franquiciaEur` a `null`**, y eso no
//     es «sin franquicia»: es «el producto no la declara». Por eso el filtro de
//     franquicia tiene TRES valores y el nivel conserva el matiz («alta»,
//     «media», «baja») que viene en la etiqueta, que muchas veces es la única
//     pista del importe.
//
// ─── La regla que gobierna este fichero ─────────────────────────────────────
// La misma de `filtro-cartera.ts`: un valor que no se reconoce se DECLARA, no
// se ignora. Aquí tiene un hermano propio del agrupar: **una etiqueta de
// cobertura que no está en la escala conocida NO se mete en un cajón «otros» ni
// se tira — se queda con su propio grupo, al final, marcada como no
// reconocida.** Un cajón «otros» es un `'otro'` centinela con otra ropa: un «no
// lo he sabido leer» disfrazado de dato, y se cuela por todas las guardas.

import type { Defensa } from './defensa-cartera.ts'
import { bloqueaEmision } from './defensa-cartera.ts'

// ─── Niveles de cobertura ────────────────────────────────────────────────────

/** A qué vocabulario pertenece un nivel. Hogar y auto NO comparten escala. */
export type FamiliaNivel = 'auto' | 'hogar' | 'sin_familia'

export type Nivel = {
  /** Clave estable para la URL y para agrupar. */
  clave: string
  label: string
  /** Orden de lectura: de menos cobertura a más. Los no reconocidos, al final. */
  rango: number
  familia: FamiliaNivel
  /** `false` = la etiqueta del vendor no está en la escala conocida. */
  reconocido: boolean
  /**
   * El matiz que trae la etiqueta y que el nivel agrupado se llevaría por
   * delante («alta» de «Todo Riesgo Con Franquicia Alta»). Se conserva porque
   * en el 59 % de las filas es lo ÚNICO que se sabe de la franquicia.
   */
  matiz: string | null
  /** La etiqueta tal y como la mandó la compañía. Nunca se pierde. */
  etiquetaVendor: string | null
}

const RANGO_SIN_DECLARAR = 900
const RANGO_NO_RECONOCIDO = 800

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function clavear(s: string): string {
  return normalizar(s).replace(/ /g, '_')
}

/**
 * Etiqueta del vendor → nivel canónico.
 *
 * `ramo` importa: medido el 21/09/2026, «Todo Riesgo» es el tope de auto Y el
 * nombre que Mapfre le da a su hogar completo. Sin el ramo, el hogar de 84,80€
 * caería en el grupo del todo riesgo de coche. Con `ramo` desconocido se asume
 * la familia de auto, que es de donde viene el 90 % del volumen, y se deja
 * dicho aquí para que nadie lo descubra en producción.
 */
export function nivelCobertura(
  categoria: string | null | undefined,
  ramo?: string | null,
): Nivel {
  if (typeof categoria !== 'string' || categoria.trim() === '') {
    return {
      clave: 'sin_declarar',
      label: 'Nivel no declarado',
      rango: RANGO_SIN_DECLARAR,
      familia: 'sin_familia',
      reconocido: false,
      matiz: null,
      etiquetaVendor: null,
    }
  }
  const n = normalizar(categoria)
  const esHogar = typeof ramo === 'string' && normalizar(ramo) === 'hogar'

  if (!esHogar) {
    if (n === 'terceros') return nivel('terceros', 'Terceros', 10, 'auto', null, categoria)
    if (n === 'terceros ampliado' || n === 'terceros ampliados') {
      return nivel('terceros_ampliado', 'Terceros ampliado', 20, 'auto', null, categoria)
    }
    if (n.startsWith('todo riesgo con franquicia')) {
      const matiz = n.replace('todo riesgo con franquicia', '').trim() || null
      return nivel(
        'todo_riesgo_franquicia',
        'Todo riesgo con franquicia',
        30,
        'auto',
        matiz,
        categoria,
      )
    }
    if (n === 'todo riesgo sin franquicia' || n === 'todo riesgo') {
      return nivel('todo_riesgo', 'Todo riesgo sin franquicia', 40, 'auto', null, categoria)
    }
  } else {
    // 🚨 Rangos DISTINTOS a propósito: ordenan la lectura, NO declaran que el
    // «Ampliado» de una compañía cubra lo mismo que el «Estándar» de otra.
    if (n === 'basico') return nivel('h_basico', 'Básico', 10, 'hogar', null, categoria)
    if (n === 'ampliado') return nivel('h_ampliado', 'Ampliado', 15, 'hogar', null, categoria)
    if (n === 'estandar') return nivel('h_estandar', 'Estándar', 20, 'hogar', null, categoria)
    if (n === 'premium') return nivel('h_premium', 'Premium', 30, 'hogar', null, categoria)
    if (n === 'todo riesgo') return nivel('h_todo_riesgo', 'Todo riesgo', 35, 'hogar', null, categoria)
  }

  // No reconocido: grupo PROPIO, al final, y dicho. Nunca un cajón «otros».
  return {
    clave: `x_${clavear(categoria)}`,
    label: categoria.trim(),
    rango: RANGO_NO_RECONOCIDO,
    familia: 'sin_familia',
    reconocido: false,
    matiz: null,
    etiquetaVendor: categoria,
  }
}

function nivel(
  clave: string,
  label: string,
  rango: number,
  familia: FamiliaNivel,
  matiz: string | null,
  etiquetaVendor: string,
): Nivel {
  return { clave, label, rango, familia, reconocido: true, matiz, etiquetaVendor }
}

// ─── El precio que entra ─────────────────────────────────────────────────────

export type FirmezaPrecio = 'firme' | 'condicionado' | 'estimado'

export const FIRMEZAS: readonly { v: FirmezaPrecio; label: string }[] = [
  { v: 'firme', label: 'Firme' },
  { v: 'condicionado', label: 'Condicionado' },
  { v: 'estimado', label: 'Estimado' },
]

const FIRMEZAS_VALIDAS = new Set<string>(FIRMEZAS.map((f) => f.v))

/** Lo mínimo de un precio para comparar. Es el `Precio` recortado del puerto. */
export type PrecioComparable = {
  compania?: string | null
  producto?: string | null
  categoria?: string | null
  /** `null` = la compañía no dio prima. NUNCA se trata como 0. */
  primaEur?: number | null
  /** `null` = no la declara. NO es «sin franquicia». */
  franquiciaEur?: number | null
  firmeza?: string | null
  /** Hasta cuándo se puede emitir (`expirationDate` del vendor). Ausente = no lo dijo. */
  expiraEn?: string | null
  avisos?: string[]
}

export type FilaPrecio = {
  precio: PrecioComparable
  nivel: Nivel
  /** `null` = no se ha evaluado la defensa de cartera (no es «emitible»). */
  defensa: Defensa | null
  bloqueada: boolean
  /** Posición en la lista original: la única clave estable que hay. */
  indice: number
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

/**
 * Tres valores, porque `franquiciaEur` es `null` en el 59 % de las filas y
 * `null` ≠ 0. «Sin franquicia» y «no declarada» son respuestas distintas y
 * juntarlas vendería un todo riesgo callando 1.500€.
 */
export type FiltroFranquicia = 'con' | 'sin' | 'no_declarada'

const FRANQUICIAS_VALIDAS = new Set<string>(['con', 'sin', 'no_declarada'])

export const FRANQUICIAS: readonly { v: FiltroFranquicia; label: string }[] = [
  { v: 'sin', label: 'Sin franquicia' },
  { v: 'con', label: 'Con franquicia' },
  { v: 'no_declarada', label: 'Franquicia no declarada' },
]

export type FiltroPrecios = {
  /** Claves de nivel (`nivelCobertura().clave`). Vacío = todos. */
  niveles: string[]
  /** Nombres de compañía tal y como vienen del vendor. Vacío = todas. */
  companias: string[]
  firmezas: FirmezaPrecio[]
  franquicia: FiltroFranquicia | null
  primaMin: number | null
  primaMax: number | null
  /**
   * Ocultar las filas que la defensa de cartera marca como no emitibles.
   *
   * 🚨 **Por defecto `false`.** Alberto necesita el precio aunque no pueda
   * emitir: «defensa de cartera» significa justo eso — la compañía da el
   * precio, la emisión no es nuestra. Y esconderlas por defecto haría invisible
   * un falso positivo del emparejamiento de compañías, que es el error caro
   * (ver `defensa-cartera.ts`).
   */
  soloEmitibles: boolean
  /** Mandar las bloqueadas al final de su grupo en vez de dejarlas por precio. */
  bloqueadasAlFinal: boolean
}

export const FILTRO_PRECIOS_VACIO: FiltroPrecios = {
  niveles: [],
  companias: [],
  firmezas: [],
  franquicia: null,
  primaMin: null,
  primaMax: null,
  soloEmitibles: false,
  bloqueadasAlFinal: false,
}

export type ParseFiltroPrecios = {
  filtro: FiltroPrecios
  /** Lo que venía y no se ha entendido, con su campo. La pantalla lo DICE. */
  descartados: { campo: string; valor: string }[]
  /** Peticiones entendidas pero imposibles (una horquilla al revés, p. ej.). */
  avisos: string[]
}

type Lector = { get(k: string): string | null }

function lista(l: Lector, k: string): string[] {
  const v = l.get(k)
  if (!v) return []
  return v.split(',').map((s) => s.trim()).filter(Boolean)
}

function booleano(l: Lector, k: string): boolean {
  const v = (l.get(k) ?? '').trim()
  return v === '1' || v === 'true' || v === 'si'
}

/**
 * Lee el filtro de la URL.
 *
 * `presentes` son los niveles y compañías que la comparativa de ESTE momento
 * trae. No es un enum cerrado —las compañías las nombra el vendor y los niveles
 * pueden ser etiquetas nuevas—, así que la validación se hace contra lo que hay
 * delante: pedir `compania=Fiatc` sobre una comparativa sin Fiatc es un filtro
 * que no puede cumplirse, y se DECLARA en vez de devolver la lista entera.
 */
export function parseFiltroPrecios(
  l: Lector,
  presentes: { niveles: readonly string[]; companias: readonly string[] },
): ParseFiltroPrecios {
  const descartados: { campo: string; valor: string }[] = []
  const avisos: string[] = []

  const nivelesOk = new Set(presentes.niveles)
  const companiasOk = new Map(presentes.companias.map((c) => [normalizar(c), c]))

  const niveles: string[] = []
  for (const v of lista(l, 'nivel')) {
    if (nivelesOk.has(v)) niveles.push(v)
    else descartados.push({ campo: 'nivel', valor: v })
  }

  const companias: string[] = []
  for (const v of lista(l, 'compania')) {
    const real = companiasOk.get(normalizar(v))
    if (real !== undefined) companias.push(real)
    else descartados.push({ campo: 'compania', valor: v })
  }

  const firmezas: FirmezaPrecio[] = []
  for (const v of lista(l, 'firmeza')) {
    if (FIRMEZAS_VALIDAS.has(v)) firmezas.push(v as FirmezaPrecio)
    else descartados.push({ campo: 'firmeza', valor: v })
  }

  const fBruto = (l.get('franquicia') ?? '').trim()
  let franquicia: FiltroFranquicia | null = null
  if (fBruto !== '') {
    if (FRANQUICIAS_VALIDAS.has(fBruto)) franquicia = fBruto as FiltroFranquicia
    else descartados.push({ campo: 'franquicia', valor: fBruto })
  }

  const primaMin = numeroOnulo(l, 'primaMin', descartados)
  const primaMax = numeroOnulo(l, 'primaMax', descartados)
  if (primaMin !== null && primaMax !== null && primaMin > primaMax) {
    // No se corrige ni se intercambian: se dice. Arreglarlo por nuestra cuenta
    // enseñaría una lista que nadie ha pedido.
    avisos.push(
      `La horquilla de prima va al revés (de ${eurEs(primaMin)} a ${eurEs(primaMax)}): ningún precio puede cumplirla.`,
    )
  }

  return {
    filtro: {
      niveles,
      companias,
      firmezas,
      franquicia,
      primaMin,
      primaMax,
      soloEmitibles: booleano(l, 'soloEmitibles'),
      bloqueadasAlFinal: booleano(l, 'bloqueadasAlFinal'),
    },
    descartados,
    avisos,
  }
}

function numeroOnulo(
  l: Lector,
  k: string,
  descartados: { campo: string; valor: string }[],
): number | null {
  const v = (l.get(k) ?? '').trim()
  if (v === '') return null
  // Se acepta la coma decimal española: es lo que teclea quien copia un importe
  // de la propia pantalla.
  const n = Number(v.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) {
    descartados.push({ campo: k, valor: v })
    return null
  }
  return n
}

export function filtroPreciosActivo(f: FiltroPrecios): boolean {
  return (
    f.niveles.length > 0 ||
    f.companias.length > 0 ||
    f.firmezas.length > 0 ||
    f.franquicia !== null ||
    f.primaMin !== null ||
    f.primaMax !== null ||
    f.soloEmitibles
  )
}

/** Importe en español: `2.162,49€`, con el € detrás. Regla global de `CLAUDE.md`. */
export function eurEs(n: number): string {
  return (
    n.toLocaleString('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: 'always',
    }) + '€'
  )
}

export function describirFiltroPrecios(f: FiltroPrecios, nombreNivel: (c: string) => string): string {
  if (!filtroPreciosActivo(f)) return 'todos los precios'
  const partes: string[] = []
  if (f.niveles.length) partes.push(f.niveles.map(nombreNivel).join(' o '))
  if (f.companias.length) partes.push(`de ${f.companias.join(' o ')}`)
  if (f.firmezas.length) {
    partes.push(
      `firmeza ${f.firmezas.map((v) => FIRMEZAS.find((x) => x.v === v)?.label.toLowerCase() ?? v).join(' o ')}`,
    )
  }
  if (f.franquicia) {
    partes.push(FRANQUICIAS.find((x) => x.v === f.franquicia)?.label.toLowerCase() ?? f.franquicia)
  }
  if (f.primaMin !== null && f.primaMax !== null) partes.push(`entre ${eurEs(f.primaMin)} y ${eurEs(f.primaMax)}`)
  else if (f.primaMin !== null) partes.push(`desde ${eurEs(f.primaMin)}`)
  else if (f.primaMax !== null) partes.push(`hasta ${eurEs(f.primaMax)}`)
  if (f.soloEmitibles) partes.push('solo las que podemos emitir')
  return partes.join(' · ')
}

// ─── Agrupar ─────────────────────────────────────────────────────────────────

export type GrupoCobertura = {
  nivel: Nivel
  /** Las filas que pasan el filtro, ya ordenadas. */
  filas: FilaPrecio[]
  /** Cuántas había en este nivel antes de filtrar. */
  total: number
  /** De las mostradas, cuántas no se pueden emitir. */
  bloqueadas: number
  /** De las mostradas, cuántas no se ha podido comprobar. */
  sinComprobar: number
  /** La más barata que SÍ se puede emitir, que es la que de verdad se vende. */
  masBarataEmitible: FilaPrecio | null
  /** Los matices de franquicia presentes («alta», «media»…), para el subtítulo. */
  matices: string[]
}

export type Comparativa = {
  grupos: GrupoCobertura[]
  total: number
  mostrados: number
  /** Cuántas ha quitado el filtro (sin contar las de `soloEmitibles`). */
  ocultosPorFiltro: number
  /** Cuántas ha quitado explícitamente «solo emitibles». */
  bloqueadasOcultas: number
  /**
   * `null` si no hay nada que advertir. Non-null cuando los grupos mezclan
   * vocabularios o cuando la escala de hogar viene de varias compañías, que es
   * cuando los niveles NO son comparables entre sí.
   */
  avisoEscala: string | null
  /** Para pintar los desplegables y para validar el filtro de la URL. */
  nivelesPresentes: { clave: string; label: string; n: number }[]
  companiasPresentes: string[]
}

export type OpcionesComparativa = {
  filtro?: FiltroPrecios
  ramo?: string | null
  /** Defensa de cartera por nombre de compañía. Ausente = no evaluada. */
  defensaPorCompania?: ReadonlyMap<string, Defensa> | null
}

/**
 * Agrupa, filtra y ordena.
 *
 * Orden ENTRE grupos: de menos cobertura a más (`rango`), porque es como se
 * decide de verdad —primero se elige el nivel, después el precio— y porque el
 * orden inverso pone arriba lo más caro. Los no reconocidos y el «nivel no
 * declarado» van al final, nunca mezclados.
 *
 * Orden DENTRO del grupo: prima ascendente; las filas sin prima al final
 * (`null` no es 0); empate, por compañía. Las bloqueadas se quedan en su sitio
 * por precio salvo que se pida `bloqueadasAlFinal`.
 */
export function agruparPrecios(
  precios: readonly PrecioComparable[],
  opciones: OpcionesComparativa = {},
): Comparativa {
  const filtro = opciones.filtro ?? FILTRO_PRECIOS_VACIO
  const ramo = opciones.ramo ?? null
  const defensas = opciones.defensaPorCompania ?? null

  const todas: FilaPrecio[] = precios.map((precio, indice) => {
    const nivel = nivelCobertura(precio.categoria, ramo)
    const defensa = defensas ? (defensas.get(precio.compania ?? '') ?? null) : null
    return { precio, nivel, defensa, bloqueada: defensa !== null && bloqueaEmision(defensa), indice }
  })

  const nivelesPresentes = contarNiveles(todas)
  const companiasPresentes = [
    ...new Set(todas.map((f) => f.precio.compania).filter((c): c is string => typeof c === 'string' && c !== '')),
  ].sort((a, b) => a.localeCompare(b, 'es'))

  let ocultosPorFiltro = 0
  let bloqueadasOcultas = 0
  const pasan: FilaPrecio[] = []
  for (const f of todas) {
    if (!cumpleFiltro(f, filtro)) {
      ocultosPorFiltro += 1
      continue
    }
    if (filtro.soloEmitibles && f.bloqueada) {
      bloqueadasOcultas += 1
      continue
    }
    pasan.push(f)
  }

  const porNivel = new Map<string, FilaPrecio[]>()
  for (const f of pasan) {
    const arr = porNivel.get(f.nivel.clave)
    if (arr) arr.push(f)
    else porNivel.set(f.nivel.clave, [f])
  }
  const totalPorNivel = new Map<string, number>()
  for (const f of todas) totalPorNivel.set(f.nivel.clave, (totalPorNivel.get(f.nivel.clave) ?? 0) + 1)

  const grupos: GrupoCobertura[] = []
  for (const [clave, filas] of porNivel) {
    filas.sort(comparar(filtro.bloqueadasAlFinal))
    const emitibles = filas.filter((f) => !f.bloqueada && f.precio.primaEur != null)
    grupos.push({
      nivel: filas[0]!.nivel,
      filas,
      total: totalPorNivel.get(clave) ?? filas.length,
      bloqueadas: filas.filter((f) => f.bloqueada).length,
      sinComprobar: filas.filter((f) => f.defensa !== null && f.defensa.estado === 'desconocida').length,
      masBarataEmitible: emitibles.length > 0 ? emitibles[0]! : null,
      matices: [...new Set(filas.map((f) => f.nivel.matiz).filter((m): m is string => m !== null))],
    })
  }
  grupos.sort((a, b) => a.nivel.rango - b.nivel.rango || a.nivel.label.localeCompare(b.nivel.label, 'es'))

  return {
    grupos,
    total: todas.length,
    mostrados: pasan.length,
    ocultosPorFiltro,
    bloqueadasOcultas,
    avisoEscala: avisoDeEscala(todas),
    nivelesPresentes,
    companiasPresentes,
  }
}

function comparar(bloqueadasAlFinal: boolean) {
  return (a: FilaPrecio, b: FilaPrecio): number => {
    if (bloqueadasAlFinal && a.bloqueada !== b.bloqueada) return a.bloqueada ? 1 : -1
    const pa = a.precio.primaEur
    const pb = b.precio.primaEur
    // 🚨 Sin prima NO es prima 0: va al final, no a la cabeza de la lista.
    if (pa == null && pb == null) return desempate(a, b)
    if (pa == null) return 1
    if (pb == null) return -1
    if (pa !== pb) return pa - pb
    return desempate(a, b)
  }
}

function desempate(a: FilaPrecio, b: FilaPrecio): number {
  const ca = a.precio.compania ?? ''
  const cb = b.precio.compania ?? ''
  return ca.localeCompare(cb, 'es') || a.indice - b.indice
}

function cumpleFiltro(f: FilaPrecio, filtro: FiltroPrecios): boolean {
  if (filtro.niveles.length > 0 && !filtro.niveles.includes(f.nivel.clave)) return false
  if (filtro.companias.length > 0) {
    const c = normalizar(f.precio.compania ?? '')
    if (!filtro.companias.some((x) => normalizar(x) === c)) return false
  }
  if (filtro.firmezas.length > 0) {
    const fm = f.precio.firmeza
    // Una firmeza que no viene NO cumple «firme»: no se supone lo que no se dijo.
    if (typeof fm !== 'string' || !filtro.firmezas.includes(fm as FirmezaPrecio)) return false
  }
  if (filtro.franquicia !== null) {
    const fr = f.precio.franquiciaEur
    if (filtro.franquicia === 'no_declarada' && fr != null) return false
    // 🚨 `null` NO cumple «sin franquicia»: no declarar no es no tener.
    if (filtro.franquicia === 'sin' && !(fr === 0)) return false
    if (filtro.franquicia === 'con' && !(typeof fr === 'number' && fr > 0)) return false
  }
  const p = f.precio.primaEur
  if (filtro.primaMin !== null || filtro.primaMax !== null) {
    // Una fila sin prima no puede cumplir una horquilla; tampoco se cuela.
    if (p == null) return false
    if (filtro.primaMin !== null && p < filtro.primaMin) return false
    if (filtro.primaMax !== null && p > filtro.primaMax) return false
  }
  return true
}

function contarNiveles(filas: readonly FilaPrecio[]): { clave: string; label: string; n: number }[] {
  const m = new Map<string, { clave: string; label: string; n: number; rango: number }>()
  for (const f of filas) {
    const e = m.get(f.nivel.clave)
    if (e) e.n += 1
    else m.set(f.nivel.clave, { clave: f.nivel.clave, label: f.nivel.label, n: 1, rango: f.nivel.rango })
  }
  return [...m.values()]
    .sort((a, b) => a.rango - b.rango || a.label.localeCompare(b.label, 'es'))
    .map(({ clave, label, n }) => ({ clave, label, n }))
}

/**
 * Cuándo los grupos NO son comparables entre sí, dicho en la pantalla.
 *
 * Dos casos, los dos medidos el 21/09/2026:
 *   · se mezclan familias (auto y hogar en la misma tabla), o hay etiquetas
 *     fuera de la escala conocida;
 *   · la escala de HOGAR con más de una compañía: «Ampliado» de Fiatc y
 *     «Estándar» de Allianz no son el mismo producto y nadie ha dicho que lo
 *     sean.
 */
function avisoDeEscala(filas: readonly FilaPrecio[]): string | null {
  if (filas.length === 0) return null
  const familias = new Set(filas.map((f) => f.nivel.familia))
  const noReconocidos = [
    ...new Set(filas.filter((f) => !f.nivel.reconocido).map((f) => f.nivel.label)),
  ]
  const companias = new Set(filas.map((f) => f.precio.compania ?? ''))

  const partes: string[] = []
  if (familias.has('auto') && familias.has('hogar')) {
    partes.push(
      'La tabla mezcla niveles de auto y de hogar, que son escalas distintas: ordenarlos juntos no los hace comparables.',
    )
  }
  if (familias.has('hogar') && companias.size > 1) {
    partes.push(
      'Los niveles de hogar los nombra cada compañía a su manera («Ampliado» de una y «Estándar» de otra no cubren necesariamente lo mismo): compara las garantías, no el rótulo.',
    )
  }
  if (noReconocidos.length > 0) {
    partes.push(
      `${noReconocidos.length === 1 ? 'Un nivel no está' : `${noReconocidos.length} niveles no están`} en la escala conocida (${noReconocidos.join(', ')}): se muestran aparte, al final, sin suponer a qué altura van.`,
    )
  }
  return partes.length > 0 ? partes.join(' ') : null
}
