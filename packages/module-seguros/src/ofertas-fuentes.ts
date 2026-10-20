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
import type { FraccionamientoOferta, OfertaNormalizada, ValorGarantia } from './comparar-ofertas.ts'

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
  const anual = p.meses === 12
  if (prima !== null && p.meses === null) avisos.push('Periodo de la prima no declarado por Avant2: no se compara como anual')
  else if (prima !== null && !anual) avisos.push(`La prima de Avant2 es de un periodo de ${p.meses} meses: no se compara como anual`)
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
export function seleccionarAvant2<T extends Pick<PrecioAvant2, 'id' | 'compania' | 'categoria' | 'modalidad' | 'primaEur' | 'meses'>>(precios: readonly T[], max = 8): T[] {
  const rangoPeriodo = (x: T) => (x.meses === 12 ? 0 : x.meses === null ? 1 : 2)
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
  for (const c of o.coberturas) {
    const clave = normalizarGarantia(ramo, c.literal) ?? c.clave
    if (garantias[clave]) continue
    garantias[clave] = {
      estado: c.estado,
      capital: positivo(c.capital),
      limite: positivo(c.limite),
      franquicia: num(c.franquicia) && c.franquicia >= 0 ? c.franquicia : null,
      evidencia: { pagina: null, texto: c.literal.slice(0, 200) },
    }
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
  }
}
