/**
 * Invitación al portal POR LOTES: el censo (quién es invitable en la cartera en
 * vigor) y el envío. La regla de a quién se escribe vive, pura y con su cepo,
 * en `lote-invitacion.ts`; aquí solo se lee la BD y se llama, uno a uno, al
 * MISMO `invitarAlPortal` que usa el botón de la ficha — que vuelve a comprobar
 * cada ficha antes de escribir.
 */
import { Prisma } from '@prisma/client'
import { sqlCarteraEnVigor } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { estadoPortalDeFicha, invitarAlPortal, nombreDe, PREFIJO_INVITACION_ANOTADA } from './invitacion-portal'
import { cuerpoInvitacionPortal, enlacePortal } from './correo-invitacion-portal'
import { decidirLote, paraElLote, rachaDeFallos, MAX_POR_LOTE, SEGUNDOS_PRESUPUESTO, type DecisionLote, type FichaCenso } from './lote-invitacion'

export type CensoPortal = {
  /** Clientes con ≥1 póliza en vigor (`esCarteraEnVigor`). */
  total: number
  decision: DecisionLote
  /** A quién se escribiría, con su nombre para que Alberto lo vea antes. Sin correos. */
  destinatarios: Array<{ clienteId: string; nombre: string | null }>
  /** El correo tal cual saldría (con un saludo sin nombre). `null` = no hay portal configurado. */
  muestra: { asunto: string; texto: string } | null
}

async function clientesEnVigor(correduriaId: string): Promise<Array<{ id: string; invitado_hace_dias: number | null }>> {
  return prismaAsegura().$queryRaw<Array<{ id: string; invitado_hace_dias: number | null }>>(Prisma.sql`
    select c.id::text as id,
      (select floor(extract(epoch from (now() - max(h.created_at))) / 86400)::int
         from historial_interno h
        where h.cliente_id = c.id and h.correduria_id = c.correduria_id and h.deleted_at is null
          and h.texto like ${PREFIJO_INVITACION_ANOTADA + '%'}) as invitado_hace_dias
    from clientes c
    where c.correduria_id = ${correduriaId}::uuid
      and c.merged_into_cliente_id is null
      and c.activo = true
      and exists (
        select 1 from polizas p
        where p.cliente_id = c.id and p.correduria_id = c.correduria_id
          and p.merged_into_poliza_id is null
          and ${Prisma.raw(sqlCarteraEnVigor('p'))}
      )
    order by c.id`)
}

export async function censoPortal(correduriaId: string): Promise<CensoPortal> {
  const clientes = await clientesEnVigor(correduriaId)
  const fichas: FichaCenso[] = []
  // Secuencial a propósito: cada ficha descifra su correo y consulta el índice;
  // son decenas, no miles, y así no se abre una ráfaga de conexiones al pooler.
  for (const c of clientes) {
    const portal = await estadoPortalDeFicha(correduriaId, c.id)
    fichas.push({ clienteId: c.id, estado: portal?.estado ?? 'no_comprobado', invitadoHaceDias: c.invitado_hace_dias })
  }
  const decision = decidirLote(fichas)
  const destinatarios = []
  for (const id of decision.enviar) destinatarios.push({ clienteId: id, nombre: await nombreDe(correduriaId, id) })
  const enlace = enlacePortal()
  const muestra = enlace ? cuerpoInvitacionPortal({ nombre: null, enlace, yaEntraba: false }) : null
  return {
    total: clientes.length,
    decision,
    destinatarios,
    muestra: muestra ? { asunto: muestra.asunto, texto: muestra.texto } : null,
  }
}

export type ResultadoLote = {
  enviados: number
  fallidos: Array<{ clienteId: string; nombre: string | null; estado: string; motivo: string }>
  /** Si el lote se cortó (fallo de instalación o racha de fallos iguales), con qué estado. */
  parado: string | null
  /** Ids que no se llegaron a intentar (por el corte o por el tope). */
  sinIntentar: number
  /** Ids pedidos que el censo de ahora ya no da como enviables (entró, se le invitó…). */
  descartados: number
}

/**
 * 🚨 Solo envía a ids que el censo de AHORA vuelve a dar como enviables: la
 * lista que manda la pantalla es la que Alberto vio, no una autorización para
 * escribir a cualquier id que llegue en el cuerpo.
 */
export async function invitarLote(
  correduriaId: string,
  entrada: { clienteIds: string[]; actor: string },
): Promise<ResultadoLote> {
  const inicio = Date.now()
  const censo = await censoPortal(correduriaId)
  const permitidos = new Set(censo.decision.enviar)
  const unicos = [...new Set(entrada.clienteIds)]
  const pedidos = unicos.filter((id) => permitidos.has(id))
  const lote = pedidos.slice(0, MAX_POR_LOTE)
  let enviados = 0
  const fallidos: ResultadoLote['fallidos'] = []
  let parado: string | null = null
  let intentados = 0
  /** `null` = enviado. Para cortar una racha de fallos idénticos. */
  const historia: Array<string | null> = []
  for (const clienteId of lote) {
    if ((Date.now() - inicio) / 1000 > SEGUNDOS_PRESUPUESTO) break
    intentados++
    const r = await invitarAlPortal(correduriaId, { clienteId, actor: entrada.actor })
    if (r.ok) {
      enviados++
      historia.push(null)
      continue
    }
    fallidos.push({ clienteId, nombre: await nombreDe(correduriaId, clienteId), estado: r.estado, motivo: r.motivo })
    historia.push(r.estado)
    if (paraElLote(r.estado) || rachaDeFallos(historia)) {
      parado = r.estado
      break
    }
  }
  return { enviados, fallidos, parado, sinIntentar: pedidos.length - intentados, descartados: unicos.length - pedidos.length }
}
