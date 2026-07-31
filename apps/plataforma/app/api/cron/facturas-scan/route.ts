// Cron: escanea Gmail en busca de nuevas facturas de proveedores,
// verifica pagos en curso con Enable Banking y auto-concilia con el extracto bancario.
// Programado en vercel.json: "15 6 * * *" (06:15 diario, tras psd2-sync 06:00).
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { escanearNuevasFacturas, verificarPagosPendientes, conciliarConBanco, alertarFacturasAusentes } from '@/lib/agente-facturas/pagos'
import { resolverCuentaBuzon } from '@/lib/agente-facturas/cuenta-buzon'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'

export const dynamic = 'force-dynamic'
// 🚨 60 s no daban: el 31/07/2026 esta ruta llevaba 3 de sus últimas 4 pasadas en 504
// («Task timed out after 60 seconds»), muriendo a mitad del escaneo — con facturas ya
// insertadas, pero SIN llegar nunca a `registrarLatido`. Por eso el vigía informaba de
// «sin ninguna señal registrada» de un agente que en realidad sí corría todos los días.
// 300 s es el estándar de la casa para crons pesados y cabe en los 280 s que espera el
// dispatcher (`app/api/cron/dispatch/route.ts`). El techo NO sustituye al presupuesto de
// abajo: subir el límite solo mueve la pared de sitio.
export const maxDuration = 300

/** El escaneo (IMAP + OCR + IA por adjunto) devuelve el control como muy tarde aquí. */
const PRESUPUESTO_ESCANEO_MS = 180_000
/** A partir de aquí no se arranca ningún paso nuevo: la respuesta tiene que salir. */
const PRESUPUESTO_TOTAL_MS = 250_000

function isCronAuthorized(req: Request): boolean {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const qs = new URL(req.url).searchParams.get('secret')
  const secret = process.env.CRON_SECRET
  return !!secret && (bearer === secret || qs === secret)
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const t0 = Date.now()
  // Huella de INTENTO, antes de tocar nada. Si la función muere a mitad (timeout,
  // OOM, un throw en cualquier paso), esta fila es lo único que distingue «el cron
  // no se dispara» de «se dispara y no termina» — y son averías distintas. No toca
  // `ultimo_ok_at`: sigue siendo un latido de agente enfermo, no una pasada buena.
  await registrarLatido('facturas_gmail', false, 'pasada en curso — aún sin completar')

  // Cuentas reales (se excluyen las de prueba `[seed-demo]`: no tienen Gmail ni banca propios y solo
  // generarían ruido). La tabla `cuentas` no tiene columna de estado → el marcador es el nombre.
  const cuentas = await prisma.$queryRaw<{ id: string; email: string | null; nombre: string }[]>(
    Prisma.sql`SELECT id, email, nombre FROM cuentas WHERE nombre NOT ILIKE '%[seed-demo]%'`
  )

  let totalNuevas = 0
  let totalConfirmados = 0
  let totalConciliados = 0
  let totalAlertas = 0

  // Escaneo de Gmail: SOLO la cuenta dueña del buzón (evita duplicar las facturas en otros tenants).
  const cuentaBuzon = resolverCuentaBuzon(
    cuentas.map(c => ({ id: c.id, email: c.email, esDemo: /\[seed-demo\]/i.test(c.nombre) })),
    { facturaCuentaId: process.env.FACTURAS_CUENTA_ID, gmailUser: process.env.GMAIL_USER },
  )
  // 🚨 El escaneo deja SIEMPRE su huella en `agente_latidos`, corra bien o mal:
  // es lo único que distingue «no llegó ninguna factura» de «el buzón lleva
  // semanas inaccesible». Sin ella, un IMAP muerto devolvía 0 y el chat
  // afirmaba «no tienes facturas pendientes 🎉» indefinidamente.
  let escaneoOk: boolean | null = null
  let escaneoError: string | null = null
  let pendientes = 0
  if (cuentaBuzon) {
    try {
      const r = await escanearNuevasFacturas(cuentaBuzon, { deadline: t0 + PRESUPUESTO_ESCANEO_MS })
      totalNuevas += r.nuevas
      escaneoOk = r.ok
      escaneoError = r.error
      pendientes = r.pendientes
    } catch (e: any) {
      escaneoOk = false
      escaneoError = String(e?.message ?? e).slice(0, 200)
    }
  } else {
    // Sin buzón resuelto tampoco se ha mirado nada: no es una pasada buena.
    escaneoOk = false
    escaneoError = 'no se ha podido resolver la cuenta dueña del buzón (GMAIL_USER / FACTURAS_CUENTA_ID)'
  }
  // El latido definitivo se escribe AQUÍ, en cuanto se sabe cómo fue el escaneo, y no
  // al final de la ruta: lo que se vigila es el buzón, así que no puede depender de que
  // la conciliación bancaria de después llegue a terminar.
  await registrarLatido(
    'facturas_gmail',
    escaneoOk === true,
    escaneoOk
      ? `${totalNuevas} factura(s) nueva(s)` +
        (pendientes > 0 ? ` · ${pendientes} correo(s) sin mirar por presupuesto de tiempo` : '')
      : escaneoError,
  )

  // Los pasos de abajo solo arrancan si queda presupuesto: agotarlo aquí devolvería
  // un 504 y dejaría la conciliación a medias sin que nadie lo supiera.
  const quedaTiempo = () => Date.now() - t0 < PRESUPUESTO_TOTAL_MS
  let truncado = false

  // Verificación de pagos en curso (global, sin cuentaId): una sola pasada.
  if (quedaTiempo()) {
    try { totalConfirmados += await verificarPagosPendientes() } catch { /* continuar */ }
  } else truncado = true

  // Conciliación con banco y alertas de justificantes: por cada cuenta real (usan su propia banca).
  for (const cuenta of cuentas) {
    if (!quedaTiempo()) { truncado = true; break }
    try { totalConciliados += await conciliarConBanco(cuenta.id) } catch { /* continuar */ }
    try { totalAlertas += await alertarFacturasAusentes(cuenta.id) } catch { /* continuar */ }
  }

  // `escaneo` va aparte de `nuevas`: un 0 con `escaneo:false` no es «no había
  // facturas», es «no se pudo mirar el buzón».
  return NextResponse.json({
    ok: true,
    escaneo: { ok: escaneoOk, error: escaneoError, pendientes },
    truncado,
    ms: Date.now() - t0,
    nuevas: totalNuevas, confirmados: totalConfirmados, conciliados: totalConciliados, alertas: totalAlertas,
  })
}
