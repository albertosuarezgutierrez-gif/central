// «No es duplicado» desde la pantalla: lectura PURA de la petición (sin BD ni red,
// para `node --test`). La escritura vive en `no-duplicados.ts` (`marcarNoDuplicado`).
//
// Quién lo decide sale de `x-actor` (la sesión de plataforma), NUNCA del cuerpo, y
// tiene que ser una PERSONA (`humano:<cuentaId>`): es una decisión que la heurística
// no puede tomar, así que ni un `sistema:` ni una cabecera ausente pueden firmarla.

import { limpiarMotivoNoDuplicado, MAX_POLIZAS_MARCA } from '@central/module-seguros'
import { leerActor } from './actor.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type PeticionNoDuplicado =
  | { ok: true; ids: string[]; motivo: string; decididoPor: string }
  | { ok: false; status: 400 | 403; motivo: 'ids_no_validos' | 'demasiadas_polizas' | 'motivo_obligatorio' | 'sin_usuario' }

export function leerPeticionNoDuplicado(cuerpo: unknown, cabeceraActor: string | null): PeticionNoDuplicado {
  const actor = leerActor(cabeceraActor)
  if (actor.tipo !== 'humano') return { ok: false, status: 403, motivo: 'sin_usuario' }
  const o = (typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}) as Record<string, unknown>
  const crudos = Array.isArray(o.ids) ? o.ids : null
  if (!crudos || crudos.length < 2 || !crudos.every((x) => typeof x === 'string' && UUID.test(x))) {
    return { ok: false, status: 400, motivo: 'ids_no_validos' }
  }
  const ids = [...new Set((crudos as string[]).map((x) => x.toLowerCase()))]
  if (ids.length < 2) return { ok: false, status: 400, motivo: 'ids_no_validos' }
  // Más de MAX_POLIZAS_MARCA: 400 EXPLÍCITO, nunca se marca un trozo del grupo.
  if (ids.length > MAX_POLIZAS_MARCA) return { ok: false, status: 400, motivo: 'demasiadas_polizas' }
  const motivo = limpiarMotivoNoDuplicado(o.motivo)
  if (motivo === null) return { ok: false, status: 400, motivo: 'motivo_obligatorio' }
  return { ok: true, ids, motivo, decididoPor: `humano:${actor.id}` }
}
