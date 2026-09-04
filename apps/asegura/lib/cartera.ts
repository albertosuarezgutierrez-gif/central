import {
  DIAS_HORIZONTE_RENOVACION,
  DIAS_PREAVISO_TOMADOR,
  POLIZA_ESTADOS_VIGENTES,
  diasHastaVencimiento,
  objetoAsegurado,
  primaReferencia,
  urgenciaRenovacion,
  type ObjetoAsegurado,
  type UrgenciaRenovacion,
} from '@central/module-seguros'
import { decryptField } from '@central/module-seguros-pii'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'
import { registrarErrorCartera, type CausaErrorCartera } from './error-cartera'

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
  /** Solo con `estado: 'error'`: por qué no se pudo leer (cada causa se arregla en un sitio). */
  causa?: CausaErrorCartera
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

/**
 * Una póliza a renovar. El criterio de qué sale de aquí es «lo que hace falta
 * para llamar al cliente y saber de qué póliza le hablas», no «todo lo que hay
 * en la fila»:
 *
 * - Sale el nombre del tomador (en claro en la BD; sin él no se llama a nadie)
 *   y el **objeto asegurado** ya derivado — vehículo y matrícula, localidad del
 *   inmueble, modalidades de la RC. Sin eso, un tomador con tres pólizas de
 *   auto es indistinguible.
 * - NO sale NUNCA `datos_especificos` en bruto: ahí conviven campos cifrados
 *   (la dirección del riesgo, `v1:iv:cipher:tag`) y ruido de la ingesta. Solo
 *   viaja el resumen que produce `objetoAsegurado`.
 * - NO salen DNI, teléfono, email ni IBAN — van cifrados y aquí no pintan.
 *
 * La matrícula SÍ es dato personal: este puerto está detrás de Bearer y solo lo
 * consume el cuadro de mando de Alberto. No se vuelca a informes ni a chats.
 */
export type PolizaVencimiento = {
  id: string
  /** El id del TOMADOR, no el de la póliza. Es lo que convierte el nombre de la
   *  lista en un enlace a su ficha: sin esto, «Jose Suárez» es texto muerto y
   *  hay que volver a buscarlo a mano. */
  clienteId: string
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
  /** Qué asegura la póliza, ya derivado y con su propio estado (conocido /
   *  no informado / cifrado / sin objeto). Nunca es una cadena vacía. */
  objeto: ObjetoAsegurado
}

/**
 * Ramos cuyo objeto NO vive en `datos_especificos`: una RC o un comercio se
 * describen por las coberturas contratadas. Se consultan solo para esos, que
 * son pocos — un auto trae 25 coberturas que no dicen nada del vehículo.
 */
const RAMOS_DESCRITOS_POR_COBERTURAS = ['responsabilidad_civil', 'comercio', 'otros'] as const

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
        // Las fichas DESCARTADAS (`activo = false`) no se cuentan: si contaran,
        // el titular seguiría diciendo «80 clientes» después de quitar una de
        // la vista, y el número no cuadraría con la lista que hay debajo.
        db.cliente.count({ where: { correduriaId, mergedIntoClienteId: null, activo: true, tipo: 'cliente' } }),
        db.cliente.count({ where: { correduriaId, mergedIntoClienteId: null, activo: true, tipo: 'lead' } }),
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
  } catch (e) {
    // Un fallo de red/credencial NO se pinta como cartera vacía (regla global),
    // y su causa se registra y viaja: sin esto la pantalla solo sabía decir «no pudo leer».
    return { estado: 'error', causa: registrarErrorCartera('resumenCartera', e) }
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
      // Una ficha descartada no genera llamadas de renovación. (Hoy no puede
      // haber ninguna aquí —no se descarta lo que tiene pólizas vivas—, pero
      // «vigente con fecha futura» no es exactamente «cartera viva», así que el
      // filtro se pone donde se lee, no se deduce.)
      cliente: { activo: true },
    },
    orderBy: { fechaVencimiento: 'asc' },
    select: {
      id: true, tipo: true, aseguradora: true, numeroPoliza: true, fechaVencimiento: true,
      primaAnual: true, primaBruta: true, fraccionamiento: true, datosEspecificos: true,
      cliente: { select: { id: true, nombre: true, apellidos: true } },
    },
  })

  // Coberturas SOLO de los ramos que las necesitan para identificarse.
  const idsPorCoberturas = filas
    .filter(f => (RAMOS_DESCRITOS_POR_COBERTURAS as readonly string[]).includes(String(f.tipo)))
    .map(f => f.id)
  const coberturasPorPoliza = new Map<string, string[]>()
  if (idsPorCoberturas.length > 0) {
    const cobs = await db.polizaCobertura.findMany({
      where: { correduriaId, polizaId: { in: idsPorCoberturas } },
      select: { polizaId: true, descripcion: true },
      orderBy: { numeroOrden: 'asc' },
    })
    for (const c of cobs) {
      if (!c.descripcion) continue
      const lista = coberturasPorPoliza.get(c.polizaId) ?? []
      lista.push(c.descripcion)
      coberturasPorPoliza.set(c.polizaId, lista)
    }
  }

  return filas.map(f => {
    const vencimiento = f.fechaVencimiento as Date
    const diasRestantes = diasHastaVencimiento(vencimiento, hoyRef)
    return {
      id: f.id,
      clienteId: f.cliente.id,
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
      objeto: objetoAsegurado({
        tipo: String(f.tipo),
        datos: descifrarDireccion(f.datosEspecificos),
        coberturas: coberturasPorPoliza.get(f.id) ?? null,
      }),
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

/** `datos_especificos` es JSON libre: puede llegar como array, número o null.
 *  Solo se mira si de verdad es un objeto. */
function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * La dirección del riesgo (hogar) viaja CIFRADA en `datos_especificos`
 * (`v1:iv:cipher:tag`). Se intenta descifrar con la clave del propio proyecto:
 *
 * - con `PII_ENCRYPTION_KEY` puesta → sale la calle en claro;
 * - sin clave, o con una clave que no abre ese registro → `objetoAsegurado`
 *   verá el `v1:` intacto y lo dirá como **«cifrado»**, que NO es «sin dato».
 *
 * Lo que no puede pasar nunca es que un fallo de descifrado se convierta en un
 * hueco silencioso: por eso el `catch` deja el valor tal cual en vez de borrarlo.
 */
function descifrarDireccion(datos: unknown): Record<string, unknown> | null {
  if (!esObjetoPlano(datos)) return null
  const direccion = datos.direccion
  if (typeof direccion !== 'string' || !direccion.startsWith('v1:')) return datos
  try {
    return { ...datos, direccion: decryptField(direccion) }
  } catch {
    return datos
  }
}
