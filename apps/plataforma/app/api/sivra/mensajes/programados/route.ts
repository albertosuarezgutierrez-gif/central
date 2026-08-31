import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { pasadaMensajesProgramados } from '@/lib/sivra/mensajes-prog/orquestador'

export const dynamic = 'force-dynamic'
// 300, no 60: la pasada habla con Smoobu (listado + hilos + guest app) y puede traducir con IA;
// la lección de facturas-scan es que el techo bajo mata la pasada a mitad SIN dejar huella.
// Abajo, además, hay presupuesto de tiempo real (deadline) para volver siempre con lo hecho.
export const maxDuration = 300

// GET /api/sivra/mensajes/programados — cron cada 30 min (CRON_JOBS `7,37 * * * *`).
//
// Orquestador de los mensajes AUTOMÁTICOS del ciclo de una reserva (el sustituto de las plantillas
// de Smoobu, decidido con Alberto el 31/08/2026 sobre el inventario real de 8 hilos). Arranca en
// MODO SOMBRA: hasta que un piso no esté activo en `mensajes_prog_pisos`, ningún huésped recibe
// nada — todo va como copia a Telegram para validar el ciclo con reservas reales.
// Detalle de diseño: docs/superpowers/plans/2026-08-31-mensajes-programados-huespedes.md
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const res = await pasadaMensajesProgramados(Date.now() + 280_000)
  return NextResponse.json(res, { status: res.ok ? 200 : 500 })
}
