/**
 * «Pídele los datos al cliente» (24/09/2026): enlace directo, sin código, para
 * que el cliente complete lo que falta para presupuestar (moto o coche).
 * Reglas puras (qué se pide, cómo se valida) en `@central/module-seguros`.
 *
 * Decisiones que no se tocan sin Alberto:
 * - El token solo vive en claro en la respuesta de crear; en BD, su SHA-256.
 * - La página pública (portal) NO recibe ningún dato del cliente: solo los
 *   campos a pedir (etiquetas) y el ramo. Ni nombre.
 * - Las respuestas se guardan CIFRADAS y NO se escriben en la ficha: son
 *   «declaradas por quien tenía el enlace»; valen para presupuestar y se
 *   verifican al emitir.
 * - Completar deja una nota con prefijo fijo en el historial (la recoge el
 *   aviso de actividad → Telegram) y una tarea «tarificar» para hoy.
 *
 * El SQL crudo NO prefija `seguros.`: la conexión ya trae `?schema=seguros`.
 */
import { createHash, randomBytes } from 'node:crypto'
import {
  DIAS_SOLICITUD,
  camposSolicitud,
  ramoSolicitud,
  validarRespuestas,
  type CampoSolicitud,
  type RamoSolicitud,
  type Respuesta,
} from '@central/module-seguros'
import { PREFIJO_HISTORIAL_DATOS_PRESUPUESTO } from '@central/module-seguros-portal'
import { decryptField, encryptField } from '@central/module-seguros-pii'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { clienteOrigenDe, listarCarnets } from './cartera-ficha'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN = /^[A-Za-z0-9_-]{40,60}$/
const CARNETS_MOTO = new Set(['A', 'A2', 'A1', 'AM'])

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

type Fallo = { ok: false; estado: 'invalido' | 'no_encontrado' | 'conflicto'; motivo: string; status: 404 | 409 | 422 }

export type SolicitudResumen = {
  id: string
  ramo: RamoSolicitud
  estado: 'pendiente' | 'completada' | 'anulada' | 'caducada'
  caduca: string
  completada: string | null
  campos: CampoSolicitud[]
  /** Descifradas. `null` = sin completar (o no se han podido descifrar: `ilegible`). */
  respuestas: Record<string, Respuesta> | null
  ilegible: boolean
}

/** Crea (o devuelve la viva) la solicitud de datos de una oportunidad ABIERTA de moto/coche. */
export async function crearSolicitud(
  correduriaId: string,
  oportunidadId: string,
  actor: string,
): Promise<{ ok: true; id: string; token: string | null; nueva: boolean; ramo: RamoSolicitud; caduca: string } | Fallo> {
  if (!UUID.test(oportunidadId)) return { ok: false, estado: 'invalido', motivo: 'id de oportunidad no válido', status: 422 }
  const db = prismaAsegura()
  const [o] = await db.$queryRaw<{ clienteId: string; ramo: string; estado: string }[]>(Prisma.sql`
    select cliente_id::text as "clienteId", tipo::text as ramo, estado::text as estado
    from oportunidades where id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid`)
  if (!o) return { ok: false, estado: 'no_encontrado', motivo: 'Esa oportunidad no es de esta correduría.', status: 404 }
  if (o.estado === 'ganada' || o.estado === 'perdida') return { ok: false, estado: 'conflicto', motivo: `La oportunidad está ${o.estado}.`, status: 409 }
  const ramo = ramoSolicitud(o.ramo)
  if (!ramo) return { ok: false, estado: 'invalido', motivo: 'Por ahora el enlace de datos es solo para moto y coche.', status: 422 }

  const origen = await clienteOrigenDe(correduriaId, o.clienteId)
  if (!origen) return { ok: false, estado: 'no_encontrado', motivo: 'No se encuentra la ficha del cliente.', status: 404 }
  const carnets = (await listarCarnets(correduriaId, o.clienteId, origen.cliente.fechaNacimiento)) ?? []
  const conFecha = carnets.filter((c) => c.fechaExpedicion !== null)
  const campos = camposSolicitud(ramo, {
    dni: origen.cliente.dni !== null,
    fechaNacimiento: origen.cliente.fechaNacimiento !== null,
    codigoPostal: origen.cliente.codigoPostal !== null,
    carnetMoto: conFecha.some((c) => CARNETS_MOTO.has(c.tipo.toUpperCase())),
    carnetCoche: conFecha.some((c) => c.tipo.toUpperCase() === 'B') || origen.cliente.fechaCarnet !== null,
  })

  const token = randomBytes(32).toString('base64url')
  const r = await db.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtext(${`solicitud:${oportunidadId}`}))`)
    const [viva] = await tx.$queryRaw<{ id: string; caduca: Date }[]>(Prisma.sql`
      select id::text as id, caduca_at as caduca from solicitud_datos
      where oportunidad_id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid
        and estado = 'pendiente' and caduca_at > now()`)
    if (viva) return { id: viva.id, caduca: viva.caduca, nueva: false }
    // Una pendiente ya caducada deja sitio (índice «una viva por oportunidad»).
    await tx.$executeRaw(Prisma.sql`
      update solicitud_datos set estado = 'anulada'
      where oportunidad_id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'pendiente'`)
    const [n] = await tx.$queryRaw<{ id: string; caduca: Date }[]>(Prisma.sql`
      insert into solicitud_datos (correduria_id, oportunidad_id, cliente_id, ramo, token_hash, campos, caduca_at, creada_por)
      values (${correduriaId}::uuid, ${oportunidadId}::uuid, ${o.clienteId}::uuid, ${ramo}, ${hashToken(token)},
              ${JSON.stringify(campos)}::jsonb, now() + make_interval(days => ${DIAS_SOLICITUD}::int), ${actor})
      returning id::text as id, caduca_at as caduca`)
    await tx.$executeRaw(Prisma.sql`
      insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
      values (${correduriaId}::uuid, ${oportunidadId}::uuid, 'datos_pedidos', cast(${o.estado} as estado_comercial),
              cast(${o.estado} as estado_comercial), ${JSON.stringify({ solicitudId: n.id, campos: campos.length })}::jsonb, ${actor})`)
    return { id: n.id, caduca: n.caduca, nueva: true }
  })
  // El token solo existe en claro al crearla: una viva no lo puede devolver (solo guardamos su hash).
  return { ok: true, id: r.id, token: r.nueva ? token : null, nueva: r.nueva, ramo, caduca: r.caduca.toISOString() }
}

function estadoEfectivo(estado: string, caduca: Date): SolicitudResumen['estado'] {
  if (estado === 'pendiente' && caduca.getTime() <= Date.now()) return 'caducada'
  return estado === 'completada' || estado === 'anulada' ? estado : 'pendiente'
}

function descifrarRespuestas(v: string | null): { respuestas: Record<string, Respuesta> | null; ilegible: boolean } {
  if (v === null) return { respuestas: null, ilegible: false }
  try {
    const o = JSON.parse(decryptField(v)) as unknown
    if (o && typeof o === 'object' && !Array.isArray(o)) return { respuestas: o as Record<string, Respuesta>, ilegible: false }
  } catch {
    /* clave PII ausente o distinta */
  }
  return { respuestas: null, ilegible: true }
}

/** Las solicitudes de una oportunidad (más reciente primero), para plataforma. */
export async function solicitudesDeOportunidad(correduriaId: string, oportunidadId: string): Promise<SolicitudResumen[] | null> {
  if (!UUID.test(oportunidadId)) return []
  try {
    const filas = await prismaAsegura().$queryRaw<{
      id: string; ramo: string; estado: string; caduca: Date; completada: Date | null; campos: CampoSolicitud[]; respuestas: string | null
    }[]>(Prisma.sql`
      select id::text as id, ramo, estado, caduca_at as caduca, completada_at as completada, campos, respuestas
      from solicitud_datos where oportunidad_id = ${oportunidadId}::uuid and correduria_id = ${correduriaId}::uuid
      order by created_at desc limit 10`)
    return filas.map((f) => {
      const d = descifrarRespuestas(f.respuestas)
      return {
        id: f.id,
        ramo: ramoSolicitud(f.ramo) ?? 'moto',
        estado: estadoEfectivo(f.estado, f.caduca),
        caduca: f.caduca.toISOString(),
        completada: f.completada ? f.completada.toISOString() : null,
        campos: f.campos,
        ...d,
      }
    })
  } catch (e) {
    console.error('[solicitud-datos] no se pudieron leer:', e instanceof Error ? e.message : e)
    return null
  }
}

/** Anula una pendiente (el enlace deja de funcionar). */
export async function anularSolicitud(correduriaId: string, id: string): Promise<{ ok: true } | Fallo> {
  if (!UUID.test(id)) return { ok: false, estado: 'invalido', motivo: 'id no válido', status: 422 }
  const n = await prismaAsegura().$executeRaw(Prisma.sql`
    update solicitud_datos set estado = 'anulada'
    where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'pendiente'`)
  return n > 0 ? { ok: true } : { ok: false, estado: 'conflicto', motivo: 'No está pendiente.', status: 409 }
}

// ─── Lado del portal (por token, sin identidad) ──────────────────────────────

export type SolicitudPublica =
  | { estado: 'ok'; ramo: RamoSolicitud; campos: CampoSolicitud[] }
  | { estado: 'muerta' }
  | { estado: 'completada' }

type FilaToken = { id: string; correduriaId: string; oportunidadId: string; clienteId: string; ramo: string; estado: string; caduca: Date; campos: CampoSolicitud[] }

async function porToken(token: string): Promise<FilaToken | null> {
  if (!TOKEN.test(token)) return null
  const [f] = await prismaAsegura().$queryRaw<FilaToken[]>(Prisma.sql`
    select id::text as id, correduria_id::text as "correduriaId", oportunidad_id::text as "oportunidadId",
           cliente_id::text as "clienteId", ramo, estado, caduca_at as caduca, campos
    from solicitud_datos where token_hash = ${hashToken(token)}`)
  return f ?? null
}

/**
 * Lo que ve la página pública: el ramo y los campos a pedir. NADA del cliente.
 * No existe, anulada o caducada → «muerta», todas igual (no es un oráculo de tokens).
 */
export async function solicitudPorToken(token: string): Promise<SolicitudPublica> {
  const f = await porToken(token)
  if (!f) return { estado: 'muerta' }
  if (f.estado === 'completada') return { estado: 'completada' }
  if (estadoEfectivo(f.estado, f.caduca) !== 'pendiente') return { estado: 'muerta' }
  const ramo = ramoSolicitud(f.ramo)
  return ramo ? { estado: 'ok', ramo, campos: f.campos } : { estado: 'muerta' }
}

/** El cliente manda sus datos. Una sola vez; lo que no se pidió se ignora. */
export async function responderSolicitud(
  token: string,
  entrada: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; estado: 'muerta' | 'completada' } | { ok: false; estado: 'errores'; errores: Record<string, string> }> {
  const f = await porToken(token)
  if (!f) return { ok: false, estado: 'muerta' }
  if (f.estado === 'completada') return { ok: false, estado: 'completada' }
  if (estadoEfectivo(f.estado, f.caduca) !== 'pendiente') return { ok: false, estado: 'muerta' }
  const v = validarRespuestas(f.campos, entrada)
  if (!v.ok) return { ok: false, estado: 'errores', errores: v.errores }

  const cifradas = encryptField(JSON.stringify(v.respuestas))
  const ramoTexto = f.ramo === 'moto' ? 'moto' : 'coche'
  const hecho = await prismaAsegura().$transaction(async (tx) => {
    const n = await tx.$executeRaw(Prisma.sql`
      update solicitud_datos set estado = 'completada', respuestas = ${cifradas}, completada_at = now()
      where id = ${f.id}::uuid and estado = 'pendiente' and caduca_at > now()`)
    if (n === 0) return false
    const [o] = await tx.$queryRaw<{ estado: string }[]>(Prisma.sql`
      select estado::text as estado from oportunidades where id = ${f.oportunidadId}::uuid for update`)
    if (o) {
      const nuevo = o.estado === 'competencia' ? 'en_negociacion' : o.estado
      if (nuevo !== o.estado) {
        await tx.$executeRaw(Prisma.sql`
          update oportunidades set estado = cast(${nuevo} as estado_comercial), updated_at = now() where id = ${f.oportunidadId}::uuid`)
      }
      await tx.$executeRaw(Prisma.sql`
        insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
        values (${f.correduriaId}::uuid, ${f.oportunidadId}::uuid, 'datos_recibidos', cast(${o.estado} as estado_comercial),
                cast(${nuevo} as estado_comercial), ${JSON.stringify({ solicitudId: f.id })}::jsonb, 'el cliente, por el enlace')`)
      await tx.$executeRaw(Prisma.sql`
        insert into gestiones (correduria_id, tipo, prioridad, estado, observaciones, fecha_limite, cliente_id, oportunidad_id, origen_trigger)
        values (${f.correduriaId}::uuid, 'tarea', 'alta', 'pendiente', ${`Tarificar ${ramoTexto}: el cliente ha completado sus datos`},
                ((now() at time zone 'Europe/Madrid')::date + time '23:59:59') at time zone 'Europe/Madrid',
                ${f.clienteId}::uuid, ${f.oportunidadId}::uuid, 'central:seguimiento')`)
    }
    // Sin los datos: el historial no se puede borrar (supresión RGPD). La recoge el aviso de actividad.
    await tx.$executeRaw(Prisma.sql`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${f.correduriaId}::uuid, ${f.clienteId}::uuid, cast('gestion' as tipo_historial_interno),
              ${`${PREFIJO_HISTORIAL_DATOS_PRESUPUESTO} ${ramoTexto}. Ya se puede tarificar.`})`)
    return true
  })
  return hecho ? { ok: true } : { ok: false, estado: 'muerta' }
}
