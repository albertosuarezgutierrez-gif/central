// /api/cron/cima-liq — Descarga LIQ de CIMA, las guarda en BD y cruza con BBVA.
// Si hay descuadre entre lo que dice CIMA y lo ingresado en BBVA, avisa por Telegram.
// Auth: Bearer CRON_SECRET (o ?secret= para disparo manual).
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { descargarLiquidaciones } from '@/lib/cima'
import { eur } from '@/lib/dinero'
import { tgSend } from '@central/core-telegram'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

const UMBRAL_DESCUADRE_EUR = 5   // alertar si diferencia > 5 €
const VENTANA_DIAS         = 45  // buscar cobros BBVA en ±45 días del cierre del periodo

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth   = req.headers.get('authorization')
  const ok     = (!!secret && auth === `Bearer ${secret}`)
               || (!!secret && req.nextUrl.searchParams.get('secret') === secret)
  if (!ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Integración CIMA apagada por defecto: el endpoint WSE aún no está confirmado
  // (devuelve 404) y este cron corre a diario → alertaba 🔴 cada mañana. Se activa
  // poniendo CIMA_WSE_ENABLED=true en Vercel cuando la ruta del web service esté validada.
  if (process.env.CIMA_WSE_ENABLED !== 'true') {
    return NextResponse.json({ ok: true, msg: 'CIMA deshabilitado (CIMA_WSE_ENABLED != true)' })
  }

  // Cuenta de Alberto (única por ahora)
  const cuenta = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM cuentas LIMIT 1`
  if (!cuenta.length) return NextResponse.json({ ok: true, msg: 'Sin cuentas' })
  const cuentaId = cuenta[0].id

  // 1. Descargar LIQ de CIMA
  let ficheros
  try {
    ficheros = await descargarLiquidaciones()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    await tgSend(`🔴 <b>CIMA LIQ</b>\nError al conectar con CIMA:\n<code>${msg.slice(0, 300)}</code>`)
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }

  if (!ficheros.length) {
    return NextResponse.json({ ok: true, msg: 'Sin ficheros LIQ pendientes en CIMA' })
  }

  const descuadres: string[] = []
  let guardados = 0

  for (const f of ficheros) {
    // 2. Guardar en BD (upsert por nombre de fichero)
    await prisma.$executeRaw`
      INSERT INTO cima_liquidaciones
        (cuenta_id, compania, periodo, nombre_fichero, importe_bruto, importe_neto, fecha_fichero, raw_cabecera)
      VALUES
        (${cuentaId}::uuid, ${f.compania}, ${f.periodo}, ${f.nombreFichero},
         ${f.importeBruto}, ${f.importeNeto},
         ${f.fechaFichero ? new Date(f.fechaFichero) : null},
         ${f.rawCabecera})
      ON CONFLICT (cuenta_id, nombre_fichero) DO NOTHING`
    guardados++

    // 3. Cruzar con BBVA: buscar cobros de esa compañía en la ventana del periodo
    const [anio, mes] = f.periodo.split('-').map(Number)
    const periodoInicio = new Date(anio, mes - 1, 1)
    const periodoFin    = new Date(anio, mes, VENTANA_DIAS)   // hasta 45 días después del cierre del mes

    const cobros = await prisma.$queryRaw<Array<{ total: number }>>`
      SELECT COALESCE(SUM(mb.importe), 0)::float AS total
      FROM v_movimientos_activos mb
      WHERE mb.destino = 'seguros'
        AND (mb.compania_seguros = ${f.compania}
             OR (mb.compania_seguros IS NULL
                 AND upper(mb.concepto) LIKE ${'%' + f.compania.toUpperCase() + '%'}))
        AND mb.fecha_operacion >= ${periodoInicio}
        AND mb.fecha_operacion <= ${periodoFin}`

    const cobradoBBVA = cobros[0]?.total ?? 0
    const diff = Math.abs(f.importeNeto - cobradoBBVA)

    if (diff > UMBRAL_DESCUADRE_EUR) {
      descuadres.push(
        `• <b>${f.compania}</b> ${f.periodo}\n` +
        `  CIMA dice: <b>${fmt(f.importeNeto)}</b> | BBVA: <b>${fmt(cobradoBBVA)}</b> | Δ <b>${fmt(diff)}</b>`
      )
    }
  }

  // 4. Telegram: resumen siempre + alerta si hay descuadres
  const resumen = ficheros.map(f => `• ${f.compania} ${f.periodo}: ${fmt(f.importeNeto)}`).join('\n')

  if (descuadres.length) {
    await tgSend(
      `🟡 <b>CIMA · Descuadre comisiones</b>\n\n` +
      `${descuadres.join('\n\n')}\n\n` +
      `Revisa en <b>/correduria</b>.`
    )
  } else {
    await tgSend(
      `✅ <b>CIMA LIQ</b> — ${ficheros.length} fichero(s) cuadran con BBVA\n${resumen}`
    )
  }

  return NextResponse.json({ ok: true, guardados, descuadres: descuadres.length })
}

function fmt(n: number): string {
  return eur(n)
}
