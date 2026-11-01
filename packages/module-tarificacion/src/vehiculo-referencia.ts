// VEHÍCULO DE REFERENCIA de una oportunidad (01/11/2026, Alberto). PURO: ni BD, ni red.
//
// Problema: cada compañía identificaba el coche por su cuenta y salían distintos (Mapfre por matrícula = FORFOUR 5p 75CV 1124cc;
// Allianz por matrícula = FORTWO PASSION/PULSE/PURE 52; Generali pide FORFOUR/FORTWO CABRIO/FORTWO COUPE; la póliza viva dice
// FORFOUR PURE 1.1), y cada bot preguntaba por separado. Regla:
//   1. UN vehículo de referencia por oportunidad, con ORIGEN y PRIORIDAD: elección humana > Mapfre por matrícula > póliza viva >
//      Allianz (`vehiculoReferenciaEfectivo`). Solo catálogo: nunca matrícula ni bastidor (el validador rechaza claves extra y
//      textos con forma de dato personal).
//   2. Cuando un bot iba a parar por elección de modelo/versión, elige SOLO con la referencia (`elegirOpcionPorVehiculoReferencia`):
//      por SIMILITUD (los nombres no son iguales entre compañías): normaliza, quita relleno, compara por tokens (Jaccard) +
//      rasgos estructurales (modelo, carrocería, puertas, combustible) + cercanía numérica (CV/kW, cc, año). Gana la de mayor
//      puntuación; empate → la primera del portal. Solo NO elige si no hay ninguna opción utilizable o ninguna de la misma marca.
//   3. Elegir por referencia es SIEMPRE un supuesto: el aviso lleva «supuesto» → precio `estimado` (`firmeza-rpa.ts`).
// Determinista: misma entrada → misma salida. Sin IA.

import { pareceDatoPersonalEnDescripcion } from './formulario-auto.ts'
import { datosEquivalenciaDesdeEtiqueta } from './vehiculo-confirmado.ts'
import { COMBUSTIBLES, esOpcionVacia, type Combustible } from './vehiculo.ts'

/** Orígenes, de MAYOR a menor prioridad (el índice es la prioridad). */
export const ORIGENES_VEHICULO_REFERENCIA = ['humano', 'mapfre', 'poliza', 'allianz'] as const
export type OrigenVehiculoReferencia = (typeof ORIGENES_VEHICULO_REFERENCIA)[number]

/** Nombre del origen para el aviso «vehículo según …». */
export const NOMBRE_ORIGEN_VEHICULO_REFERENCIA: Readonly<Record<OrigenVehiculoReferencia, string>> = Object.freeze({
  humano: 'elección en la bandeja',
  mapfre: 'Mapfre',
  poliza: 'la póliza',
  allianz: 'Allianz',
})

export type VehiculoReferencia = {
  origen: OrigenVehiculoReferencia
  marca: string | null
  modelo: string | null
  /** Versión / denominación de catálogo (texto de la compañía de origen). */
  version: string | null
  carroceria: string | null
  puertas: number | null
  cc: number | null
  cv: number | null
  combustible: Combustible | null
  anio: number | null
}

/** Las ÚNICAS claves permitidas (todo lo demás, p. ej. `matricula`, se rechaza). */
export const CLAVES_VEHICULO_REFERENCIA = ['origen', 'marca', 'modelo', 'version', 'carroceria', 'puertas', 'cc', 'cv', 'combustible', 'anio'] as const
const MAX_TEXTO = 200

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const espacios = (s: string) => s.replace(/\s+/g, ' ').trim()

export type ValidacionVehiculoReferencia = { ok: true; valor: VehiculoReferencia } | { ok: false; errores: string[] }

/** Valida un vehículo de referencia. Nunca repite valores en el error. Hace falta al menos modelo o versión. PURA. */
export function validarVehiculoReferencia(v: unknown): ValidacionVehiculoReferencia {
  if (!esObj(v)) return { ok: false, errores: ['vehiculoReferencia: tiene que ser un objeto (o no venir)'] }
  const errores: string[] = []
  const extra = Object.keys(v).filter((k) => !(CLAVES_VEHICULO_REFERENCIA as readonly string[]).includes(k))
  if (extra.length) errores.push(`vehiculoReferencia: claves no permitidas (${extra.map((k) => k.slice(0, 30)).join(', ')})`)
  const origen = typeof v.origen === 'string' && (ORIGENES_VEHICULO_REFERENCIA as readonly string[]).includes(v.origen) ? (v.origen as OrigenVehiculoReferencia) : null
  if (!origen) errores.push(`vehiculoReferencia.origen: tiene que ser uno de ${ORIGENES_VEHICULO_REFERENCIA.join(', ')}`)
  const texto = (campo: string): string | null => {
    const x = v[campo]
    if (x === undefined || x === null) return null
    if (typeof x !== 'string') {
      errores.push(`vehiculoReferencia.${campo}: tiene que ser texto`)
      return null
    }
    const t = espacios(x)
    if (t === '') return null
    if (t.length > MAX_TEXTO) errores.push(`vehiculoReferencia.${campo}: máximo ${MAX_TEXTO} caracteres`)
    else if (pareceDatoPersonalEnDescripcion(t)) errores.push(`vehiculoReferencia.${campo}: solo catálogo (sin matrícula ni datos personales)`)
    else return t
    return null
  }
  const entero = (campo: string, min: number, max: number): number | null => {
    const x = v[campo]
    if (x === undefined || x === null) return null
    if (typeof x !== 'number' || !Number.isInteger(x) || x < min || x > max) {
      errores.push(`vehiculoReferencia.${campo}: entero entre ${min} y ${max}`)
      return null
    }
    return x
  }
  const marca = texto('marca')
  const modelo = texto('modelo')
  const version = texto('version')
  const carroceria = texto('carroceria')
  const puertas = entero('puertas', 0, 9)
  const cc = entero('cc', 0, 10000)
  const cv = entero('cv', 1, 2000)
  const anio = entero('anio', 1900, 2100)
  let combustible: Combustible | null = null
  if (v.combustible !== undefined && v.combustible !== null) {
    if (typeof v.combustible === 'string' && (COMBUSTIBLES as readonly string[]).includes(v.combustible)) combustible = v.combustible as Combustible
    else errores.push(`vehiculoReferencia.combustible: uno de ${COMBUSTIBLES.join(', ')}`)
  }
  if (modelo === null && version === null && !errores.length) errores.push('vehiculoReferencia: hace falta el modelo o la versión')
  if (errores.length || !origen) return { ok: false, errores }
  return { ok: true, valor: { origen, marca, modelo, version, carroceria, puertas, cc, cv, combustible, anio } }
}

/** Prioridad del origen (0 = la más alta). PURA. */
export function prioridadOrigenVehiculo(o: OrigenVehiculoReferencia): number {
  return ORIGENES_VEHICULO_REFERENCIA.indexOf(o)
}

/** El vehículo que MANDA entre varios: el de origen más prioritario (humano gana); empate → el primero dado. Inválidos fuera. PURA. */
export function vehiculoReferenciaEfectivo(candidatos: readonly unknown[]): VehiculoReferencia | null {
  let mejor: VehiculoReferencia | null = null
  for (const c of candidatos) {
    if (c === null || c === undefined) continue
    const v = validarVehiculoReferencia(c)
    if (!v.ok) continue
    if (!mejor || prioridadOrigenVehiculo(v.valor.origen) < prioridadOrigenVehiculo(mejor.origen)) mejor = v.valor
  }
  return mejor
}

/** Vehículo de referencia vacío de un origen (para construir desde otras formas). */
function base(origen: OrigenVehiculoReferencia): VehiculoReferencia {
  return { origen, marca: null, modelo: null, version: null, carroceria: null, puertas: null, cc: null, cv: null, combustible: null, anio: null }
}

/** Desde el `vehiculoConfirmado` de Mapfre (denominación + CV/cc/puertas/combustible/fecha). `null` si no valida. PURA. */
export function vehiculoReferenciaDesdeConfirmado(vc: unknown): VehiculoReferencia | null {
  if (!esObj(vc) || typeof vc.denominacion !== 'string' || !vc.denominacion.trim()) return null
  const anio = typeof vc.fechaInicio === 'string' && /^\d{4}/.test(vc.fechaInicio) ? Number(vc.fechaInicio.slice(0, 4)) : null
  const r = validarVehiculoReferencia({
    ...base('mapfre'),
    version: vc.denominacion,
    cv: typeof vc.cv === 'number' && vc.cv > 0 ? vc.cv : null,
    cc: typeof vc.cc === 'number' ? vc.cc : null,
    puertas: typeof vc.puertas === 'number' ? vc.puertas : null,
    combustible: typeof vc.combustible === 'string' ? vc.combustible : null,
    anio,
  })
  return r.ok ? r.valor : null
}

/** Desde un catálogo separado (marca/modelo/descripción/cc: Allianz confirmado o póliza viva). `null` si no valida. PURA. */
export function vehiculoReferenciaDesdeSeleccion(sv: unknown, origen: OrigenVehiculoReferencia): VehiculoReferencia | null {
  if (!esObj(sv)) return null
  const t = (x: unknown) => (typeof x === 'string' && x.trim() ? x : null)
  const version = t(sv.descripcion) ?? t(sv.version)
  const r = validarVehiculoReferencia({
    ...base(origen),
    marca: t(sv.marca),
    modelo: t(sv.modelo),
    version,
    cc: typeof sv.cilindradaCc === 'number' ? sv.cilindradaCc : null,
  })
  return r.ok ? r.valor : null
}

/** Texto legible (sin datos personales: solo catálogo). PURA. */
export function textoVehiculoReferencia(v: VehiculoReferencia): string {
  const partes = [v.marca, v.modelo, v.version, v.carroceria, v.puertas !== null ? `${v.puertas}P` : null, v.cv !== null ? `${v.cv}CV` : null, v.cc !== null ? `${v.cc}CC` : null]
  return espacios(partes.filter((x): x is string => typeof x === 'string' && x !== '').join(' '))
}

// ───────────────────────── similitud ─────────────────────────

const normalizar = (t: string): string =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/(\d)[.,](\d)/g, '$1_$2').replace(/[^A-Z0-9_]+/g, ' ').replace(/_/g, '.').replace(/\s+/g, ' ').trim()

/** Palabras que no distinguen un vehículo de otro (relleno del catálogo). El combustible se compara aparte. */
const RELLENO = new Set([
  'MARCA', 'MODELO', 'VERSION', 'VERSIONES', 'ACABADO', 'TURISMO', 'TURISMOS', 'VEHICULO', 'COCHE',
  'GASOLINA', 'DIESEL', 'GASOIL', 'GASOLEO', 'ELECTRICO', 'HIBRIDO', 'HYBRID', 'PETROL',
  'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'CON', 'SIN', 'EN', 'A', 'AUT', 'AUTO', 'MAN', 'MANUAL', 'AUTOMATICO',
  'CV', 'KW', 'CC', 'HP', 'P', 'PTAS', 'PUERTAS', 'OTROS', 'OTRO',
])

/** Carrocería canónica (sinónimos → una palabra). */
const CARROCERIA: Readonly<Record<string, string>> = Object.freeze({
  COUPE: 'COUPE', CABRIO: 'CABRIO', CABRIOLET: 'CABRIO', DESCAPOTABLE: 'CABRIO', CONVERTIBLE: 'CABRIO', ROADSTER: 'CABRIO',
  FAMILIAR: 'FAMILIAR', SW: 'FAMILIAR', ESTATE: 'FAMILIAR', TOURER: 'FAMILIAR', BREAK: 'FAMILIAR', AVANT: 'FAMILIAR', KOMBI: 'FAMILIAR', SPORTSTOURER: 'FAMILIAR',
  SEDAN: 'SEDAN', BERLINA: 'SEDAN', MONOVOLUMEN: 'MONOVOLUMEN', FURGON: 'FURGON', PICKUP: 'PICKUP', TODOTERRENO: 'TODOTERRENO', SUV: 'TODOTERRENO',
})

type Rasgos = { tokens: Set<string>; carrocerias: Set<string>; puertas: number | null; cv: number | null; cc: number | null; anio: number | null; combustible: Combustible | null }

const KW_A_CV = 1.35962

function rasgosDeTexto(texto: string, quitar: ReadonlySet<string>): Rasgos {
  const n = normalizar(texto)
  const d = datosEquivalenciaDesdeEtiqueta(texto)
  const mp = /\b([2-5])\s*(?:P|PTAS?|PUERTAS)\b/.exec(n)
  const ma = /\b(19[89]\d|20[0-4]\d)\b/.exec(n)
  const cv = d.cv ?? (d.kw ? Math.round(d.kw * KW_A_CV) : null)
  const limpio = n
    .replace(/\b[2-5]\s*(?:P|PTAS?|PUERTAS)\b/g, ' ')
    .replace(/\b\d{1,4}\s*(?:CV|HP|KW|CC|CM3)\b/g, ' ')
    .replace(/\b(19[89]\d|20[0-4]\d)\b/g, ' ')
  const tokens = new Set<string>()
  const carrocerias = new Set<string>()
  for (const w of limpio.split(' ')) {
    if (!w || RELLENO.has(w) || quitar.has(w)) continue
    const c = CARROCERIA[w]
    if (c) {
      carrocerias.add(c)
      continue
    }
    // Cifras sueltas fuera (ambiguas); sí palabras con letras y cilindradas en litros («1.1»).
    if (/[A-Z]/.test(w) || /^\d\.\d$/.test(w)) tokens.add(w)
  }
  return { tokens, carrocerias, puertas: d.puertas ?? (mp ? Number(mp[1]) : null), cv, cc: d.cc, anio: ma ? Number(ma[1]) : null, combustible: d.combustible ?? null }
}

function rasgosReferencia(v: VehiculoReferencia, quitar: ReadonlySet<string>): Rasgos {
  const r = rasgosDeTexto([v.modelo, v.version, v.carroceria].filter((x): x is string => !!x).join(' '), quitar)
  return {
    tokens: r.tokens,
    carrocerias: v.carroceria ? new Set([...rasgosDeTexto(v.carroceria, new Set()).carrocerias, ...r.carrocerias]) : r.carrocerias,
    puertas: v.puertas ?? r.puertas,
    cv: v.cv ?? r.cv,
    cc: v.cc ?? r.cc,
    anio: v.anio ?? r.anio,
    combustible: v.combustible ?? r.combustible,
  }
}

/** Cercanía numérica en [0,1]: 1 = igual; 0 = a ≥25 % (o fuera del absoluto mínimo). */
const cercania = (a: number, b: number, absMin: number): number => {
  const escala = Math.max(Math.abs(b) * 0.25, absMin)
  return Math.max(0, 1 - Math.abs(a - b) / escala)
}

export type OpcionCatalogo = string | { etiqueta: string }

export type EleccionPorReferencia =
  /** `indice` = posición en `opciones` (la lista ORIGINAL). `supuesto` va tal cual en los avisos de la oferta (lleva «supuesto»). */
  | { tipo: 'coincidencia' | 'aproximacion'; indice: number; etiqueta: string; puntuacion: number; supuesto: string }
  | { tipo: 'sin_referencia' }
  | { tipo: 'sin_opciones' }
  | { tipo: 'sin_marca' }

const etiquetaDe = (o: OpcionCatalogo): string => espacios(typeof o === 'string' ? o : String(o?.etiqueta ?? ''))
const esOtros = (t: string): boolean => /^OTROS?\b/.test(normalizar(t))

/** Aviso del supuesto (sin comas: los bots unen supuestos con «, »). PURA. */
export function supuestoVehiculoReferencia(tipo: 'coincidencia' | 'aproximacion', nivel: 'modelo' | 'version', etiqueta: string, origen: OrigenVehiculoReferencia): string {
  const que = nivel === 'modelo' ? 'Modelo' : 'Versión'
  const elegida = nivel === 'modelo' ? 'elegido' : 'elegida'
  const como = tipo === 'coincidencia' ? 'por coincidencia con el vehículo de referencia' : 'por aproximación al vehículo de referencia'
  const e = espacios(etiqueta.replace(/,/g, ' ')).slice(0, 60)
  return `${que} «${e}» ${elegida} ${como} (vehículo según ${NOMBRE_ORIGEN_VEHICULO_REFERENCIA[origen]}; supuesto); revisar en la emisión`
}

/**
 * Elige UNA opción del catálogo de un portal con el vehículo de referencia. Regla (determinista, sin IA):
 *   0. Fuera opciones vacías y «Otros…». Ninguna → `sin_opciones`. Sin referencia válida → `sin_referencia`.
 *   1. MARCA: si se sabe la marca de la lista (`marcaLista`) y no es la de la referencia → `sin_marca` (lo único que para). Si algunas
 *      opciones nombran la marca de la referencia, solo cuentan esas; si ninguna la nombra, la lista se toma como ya filtrada por marca.
 *   2. Por opción: estructural = modelo (todas las palabras del modelo de la referencia en la opción: +1) + carrocería, puertas y
 *      combustible (+1 si coinciden, −1 si ambos lo dicen y difieren, 0 si alguno no lo dice); similitud = Jaccard de palabras
 *      (sin relleno ni marca) + cercanía media de CV (kW→CV), cc y año (solo lo que ambos dicen).
 *   3. Gana la de mayor estructural; empate → mayor similitud; empate → la primera del portal.
 *   4. `coincidencia` si la ganadora es la ÚNICA sin contradicciones que comparte alguna palabra distintiva (no común a todas) con la
 *      referencia y lo común a todas no contradice a la referencia; si no, `aproximacion`. Ambas son supuesto (precio `estimado`).
 * PURA.
 */
export function elegirOpcionPorVehiculoReferencia(
  opciones: readonly OpcionCatalogo[],
  referencia: unknown,
  o: { nivel?: 'modelo' | 'version'; marcaLista?: string | null } = {},
): EleccionPorReferencia {
  const nivel = o.nivel ?? 'version'
  const vr = validarVehiculoReferencia(referencia)
  const cand = opciones.map((x, i) => ({ i, etiqueta: etiquetaDe(x) })).filter((c) => c.etiqueta !== '' && !esOpcionVacia(c.etiqueta) && !esOtros(c.etiqueta))
  if (cand.length === 0) return { tipo: 'sin_opciones' }
  if (!vr.ok) return { tipo: 'sin_referencia' }
  const ref = vr.valor
  const marcaTokens = ref.marca ? normalizar(ref.marca).split(' ').filter((w) => w && !RELLENO.has(w)) : []
  const nombraMarca = (t: string) => marcaTokens.length > 0 && marcaTokens.every((w) => normalizar(t).split(' ').includes(w))
  if (marcaTokens.length && o.marcaLista && o.marcaLista.trim() && !nombraMarca(o.marcaLista)) return { tipo: 'sin_marca' }
  const deMarca = cand.filter((c) => nombraMarca(c.etiqueta))
  const enJuego = deMarca.length ? deMarca : cand
  const quitar = new Set(marcaTokens)
  const rr = rasgosReferencia(ref, quitar)
  const modeloTokens = ref.modelo ? [...rasgosDeTexto(ref.modelo, quitar).tokens] : []
  const rasgos = enJuego.map((c) => ({ ...c, r: rasgosDeTexto(c.etiqueta, quitar) }))
  const comunes = new Set([...rasgos[0]!.r.tokens].filter((t) => rasgos.every((x) => x.r.tokens.has(t))))
  const puntuadas = rasgos.map((c) => {
    const r = c.r
    let estructural = 0
    let contradice = false
    if (modeloTokens.length && modeloTokens.every((t) => r.tokens.has(t))) estructural += 1
    const tri = (coincide: boolean | null) => {
      if (coincide === null) return
      if (coincide) estructural += 1
      else {
        estructural -= 1
        contradice = true
      }
    }
    tri(r.carrocerias.size && rr.carrocerias.size ? [...r.carrocerias].some((x) => rr.carrocerias.has(x)) : null)
    tri(r.puertas !== null && rr.puertas !== null ? r.puertas === rr.puertas : null)
    tri(r.combustible && rr.combustible ? r.combustible === rr.combustible : null)
    const union = new Set([...r.tokens, ...rr.tokens])
    const inter = [...r.tokens].filter((t) => rr.tokens.has(t))
    const jaccard = union.size ? inter.length / union.size : 0
    const nums: number[] = []
    if (r.cv !== null && rr.cv !== null) nums.push(cercania(r.cv, rr.cv, 5))
    if (r.cc !== null && rr.cc !== null) nums.push(cercania(r.cc, rr.cc, 50))
    if (r.anio !== null && rr.anio !== null) nums.push(Math.max(0, 1 - Math.abs(r.anio - rr.anio) / 5))
    const numerica = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
    const distintiva = inter.some((t) => !comunes.has(t))
    return { ...c, estructural, similitud: jaccard + numerica, contradice, distintiva }
  })
  let g = puntuadas[0]!
  for (const p of puntuadas.slice(1)) {
    if (p.estructural > g.estructural || (p.estructural === g.estructural && p.similitud > g.similitud + 1e-9)) g = p
  }
  const apoyadas = puntuadas.filter((p) => !p.contradice && (p.distintiva || (modeloTokens.length > 0 && p.estructural > 0)))
  // Palabras comunes a TODAS las opciones que la referencia no dice (p. ej. todas «FORTWO» y la referencia «FORFOUR»): la lista habla de
  // otro modelo → nunca «coincidencia».
  const comunesAjenas = comunes.size > 0 && cand.length > 1 && ![...comunes].some((t) => rr.tokens.has(t))
  const tipo = !comunesAjenas && apoyadas.length === 1 && apoyadas[0]!.i === g.i ? 'coincidencia' : 'aproximacion'
  return { tipo, indice: g.i, etiqueta: g.etiqueta, puntuacion: Math.round((g.estructural + g.similitud) * 1000) / 1000, supuesto: supuestoVehiculoReferencia(tipo, nivel, g.etiqueta, ref.origen) }
}
