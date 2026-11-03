// EDIFICIO SIN DIVISIÓN HORIZONTAL con unidades (27/10/2026, decisión de Alberto). PURO: sin BD, sin red, sin reloj.
//
// Un edificio con UNA referencia catastral y N pisos alquilados (piloto: Busto Tavera 22, 12 pisos). Las UNIDADES son
// inmuebles normales (contrato, inquilino, recibos, gastos propios) que cuelgan del edificio (`inmueblePadreId`). Los gastos
// del EDIFICIO (IBI, seguro, comunes) se imputan a las unidades por m² o por % que fija el propietario, para que la
// rentabilidad POR PISO sea completa.
//
// Reglas (cada una es una frase de la pantalla):
//  · Un solo nivel: un edificio no cuelga de nada; una unidad cuelga de un edificio del MISMO titular (`puedeColgarDe`).
//  · Reparto en CÉNTIMOS ENTEROS: cada unidad recibe el suelo de su parte y el resto del redondeo va a UNA unidad
//    determinista (la de más peso; a igualdad, la de id menor). La suma de las partes es SIEMPRE el total.
//  · 🚨 Sin criterio, o con una unidad sin m² / sin %, o con % que no suman 100: NO se reparte nada (ni «a partes
//    iguales» por defecto). El gasto se queda en el edificio (cuenta en su total) y cada unidad lo dice
//    (`reparto_edificio_pendiente`): su número no incluye su parte del edificio.
//  · Sin unidades vivas en la lista, el «edificio» es un inmueble más: el cálculo es EXACTAMENTE `rentabilidadPorInmueble`.
import { rentabilidadPorInmueble, type EntradaRentabilidad, type RentabilidadInmueble, type ResultadoRentabilidad } from './rentabilidad.ts'
import type { Centimos, Gasto, Inmueble, PrimaSeguroInmueble } from './tipos.ts'

export const CRITERIOS_REPARTO = ['m2', 'porcentaje'] as const
export type CriterioReparto = (typeof CRITERIOS_REPARTO)[number]

export function esCriterioReparto(v: unknown): v is CriterioReparto {
  return typeof v === 'string' && (CRITERIOS_REPARTO as readonly string[]).includes(v)
}

/** Tope de unidades por edificio (alta en bloque y unidad suelta). */
export const MAX_UNIDADES_EDIFICIO = 200

// ─── Jerarquía ─────────────────────────────────────────────────────────────────────────────────────────────

export type PadreCandidato = { id: string; titularId: string; uso: string; inmueblePadreId: string | null; archivado: boolean }

export type MotivoNoCuelga = 'no_es_edificio' | 'otro_titular' | 'padre_es_unidad' | 'archivado' | 'unidad_no_puede_ser_edificio'

/**
 * ¿Puede una unidad (de `titularId`, con `uso`) colgar de `padre`? La BD lo cierra también (FK compuesta con `titular_id` y
 * trigger de un nivel); esto da el motivo legible antes de escribir.
 */
export function puedeColgarDe(padre: PadreCandidato, unidad: { titularId: string; uso: string }): { ok: true } | { ok: false; motivo: MotivoNoCuelga } {
  if (padre.titularId !== unidad.titularId) return { ok: false, motivo: 'otro_titular' }
  if (padre.archivado) return { ok: false, motivo: 'archivado' }
  if (padre.inmueblePadreId !== null) return { ok: false, motivo: 'padre_es_unidad' }
  if (padre.uso !== 'edificio') return { ok: false, motivo: 'no_es_edificio' }
  if (unidad.uso === 'edificio') return { ok: false, motivo: 'unidad_no_puede_ser_edificio' }
  return { ok: true }
}

/**
 * Referencia catastral EFECTIVA para ENSEÑAR y DECLARAR: la propia; si no tiene y es UNIDAD de un edificio, la del edificio
 * (sin división horizontal hay una sola RC). `null` = no consta.
 *
 * 🚨 NO se usa para CRUZAR ni CONSULTAR (decisión 27/10/2026): la RC del edificio describe el EDIFICIO ENTERO. Heredada en el
 * cruce póliza↔inmueble, la póliza del edificio se propondría en cada piso (prima contada 13 veces); en el Catastro y el
 * infraseguro, cada piso tendría la superficie de todo el edificio; en las señales, la clave `rc:` fundiría los 12 pisos
 * en un solo objeto. Ahí la unidad va con SU RC (normalmente `null` = «no lo sabemos») y el seguro del edificio se
 * enlaza al EDIFICIO, cuya prima ya se reparte entre las unidades (`rentabilidadConEdificios`).
 */
export function rcEfectiva(
  inmueble: { referenciaCatastral: string | null; inmueblePadreId?: string | null },
  edificio: { id?: string; referenciaCatastral: string | null } | null,
): string | null {
  const limpia = (rc: string | null) => (rc === null ? null : rc.trim().toUpperCase() || null)
  const propia = limpia(inmueble.referenciaCatastral)
  if (propia !== null) return propia
  if (!inmueble.inmueblePadreId || edificio === null) return null
  if (edificio.id !== undefined && edificio.id !== inmueble.inmueblePadreId) return null
  return limpia(edificio.referenciaCatastral)
}

/** Nombres por defecto de N unidades nuevas («Piso 1»…«Piso N»), editables en el alta. */
export function nombresUnidades(n: number, base = 'Piso'): string[] {
  if (!Number.isInteger(n) || n < 1 || n > MAX_UNIDADES_EDIFICIO) return []
  return Array.from({ length: n }, (_, k) => `${base} ${k + 1}`)
}

// ─── Reparto ───────────────────────────────────────────────────────────────────────────────────────────────

export type UnidadReparto = { id: string; superficieM2: number | null; porcentaje: number | null }

export type MotivoSinReparto = 'sin_criterio' | 'sin_unidades' | 'falta_superficie' | 'falta_porcentaje' | 'porcentajes_no_suman'

export type PesosReparto =
  | { ok: true; criterio: CriterioReparto; pesos: { id: string; peso: number }[] }
  | { ok: false; motivo: MotivoSinReparto; /** Unidades a las que les falta el dato (vacío si el motivo es global). */ unidades: string[] }

/** Peso ENTERO (centésimas) para que el reparto sea aritmética exacta. */
const centesimas = (v: number) => Math.round(v * 100)

/**
 * Pesos del reparto. m²: la superficie de cada unidad (> 0). %: el porcentaje de cada unidad (0–100, dos decimales) y la
 * suma EXACTA de 100,00. Un dato que falta no se rellena: devuelve qué unidades lo necesitan.
 */
export function pesosDeReparto(criterio: CriterioReparto | null | undefined, unidades: readonly UnidadReparto[]): PesosReparto {
  if (unidades.length === 0) return { ok: false, motivo: 'sin_unidades', unidades: [] }
  if (criterio !== 'm2' && criterio !== 'porcentaje') return { ok: false, motivo: 'sin_criterio', unidades: [] }
  if (criterio === 'm2') {
    const faltan = unidades.filter((u) => !(typeof u.superficieM2 === 'number' && Number.isFinite(u.superficieM2) && u.superficieM2 > 0)).map((u) => u.id)
    if (faltan.length > 0) return { ok: false, motivo: 'falta_superficie', unidades: faltan }
    return { ok: true, criterio, pesos: unidades.map((u) => ({ id: u.id, peso: centesimas(u.superficieM2 as number) })) }
  }
  const faltan = unidades.filter((u) => !(typeof u.porcentaje === 'number' && Number.isFinite(u.porcentaje) && u.porcentaje >= 0 && u.porcentaje <= 100)).map((u) => u.id)
  if (faltan.length > 0) return { ok: false, motivo: 'falta_porcentaje', unidades: faltan }
  const pesos = unidades.map((u) => ({ id: u.id, peso: centesimas(u.porcentaje as number) }))
  if (pesos.reduce((a, p) => a + p.peso, 0) !== 10_000) return { ok: false, motivo: 'porcentajes_no_suman', unidades: [] }
  return { ok: true, criterio, pesos }
}

/**
 * Reparte `total` céntimos (entero, también negativo: un abono) entre `pesos` (enteros ≥ 0, suma > 0). Cada uno recibe el
 * suelo de su parte; el RESTO va entero a la unidad de más peso (a igualdad, la de id menor). Σ partes = total, siempre.
 */
export function repartirCentimos(total: Centimos, pesos: readonly { id: string; peso: number }[]): Map<string, Centimos> {
  if (!Number.isSafeInteger(total)) throw new Error('reparto_total_no_entero')
  if (pesos.length === 0) throw new Error('reparto_sin_pesos')
  for (const p of pesos) if (!Number.isSafeInteger(p.peso) || p.peso < 0) throw new Error('reparto_peso_invalido')
  const CERO = BigInt(0)
  const suma = pesos.reduce((a, p) => a + BigInt(p.peso), CERO)
  if (suma === CERO) throw new Error('reparto_pesos_cero')
  const signo = BigInt(total < 0 ? -1 : 1)
  const abs = BigInt(Math.abs(total))
  const out = new Map<string, Centimos>()
  let repartido = CERO
  for (const p of pesos) {
    const parte = (abs * BigInt(p.peso)) / suma // BigInt: división entera = suelo (abs ≥ 0)
    out.set(p.id, Number(parte * signo))
    repartido += parte
  }
  const resto = abs - repartido
  if (resto > CERO) {
    const receptor = [...pesos].sort((a, b) => b.peso - a.peso || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]
    out.set(receptor.id, (out.get(receptor.id) ?? 0) + Number(resto * signo))
  }
  return out
}

/** Parte de un importe que puede no constar: `null` se queda `null` en cada unidad (nunca 0). */
function repartirONull(v: Centimos | null, pesos: readonly { id: string; peso: number }[]): Map<string, Centimos | null> {
  if (v === null) return new Map(pesos.map((p) => [p.id, null]))
  return repartirCentimos(v, pesos)
}

// ─── Rentabilidad con edificios ────────────────────────────────────────────────────────────────────────────

export interface TotalEdificio {
  ingresos: Centimos
  gastos: Centimos
  seguros: Centimos
  beneficio: Centimos
  margenPct: number | null
  gastosSinConfirmar: number
}

export interface ComparativaUnidad {
  inmuebleId: string
  ingresos: Centimos
  beneficio: Centimos
  margenPct: number | null
  /** Puesto por beneficio (1 = el que más gana). */
  puesto: number
}

export interface VistaEdificio {
  edificioId: string
  /** Unidades vivas del edificio, en el orden de la entrada. */
  unidadIds: string[]
  /** Lo que se queda en el edificio: sus contratos propios y lo que NO se ha podido repartir. */
  propio: RentabilidadInmueble
  /** Edificio entero = propio + Σ unidades. */
  total: TotalEdificio
  reparto: { ok: true; criterio: CriterioReparto } | { ok: false; motivo: MotivoSinReparto; unidades: string[] }
  /** Gastos confirmados y primas (prorrateo aparte) del edificio que se quedaron SIN repartir. 0 si se repartió todo. */
  gastosSinRepartir: Centimos
  /** Unidades de más a menos beneficio (a igualdad, id menor primero). */
  comparativa: ComparativaUnidad[]
}

export interface ResultadoConEdificios extends ResultadoRentabilidad {
  edificios: VistaEdificio[]
}

const margen = (beneficio: number, ingresos: number) => (ingresos > 0 ? Math.round((beneficio / ingresos) * 1000) / 10 : null)

/** Edificios de la lista que tienen al menos una unidad (también en la lista) → sus unidades. */
export function unidadesPorEdificio(inmuebles: readonly Inmueble[]): Map<string, Inmueble[]> {
  const porId = new Map(inmuebles.map((i) => [i.id, i]))
  const out = new Map<string, Inmueble[]>()
  for (const i of inmuebles) {
    const padre = i.inmueblePadreId ? porId.get(i.inmueblePadreId) : undefined
    if (!padre || padre.uso !== 'edificio' || (padre.inmueblePadreId ?? null) !== null || padre.titularId !== i.titularId) continue
    out.set(padre.id, [...(out.get(padre.id) ?? []), i])
  }
  return out
}

/**
 * `rentabilidadPorInmueble` + edificios: reparte los gastos CONFIRMADOS y las primas del edificio entre sus unidades y da
 * la vista del edificio (total y comparativa). Sin edificios con unidades devuelve el cálculo de siempre, idéntico.
 */
export function rentabilidadConEdificios(e: EntradaRentabilidad): ResultadoConEdificios {
  const grupos = unidadesPorEdificio(e.inmuebles)
  if (grupos.size === 0) return { ...rentabilidadPorInmueble(e), edificios: [] }

  const repartos = new Map<string, PesosReparto>()
  for (const [edId, unidades] of grupos) {
    const ed = e.inmuebles.find((i) => i.id === edId)!
    repartos.set(edId, pesosDeReparto(ed.repartoCriterio ?? null, unidades.map((u) => ({ id: u.id, superficieM2: u.superficieM2, porcentaje: u.repartoPorcentaje ?? null }))))
  }

  // Gastos: los CONFIRMADOS del edificio se trocean (base y total por separado, `null` se queda `null`). Los propuestos se
  // quedan en el edificio (son «facturas sin revisar» del edificio, no de un piso).
  const conGastoPendiente = new Set<string>()
  const gastos: Gasto[] = []
  for (const g of e.gastos) {
    const r = g.inmuebleId !== null ? repartos.get(g.inmuebleId) : undefined
    if (!r || g.estado !== 'confirmado' || g.fecha < e.desde || g.fecha > e.hasta) {
      gastos.push(g)
      continue
    }
    if (!r.ok) {
      conGastoPendiente.add(g.inmuebleId!)
      gastos.push(g)
      continue
    }
    const bases = repartirONull(g.base, r.pesos)
    const totales = repartirONull(g.total, r.pesos)
    for (const p of r.pesos) gastos.push({ ...g, id: `${g.id}@${p.id}`, inmuebleId: p.id, base: bases.get(p.id) ?? null, total: totales.get(p.id) ?? null })
  }

  // Primas del edificio: la prima ANUAL se trocea con el mismo criterio (el prorrateo por días lo hace cada unidad).
  let primas: PrimaSeguroInmueble[] | null = null
  if (e.primas !== null) {
    primas = []
    for (const p of e.primas) {
      const r = repartos.get(p.inmuebleId)
      if (!r) {
        primas.push(p)
        continue
      }
      if (!r.ok) {
        conGastoPendiente.add(p.inmuebleId)
        primas.push(p)
        continue
      }
      const partes = repartirONull(p.primaAnual, r.pesos)
      for (const q of r.pesos) primas.push({ ...p, inmuebleId: q.id, primaAnual: partes.get(q.id) ?? null })
    }
  }

  const base = rentabilidadPorInmueble({ ...e, gastos, primas })
  const porId = new Map(base.inmuebles.map((r) => [r.inmuebleId, r]))

  const inmuebles = base.inmuebles.map((r): RentabilidadInmueble => {
    if (grupos.has(r.inmuebleId)) {
      // El edificio no se alquila entero ni lleva el seguro «suyo»: esos avisos los dicen sus unidades.
      return { ...r, avisos: r.avisos.filter((a) => a !== 'sin_contrato' && a !== 'sin_seguro_conocido') }
    }
    const inm = e.inmuebles.find((i) => i.id === r.inmuebleId)
    const padre = inm?.inmueblePadreId ?? null
    if (padre !== null && grupos.has(padre) && conGastoPendiente.has(padre)) {
      return { ...r, avisos: [...new Set([...r.avisos, 'reparto_edificio_pendiente' as const])].sort() }
    }
    return r
  })
  const final = new Map(inmuebles.map((r) => [r.inmuebleId, r]))

  const edificios: VistaEdificio[] = []
  for (const [edId, unidades] of grupos) {
    const propio = final.get(edId)!
    const filas = [propio, ...unidades.map((u) => final.get(u.id)!)]
    const suma = (k: 'ingresos' | 'gastos' | 'seguros' | 'beneficio' | 'gastosSinConfirmar') => filas.reduce((a, f) => a + f[k], 0)
    const r = repartos.get(edId)!
    const comparativa = unidades
      .map((u) => final.get(u.id)!)
      .sort((a, b) => b.beneficio - a.beneficio || (a.inmuebleId < b.inmuebleId ? -1 : a.inmuebleId > b.inmuebleId ? 1 : 0))
      .map((f, k): ComparativaUnidad => ({ inmuebleId: f.inmuebleId, ingresos: f.ingresos, beneficio: f.beneficio, margenPct: f.margenPct, puesto: k + 1 }))
    const total: TotalEdificio = {
      ingresos: suma('ingresos'),
      gastos: suma('gastos'),
      seguros: suma('seguros'),
      beneficio: suma('beneficio'),
      margenPct: margen(suma('beneficio'), suma('ingresos')),
      gastosSinConfirmar: suma('gastosSinConfirmar'),
    }
    edificios.push({
      edificioId: edId,
      unidadIds: unidades.map((u) => u.id),
      propio,
      total,
      reparto: r.ok ? { ok: true, criterio: r.criterio } : { ok: false, motivo: r.motivo, unidades: r.unidades },
      gastosSinRepartir: r.ok ? 0 : (porId.get(edId)?.gastos ?? 0) + (porId.get(edId)?.seguros ?? 0),
      comparativa,
    })
  }
  return { ...base, inmuebles, edificios }
}
