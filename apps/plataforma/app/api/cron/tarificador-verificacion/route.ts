// ────────────────────────────────────────────────────────────────────────────
// Aviso de verificación humana del tarificador (08/10/2026): un portal (Generali…) pide un código SMS/OTP y el
// trabajo del bot acaba `requiere_humano`. Asegura dice QUÉ trabajos faltan por avisar; aquí se manda UN Telegram
// por trabajo y, SOLO si salió, se marca en asegura. Si no sale (o está silenciado en /telegram) no se marca:
// la pasada siguiente lo reintenta. Mensaje sin datos personales (compañía y ramo).
// 🚨 Un fallo del puerto NO es «no hay pendientes»: se registra y la respuesta es no-ok (no se afirma nada).
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'

import { isCronAuthorized } from '@/lib/cron-auth'
import { tgSend } from '@/lib/telegram'
import { avisoPermitido, avisoEnviado } from '@/lib/telegram/avisos'
import { componerAvisoVerificacion, leerVerificacionesAsegura, marcarVerificacionesAvisadas } from '@/lib/tarificador-verificacion-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const lectura = await leerVerificacionesAsegura()
  if (lectura.estado !== 'ok') {
    const causa = lectura.estado === 'sin_configurar' ? 'puerto sin configurar (ASEGURA_OPERADOR_SECRET)' : lectura.causa
    console.error('[tarificador-verificacion] no se pudo leer los trabajos parados:', causa)
    return NextResponse.json({ ok: false, estado: 'sin_datos', causa })
  }

  // ⚠️ Id LITERAL en las dos llamadas: `lib/telegram/catalogo.test.ts` lee el fuente.
  const permitido = lectura.pendientes.length === 0 ? true : await avisoPermitido('correduria.tarificador-verificacion')
  const avisados: string[] = []
  const sinEnviar: string[] = []
  if (permitido) {
    for (const p of lectura.pendientes) {
      const salio = (await tgSend(componerAvisoVerificacion(p)).catch(() => null)) !== null
      if (!salio) { sinEnviar.push(p.trabajoId); continue }
      await avisoEnviado('correduria.tarificador-verificacion')
      avisados.push(p.trabajoId)
    }
  }
  // SOLO lo que salió se marca (idempotente en asegura); lo que falló se reintenta en la pasada siguiente.
  const marcados = await marcarVerificacionesAvisadas(avisados)
  if (!marcados) console.error('[tarificador-verificacion] avisados pero sin marcar en asegura (puede repetirse):', avisados)
  if (sinEnviar.length) console.error('[tarificador-verificacion] Telegram no salió para:', sinEnviar)

  return NextResponse.json({
    ok: sinEnviar.length === 0 && marcados && lectura.ilegibles === 0,
    pendientes: lectura.pendientes.length,
    avisados: avisados.length,
    sinEnviar: sinEnviar.length,
    ilegibles: lectura.ilegibles,
    silenciado: !permitido,
  })
}
