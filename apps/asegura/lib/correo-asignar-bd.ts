// apps/asegura/lib/correo-asignar-bd.ts
//
// «Asignar a cliente / oportunidad» desde la bandeja «Correos de compañía» (F1 del agente de correo, 21/10/2026): un
// aviso que quedó SIN RESOLVER (su nº no casó con nada) lo asigna Alberto a mano. La regla vive en `correo-documento.ts`
// (`decidirAsignacion`, puro y con test):
//   · SOLICITUD → se apunta su nº en la oportunidad elegida (`fijarSolicitudCompania`, la MISMA vía que a mano) y se
//     engancha con `vincularSolicitudesPendientes` (nota, estado y tarea si la compañía pide documentación);
//   · el resto → nota en la ficha del cliente y la fila pasa a `aplicado` («asignado a mano»). Ni tareas ni siniestros:
//     el aviso no casó solo y no se adivina qué haría falta.
// En los dos casos los adjuntos SIN asignar de ese correo pasan a la ficha. El actor lo pone plataforma (sesión).
//
// El SQL crudo NO prefija el schema: la conexión ya trae `?schema=seguros`.

import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { resolverDestino } from './cartera-documentos'
import { asignarDocumentosDeMensaje } from './correo-documento-bd'
import { decidirAsignacion, notaAsignacionEvento, type AsignacionEvento } from './correo-documento'
import { vincularSolicitudesPendientes } from './correo-evento-bd'
import { nombreCompania } from './correo-evento'
import { fijarSolicitudCompania } from './oportunidad-seguimiento'

const ABIERTAS = new Set(['competencia', 'en_negociacion', 'pendiente_cliente'])

export type ResultadoAsignacion =
  | { ok: true; via: 'solicitud' | 'ficha'; resumen: string; documentos: number }
  | { ok: false; status: 404 | 409 | 422 | 503; estado: string; motivo: string }

export async function asignarEventoCorreo(correduriaId: string, a: AsignacionEvento, actor: string): Promise<ResultadoAsignacion> {
  const db = prismaAsegura()
  const [ev] = await db.$queryRaw<{ tipo: string; estado: string; compania: string; clave: string; numeroPoliza: string | null; resumen: string | null; mensajeId: string; revisadoAt: Date | null }[]>(Prisma.sql`
    select tipo, estado, compania, clave, numero_poliza as "numeroPoliza", resumen, mensaje_id as "mensajeId", revisado_at as "revisadoAt"
    from correo_evento_entrante where id = ${a.id}::uuid and correduria_id = ${correduriaId}::uuid`)
  const cliente = await resolverDestino(correduriaId, { clienteId: a.clienteId })
  if (!cliente?.clienteId) return { ok: false, status: 422, estado: 'invalido', motivo: 'ese cliente no es de esta correduría' }
  const [op] = a.oportunidadId
    ? await db.$queryRaw<{ clienteId: string; estado: string }[]>(Prisma.sql`
        select cliente_id::text as "clienteId", estado::text as estado from oportunidades
        where id = ${a.oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`)
    : []
  const d = decidirAsignacion(ev ?? null, { oportunidadId: a.oportunidadId }, op ? { clienteId: op.clienteId, abierta: ABIERTAS.has(op.estado) } : null, a.clienteId)
  if (!d.ok) return { ok: false, status: d.status, estado: d.status === 404 ? 'no_encontrado' : d.status === 409 ? 'conflicto' : 'invalido', motivo: d.motivo }
  if (!ev) return { ok: false, status: 404, estado: 'no_encontrado', motivo: 'ese aviso no existe en esta correduría' }

  if (d.via === 'solicitud' && a.oportunidadId) {
    // Se RECLAMA la fila antes de tocar nada (la lectura de arriba pudo quedarse vieja): si otra pestaña o una pasada ya
    // la sacó de `sin_resolver`, 0 filas y ningún efecto lateral. «Marcado como mirado» no impide engancharlo: se quita
    // la marca de ESTA fila (y se restituye si apuntar la solicitud falla).
    const reclamada = await db.$executeRaw(Prisma.sql`
      update correo_evento_entrante set revisado_at = null, updated_at = now()
      where id = ${a.id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'sin_resolver'`)
    if (reclamada === 0) return { ok: false, status: 409, estado: 'conflicto', motivo: 'el aviso ya no está sin resolver (otra pestaña o una pasada lo resolvió)' }
    const f = await fijarSolicitudCompania(correduriaId, a.oportunidadId, { numero: ev.clave, compania: ev.compania }, actor)
    if (!f.ok) {
      await db.$executeRaw(Prisma.sql`
        update correo_evento_entrante set revisado_at = ${ev.revisadoAt}, updated_at = now()
        where id = ${a.id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'sin_resolver'`).catch(() => undefined)
      return { ok: false, status: f.status === 404 ? 404 : f.status === 409 ? 409 : f.status === 503 ? 503 : 422, estado: f.estado, motivo: f.motivo }
    }
    const v = await vincularSolicitudesPendientes(correduriaId, a.oportunidadId, ev.compania, ev.clave)
    const docs = await asignarDocumentosDeMensaje(correduriaId, ev.mensajeId, { clienteId: a.clienteId, polizaId: null }).catch(() => 0)
    return { ok: true, via: 'solicitud', resumen: `solicitud ${ev.clave} apuntada en la oportunidad: ${v.vinculados} correo(s) enganchado(s)`, documentos: docs }
  }

  const resumen = `asignado a mano a la ficha por ${actor.slice(0, 80)} (sin tareas)`
  const n = await db.$transaction(async (tx) => {
    const k = await tx.$executeRaw(Prisma.sql`
      update correo_evento_entrante set estado = 'aplicado', motivo = null, resumen = ${resumen.slice(0, 300)},
             cliente_id = ${a.clienteId}::uuid, oportunidad_id = ${a.oportunidadId}::uuid, revisado_at = now(), updated_at = now()
      where id = ${a.id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'sin_resolver'`)
    if (k === 0) return 0
    await tx.$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${a.clienteId}::uuid, cast('gestion' as tipo_historial_interno),
              ${notaAsignacionEvento({ ...ev, compania: nombreCompania(ev.compania) }, actor.slice(0, 80))})`)
    return k
  })
  if (n === 0) return { ok: false, status: 409, estado: 'conflicto', motivo: 'el aviso ya no está sin resolver (otra pestaña o una pasada lo resolvió)' }
  anotarCambio({ entidad: 'correo_evento', id: a.id, campo: 'estado', antes: 'sin_resolver', despues: 'aplicado' })
  const docs = await asignarDocumentosDeMensaje(correduriaId, ev.mensajeId, { clienteId: a.clienteId, polizaId: null }).catch(() => 0)
  return { ok: true, via: 'ficha', resumen, documentos: docs }
}
