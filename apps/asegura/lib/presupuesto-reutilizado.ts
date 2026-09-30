/**
 * Las opciones de un presupuesto REUTILIZADO, leídas de lo que se GUARDÓ (30/09/2026, revisión PR #4133).
 *
 * Al preparar dos veces lo mismo se devuelve el presupuesto ya existente (misma referencia AS-AA-NNNN).
 * Lo que se enseña entonces tiene que ser lo que ESE presupuesto congeló —portada, papeles, cuántas
 * en lista y cuántas ocultas—, no un recálculo: la tarificación puede haberse re-leído desde entonces
 * (coberturas, garantías) y la portada recalculada diría otra cosa que el PDF que tiene el cliente.
 *
 * Puro (sin Prisma): los `Decimal` llegan como algo con `toString()`.
 */
import type { PapelPortada } from '@central/module-seguros'

import { coberturasDeSobre, type SobreCoberturas } from './codeoscopic/coberturas-presupuesto.ts'
import type { OpcionPreparada } from './presupuesto.ts'

type Num = string | number | { toString(): string }

/** Una fila de `presupuesto_opcion` tal como la devuelve Prisma (TODAS, también las ocultas). */
export type OpcionGuardada = {
  orden: number
  compania: string
  producto: string
  modalidad: string | null
  categoria: string | null
  grupoCobertura: string | null
  primaEur: Num
  entradaEur: Num | null
  franquiciaEur: Num | null
  firmeza: string
  requiereRerate: boolean
  referenciaVendor: string | null
  avisos: unknown
  papeles: string[]
  precioId: string | null
  garantias: unknown
  coberturas: unknown
  ocultaAt: Date | null
}

export type OpcionesReutilizadas = {
  /** La portada que se CONGELÓ (papeles no vacíos y visible), en su orden. */
  opciones: OpcionPreparada[]
  /** Visibles sin papel: las que el cliente ve en «ver todas». */
  enLista: number
  /** Las que quitó el corredor. */
  ocultas: number
}

const PAPELES: ReadonlySet<string> = new Set<PapelPortada>(['equivalente', 'mas_barata', 'mejor_cubierta'])

function num(v: Num | null): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v.toString())
  return Number.isFinite(n) ? n : null
}

/** El sobre guardado; el `[]` desnudo (default de la columna) = «no se intentó» → `null`. */
function sobreGuardado(v: unknown): SobreCoberturas | null {
  const { estado, lista } = coberturasDeSobre(v)
  if (estado === 'no_intentado') return null
  const s = v as Record<string, unknown>
  const leidasAt = typeof s.leidasAt === 'string' ? s.leidasAt : ''
  return { estado, lista, leidasAt }
}

export function opcionesReutilizadas(filas: readonly OpcionGuardada[]): OpcionesReutilizadas {
  const ordenadas = [...filas].sort((a, b) => a.orden - b.orden)
  const visibles = ordenadas.filter((f) => f.ocultaAt === null)
  const papelesDe = (f: OpcionGuardada) => f.papeles.filter((p): p is PapelPortada => PAPELES.has(p))
  const portada = visibles.filter((f) => papelesDe(f).length > 0)
  // «Cobertura distinta» no se guarda, pero se DEDUCE sin ambigüedad de los papeles congelados
  // (`elegirPortada`): solo la más barata la lleva, y solo cuando no hubo equivalente.
  const hayEquivalente = portada.some((f) => papelesDe(f).includes('equivalente'))

  const opciones: OpcionPreparada[] = []
  for (const f of portada) {
    const prima = num(f.primaEur)
    if (prima === null || f.precioId === null) continue
    const papeles = papelesDe(f)
    opciones.push({
      orden: f.orden,
      compania: f.compania,
      producto: f.producto,
      modalidad: f.modalidad,
      categoria: f.categoria,
      grupoCobertura: f.grupoCobertura,
      primaEur: prima,
      entradaEur: num(f.entradaEur),
      franquiciaEur: num(f.franquiciaEur),
      firmeza: f.firmeza,
      requiereRerate: f.requiereRerate,
      referenciaVendor: f.referenciaVendor,
      avisos: Array.isArray(f.avisos) ? f.avisos.filter((a): a is string => typeof a === 'string') : [],
      papeles,
      precioId: f.precioId,
      garantias: f.garantias ?? null,
      oculta: false,
      coberturaDistinta: !hayEquivalente && papeles.includes('mas_barata'),
      coberturas: sobreGuardado(f.coberturas),
    })
  }
  return {
    opciones,
    enLista: visibles.length - portada.length,
    ocultas: ordenadas.length - visibles.length,
  }
}
