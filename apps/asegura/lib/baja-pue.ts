// Bajas de Allianz que se tramitan a mano en el PUE (30/09/2026). Ver `docs/ALLIANZ-PUE.md`.
//
// La anulación firmada por el cliente NO sale por correo (`canalBajaCompania`): se queda `firmada` y
// esta lista es lo que Alberto tiene pendiente de teclear en el PUE. `marcarBajaTramitadaPue` la pasa a
// `comunicada` con guarda de estado y de compañía, y deja constancia en el historial.
// El SQL crudo no prefija `seguros.`: la conexión ya trae `?schema=seguros`.

import { ETIQUETA_MOTIVO_ANULACION, type MotivoAnulacion } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { anotarCambio } from './auditoria'
import { anotarHistorial } from './aprobaciones'
import { CODIGO_DGS_ALLIANZ, fichaPueAllianz, type FichaPue } from './canal-baja.ts'

export type BajaPue = {
  anulacionId: string
  polizaId: string
  clienteId: string
  cliente: string | null
  /** Desde cuándo espera: la firma del cliente (ISO). */
  desde: string | null
  ficha: FichaPue
  /** Id del PDF firmado archivado en la póliza (`/api/operador/documentos/<id>`); `null` = no hay PDF archivado. */
  documentoId: string | null
  /** Firmada junto a un presupuesto cuya póliza nueva aún no consta emitida: no se tramita todavía. */
  esperaEmision: boolean
}

type Fila = {
  anulacionId: string; polizaId: string; clienteId: string; nombre: string | null; numero: string | null
  fechaEfecto: string | null; motivo: MotivoAnulacion | null; motivoTexto: string | null; firmadaAt: Date | null
  documentoId: string | null; esperaEmision: boolean
}

export async function bajasPendientesPue(correduriaId: string): Promise<BajaPue[]> {
  const filas = await prismaAsegura().$queryRaw<Fila[]>`
    select a.id::text as "anulacionId", a.poliza_id::text as "polizaId", a.cliente_id::text as "clienteId",
           nullif(trim(concat(c.nombre, ' ', coalesce(c.apellidos, ''))), '') as nombre,
           p.numero_poliza as numero, to_char(a.fecha_efecto, 'YYYY-MM-DD') as "fechaEfecto",
           a.motivo, a.motivo_texto as "motivoTexto", a.firmada_at as "firmadaAt",
           (select d.id::text from documentos d where d.poliza_id = a.poliza_id and d.correduria_id = a.correduria_id
              and d.notas = 'justificante_anulacion:' || a.id::text order by d.created_at desc limit 1) as "documentoId",
           (a.presupuesto_id is not null and not exists (select 1 from presupuesto pr where pr.id = a.presupuesto_id and pr.emitido_at is not null)) as "esperaEmision"
    from anulacion a
      join polizas p on p.id = a.poliza_id
      join clientes c on c.id = a.cliente_id
    where a.correduria_id = ${correduriaId}::uuid and a.estado = 'firmada'
      and upper(trim(p.codigo_entidad_dgs)) = ${CODIGO_DGS_ALLIANZ}
    order by a.firmada_at nulls last, a.created_at
    limit 200`
  return filas.map((f) => {
    const etiqueta = f.motivo ? ETIQUETA_MOTIVO_ANULACION[f.motivo] ?? f.motivo : null
    const motivo = [etiqueta, f.motivoTexto?.trim()].filter(Boolean).join(' · ') || null
    return {
      anulacionId: f.anulacionId, polizaId: f.polizaId, clienteId: f.clienteId, cliente: f.nombre,
      desde: f.firmadaAt ? f.firmadaAt.toISOString() : null,
      ficha: fichaPueAllianz({ numeroPoliza: f.numero, tomador: f.nombre, fechaEfectoBaja: f.fechaEfecto, motivo }),
      documentoId: f.documentoId, esperaEmision: f.esperaEmision,
    }
  })
}

export type ResultadoTramitadaPue =
  | { estado: 'hecho' }
  | { estado: 'no_encontrada' }
  /** No está `firmada`, no es de Allianz o espera a la emisión de la póliza nueva: no se toca. */
  | { estado: 'no_permitida'; motivo: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function marcarBajaTramitadaPue(correduriaId: string, anulacionId: string, actor: string): Promise<ResultadoTramitadaPue> {
  if (!UUID.test(anulacionId)) return { estado: 'no_encontrada' }
  const db = prismaAsegura()
  const quien = actor.trim().slice(0, 100) || 'corredor'
  const [a] = await db.$queryRaw<{ estado: string; dgs: string | null; clienteId: string; polizaId: string; esperaEmision: boolean }[]>`
    select a.estado, p.codigo_entidad_dgs as dgs, a.cliente_id::text as "clienteId", a.poliza_id::text as "polizaId",
           (a.presupuesto_id is not null and not exists (select 1 from presupuesto pr where pr.id = a.presupuesto_id and pr.emitido_at is not null)) as "esperaEmision"
    from anulacion a join polizas p on p.id = a.poliza_id
    where a.id = ${anulacionId}::uuid and a.correduria_id = ${correduriaId}::uuid`
  if (!a) return { estado: 'no_encontrada' }
  if (a.dgs === null || a.dgs.trim().toUpperCase() !== CODIGO_DGS_ALLIANZ) return { estado: 'no_permitida', motivo: 'No es una póliza de Allianz: su baja no va por el PUE.' }
  if (a.estado !== 'firmada') return { estado: 'no_permitida', motivo: `Ya no está pendiente de tramitar (estado «${a.estado}»).` }
  if (a.esperaEmision) return { estado: 'no_permitida', motivo: 'La póliza nueva aún no consta emitida: no se tramita la baja todavía.' }
  // Guarda atómica: dos clics = una sola transición.
  const n = await db.$executeRaw`
    update anulacion set estado = 'comunicada', comunicada_at = now(), updated_at = now()
    where id = ${anulacionId}::uuid and correduria_id = ${correduriaId}::uuid and estado = 'firmada'`
  if (n === 0) return { estado: 'no_permitida', motivo: 'Ha cambiado mientras tanto: recarga.' }
  anotarCambio({ entidad: 'anulacion', id: anulacionId, campo: 'estado', antes: 'firmada', despues: 'comunicada' })
  await anotarHistorial(correduriaId, a.clienteId, a.polizaId, `Baja tramitada en el PUE de Allianz por ${quien}.`)
  return { estado: 'hecho' }
}
