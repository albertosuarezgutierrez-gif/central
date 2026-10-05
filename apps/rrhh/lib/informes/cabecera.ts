// Texto de cabecera de un informe (título, filtros aplicados, fecha de generación). Módulo PURO.

import type { EntidadDef } from './catalogo'
import { fechaEs, fechaHoraEs } from './formato'
import type { PeticionInforme } from './validador'

export type CabeceraInforme = {
  titulo: string
  empresa: string
  filtros: string[]
  agrupacion: string | null
  generado: string
}

function mesEs(m: string): string { return `${m.slice(5, 7)}/${m.slice(0, 4)}` }

/** «Filtro: valor» legibles. `nombres` resuelve uuids de empleado/obra a nombre. */
export function describirFiltros(ent: EntidadDef, pet: PeticionInforme, nombres: Record<string, string> = {}): string[] {
  const out: string[] = []
  for (const def of ent.filtros) {
    const v = pet.filtros[def.clave]
    if (v === undefined) continue
    if (def.tipo === 'rango_fecha' || def.tipo === 'rango_mes') {
      const r = v as { desde?: string; hasta?: string }
      const f = def.tipo === 'rango_fecha' ? fechaEs : mesEs
      if (r.desde && r.hasta) out.push(`${def.etiqueta}: del ${f(r.desde)} al ${f(r.hasta)}`)
      else if (r.desde) out.push(`${def.etiqueta}: desde el ${f(r.desde)}`)
      else if (r.hasta) out.push(`${def.etiqueta}: hasta el ${f(r.hasta)}`)
    } else if (def.tipo === 'empleado' || def.tipo === 'obra') {
      out.push(`${def.etiqueta}: ${nombres[def.clave] ?? '(no encontrado en esta empresa)'}`)
    } else if (def.tipo === 'opcion') {
      out.push(`${def.etiqueta}: ${def.opciones.find(o => o.valor === v)?.etiqueta ?? String(v)}`)
    } else if (def.tipo === 'booleano') {
      out.push(`${def.etiqueta}: ${v ? 'sí' : 'no'}`)
    }
  }
  return out
}

export function construirCabecera(ent: EntidadDef, pet: PeticionInforme, empresa: string, nombres: Record<string, string>, ahora = new Date()): CabeceraInforme {
  const agr = pet.agrupacion ? ent.agrupaciones.find(a => a.clave === pet.agrupacion)?.etiqueta ?? null : null
  return {
    titulo: `Informe de ${ent.etiqueta.toLocaleLowerCase('es')}`,
    empresa,
    filtros: describirFiltros(ent, pet, nombres),
    agrupacion: agr,
    generado: fechaHoraEs(ahora.toISOString()),
  }
}
