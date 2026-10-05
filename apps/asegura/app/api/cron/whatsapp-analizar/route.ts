import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { iaWhatsappActiva, whatsappActivo } from '@/lib/whatsapp/config'
import { procesarPendientes } from '@/lib/whatsapp/procesar'
import { analizarPendientes } from '@/lib/whatsapp/analizar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/cron/whatsapp-analizar — cada 15 min (`vercel.json`). Doc: apps/asegura/docs/WHATSAPP.md.
 *
 *   1. Rescate de la Fase 1 (con ASEGURA_WHATSAPP_ACTIVO=1): procesa los crudos que el `after()` del
 *      webhook no llegó a procesar (o que fallaron), sin IA.
 *   2. Fase 2 (con ASEGURA_WHATSAPP_IA_ACTIVO=1): analiza con IA las conversaciones con mensajes
 *      nuevos y ≥10 min de silencio, y ejecuta las acciones de la lista blanca. Sin el flag no se
 *      llama a la IA y se dice (`ia: 'inactiva'`), no se responde «0 analizadas».
 *
 * Auth: `CRON_SECRET` por `Authorization: Bearer`. Idempotente (reclamo por conversación).
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!whatsappActivo()) return NextResponse.json({ estado: 'inactivo' })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const rescate = await procesarPendientes(correduria.id)
    if (!iaWhatsappActiva()) return NextResponse.json({ estado: 'ok', rescate, ia: 'inactiva' })
    const analisis = await analizarPendientes(correduria.id)
    return NextResponse.json({ estado: 'ok', rescate, ia: 'activa', analisis })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('cron/whatsapp-analizar', e) }, { status: 500 })
  }
}
