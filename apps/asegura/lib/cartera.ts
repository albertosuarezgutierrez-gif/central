import {
  DIAS_HORIZONTE_RENOVACION,
  DIAS_PREAVISO_TOMADOR,
  POLIZA_ESTADOS_VIGENTES,
  diasHastaVencimiento,
  primaReferencia,
  urgenciaRenovacion,
  type UrgenciaRenovacion,
} from '@central/module-seguros'
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
  /** Vigentes que vencen dentro del mes de preaviso (LCS art. 22): la prórroga
   *  ya no se puede evitar en plazo. */
  vence30?: number
  /** Vigentes que vencen en 60 días: incluye las anteriores. */
  vence60?: number
}

/** Una póliza a renovar. SIN datos sensibles: el nombre del tomador sí (está en
 *  claro en la BD y sin él no se puede llamar a nadie), pero NUNCA DNI,
 *  teléfono, dirección ni matrícula — esos van cifrados y aquí no pintan. */
export type PolizaVencimiento = {
  id: string
  cliente: string
  tipo: string
  aseguradora: string
  numeroPoliza: string | null
  fechaVencimiento: string
  dias: number
  urgencia: UrgenciaRenovacion
  /** `null` = la compañía no ha informado la prima (pasa con Allianz por EIAC). */
  prima: number | null
  fraccionamiento: string | null
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
    const limite = (dias: number) => {
      const d = new Date(hoy)
      d.setUTCDate(d.getUTCDate() + dias)
      return d
    }
    const [
      clientes, leads, polizasVigentes, polizasPendientesFecha, totalPolizas, siniestrosAbiertos,
      vence30, vence60,
    ] =
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
        db.poliza.count({
          where: {
            ...basePoliza, estado: { in: estadosVigentes },
            fechaVencimiento: { gte: hoy, lte: limite(DIAS_PREAVISO_TOMADOR) },
          },
        }),
        db.poliza.count({
          where: {
            ...basePoliza, estado: { in: estadosVigentes },
            fechaVencimiento: { gte: hoy, lte: limite(2 * DIAS_PREAVISO_TOMADOR) },
          },
        }),
      ])
    return {
      estado: 'ok',
      clientes,
      leads,
      polizasVigentes,
      polizasPendientesFecha,
      polizasNoVigentes: totalPolizas - polizasVigentes - polizasPendientesFecha,
      siniestrosAbiertos,
      vence30,
      vence60,
    }
  } catch {
    // Un fallo de red/credencial NO se pinta como cartera vacía (regla global).
    return { estado: 'error' }
  }
}

/**
 * Pólizas vigentes que vencen dentro del horizonte, ordenadas por urgencia real
 * (la fecha, no la etiqueta del estado). Es la lista de llamadas de la semana.
 *
 * Las que tienen `fechaVencimiento` NULL NO salen aquí y eso no significa que no
 * venzan: significa que no se sabe cuándo. El resumen las cuenta aparte
 * (`polizasPendientesFecha`) para que la ausencia se vea en vez de desaparecer.
 */
export async function vencimientosProximos(
  correduriaId: string,
  dias: number = DIAS_HORIZONTE_RENOVACION,
  hoyRef: Date = hoyUtc(),
): Promise<PolizaVencimiento[]> {
  if (!aseguraConfigurada()) return []
  const db = prismaAsegura()
  const hasta = new Date(hoyRef)
  hasta.setUTCDate(hasta.getUTCDate() + dias)
  const filas = await db.poliza.findMany({
    where: {
      correduriaId,
      mergedIntoPolizaId: null,
      estado: { in: [...POLIZA_ESTADOS_VIGENTES] },
      fechaVencimiento: { gte: hoyRef, lte: hasta },
    },
    orderBy: { fechaVencimiento: 'asc' },
    select: {
      id: true, tipo: true, aseguradora: true, numeroPoliza: true, fechaVencimiento: true,
      primaAnual: true, primaBruta: true, fraccionamiento: true,
      cliente: { select: { nombre: true, apellidos: true } },
    },
  })
  return filas.map(f => {
    const vencimiento = f.fechaVencimiento as Date
    const diasRestantes = diasHastaVencimiento(vencimiento, hoyRef)
    return {
      id: f.id,
      cliente: `${f.cliente.nombre} ${f.cliente.apellidos}`.trim(),
      tipo: String(f.tipo),
      aseguradora: f.aseguradora,
      numeroPoliza: f.numeroPoliza ?? null,
      fechaVencimiento: vencimiento.toISOString().slice(0, 10),
      dias: diasRestantes,
      urgencia: urgenciaRenovacion(diasRestantes),
      prima: primaReferencia({
        primaAnual: f.primaAnual === null ? null : Number(f.primaAnual),
        primaBruta: f.primaBruta === null ? null : Number(f.primaBruta),
      }),
      fraccionamiento: f.fraccionamiento === null ? null : String(f.fraccionamiento),
    }
  })
}

/** La única correduría de la base (medido: 1 fila). Lanza si hubiera más de una. */
export async function correduriaUnica(): Promise<{ id: string; nombre: string } | null> {
  if (!aseguraConfigurada()) return null
  const filas = await prismaAsegura().correduria.findMany({ select: { id: true, nombre: true }, take: 2 })
  if (filas.length > 1) throw new Error('Más de una correduría en la base: el ámbito ya no puede ser implícito')
  return filas[0] ?? null
}
