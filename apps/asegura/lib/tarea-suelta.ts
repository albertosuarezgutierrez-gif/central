// apps/asegura/lib/tarea-suelta.ts
//
// «Hecho» y «Posponer N días» sobre una TAREA SUELTA (13/10/2026): una gestión abierta SIN oportunidad
// (casi todas de la agenda del CRM anterior) que Mi mesa lista en `tareasSueltas`. `cerrarTarea` y
// `posponerOportunidad` de `oportunidad-seguimiento.ts` exigen oportunidad (su rastro va a
// `oportunidad_historial`), así que estas tareas no tenían salida. Aquí:
//
//   · Aislamiento: la tarea se lee por `id` + `correduria_id` con `FOR UPDATE` (rol con BYPASSRLS: un id
//     ajeno sin ese filtro escribiría en la de otra correduría) y la escritura repite el filtro.
//   · Solo SUELTAS: una tarea con oportunidad va por su seguimiento (409), para no saltarse su historial
//     ni la recurrencia anual de la llamada.
//   · Los hitos del recibo devuelto (art. 15 LCS, prefijo `PREFIJO_TAREA_DEVOLUCION`) NO se cierran ni
//     se posponen por aquí: llevan el plazo legal (409). Hoy siempre cuelgan de una oportunidad; la
//     guarda está por si alguno llega suelto.
//   · Rastro: sin `oportunidad_historial` posible, lo que se hizo y quién queda en la propia tarea
//     (`observaciones`), en `historial_interno` si cuelga de una ficha, y en la auditoría del puerto.
//
// El SQL crudo NO prefija el schema: la conexión ya trae `?schema=seguros`.

import { fechaPospuesta } from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { rechazoSuelta, type FalloSuelta, type FilaSuelta } from './tarea-suelta-reglas'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function hoyMadridIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

type Tx = Prisma.TransactionClient

const NO_ENCONTRADA = rechazoSuelta(undefined)!

async function leerSuelta(tx: Tx, correduriaId: string, tareaId: string): Promise<(FilaSuelta & { fecha: string | null }) | undefined> {
  const [t] = await tx.$queryRaw<(FilaSuelta & { fecha: string | null })[]>(Prisma.sql`
    select oportunidad_id::text as "oportunidadId", cliente_id::text as "clienteId", estado::text as estado, observaciones,
           to_char(fecha_limite at time zone 'Europe/Madrid', 'YYYY-MM-DD') as fecha
    from gestiones where id = ${tareaId}::uuid and correduria_id = ${correduriaId}::uuid for update`)
  return t
}

/** «Hecho»: la tarea suelta queda cerrada, con el resultado (si lo hay) y quién la cerró. */
export async function cerrarTareaSuelta(
  correduriaId: string,
  tareaId: string,
  resultado: string | null,
  actor: string,
): Promise<{ ok: true } | FalloSuelta> {
  if (!UUID.test(tareaId)) return { ok: false, estado: 'invalido', motivo: 'id de tarea no válido', status: 422 }
  const nota = `\n— Hecha por ${actor}${resultado ? `: ${resultado}` : ''}`
  const r = await prismaAsegura().$transaction(async (tx) => {
    const t = await leerSuelta(tx, correduriaId, tareaId)
    const no = rechazoSuelta(t)
    if (no || !t) return no ?? NO_ENCONTRADA
    await tx.$executeRaw(Prisma.sql`
      update gestiones set estado = 'cerrada', observaciones = coalesce(observaciones, '') || ${nota}, updated_at = now()
      where id = ${tareaId}::uuid and correduria_id = ${correduriaId}::uuid and oportunidad_id is null`)
    return { ok: true as const, clienteId: t.clienteId, antes: t.estado }
  })
  if (!r.ok) return r
  anotarCambio({ entidad: 'gestion', id: tareaId, campo: 'estado', antes: r.antes, despues: 'cerrada' })
  if (r.clienteId) await anotarEnFicha(correduriaId, r.clienteId, `Tarea cerrada${resultado ? `: ${resultado.slice(0, 140)}` : ''} — por ${actor}`)
  return { ok: true }
}

/** «Posponer N días»: la fecha límite pasa a hoy + N (Madrid). Se MUEVE, no se cierra. */
export async function posponerTareaSuelta(
  correduriaId: string,
  tareaId: string,
  dias: unknown,
  actor: string,
  hoyIso: string = hoyMadridIso(),
): Promise<{ ok: true; fecha: string } | FalloSuelta> {
  if (!UUID.test(tareaId)) return { ok: false, estado: 'invalido', motivo: 'id de tarea no válido', status: 422 }
  const p = fechaPospuesta(dias, hoyIso)
  if (!p.ok) return { ok: false, estado: 'invalido', motivo: p.motivo, status: 422 }
  const nota = `\n— Pospuesta ${p.dias} día${p.dias === 1 ? '' : 's'} (al ${p.fecha}) por ${actor}`
  const r = await prismaAsegura().$transaction(async (tx) => {
    const t = await leerSuelta(tx, correduriaId, tareaId)
    const no = rechazoSuelta(t)
    if (no || !t) return no ?? NO_ENCONTRADA
    await tx.$executeRaw(Prisma.sql`
      update gestiones set fecha_limite = (${p.fecha}::date + time '23:59:59') at time zone 'Europe/Madrid',
        observaciones = coalesce(observaciones, '') || ${nota}, updated_at = now()
      where id = ${tareaId}::uuid and correduria_id = ${correduriaId}::uuid and oportunidad_id is null`)
    return { ok: true as const, clienteId: t.clienteId, antes: t.fecha }
  })
  if (!r.ok) return r
  anotarCambio({ entidad: 'gestion', id: tareaId, campo: 'fecha_limite', antes: r.antes, despues: p.fecha })
  if (r.clienteId) await anotarEnFicha(correduriaId, r.clienteId, `Tarea pospuesta ${p.dias} día${p.dias === 1 ? '' : 's'} (al ${p.fecha}) — por ${actor}`)
  return { ok: true, fecha: p.fecha }
}

async function anotarEnFicha(correduriaId: string, clienteId: string, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`)
  } catch (e) {
    console.error('[tarea-suelta] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}
