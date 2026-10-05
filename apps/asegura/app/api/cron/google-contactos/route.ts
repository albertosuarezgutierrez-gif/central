import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { sincronizarGoogleContactos } from '@/lib/google-contactos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/cron/google-contactos — sincronización horaria CRM → Google Contacts (05/10/2026).
 *
 * El CRM manda: crea/actualiza los contactos del grupo «Grupo ASegura» con la selección del .vcf
 * (clientes en vigor + leads de Vencimientos). Lo editado en Google sobre un campo gestionado se
 * vuelve a pisar y queda en la cola de revisión; los contactos nuevos del grupo son propuestas de
 * lead. Sin conexión → `sin_conexion` (200, no hace nada). Clave PII que no abre → no escribe.
 * Auth: `CRON_SECRET` por `Authorization: Bearer`.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const r = await sincronizarGoogleContactos(correduria.id)
    return NextResponse.json(r, { status: r.estado === 'pii_no_descifra' ? 503 : 200 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('cron/google-contactos', e) }, { status: 500 })
  }
}
