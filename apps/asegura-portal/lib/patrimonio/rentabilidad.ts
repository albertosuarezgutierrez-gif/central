// PATRIMONIO (24/10/2026, P14) — adaptador PURO de la rentabilidad (`rentabilidadPorInmueble` de
// `@central/module-patrimonio`): el periodo que se pide y las primas de las pólizas ENLAZADAS al inmueble.
// Sin prisma ni sesión ni reloj (`hoy` entra como parámetro).
//
// 🚨 `null` = no se sabe. Un seguro enlazado cuya prima no consta (o que esta identidad no ve porque lo enlazó otra
// persona) entra con `primaAnual: null` sobre TODO el periodo: el puro avisa `prima_sin_dato`; jamás cuenta 0 €.
// Cartera o declaradas ilegibles → `primas: null` → `seguros_sin_leer` (el número NO incluye seguros y lo dice).
import { esFecha, sumarAnios, sumarDias, type Fecha, type PrimaSeguroInmueble } from '@central/module-patrimonio'

import type { FilaEnlace, PolizaVisible } from './seguros-inmueble-api'

export type Periodo = { anio: number; desde: Fecha; hasta: Fecha; enCurso: boolean }

/** Años que se ofrecen: desde 2020 (no hay datos anteriores en el portal) hasta el actual. */
export const PRIMER_ANIO = 2020

/** `anio` pedido (query) → periodo. Fuera de rango o raro → el año de `hoy`. El año en curso llega hasta `hoy`. */
export function periodoDeAnio(pedido: unknown, hoy: Fecha): Periodo {
  if (!esFecha(hoy)) throw new Error('hoy_invalido')
  const actual = Number(hoy.slice(0, 4))
  const n = typeof pedido === 'string' && /^\d{4}$/.test(pedido) ? Number(pedido) : actual
  const anio = n >= PRIMER_ANIO && n <= actual ? n : actual
  const finAnio = `${anio}-12-31`
  const enCurso = anio === actual
  return { anio, desde: `${anio}-01-01`, hasta: enCurso ? hoy : finAnio, enCurso }
}

/**
 * Las primas de los seguros CONFIRMADOS y vivos de cada inmueble. `visibles` `null` = no se pudieron leer las pólizas
 * (cartera o declaradas caídas): todo el resultado es `null`.
 */
export function primasDeEnlaces(
  enlaces: readonly (FilaEnlace & { inmuebleId: string })[],
  visibles: readonly PolizaVisible[] | null,
  periodo: Pick<Periodo, 'desde' | 'hasta'>,
): PrimaSeguroInmueble[] | null {
  if (visibles === null) return null
  const porClave = new Map(visibles.map((v) => [`${v.tipo}:${v.id}`, v]))
  const out: PrimaSeguroInmueble[] = []
  for (const f of enlaces) {
    if (f.estado !== 'confirmado') continue
    const par = f.polizaId !== null && f.polizaDeclaradaId === null ? `cartera:${f.polizaId}` : f.polizaDeclaradaId !== null && f.polizaId === null ? `declarada:${f.polizaDeclaradaId}` : null
    if (par === null) continue
    const v = porClave.get(par)
    // Anualidad conocida: del efecto (o un año antes) al vencimiento. Si no se puede saber, el periodo entero con prima null.
    if (v && v.vence !== null && esFecha(v.vence) && typeof v.costeAnualCent === 'number') {
      const desde = v.desde && esFecha(v.desde) && v.desde < v.vence ? v.desde : sumarAnios(v.vence, -1)
      out.push({ inmuebleId: f.inmuebleId, primaAnual: v.costeAnualCent, desde, hasta: v.vence })
    } else {
      out.push({ inmuebleId: f.inmuebleId, primaAnual: null, desde: periodo.desde, hasta: sumarDias(periodo.hasta, 1) })
    }
  }
  return out
}
