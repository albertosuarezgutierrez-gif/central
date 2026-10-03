// Contrasta los datos de un ramo de personas (vida/salud/decesos) con lo que el
// vendor exige en `GET /{ramo}/person-roles` (gratis), ANTES de la llamada de pago.
// La lectura de la respuesta y la tabla de ids viven en `roles-persona.ts` (puro);
// aquí solo se une la lectura de red (inyectable, para probarlo sin red).
//
// 🚨 Fail-closed: si `person-roles` falla o no se puede leer, el resultado es
// `no_disponible` y NO se cotiza. Un fallo de lectura no es «no hace falta nada».

import { rolesDePersonas } from './catalogos.ts'
import type { ConfigCodeoscopic } from './config.ts'
import {
  CAMPOS_ASEGURADO_ADICIONAL,
  faltantesPorRoles,
  leerRolesPersonas,
  type RamoPersonas,
  type ReparoRol,
} from './roles-persona.ts'

export type ResultadoRoles =
  | { estado: 'ok'; faltan: ReparoRol[] }
  | { estado: 'no_disponible'; motivo: string }

export type LectorRoles = (config: ConfigCodeoscopic, ramo: RamoPersonas) => Promise<unknown>

/**
 * `datos` = lo que se mandaría del TITULAR (la misma persona va de tomador y de asegurado);
 * `adicionales` = los demás asegurados (solo se les exige lo del rol del asegurado).
 */
export async function comprobarRolesRamo(
  config: ConfigCodeoscopic,
  ramo: RamoPersonas,
  entrada: { datos: Readonly<Record<string, unknown>>; adicionales?: readonly Record<string, unknown>[] },
  leer: LectorRoles = rolesDePersonas,
): Promise<ResultadoRoles> {
  let crudo: unknown
  try {
    crudo = await leer(config, ramo)
  } catch (e) {
    return {
      estado: 'no_disponible',
      motivo: `no se ha podido leer person-roles de ${ramo} (${e instanceof Error ? e.message : String(e)}): no se cotiza sin saber qué exige el vendor`,
    }
  }
  const lectura = leerRolesPersonas(crudo)
  if (!lectura.ok) {
    return { estado: 'no_disponible', motivo: `${lectura.motivo}: no se cotiza sin saber qué exige el vendor` }
  }
  const { roles } = lectura

  // El titular es tomador Y asegurado: se le exige la unión de los dos roles.
  const exigidosTitular = [...new Set([...roles.tomador, ...roles.asegurado])]
  const faltan = faltantesPorRoles(exigidosTitular, entrada.datos, ramo)

  const adicionales = entrada.adicionales ?? []
  if (roles.maxAsegurados !== null && adicionales.length + 1 > roles.maxAsegurados) {
    faltan.push({
      campo: 'aseguradosAdicionales',
      motivo: `el vendor admite como máximo ${roles.maxAsegurados} asegurados (el tomador cuenta) y hay ${adicionales.length + 1}`,
    })
  }
  adicionales.forEach((a, i) => {
    for (const f of faltantesPorRoles(roles.asegurado, a, ramo, CAMPOS_ASEGURADO_ADICIONAL)) {
      faltan.push({ campo: 'aseguradosAdicionales', motivo: `asegurado adicional ${i + 1}: ${f.campo} — ${f.motivo}` })
    }
  })
  return { estado: 'ok', faltan }
}

/**
 * Junta los huecos propios de la precalificación con los que dice `person-roles`, sin duplicar
 * (mismo `campo`). Si `person-roles` no se pudo leer, se añade un hueco BLOQUEANTE
 * `person-roles` con el motivo: la pantalla no deja pedir precio (fail-closed).
 */
export function unirFaltanConRoles(
  propios: ReadonlyArray<{ campo: PropertyKey; motivo: string }>,
  roles: ResultadoRoles,
): { campo: string; motivo: string }[] {
  const out = propios.map((f) => ({ campo: String(f.campo), motivo: f.motivo }))
  if (roles.estado === 'no_disponible') return [...out, { campo: 'person-roles', motivo: roles.motivo }]
  // `aseguradosAdicionales` puede venir varias veces (uno por asegurado): se deduplica por campo+motivo.
  for (const f of roles.faltan) if (!out.some((o) => o.campo === f.campo && (o.campo !== 'aseguradosAdicionales' || o.motivo === f.motivo))) out.push(f)
  return out
}
