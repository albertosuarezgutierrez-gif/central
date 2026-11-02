// Los ADAPTADORES de la comparativa única (20/10/2026). PURO: sin BD, sin red, sin IA.
//
// Alberto: «una sola función de comparativa para cualquier fuente y cualquier ramo, para no desarrollar 40 veces
// lo mismo». El motor es `compararOfertas` (comparar-ofertas.ts); aquí solo se traduce cada fuente a
// `OfertaNormalizada`, y nada más:
//   · `ofertaDeAvant2`        — un precio guardado de `tarificacion_precios` (garantías del catálogo si/no/no_consta).
//   · `ofertaDePolizaActual`  — la póliza del cliente en la cartera (coberturas de CIMA/EIAC).
//   · `ofertaDeBot`           — la oferta normalizada de un bot de portal (module-tarificacion), por FORMA.
//   · El PDF (compañía o competencia) ya llega normalizado por `oferta-leida.ts` de apps/asegura.
//
// 🚨 Reglas que aquí no se negocian:
//   · `no_consta` / sin lista = la garantía NO se escribe (el cuadro dirá «no se sabe»), nunca `excluida`.
//   · Una prima que no es de un año (meses ≠ 12) NO se compara como anual: `primaTotal: null` y se dice en `avisos`.
//   · La franquicia que no viene es `null` = «no declarada», jamás 0.

import { normalizarGarantia, type RamoOferta } from './coberturas-taxonomia.ts'
import { garantiasLeidasDeDocumento, type FraccionamientoOferta, type OfertaNormalizada, type ValorGarantia } from './comparar-ofertas.ts'

const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const positivo = (n: unknown): number | null => (num(n) && n > 0 ? Math.round(n * 100) / 100 : null)
const vacio = (): ValorGarantia => ({ estado: null, capital: null, limite: null, franquicia: null, evidencia: null })

/** Texto libre del vendor/CIMA → fraccionamiento. Lo que no se reconoce es `null` (no se supone «anual»). */
export function fraccionamientoDe(v: string | null | undefined): FraccionamientoOferta | null {
  const t = (v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (/\banual\b|\bannual\b|\byearly\b/.test(t)) return 'anual'
  if (/semestr|semiannual|half/.test(t)) return 'semestral'
  if (/trimestr|quarter/.test(t)) return 'trimestral'
  if (/mensual|monthly/.test(t)) return 'mensual'
  return null
}

// ─── Avant2 ──────────────────────────────────────────────────────────────────

/**
 * Las claves del catálogo de HOGAR de Avant2 que tienen su hermana en la taxonomía de comparación de hogar (la de
 * los PDFs). Sin esto, el continente de Avant2 y el del PDF saldrían en dos filas distintas. Lo que no está aquí
 * entra con su clave del catálogo (fila propia, con la etiqueta del catálogo).
 */
export const HOGAR_CATALOGO_A_TAXONOMIA: Readonly<Record<string, string>> = {
  rc_familiar: 'rc_general',
  robo: 'robo_vandalismo',
  cristales: 'rotura_cristales',
  asistencia_hogar: 'asistencia',
  joyas: 'joyas_objetos_valor',
}

/** Un precio de Avant2 tal como lo lee `tarificacion-guardada.ts` (solo lo que compara). */
export type PrecioAvant2 = {
  id: string
  compania: string | null
  producto: string | null
  modalidad: string | null
  categoria: string | null
  primaEur: number | null
  franquiciaEur: number | null
  firmeza: string | null
  frecuenciaPago: string | null
  /** Duración del periodo que cubre `primaEur`. `null` = fila anterior al 29/09/2026 (no se guardaba). */
  meses: number | null
  /** `{porClave}` del catálogo. `null` = aún sin leer sus coberturas («no se sabe», nunca «no incluye»). */
  garantias: { porClave: Record<string, 'si' | 'no' | 'no_consta'> } | null
  /**
   * Los avisos del vendor tal como se guardaron (`tarificacion_precios.avisos`). Solo se LEEN para el periodo de la
   * prima cuando `meses` es `null` (`periodoDeAvant2`); no se copian a la oferta (son observaciones internas).
   */
  avisos?: readonly string[] | null
}

/** Una fecha `dd/mm/aaaa` → `[año, mes, día]`, o `null` si no es una fecha real. */
function fechaEs(d: string, m: string, a: string): [number, number, number] | null {
  const dia = Number(d), mes = Number(m), anio = Number(a)
  const f = new Date(Date.UTC(anio, mes - 1, dia))
  if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return null
  return [anio, mes, dia]
}

/**
 * El periodo de la prima que la PROPIA compañía escribe en sus observaciones («Prima calculada con fecha de efecto :
 * 05/12/2026 y fecha de término : 05/12/2027»). PURO.
 *   · `null` = no lo dice (o lo dice de dos formas distintas: no se elige una).
 *   · `doceMeses` = el término es el mismo día del año siguiente (o la víspera): un año exacto. Cualquier otra cosa
 *     (361 días, 6 meses…) NO es un año, aunque se le parezca: la prima sería de otro periodo.
 */
export function periodoEnAvisos(avisos: readonly string[] | null | undefined): { efecto: string; termino: string; doceMeses: boolean } | null {
  const re = /fecha\s+de\s+efecto\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*,?\s*y\s+fecha\s+de\s+t[eé]rmino\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/giu
  const vistos = new Map<string, { efecto: string; termino: string; doceMeses: boolean }>()
  for (const a of avisos ?? []) {
    if (typeof a !== 'string') continue
    for (const m of a.matchAll(re)) {
      const ef = fechaEs(m[1]!, m[2]!, m[3]!)
      const te = fechaEs(m[4]!, m[5]!, m[6]!)
      if (!ef || !te) continue
      const t = Date.UTC(te[0], te[1] - 1, te[2])
      // Mismo día del año siguiente (29/02 → 28/02 o 01/03 lo resuelve Date.UTC) o la víspera.
      const unAnio = Date.UTC(ef[0] + 1, ef[1] - 1, ef[2])
      const doceMeses = t === unAnio || t === unAnio - 86_400_000
      const dd = (x: [number, number, number]) => `${String(x[2]).padStart(2, '0')}/${String(x[1]).padStart(2, '0')}/${x[0]}`
      const r = { efecto: dd(ef), termino: dd(te), doceMeses }
      vistos.set(`${r.efecto}|${r.termino}`, r)
    }
  }
  if (vistos.size !== 1) return null
  return [...vistos.values()][0]!
}

/**
 * El periodo de un precio de Avant2, con su origen (PURO):
 *   · `meses` guardado (desde el 29/09/2026) → manda, tal cual.
 *   · `meses` NULL (fila anterior) → si las observaciones de la compañía dan efecto y término de UN AÑO exacto, 12
 *     (`deducido: true`, y se dice); si dan otro periodo, `null` con esas fechas; si no dicen nada, `null`.
 * Nunca se supone «anual» porque sí.
 */
export function periodoDeAvant2(p: Pick<PrecioAvant2, 'meses' | 'avisos'>): { meses: number | null; deducido: boolean; fechas: { efecto: string; termino: string } | null } {
  if (typeof p.meses === 'number' && Number.isFinite(p.meses)) return { meses: p.meses, deducido: false, fechas: null }
  const enAvisos = periodoEnAvisos(p.avisos)
  if (enAvisos?.doceMeses) return { meses: 12, deducido: true, fechas: { efecto: enAvisos.efecto, termino: enAvisos.termino } }
  return { meses: null, deducido: false, fechas: enAvisos ? { efecto: enAvisos.efecto, termino: enAvisos.termino } : null }
}

/**
 * `opts.caducada` = la fecha de efecto de la cotización ya pasó (`fechaEfectoCaducada`): el precio se enseña pero
 * va con su reserva (para emitir hace falta una consulta nueva).
 */
export function ofertaDeAvant2(p: PrecioAvant2, ramo: RamoOferta, opts: { caducada?: boolean } = {}): OfertaNormalizada {
  const garantias: Record<string, ValorGarantia> = {}
  for (const [k, e] of Object.entries(p.garantias?.porClave ?? {})) {
    if (e !== 'si' && e !== 'no') continue // no_consta: no se escribe → «no se sabe»
    const clave = ramo === 'hogar' ? (HOGAR_CATALOGO_A_TAXONOMIA[k] ?? k) : k
    // Dos claves del catálogo en la misma fila: gana «incluida» (como en `clasificarCoberturas`).
    if (garantias[clave]?.estado === 'incluida') continue
    garantias[clave] = { ...vacio(), estado: e === 'si' ? 'incluida' : 'excluida' }
  }
  const avisos: string[] = []
  const prima = positivo(p.primaEur)
  // Tres estados del periodo: 12 = anual (se compara) · otro número = otro periodo · null = NO DECLARADO (filas
  // anteriores al 29/09/2026). Ni el segundo ni el tercero se comparan como prima anual: el precio se ve, el orden no.
  // Con `meses` NULL, las fechas de efecto y término que da la propia compañía deciden (`periodoDeAvant2`).
  const periodo = periodoDeAvant2(p)
  const anual = periodo.meses === 12
  if (prima !== null && periodo.deducido && periodo.fechas) {
    avisos.push(`Periodo anual tomado de las fechas que da la compañía (efecto ${periodo.fechas.efecto}, término ${periodo.fechas.termino})`)
  } else if (prima !== null && periodo.meses === null && periodo.fechas) {
    avisos.push(`La compañía calculó la prima del ${periodo.fechas.efecto} al ${periodo.fechas.termino}, que no es un año exacto: no se compara como anual`)
  } else if (prima !== null && periodo.meses === null) avisos.push('Periodo de la prima no declarado por Avant2: no se compara como anual')
  else if (prima !== null && !anual) avisos.push(`La prima de Avant2 es de un periodo de ${periodo.meses} meses: no se compara como anual`)
  if (p.garantias === null) avisos.push('Coberturas de Avant2 aún sin leer')
  if (opts.caducada) avisos.push('Cotización de Avant2 con la fecha de efecto ya pasada: para emitir hace falta una consulta nueva')
  const firmeza = p.firmeza === 'firme' || p.firmeza === 'condicionado' || p.firmeza === 'estimado' ? p.firmeza : null
  return {
    id: p.id,
    rol: 'oferta',
    compania: p.compania?.trim() || 'Compañía sin identificar',
    producto: p.producto?.trim() || null,
    primaTotal: anual ? prima : null,
    primaNeta: null,
    garantias,
    // El precio que NO es anual comparable se sigue viendo (con su periodo): nunca «No figura» sobre un precio que hay.
    ...(prima !== null && !anual ? { primaPeriodo: { importe: prima, meses: periodo.meses } } : {}),
    fuente: 'avant2',
    fraccionamiento: fraccionamientoDe(p.frecuenciaPago),
    importeReciboEur: null,
    franquiciaGeneral: num(p.franquiciaEur) && p.franquiciaEur >= 0 ? p.franquiciaEur : null,
    nivel: p.categoria?.trim() || p.modalidad?.trim() || null,
    firmeza,
    referencia: { tipo: 'tarificacion_precio', id: p.id },
    avisos,
  }
}

/**
 * Cuáles de los precios de UNA tarificación entran al cuadro: por compañía y nivel, el más barato de los de
 * periodo ANUAL (meses = 12); solo si ese grupo no tiene ninguno anual, el de periodo no declarado (`null`, que
 * entra sin prima comparable y con su aviso), y en último lugar el de otro periodo. Así un semestral más barato no
 * tapa al anual. Se ordena por prima de los anuales (los demás al final) y se corta en `max`. Determinista.
 */
export function seleccionarAvant2<T extends Pick<PrecioAvant2, 'id' | 'compania' | 'categoria' | 'modalidad' | 'primaEur' | 'meses'> & { avisos?: readonly string[] | null }>(precios: readonly T[], max = 8): T[] {
  const rangoPeriodo = (x: T) => { const m = periodoDeAvant2(x).meses; return m === 12 ? 0 : m === null ? 1 : 2 }
  const prima = (x: T) => (num(x.primaEur) ? x.primaEur : Number.POSITIVE_INFINITY)
  const antes = (a: T, b: T) => rangoPeriodo(a) - rangoPeriodo(b) || prima(a) - prima(b) || a.id.localeCompare(b.id)
  const mejor = new Map<string, T>()
  for (const p of precios) {
    const k = `${(p.compania ?? '').trim().toLowerCase()}|${(p.categoria ?? p.modalidad ?? '').trim().toLowerCase()}`
    const ya = mejor.get(k)
    if (!ya || antes(p, ya) < 0) mejor.set(k, p)
  }
  return [...mejor.values()].sort(antes).slice(0, Math.max(0, max))
}

// ─── Póliza de la cartera ────────────────────────────────────────────────────

/** Una cobertura de la póliza tal como la dio CIMA (`poliza_coberturas`), ya con los importes en número. */
export type CoberturaPoliza = {
  nombre: string
  /** `true` = contratada (la lista de CIMA es la de lo contratado). `null` = no se sabe. */
  incluida: boolean | null
  capital?: number | null
  franquicia?: number | null
}

export type PolizaParaComparar = {
  id: string
  compania: string | null
  producto?: string | null
  /** Prima ANUAL ya resuelta con `primaConRecibos()` (la póliza miente por compañía). `null` = no se sabe. */
  primaAnual: number | null
  fraccionamiento?: string | null
  /** `null` = no se han leído (no «no tiene coberturas»). */
  coberturas: readonly CoberturaPoliza[] | null
}

export function ofertaDePolizaActual(p: PolizaParaComparar, ramo: RamoOferta): OfertaNormalizada {
  const garantias: Record<string, ValorGarantia> = {}
  for (const c of p.coberturas ?? []) {
    const nombre = c.nombre.trim()
    if (!nombre) continue
    const clave = normalizarGarantia(ramo, nombre) ?? nombre
    const nuevo: ValorGarantia = {
      estado: c.incluida === true ? 'incluida' : c.incluida === false ? 'excluida' : null,
      capital: positivo(c.capital),
      limite: null,
      franquicia: num(c.franquicia) && c.franquicia >= 0 ? c.franquicia : null,
      evidencia: { pagina: null, texto: nombre.slice(0, 200) },
    }
    const ya = garantias[clave]
    // Dos coberturas sobre la misma clave: gana la incluida y, entre incluidas, la de más capital.
    if (ya) {
      const mejor = (nuevo.estado === 'incluida' && ya.estado !== 'incluida') || (nuevo.estado === ya.estado && (nuevo.capital ?? -1) > (ya.capital ?? -1))
      if (!mejor) continue
    }
    garantias[clave] = nuevo
  }
  const avisos = p.coberturas === null ? ['Coberturas de la póliza actual sin leer'] : []
  return {
    id: p.id,
    rol: 'actual',
    compania: p.compania?.trim() || 'Compañía sin identificar',
    producto: p.producto?.trim() || null,
    primaTotal: positivo(p.primaAnual),
    primaNeta: null,
    garantias,
    fuente: 'poliza_actual',
    fraccionamiento: fraccionamientoDe(p.fraccionamiento),
    importeReciboEur: null,
    franquiciaGeneral: null,
    nivel: null,
    firmeza: null,
    referencia: { tipo: 'poliza', id: p.id },
    avisos,
  }
}

// ─── Bot de portal ───────────────────────────────────────────────────────────

/** La forma de `OfertaNormalizada` de module-tarificacion (por FORMA: este paquete no depende de aquél). */
export type OfertaBot = {
  compania: string
  producto: string
  primaAnualEur: number
  primaNetaEur: number | null
  fraccionamiento: FraccionamientoOferta | null
  importeReciboEur: number | null
  coberturas: readonly { clave: string; literal: string; estado: 'incluida' | 'excluida' | null; capital: number | null; limite: number | null; franquicia: number | null }[]
  franquicias: readonly { ambito: string; importeEur: number | null; literal: string | null }[]
  avisos?: readonly string[]
}

export function ofertaDeBot(o: OfertaBot, id: string, ramo: RamoOferta): OfertaNormalizada {
  const garantias: Record<string, ValorGarantia> = {}
  // 02/11/2026 (Mapfre, PDF del proyecto): «- FALLECIMIENTO», «*R. C. Ampliada»… son SUB-garantías (llevan «*» o «- »). Si caen en una
  // garantía que ya está, se funden en ella (estado y detalle en la evidencia); si no tienen nombre canónico, cuelgan de la anterior.
  const esSub = (lit: string) => /^\s*[*\-–]/.test(lit)
  const detalleDe = (c: OfertaBot['coberturas'][number]) => {
    const cifra = num(c.capital) ? c.capital : num(c.limite) ? c.limite : null
    return `${c.literal.replace(/^[\s*\-–]+/, '').trim()}${cifra !== null ? ` ${cifra}` : ''}`
  }
  let previa: string | null = null
  for (const c of o.coberturas) {
    const mapeada = normalizarGarantia(ramo, c.literal)
    const clave = mapeada ?? (esSub(c.literal) && previa ? previa : c.clave)
    const ya = garantias[clave]
    if (ya) {
      if (esSub(c.literal)) {
        garantias[clave] = { ...ya, estado: ya.estado ?? c.estado, evidencia: { pagina: null, texto: `${ya.evidencia?.texto ?? ''}; ${detalleDe(c)}`.slice(0, 200) } }
      }
      previa = clave
      continue
    }
    garantias[clave] = {
      estado: c.estado,
      capital: positivo(c.capital),
      limite: positivo(c.limite),
      franquicia: num(c.franquicia) && c.franquicia >= 0 ? c.franquicia : null,
      evidencia: { pagina: null, texto: c.literal.slice(0, 200) },
    }
    previa = clave
  }
  const general = o.franquicias.find((f) => f.ambito.trim().toLowerCase() === 'general')
  return {
    id,
    rol: 'oferta',
    compania: o.compania,
    producto: o.producto || null,
    primaTotal: positivo(o.primaAnualEur),
    primaNeta: positivo(o.primaNetaEur),
    garantias,
    fuente: 'bot',
    fraccionamiento: o.fraccionamiento,
    importeReciboEur: positivo(o.importeReciboEur),
    franquiciaGeneral: general && num(general.importeEur) ? general.importeEur : null,
    nivel: null,
    firmeza: 'estimado',
    referencia: { tipo: 'trabajo_rpa', id },
    avisos: [...(o.avisos ?? [])],
    ...(garantiasLeidasDeDocumento({ compania: o.compania, fuente: 'bot', avisos: o.avisos }) ? { garantiasDeDocumento: true } : {}),
  }
}
