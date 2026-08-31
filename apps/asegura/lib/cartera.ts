import { POLIZA_ESTADOS_VIGENTES } from '@central/module-seguros'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'

/**
 * Lecturas de la Fase 1 sobre la cartera real. Reglas que no se negocian:
 * - `correduriaId` SIEMPRE explícito en el WHERE (la BD se consulta con
 *   permisos amplios; el aislamiento es del código — ADR-013 del CRM origen).
 * - Filas fusionadas (merged_into_* != null) son lápidas: se excluyen SIEMPRE.
 * - «Vigente» es la regla de @central/module-seguros, nunca la etiqueta del
 *   enum, y el vencimiento NULL cuenta como PENDIENTE, no como vigente.
 */

export type ResumenCartera = {
  estado: 'sin_configurar' | 'error' | 'ok'
  clientes?: number
  leads?: number
  polizasVigentes?: number
  polizasPendientesFecha?: number
  polizasNoVigentes?: number
  siniestrosAbiertos?: number
}

function hoyUtc(): Date {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export async function resumenCartera(correduriaId: string): Promise<ResumenCartera> {
  if (!aseguraConfigurada()) return { estado: 'sin_configurar' }
  try {
    const db = prismaAsegura()
    const hoy = hoyUtc()
    const estadosVigentes = [...POLIZA_ESTADOS_VIGENTES]
    const basePoliza = { correduriaId, mergedIntoPolizaId: null }
    const [clientes, leads, polizasVigentes, polizasPendientesFecha, totalPolizas, siniestrosAbiertos] =
      await Promise.all([
        db.cliente.count({ where: { correduriaId, mergedIntoClienteId: null, tipo: 'cliente' } }),
        db.cliente.count({ where: { correduriaId, mergedIntoClienteId: null, tipo: 'lead' } }),
        db.poliza.count({
          where: { ...basePoliza, estado: { in: estadosVigentes }, fechaVencimiento: { gte: hoy } },
        }),
        db.poliza.count({
          where: { ...basePoliza, estado: { in: estadosVigentes }, fechaVencimiento: null },
        }),
        db.poliza.count({ where: basePoliza }),
        db.siniestro.count({ where: { correduriaId, estado: { in: ['abierto', 'en_tramitacion'] } } }),
      ])
    return {
      estado: 'ok',
      clientes,
      leads,
      polizasVigentes,
      polizasPendientesFecha,
      polizasNoVigentes: totalPolizas - polizasVigentes - polizasPendientesFecha,
      siniestrosAbiertos,
    }
  } catch {
    // Un fallo de red/credencial NO se pinta como cartera vacía (regla global).
    return { estado: 'error' }
  }
}

/** La única correduría de la base (medido: 1 fila). Lanza si hubiera más de una. */
export async function correduriaUnica(): Promise<{ id: string; nombre: string } | null> {
  if (!aseguraConfigurada()) return null
  const filas = await prismaAsegura().correduria.findMany({ select: { id: true, nombre: true }, take: 2 })
  if (filas.length > 1) throw new Error('Más de una correduría en la base: el ámbito ya no puede ser implícito')
  return filas[0] ?? null
}
