// lib/sivra/factura-cuadre-correo.ts — borde sucio del cuadre de la factura de Sique Brilla.
//
// Lo llama el triaje de correo (`lib/correo/triaje.ts`) cuando llega un correo de
// limpiezascruzz@gmail.com con asunto de factura: PDF → texto por filas → cuadre puro
// (`factura-cuadre.ts`) → `limpieza_facturas` (si es guardable) → aviso de Telegram.
// Toda la decisión vive en el helper puro; aquí solo hay SQL, el guardado y Telegram.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { tgAviso } from '@/lib/telegram'
import { eur } from '@/lib/dinero'
import { textoPdfPorFilas } from '@/lib/correo/pdf-filas'
import { guardarFactura, PROVEEDOR_LIMPIEZA } from './factura-limpieza-lectura'
import { LIMPIEZA_TARIFAS } from './pl-mensual'
import {
  PISOS_FACTURADOS,
  cuadrarFactura,
  esGuardable,
  limitesDelPeriodo,
  mensajeCuadre,
  parsearFacturaSique,
  periodoFacturado,
  type ResultadoCuadre,
  type Salida,
  type SinSalida,
} from './factura-cuadre'

/**
 * Salidas (checkouts) del mes de servicio de reservas NO canceladas, en fecha civil de Madrid.
 * Excluye lo que figure en `reservas_canceladas` (por si una cancelación tardía sigue en `incomes`).
 */
export async function salidasDelPeriodo(periodo: string): Promise<Salida[]> {
  const { desde, hasta } = limitesDelPeriodo(periodo)
  const filas = await prisma.$queryRaw<Array<{ pid: string; fecha: string }>>(Prisma.sql`
    SELECT i."propertyId" AS pid, (i."checkOut" AT TIME ZONE 'Europe/Madrid')::date::text AS fecha
    FROM incomes i
    WHERE i."propertyId" IN (${Prisma.join(PISOS_FACTURADOS)})
      AND (i."checkOut" AT TIME ZONE 'Europe/Madrid')::date >= ${desde}::date
      AND (i."checkOut" AT TIME ZONE 'Europe/Madrid')::date <  ${hasta}::date
      AND NOT EXISTS (
        SELECT 1 FROM reservas_canceladas rc
        WHERE rc.reservation_id = i."reservationId" AND i."reservationId" IS NOT NULL
      )
  `)
  return filas.map((f) => ({ propertyId: f.pid, fecha: f.fecha }))
}

/**
 * Reservas NO canceladas sin `checkOut` cuyo `checkIn` cae antes del fin del mes facturado: podrían
 * haber salido ese mes y no se sabe. Se cuentan para que el cuadre no pueda ser un ✅ limpio.
 */
export async function reservasSinSalida(periodo: string): Promise<SinSalida[]> {
  const { hasta } = limitesDelPeriodo(periodo)
  const filas = await prisma.$queryRaw<Array<{ pid: string }>>(Prisma.sql`
    SELECT i."propertyId" AS pid
    FROM incomes i
    WHERE i."propertyId" IN (${Prisma.join(PISOS_FACTURADOS)})
      AND i."checkOut" IS NULL
      AND (i."checkIn" AT TIME ZONE 'Europe/Madrid')::date < ${hasta}::date
      AND NOT EXISTS (
        SELECT 1 FROM reservas_canceladas rc
        WHERE rc.reservation_id = i."reservationId" AND i."reservationId" IS NOT NULL
      )
  `)
  return filas.map((f) => ({ propertyId: f.pid }))
}

/** Cuenta dueña de las facturas: la de las ya guardadas (o `SIVRA_CUENTA_ID`). Sin sesión en un cron. */
async function cuentaDeFacturas(): Promise<string | null> {
  const filas = await prisma.$queryRaw<Array<{ cuenta_id: string }>>(Prisma.sql`
    SELECT cuenta_id FROM limpieza_facturas
    WHERE proveedor = ${PROVEEDOR_LIMPIEZA} ORDER BY creada_at DESC LIMIT 1
  `)
  return filas[0]?.cuenta_id ?? process.env.SIVRA_CUENTA_ID ?? null
}

export interface SalidaProcesoFactura {
  resultado: ResultadoCuadre
  guardada: boolean
  avisado: boolean
}

/**
 * Procesa el correo de la factura. Idempotente por nº de factura (guardarFactura hace upsert).
 * Nunca lanza por un PDF ilegible: avisa «no he podido leer la factura».
 */
export async function procesarCorreoFacturaSique(correo: {
  subject: string
  fecha: Date
  pdfs?: Buffer[]
}): Promise<SalidaProcesoFactura> {
  let leida = null
  for (const pdf of correo.pdfs ?? []) {
    leida = parsearFacturaSique(await textoPdfPorFilas(pdf))
    if (leida) break
  }
  const periodo = leida
    ? periodoFacturado(correo.subject, leida.fecha)
    : periodoFacturado(correo.subject, correo.fecha.toISOString().slice(0, 10))

  let resultado: ResultadoCuadre
  let nota = ''
  try {
    const salidas = leida ? await salidasDelPeriodo(periodo) : []
    const sinSalida = leida ? await reservasSinSalida(periodo) : []
    resultado = cuadrarFactura(leida, periodo, salidas, sinSalida)
  } catch (e) {
    // Sin poder leer las salidas NO se afirma «cuadra»: se avisa de que no se ha podido cuadrar.
    console.error('[factura-sique] salidas', e instanceof Error ? e.message : 'error')
    const enviado = await tgAviso(
      'facturas.siquebrilla-cuadre',
      `⚠️ He leído la factura de Sique Brilla${leida ? ` (nº ${leida.numero}, ${eur(leida.total)})` : ''} pero no he podido cuadrarla con las salidas del mes. Revísala a mano.`,
    ).catch(() => null)
    return { resultado: cuadrarFactura(null, periodo, []), guardada: false, avisado: enviado !== null }
  }

  let guardada = false
  if (resultado.leida && esGuardable(resultado)) {
    try {
      const cuentaId = await cuentaDeFacturas()
      if (cuentaId) {
        const f = resultado.leida
        const limpieza = f.lineas.filter((l) => l.tipo === 'limpieza').map((l) => ({
          propertyId: l.propertyId as string, sesiones: l.unidades, tarifa: l.precio, importe: l.total,
        }))
        const lavanderia = f.lineas.filter((l) => l.tipo === 'lavanderia').reduce((s, l) => s + l.total, 0)
        // Avisos como los del validador: tarifa distinta de la contratada.
        const avisos = limpieza
          .filter((l) => LIMPIEZA_TARIFAS[l.propertyId] != null && Math.abs(LIMPIEZA_TARIFAS[l.propertyId] - l.tarifa) > 0.001)
          .map((l) => `Tarifa distinta de la contratada en ${l.propertyId}: factura ${l.tarifa}€, contratada ${LIMPIEZA_TARIFAS[l.propertyId]}€`)
        await guardarFactura(cuentaId, {
          numero: f.numero, periodo, fecha: f.fecha, total: f.total, base: f.base, iva: f.iva,
          limpieza, lavanderia: Math.round(lavanderia * 100) / 100,
        }, 'correo_pdf', avisos)
        guardada = true
      } else {
        nota += '\n(No la he guardado: no sé a qué cuenta pertenece.)'
      }
    } catch (e) {
      console.error('[factura-sique] guardar', e instanceof Error ? e.message : 'error')
      nota += '\n(No he podido guardarla en la BD.)'
    }
  } else if (resultado.leida) {
    nota += '\n(No la he guardado en la BD: la aritmética o las líneas no son fiables.)'
  }

  const enviado = await tgAviso('facturas.siquebrilla-cuadre', mensajeCuadre(resultado) + nota)
  return { resultado, guardada, avisado: enviado !== null }
}
