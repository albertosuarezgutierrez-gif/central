// ¿La póliza de un documento ya la llevamos? (27/09/2026, asistente de Telegram).
// Alberto sube una póliza para abrir una oportunidad: si ese número ya está en la
// cartera EN VIGOR no es una oportunidad, es un cliente nuestro, y abrirla sería
// venderle lo que ya tiene. El volcado histórico no cuenta: sus pólizas son de
// leads (vencidas en 2013-2018), no nuestras.
import { claveNumeroPoliza, sqlCarteraEnVigor } from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'

export type PolizaNuestra = { polizaId: string; clienteId: string; aseguradora: string | null }


/**
 * Las pólizas EN VIGOR con ese número exacto (compactado). `[]` = mirado y no
 * está; `null` = no se ha podido mirar (sin número fiable o la BD falló): quien
 * llama NO lo pinta como «no es nuestra».
 */
export async function polizaEnCartera(correduriaId: string, numero: string | null | undefined): Promise<PolizaNuestra[] | null> {
  const clave = claveNumeroPoliza(numero)
  if (!clave) return null
  return prismaAsegura().$queryRaw<PolizaNuestra[]>(Prisma.sql`
    select p.id::text as "polizaId", p.cliente_id::text as "clienteId", p.aseguradora
    from polizas p
    join clientes cl on cl.id = p.cliente_id and cl.merged_into_cliente_id is null
    where p.correduria_id = ${correduriaId}::uuid and p.merged_into_poliza_id is null
      and ${Prisma.raw(sqlCarteraEnVigor('p'))}
      and ltrim(regexp_replace(upper(p.numero_poliza), '[^A-Z0-9]', '', 'g'), '0') = ${clave}
    limit 5`).catch(() => null)
}
