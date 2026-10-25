// PATRIMONIO (24/10/2026, P13) — adaptador PURO de `calendarioPatrimonio` (`@central/module-patrimonio`) a lo que
// consumen la pantalla del calendario, la campana, «Pendiente de ti» y el push. Sin prisma ni sesión ni reloj (`hoy`
// entra como parámetro): las filas llegan ya acotadas a los titulares que ve la sesión (`calendario-bd.ts`).
//
// 🚨 `sin_dato` es un estado propio: «no sabemos cuándo te toca». No es «al día» ni un vencimiento; la campana no
// avisa de ello (no hay fecha), pero «Pendiente de ti» y la pantalla SÍ lo dicen. Una lectura que falla es `null`
// en quien llama, nunca una lista vacía.
import {
  calendarioPatrimonio,
  type Contrato,
  type Fecha,
  type ObligacionInmueble,
  type Vencimiento,
} from '@central/module-patrimonio'
import { patrimonioSeAvisa, type PatrimonioParaAviso } from '@central/module-seguros-portal'

export type VencimientoVista = Vencimiento & { inmueble: string }

export type EntradaCalendario = {
  inmuebles: readonly { id: string; alias: string }[]
  obligaciones: readonly ObligacionInmueble[]
  contratos: readonly Contrato[]
}

/** El calendario ordenado, con el alias del inmueble de cada fila. Una fila de un inmueble que no está en la lista se descarta. */
export function calendarioDeEntrada(e: EntradaCalendario, hoy: Fecha): VencimientoVista[] {
  const alias = new Map(e.inmuebles.map((i) => [i.id, i.alias]))
  const vivos = new Set(alias.keys())
  const vs = calendarioPatrimonio(
    {
      obligaciones: e.obligaciones.filter((o) => vivos.has(o.inmuebleId)),
      contratos: e.contratos.filter((c) => vivos.has(c.inmuebleId)),
    },
    hoy,
  )
  return vs.map((v) => ({ ...v, inmueble: alias.get(v.inmuebleId) ?? 'tu inmueble' }))
}

/**
 * Los vencimientos que la campana y el push cuentan. `fin_contrato` vencido NO: con la prórroga de la LAU el contrato
 * puede seguir vigente, y decir «venció» sería afirmar lo que no sabemos.
 */
export function avisosDePatrimonio(vs: readonly VencimientoVista[]): PatrimonioParaAviso[] {
  const out: PatrimonioParaAviso[] = []
  for (const v of vs) {
    if (v.vence === null || v.dias === null) continue
    if (v.estado !== 'vencida' && v.estado !== 'avisar') continue
    if (v.estado === 'vencida' && v.tipo === 'fin_contrato') continue
    const p: PatrimonioParaAviso = { clave: v.clave, etiqueta: v.etiqueta, inmueble: v.inmueble, vence: v.vence, estado: v.estado, dias: v.dias }
    if (patrimonioSeAvisa(p)) out.push(p)
  }
  return out
}

export type ResumenCalendario = { vencidas: number; porVencer: number; sinFecha: number }

/** Recuento para «Pendiente de ti». Cada fila cae en UN cubo; `al_dia` y `cumplida` no cuentan. */
export function resumenDeCalendario(vs: readonly VencimientoVista[]): ResumenCalendario {
  const r: ResumenCalendario = { vencidas: 0, porVencer: 0, sinFecha: 0 }
  for (const v of vs) {
    if (v.estado === 'vencida' && v.tipo !== 'fin_contrato') r.vencidas++
    else if (v.estado === 'avisar') r.porVencer++
    else if (v.estado === 'sin_dato') r.sinFecha++
  }
  return r
}
