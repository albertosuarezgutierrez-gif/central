import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { sincronizarGoogleContactos } from '@/lib/google-contactos'
import { avisarColaGoogleContactos, type ResultadoAvisoCola } from '@/lib/aviso-cola-google-contactos-ejecutar'
import { rellenarLeadsCorreo, type InformeRelleno } from '@/lib/google-contactos-lead'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/cron/google-contactos — sincronización horaria CRM → Google Contacts (05/10/2026).
 *
 * El CRM manda: crea/actualiza los contactos del grupo «Grupo ASegura» con la selección del .vcf
 * (clientes en vigor + leads de Vencimientos). Lo editado en Google sobre un campo gestionado se
 * vuelve a pisar y queda en la cola de revisión; los contactos nuevos del grupo son propuestas de
 * lead. Sin conexión → `sin_conexion` (200, no hace nada). Sin la sincronización ACTIVADA tras
 * revisar la simulación → `pendiente_activar` (200, no escribe nada, ni la etiqueta). Clave PII
 * que no abre → no escribe.
 * Tras la sincronización, RELLENO de los leads de correo antiguos (19/10/2026): hasta 3 lotes de 10 por pasada,
 * idempotente, solo si la sincronización está activada y conectada; se calla solo al no quedar pendientes.
 * Aviso de cola atascada (21/10/2026): a las 09:xx de Madrid (una pasada al día, el cron es horario) y ANTES de sincronizar,
 * para que salga aunque la sincronización falle; UN Telegram con cifras si hay revisiones de clientes en vigor con ≥3 días.
 * Auth: `CRON_SECRET` por `Authorization: Bearer`.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    // El aviso nunca tumba el cron ni su respuesta: solo códigos y cifras (sin PII).
    let aviso: ResultadoAvisoCola | { estado: 'error' }
    try {
      aviso = await avisarColaGoogleContactos(correduria.id)
    } catch (e) {
      registrarErrorCartera('cron/google-contactos/aviso-cola', e)
      aviso = { estado: 'error' }
    }
    const inicio = Date.now()
    const r = await sincronizarGoogleContactos(correduria.id)
    // El relleno nunca tumba el cron ni su respuesta: solo códigos y cifras (sin PII).
    let relleno: InformeRelleno | { estado: 'error' } | undefined
    if (r.estado !== 'pii_no_descifra') {
      try {
        relleno = await rellenarLeadsCorreo(correduria.id, inicio)
      } catch (e) {
        registrarErrorCartera('cron/google-contactos/relleno', e)
        relleno = { estado: 'error' }
      }
    }
    return NextResponse.json({ ...r, avisoCola: aviso, ...(relleno ? { relleno } : {}) }, { status: r.estado === 'pii_no_descifra' ? 503 : 200 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('cron/google-contactos', e) }, { status: 500 })
  }
}
