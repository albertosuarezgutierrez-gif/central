// Banda de avisos de «Mi mesa» (13/10/2026): lee cada cola con plazo, CADA UNA con su propio try/catch.
// Lo que decide n/plazo/urgentes vive en `avisos-mesa-reglas.ts` (puro, con test). SOLO LECTURA: no se
// llama a `aprobacionesPendientes()` (retira caducadas y propone envíos: escribe) sino a una cuenta.
//
// 🚨 Una cola que no se puede leer sale `{ estado: 'error' }` («no se ha podido comprobar»), nunca n = 0.
// Aislamiento: toda tabla con `correduria_id` se filtra por él; las del portal (partes, supresiones) no lo
// tienen y se leen como ya las leen sus colas (`listarPartes`, `colaSupresiones`).

import { ORIGEN_DEVOLUCION } from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { colaQuejas } from './quejas'
import { colaSupresiones } from './supresiones'
import { colaCambiosCuenta } from './cambio-cuenta'
import { bajasPendientesPue } from './baja-pue'
import { anulacionesAbiertas } from './anulaciones'
import { colaRetencion } from './cartera-impagados'
import { eventosCorreoSinResolver } from './correo-evento-bd'
import {
  COLAS_AVISO, itemParte, recibosConRelojSinRescate, recibosSinConfirmar, resumirCola,
  type ColaAviso, type LecturaCola,
} from './avisos-mesa-reglas'

const ERROR: LecturaCola = { estado: 'error' }

async function leer(nombre: string, f: () => Promise<LecturaCola>): Promise<LecturaCola> {
  try {
    return await f()
  } catch (e) {
    console.error(`[avisos-mesa] ${nombre} no se pudo leer:`, e instanceof Error ? e.message : e)
    return ERROR
  }
}

const iso = (d: Date | null | undefined): string | null => (d instanceof Date ? d.toISOString().slice(0, 10) : null)

/** Rescates de recibo VISIBLES en la mesa (abiertos y NO aparcados) de esas pólizas. */
async function polizasConRescateVisible(correduriaId: string, polizaIds: string[], hoy: string): Promise<Set<string>> {
  if (polizaIds.length === 0) return new Set()
  const filas = await prismaAsegura().$queryRaw<{ polizaId: string }[]>(Prisma.sql`
    select distinct coalesce(o.poliza_id::text, o.info_riesgo->>'polizaId') as "polizaId"
    from oportunidades o
    where o.correduria_id = ${correduriaId}::uuid
      and o.estado::text in ('competencia', 'en_negociacion', 'pendiente_cliente')
      and (o.aparcada_hasta is null or o.aparcada_hasta <= ${hoy}::date)
      and (o.info_riesgo->>'origen' = ${ORIGEN_DEVOLUCION} or o.info_riesgo->>'motivo' = ${ORIGEN_DEVOLUCION})
      and (o.poliza_id::text = any(${polizaIds}::text[]) or o.info_riesgo->>'polizaId' = any(${polizaIds}::text[]))`)
  return new Set(filas.map((f) => f.polizaId).filter(Boolean))
}

export type AvisosMesa = { hoy: string; colas: Record<ColaAviso, LecturaCola> }

export async function avisosMesa(
  correduriaId: string,
  hoy: string = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }),
): Promise<AvisosMesa> {
  const db = prismaAsegura()

  // Los recibos se leen una vez y alimentan dos colas: si la lectura falla, las DOS dicen «no se pudo».
  const recibos = colaRetencion(correduriaId).then(
    async (c) => {
      const filas = c.filas.map((f) => ({ polizaId: f.polizaId, estado: String(f.estado), fechaRecibo: f.fechaRecibo, dias: f.dias }))
      const visibles = await polizasConRescateVisible(correduriaId, [...new Set(filas.map((f) => f.polizaId))], hoy)
      return { filas, visibles }
    },
  )

  const [partes, supresiones, quejas, cambios, recLcs, aprob, pue, anul, recSin, correos] = await Promise.all([
    leer('partes', async () => {
      // «Sin atender» = `enviado` (nadie lo ha mirado): la misma regla que `partesSinAtender` de plataforma.
      const filas = await db.portalParteSiniestro.findMany({ where: { estado: 'enviado' }, select: { fechaHecho: true }, take: 500 })
      return resumirCola(filas.map((f) => itemParte(iso(f.fechaHecho))), hoy)
    }),
    leer('supresiones', async () => {
      const r = await colaSupresiones(false)
      if (r.estado !== 'ok') return ERROR
      return resumirCola(r.solicitudes.map((s) => ({ plazo: iso(s.fechaLimite), urgente: s.plazo === 'urgente' || s.plazo === 'vencido' })), hoy)
    }),
    leer('quejas', async () => {
      const r = await colaQuejas(correduriaId, false)
      if (r.estado !== 'ok') return ERROR
      const abiertas = r.quejas.filter((q) => q.plazo !== 'cerrada')
      return resumirCola(abiertas.map((q) => ({ plazo: q.plazoEl, urgente: q.plazo === 'urgente' || q.plazo === 'vencida' })), hoy)
    }),
    leer('cambios_cuenta', async () => {
      // Sin plazo legal, pero el siguiente recibo se carga en la cuenta vieja: va a la banda.
      const r = await colaCambiosCuenta(correduriaId)
      return resumirCola(r.filter((s) => s.estado === 'pendiente').map(() => ({ plazo: null })), hoy)
    }),
    leer('recibos_lcs', async () => {
      const { filas, visibles } = await recibos
      return resumirCola(recibosConRelojSinRescate(filas, visibles), hoy)
    }),
    leer('aprobaciones', async () => {
      // Cuenta de SOLO LECTURA (las caducadas aún sin retirar no se cuentan: las dice la red diaria).
      const filas = await db.$queryRaw<{ caduca: Date | null; urgente: boolean }[]>(Prisma.sql`
        select a.caduca_at as caduca, a.urgente from aprobacion a
        where a.correduria_id = ${correduriaId}::uuid and a.estado = 'pendiente' and a.caduca_at > now()`)
      return resumirCola(filas.map((f) => ({ plazo: iso(f.caduca), urgente: f.urgente })), hoy)
    }),
    leer('bajas_pue', async () => {
      // Las que esperan a que se emita la nueva no se tramitan todavía: no son trabajo de hoy.
      const r = await bajasPendientesPue(correduriaId)
      return resumirCola(r.filter((b) => !b.esperaEmision).map(() => ({ plazo: null, urgente: true })), hoy)
    }),
    leer('anulaciones', async () => {
      const r = await anulacionesAbiertas(correduriaId)
      return resumirCola(r.filter((a) => a.siguiente?.alerta === true).map((a) => ({ plazo: a.fechaEfecto })), hoy)
    }),
    leer('recibos_sin_confirmar', async () => {
      const { filas } = await recibos
      return resumirCola(recibosSinConfirmar(filas), hoy)
    }),
    leer('correos_compania_sin_resolver', async () => {
      // Avisos de compañías leídos del correo cuya póliza no se encontró (o quedaron a medias): NO se
      // escribió nada en la cartera y la única señal es esta. Sin la tabla (SQL 2026-10-14 sin aplicar)
      // la lectura falla y la cola sale «no se ha podido comprobar», nunca 0.
      const filas = await eventosCorreoSinResolver(correduriaId)
      return resumirCola(filas.map((f) => ({ plazo: f.plazo })), hoy)
    }),
  ])

  const colas = { partes, supresiones, quejas, cambios_cuenta: cambios, recibos_lcs: recLcs, aprobaciones: aprob, bajas_pue: pue, anulaciones: anul, recibos_sin_confirmar: recSin, correos_compania_sin_resolver: correos }
  // Red: si alguien añade una cola a COLAS_AVISO y no la lee aquí, sale como «no se pudo comprobar».
  for (const k of COLAS_AVISO) if (!colas[k]) (colas as Record<ColaAviso, LecturaCola>)[k] = ERROR
  return { hoy, colas }
}
