// Lo que el corredor puede hacer con una baja pedida por el CLIENTE desde el portal (retenida 48 h).
//
// Aparte de `anulaciones.ts` A PROPÓSITO (no importa Prisma ni auditoría: todo entra por `deps`), para que el
// cepo ejecute la decisión con una BD simulada. `anulaciones.ts` la cablea con la real.
//
//   · `liberar`  — «Liberar para firma»: el corredor ya ha llamado al cliente y la baja puede firmarse. Una sola
//                  vez: el UPDATE solo casa con `solicitada` + `origen = 'portal'` + `liberada_at IS NULL`.
//   · `bloqueoAccion` — sin liberar, el corredor tampoco puede darla por firmada a mano (sería saltarse la retención
//                  por el otro lado); y desistir de una pedida por el cliente exige decir por qué (el cliente la pidió).

import { liberadaParaFirma, type AccionAnulacion, type OrigenAnulacion } from '@central/module-seguros'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type BloqueoAccion = { estado: 'no_permitida' | 'invalida'; motivo: string }

export function bloqueoAccion(
  a: { origen: OrigenAnulacion; liberadaAt: Date | null; createdAt: Date },
  accion: AccionAnulacion,
  nota: string | null,
  ahora: Date,
): BloqueoAccion | null {
  if (a.origen !== 'portal') return null
  if (accion === 'marcar_firmada' && !liberadaParaFirma(a, ahora)) {
    return { estado: 'no_permitida', motivo: MOTIVO_RETENIDA }
  }
  if (accion === 'desistir' && !nota?.trim()) {
    return { estado: 'invalida', motivo: 'La pidió el cliente: di por qué se desiste (p. ej. «hablado por teléfono, se queda»).' }
  }
  return null
}

export const MOTIVO_RETENIDA = 'Pedida por el cliente desde el portal y aún retenida: llámale y pulsa «Liberar para firma» antes (se libera sola a las 48 h).'

/** El CHECK `anulacion_portal_retenida` (23514) saltó en un UPDATE: la BD defiende lo que `bloqueoAccion` ya debía cortar. */
export function esViolacionRetencionPortal(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const x = e as { message?: unknown; constraint?: unknown; meta?: { constraint?: unknown; message?: unknown } }
  return [x.message, x.constraint, x.meta?.constraint, x.meta?.message].some((c) => typeof c === 'string' && c.includes('anulacion_portal_retenida'))
}

type Plantilla = (texto: TemplateStringsArray, ...valores: unknown[]) => Promise<unknown>
export type DbLiberar = { $queryRaw: Plantilla }

export type ResultadoLiberar =
  | { estado: 'hecho'; nuevo: 'solicitada' }
  | { estado: 'no_encontrada' }
  | { estado: 'no_permitida'; motivo: string }

export async function liberarConDeps(
  deps: {
    db: DbLiberar
    anotar: (c: { entidad: string; id: string; campo: string; antes: string | null; despues: string }) => void
    historial: (clienteId: string, polizaId: string, texto: string) => Promise<void>
  },
  correduriaId: string,
  id: string,
  actor: string,
): Promise<ResultadoLiberar> {
  if (!UUID.test(id)) return { estado: 'no_encontrada' }
  const quien = actor.slice(0, 100)
  const [lib] = (await deps.db.$queryRaw`
    update anulacion set liberada_at = now(), liberada_por = ${quien}, updated_at = now()
    where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid
      and estado = 'solicitada' and origen = 'portal' and liberada_at is null
    returning id::text as id, cliente_id::text as "clienteId", poliza_id::text as "polizaId"`) as { id: string; clienteId: string; polizaId: string }[]
  if (!lib) {
    const [e] = (await deps.db.$queryRaw`
      select estado, origen, liberada_at is not null as liberada from anulacion
      where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`) as { estado: string; origen: string; liberada: boolean }[]
    if (!e) return { estado: 'no_encontrada' }
    return {
      estado: 'no_permitida',
      motivo: e.origen !== 'portal' ? 'Solo se liberan las bajas que pidió el cliente desde el portal.'
        : e.estado !== 'solicitada' ? `Desde «${e.estado}» no se puede.`
        : 'Ya estaba liberada.',
    }
  }
  deps.anotar({ entidad: 'anulacion', id, campo: 'liberada', antes: null, despues: 'liberada_por_corredor' })
  await deps.historial(lib.clienteId, lib.polizaId, `Baja pedida por el cliente liberada para firma (${quien}).`)
  return { estado: 'hecho', nuevo: 'solicitada' }
}
