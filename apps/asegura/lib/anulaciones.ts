// Expediente de anulación de póliza (Fase 2 de ASegura OS, pieza 2-d).
//
// - `crearAnulacion()` abre el expediente desde la ficha de la póliza (plataforma).
// - `accionAnulacion()` lo mueve: firmada (con nota de cómo consta), comunicada, desistida.
// - `confirmarAnulaciones()` la llama el detector de cartera DENTRO de su transacción: cuando CIMA
//   trae la póliza como no vigente, el expediente queda confirmado y la baja deja de ser una
//   pérdida sin explicar.
//
// Las reglas (plazo del art. 22 LCS, qué transición vale) viven en `@central/module-seguros`.
// El SQL crudo no prefija `seguros.`: la conexión ya trae `?schema=seguros`.

import {
  ESTADOS_ANULACION_ABIERTA, POLIZA_ESTADOS_VIGENTES, resolucionDeAnulacion, siguientePasoAnulacion, transicionAnulacion,
  validarSolicitudAnulacion, type AccionAnulacion, type EstadoAnulacion, type MotivoAnulacion, type SiguientePasoAnulacion, type TipoAnulacion,
} from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'

type Tx = Pick<ReturnType<typeof prismaAsegura>, '$queryRaw' | '$executeRaw'>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ABIERTOS = [...ESTADOS_ANULACION_ABIERTA] as string[]
const VIGENTES = [...POLIZA_ESTADOS_VIGENTES] as string[]

function hoyMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

export type Anulacion = {
  id: string
  polizaId: string
  clienteId: string
  cliente: string | null
  numeroPoliza: string | null
  compania: string | null
  tipo: TipoAnulacion
  solicitadaPor: string
  motivo: MotivoAnulacion
  motivoTexto: string | null
  fechaEfecto: string
  estado: EstadoAnulacion
  creada: string
  firmadaAt: string | null
  firmaNota: string | null
  comunicadaAt: string | null
  confirmadaAt: string | null
  siguiente: SiguientePasoAnulacion | null
}

type Fila = {
  id: string; polizaId: string; clienteId: string; nombre: string | null; apellidos: string | null; numeroPoliza: string | null
  compania: string | null; tipo: TipoAnulacion; solicitadaPor: string; motivo: MotivoAnulacion; motivoTexto: string | null
  fechaEfecto: string; estado: EstadoAnulacion; creada: Date; firmadaAt: Date | null; firmaNota: string | null
  comunicadaAt: Date | null; confirmadaAt: Date | null
}

function mapear(f: Fila, hoy: string): Anulacion {
  return {
    id: f.id, polizaId: f.polizaId, clienteId: f.clienteId,
    cliente: [f.nombre, f.apellidos].filter(Boolean).join(' ') || null,
    numeroPoliza: f.numeroPoliza, compania: f.compania, tipo: f.tipo, solicitadaPor: f.solicitadaPor,
    motivo: f.motivo, motivoTexto: f.motivoTexto, fechaEfecto: f.fechaEfecto, estado: f.estado,
    creada: f.creada.toISOString(),
    firmadaAt: f.firmadaAt?.toISOString() ?? null, firmaNota: f.firmaNota,
    comunicadaAt: f.comunicadaAt?.toISOString() ?? null, confirmadaAt: f.confirmadaAt?.toISOString() ?? null,
    siguiente: siguientePasoAnulacion({ estado: f.estado, fechaEfecto: f.fechaEfecto, compania: f.compania }, hoy),
  }
}

const SELECT = Prisma.sql`
  select a.id::text as id, a.poliza_id::text as "polizaId", a.cliente_id::text as "clienteId", c.nombre, c.apellidos,
         p.numero_poliza as "numeroPoliza", p.aseguradora as compania, a.tipo, a.solicitada_por as "solicitadaPor",
         a.motivo, a.motivo_texto as "motivoTexto", to_char(a.fecha_efecto, 'YYYY-MM-DD') as "fechaEfecto", a.estado,
         a.created_at as creada, a.firmada_at as "firmadaAt", a.firma_nota as "firmaNota",
         a.comunicada_at as "comunicadaAt", a.confirmada_at as "confirmadaAt"
  from anulacion a join polizas p on p.id = a.poliza_id left join clientes c on c.id = a.cliente_id`

/** Los expedientes de una póliza, el más reciente primero. */
export async function anulacionesDePoliza(correduriaId: string, polizaId: string): Promise<Anulacion[]> {
  const filas = await prismaAsegura().$queryRaw<Fila[]>(Prisma.sql`${SELECT}
    where a.correduria_id = ${correduriaId}::uuid and a.poliza_id = ${polizaId}::uuid
    order by a.created_at desc limit 20`)
  const hoy = hoyMadrid()
  return filas.map((f) => mapear(f, hoy))
}

/** Los abiertos de toda la correduría, por fecha de efecto. */
export async function anulacionesAbiertas(correduriaId: string): Promise<Anulacion[]> {
  const filas = await prismaAsegura().$queryRaw<Fila[]>(Prisma.sql`${SELECT}
    where a.correduria_id = ${correduriaId}::uuid and a.estado = any(${ABIERTOS}::text[])
    order by a.fecha_efecto limit 100`)
  const hoy = hoyMadrid()
  return filas.map((f) => mapear(f, hoy))
}

export type ResultadoCrear =
  | { estado: 'creada'; id: string; advertencia: string | null }
  | { estado: 'no_encontrada' }
  | { estado: 'invalida'; motivo: string }
  | { estado: 'ya_abierta' }

export async function crearAnulacion(correduriaId: string, polizaId: string, cuerpo: unknown, actor: string): Promise<ResultadoCrear> {
  if (!UUID.test(polizaId)) return { estado: 'no_encontrada' }
  const db = prismaAsegura()
  const [p] = await db.$queryRaw<{ clienteId: string; vencimiento: string | null; vigente: boolean }[]>`
    select p.cliente_id::text as "clienteId", to_char(p.fecha_vencimiento, 'YYYY-MM-DD') as vencimiento,
           p.estado::text = any(${VIGENTES}::text[]) as vigente
    from polizas p where p.id = ${polizaId}::uuid and p.correduria_id = ${correduriaId}::uuid and p.merged_into_poliza_id is null`
  if (!p) return { estado: 'no_encontrada' }
  // Una póliza que ya no está en vigor no se anula: se confirmaría sola sin haber hecho nada.
  if (!p.vigente) return { estado: 'invalida', motivo: 'La póliza ya no está en vigor según CIMA: no hay nada que anular.' }
  const v = validarSolicitudAnulacion(cuerpo, { vencimiento: p.vencimiento, hoy: hoyMadrid() })
  if (!v.ok) return { estado: 'invalida', motivo: v.motivo }
  const s = v.solicitud
  const quien = actor.slice(0, 100)
  let id: string
  try {
    const [r] = await db.$queryRaw<{ id: string }[]>`
      insert into anulacion (correduria_id, poliza_id, cliente_id, tipo, solicitada_por, motivo, motivo_texto, fecha_efecto, creada_por)
      values (${correduriaId}::uuid, ${polizaId}::uuid, ${p.clienteId}::uuid, ${s.tipo}, ${s.solicitadaPor}, ${s.motivo},
              ${s.motivoTexto}, ${s.fechaEfecto}::date, ${quien})
      returning id::text as id`
    id = r.id
  } catch (e) {
    // El índice parcial: ya hay un expediente abierto para esta póliza.
    if (e instanceof Error && /uq_anulacion_abierta_por_poliza/.test(e.message)) return { estado: 'ya_abierta' }
    throw e
  }
  anotarCambio({ entidad: 'anulacion', id, campo: 'estado', antes: null, despues: 'solicitada' })
  await historial(correduriaId, p.clienteId, polizaId, `Anulación solicitada (${s.tipo}, efecto ${s.fechaEfecto}) por ${quien}.`)
  return { estado: 'creada', id, advertencia: v.advertencia }
}

export type ResultadoAccion =
  | { estado: 'hecho'; nuevo: EstadoAnulacion }
  | { estado: 'no_encontrada' }
  | { estado: 'no_permitida'; motivo: string }
  | { estado: 'invalida'; motivo: string }

export async function accionAnulacion(correduriaId: string, id: string, accion: AccionAnulacion, nota: string | null, actor: string): Promise<ResultadoAccion> {
  if (!UUID.test(id)) return { estado: 'no_encontrada' }
  const db = prismaAsegura()
  const [a] = await db.$queryRaw<{ estado: EstadoAnulacion; clienteId: string; polizaId: string }[]>`
    select estado, cliente_id::text as "clienteId", poliza_id::text as "polizaId"
    from anulacion where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`
  if (!a) return { estado: 'no_encontrada' }
  const nuevo = transicionAnulacion(a.estado, accion)
  if (!nuevo) {
    return { estado: 'no_permitida', motivo: accion === 'marcar_comunicada' && a.estado === 'solicitada' ? 'Sin la firma del cliente no se comunica a la compañía.' : `Desde «${a.estado}» no se puede.` }
  }
  const texto = nota?.trim().slice(0, 500) || null
  // Firmar sin decir cómo consta la firma es firmar a ciegas: la nota es obligatoria.
  if (accion === 'marcar_firmada' && !texto) return { estado: 'invalida', motivo: 'Di cómo consta la firma (p. ej. «carta firmada, subida a Documentos»).' }
  const quien = actor.slice(0, 100)
  // `where estado = actual`: si otro clic la movió entre medias, esta no pisa nada.
  const n = await db.$executeRaw`
    update anulacion set estado = ${nuevo}, updated_at = now(),
      firmada_at    = case when ${nuevo} = 'firmada'    then now() else firmada_at end,
      firma_nota    = case when ${nuevo} = 'firmada'    then ${texto} else firma_nota end,
      comunicada_at = case when ${nuevo} = 'comunicada' then now() else comunicada_at end,
      confirmada_at = case when ${nuevo} = 'confirmada' then now() else confirmada_at end,
      desistida_at  = case when ${nuevo} = 'desistida'  then now() else desistida_at end
    where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid and estado = ${a.estado}`
  if (n === 0) return { estado: 'no_permitida', motivo: 'Ha cambiado mientras tanto: recarga.' }
  anotarCambio({ entidad: 'anulacion', id, campo: 'estado', antes: a.estado, despues: nuevo })
  await historial(correduriaId, a.clienteId, a.polizaId, `Anulación ${nuevo}${texto ? `: ${texto}` : ''} (${quien}).`)
  return { estado: 'hecho', nuevo }
}

async function historial(correduriaId: string, clienteId: string, polizaId: string, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, ${polizaId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`
  } catch (e) {
    console.error('[anulaciones] historial no anotado:', e instanceof Error ? e.message : e)
  }
}

/**
 * Detector de cartera, dentro de su transacción.
 *
 * 1. Solo un expediente COMUNICADO se confirma solo, cuando CIMA trae la póliza no vigente. Uno
 *    sin firma o sin comunicar NO: si la compañía cancela la póliza por otra razón (un impago),
 *    decir «confirmada» atribuiría la baja a una anulación que nunca salió.
 * 2. La baja pendiente de una póliza con expediente comunicado o confirmado (también a mano, antes
 *    de que CIMA la trajera) queda explicada con el motivo del expediente. Solo bajas posteriores al
 *    expediente y sin sustitución.
 *
 * Devuelve cuántos se confirmaron y las pólizas cuya baja quedó explicada (no se anuncian como fuga).
 */
export async function confirmarAnulaciones(tx: Tx, correduriaId: string): Promise<{ confirmadas: number; explicadas: string[] }> {
  const confirmadas = await tx.$queryRaw<{ id: string }[]>`
    update anulacion a set estado = 'confirmada', confirmada_at = now(), updated_at = now()
    from polizas p
    where a.correduria_id = ${correduriaId}::uuid and a.estado = 'comunicada'
      and p.id = a.poliza_id and p.merged_into_poliza_id is null and not (p.estado::text = any(${VIGENTES}::text[]))
    returning a.id::text as id`
  for (const f of confirmadas) anotarCambio({ entidad: 'anulacion', id: f.id, campo: 'estado', antes: 'comunicada', despues: 'confirmada' })

  const bajas = await tx.$queryRaw<{ eventoId: string; polizaId: string; tipo: TipoAnulacion; motivo: MotivoAnulacion }[]>`
    select distinct on (e.id) e.id::text as "eventoId", e.entidad_id::text as "polizaId", a.tipo, a.motivo
    from evento e join anulacion a on a.poliza_id = e.entidad_id and a.correduria_id = e.correduria_id
    where e.correduria_id = ${correduriaId}::uuid and e.entidad = 'poliza' and e.estado = 'pendiente'
      and e.tipo in ('POLIZA_BAJA', 'POLIZA_ANULA_AL_VENCIMIENTO', 'POLIZA_DESAPARECIDA')
      and coalesce(e.datos->>'sustituida', 'false') <> 'true'
      and a.estado in ('comunicada', 'confirmada') and e.created_at >= a.created_at - interval '1 day'
    order by e.id, a.created_at desc`
  for (const b of bajas) {
    const r = resolucionDeAnulacion(b)
    await tx.$executeRaw`
      update evento set estado = 'revisado', resolucion = ${r.resolucion}, motivo = ${r.resolucion === 'perdida' ? r.motivo : null},
             revisado_at = now(), revisado_por = 'sistema:anulacion'
      where id = ${b.eventoId}::uuid and estado = 'pendiente'`
  }
  return { confirmadas: confirmadas.length, explicadas: [...new Set(bajas.map((b) => b.polizaId))] }
}
