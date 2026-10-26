import { NextResponse } from 'next/server'
import { tgSend } from '@central/core-telegram'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { prisma } from '@/lib/tenant'
import { ejecutarPurgaRgpd, purgaRgpdActiva } from '@/lib/purga-rgpd'
import { limpiarBorradoresMuertos } from '@/lib/solicitud-borrador-purga'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/cron/purga-rgpd — diario (`vercel.json`, 03:47 UTC). Cumple lo que promete la política de privacidad:
 *   · borra los documentos subidos por quien no llega a ser cliente a los 30 días;
 *   · anonimiza los prospectos web sin acuerdo al año (la fila se queda, con marca);
 *   · borra el borrador (cifrado) de los enlaces de datos caducados, anulados o completados (siempre, también en informe).
 * Reglas y guardas en `lib/purga-rgpd.ts` (cepo `lib/purga-rgpd.test.ts`).
 *
 * Cerrojos: `CRON_SECRET` por Bearer · MODO INFORME por defecto (`CORREDURIA_PURGA_RGPD_ACTIVA=1` para ejecutar; sin
 * ella solo cuenta y lo avisa por Telegram, cifras sin PII) · lote de 200 por tipo y pasada · fail-closed (una lectura
 * que falla → 500, no se escribe nada).
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    const activa = purgaRgpdActiva()
    const r = await ejecutarPurgaRgpd(prisma, correduria.id, { activa, enviar: (t) => tgSend(t) })
    // Borradores del enlace de datos (26/10/2026) de solicitudes caducadas, anuladas o completadas: se borran SIEMPRE (no
    // dependen del modo informe: es lo tecleado a medias en un enlace muerto, sin valor para nadie). Nunca lanza.
    const borradores = await limpiarBorradoresMuertos(prisma, { correduriaId: correduria.id })
    console.log(`[cron/purga-rgpd] modo=${r.modo} docs=${r.documentos.candidatos}/${r.documentos.borrados} prospectos=${r.prospectos.candidatos}/${r.prospectos.anonimizados} avisado=${r.avisado} borradores=${borradores.estado === 'ok' ? borradores.limpiados : borradores.estado}`)
    return NextResponse.json({ estado: 'ok', ...r, borradores })
  } catch (e) {
    const causa = registrarErrorCartera('cron/purga-rgpd', e)
    await tgSend(`🧹 <b>Purga RGPD</b> · ha fallado (${causa}). No se ha borrado ni anonimizado nada en esta pasada.`).catch(() => null)
    return NextResponse.json({ estado: 'error', causa }, { status: 500 })
  }
}
