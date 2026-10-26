// Pasada del cron `/api/cron/solicitudes-abandonadas` (26/10/2026, fase B del enlace de datos).
// Busca enlaces PENDIENTES (vivos, de una oportunidad abierta) creados hace ≥ 24 h y sin sello `aviso_abandono_at`,
// avisa a Alberto por Telegram (`tgSend`) y SELLA justo tras el envío: una sola vez por solicitud.
// Nunca escribe al cliente. Modo CUENTA por defecto: sin `ASEGURA_AVISO_ABANDONO_ACTIVO=1` (o con `?contar=1`) solo cuenta.
// Sin el SQL `2026-10-26_solicitud_datos_borrador.sql` (columnas `ultimo_paso`/`aviso_abandono_at`) → `sin_migracion`.
//
// El SQL crudo NO prefija el schema: la conexión ya trae `?schema=seguros`.
import { tgSend } from '@central/core-telegram'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { HORAS_ABANDONO, TOPE_ABANDONO_PASADA, textoAvisoAbandono, type SolicitudAbandonada } from './aviso-abandono-solicitud.ts'
import { enlaceFichaCliente, URL_PLATAFORMA_DEFECTO } from './datos-cotizados'
import { esColumnaAusente } from './pg-error'

export function avisoAbandonoActivo(): boolean {
  return process.env.ASEGURA_AVISO_ABANDONO_ACTIVO === '1'
}

export type ResultadoAbandono =
  | { estado: 'ensayo'; candidatas: number }
  | { estado: 'ok'; avisadas: number }
  | { estado: 'sin_telegram'; candidatas: number }
  | { estado: 'sin_migracion'; motivo: string }

export async function pasadaSolicitudesAbandonadas(correduriaId: string, opts: { forzarContar?: boolean } = {}): Promise<ResultadoAbandono> {
  const db = prismaAsegura()
  let filas: { id: string; ramo: string; tercero: boolean; ultimoPaso: string | null; clienteId: string }[]
  try {
    filas = await db.$queryRaw(Prisma.sql`
      select s.id::text as id, s.ramo, s.tercero, s.ultimo_paso as "ultimoPaso", o.cliente_id::text as "clienteId"
      from solicitud_datos s
      join oportunidades o on o.id = s.oportunidad_id and o.correduria_id = s.correduria_id
      where s.correduria_id = ${correduriaId}::uuid
        and s.estado = 'pendiente' and s.caduca_at > now() and s.completada_at is null
        and s.aviso_abandono_at is null
        and s.created_at <= now() - make_interval(hours => ${HORAS_ABANDONO}::int)
        and o.estado::text not in ('ganada', 'perdida')
      order by s.created_at asc
      limit ${TOPE_ABANDONO_PASADA}`)
  } catch (e) {
    if (esColumnaAusente(e)) return { estado: 'sin_migracion', motivo: 'Falta aplicar prisma/sql/2026-10-26_solicitud_datos_borrador.sql: no se ha avisado nada.' }
    throw e
  }
  if (opts.forzarContar || !avisoAbandonoActivo()) return { estado: 'ensayo', candidatas: filas.length }
  if (filas.length === 0) return { estado: 'ok', avisadas: 0 }
  const base = process.env.PLATAFORMA_URL?.trim() || URL_PLATAFORMA_DEFECTO
  // La ficha del CLIENTE de la oportunidad (aunque los datos pedidos sean de un familiar): ahí está la oportunidad.
  const aviso: SolicitudAbandonada[] = filas.map((f) => ({ id: f.id, ramo: f.ramo, tercero: f.tercero, ultimoPaso: f.ultimoPaso, enlaceFicha: enlaceFichaCliente(f.clienteId, base) }))
  const enviado = await tgSend(textoAvisoAbandono(aviso))
  // Sin Telegram (o falló el envío): NO se sella; se reintenta en la siguiente pasada.
  if (enviado === null) return { estado: 'sin_telegram', candidatas: filas.length }
  const ids = filas.map((f) => f.id)
  await db.$executeRaw(Prisma.sql`
    update solicitud_datos set aviso_abandono_at = now()
    where correduria_id = ${correduriaId}::uuid and id = any(${ids}::uuid[]) and aviso_abandono_at is null`)
  return { estado: 'ok', avisadas: filas.length }
}
