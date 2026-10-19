// ────────────────────────────────────────────────────────────────────────────
// Relevo del código SMS del tarificador (19/10/2026): un bot (Generali/Okta) está en la pantalla del SMS esperando el código.
// Asegura dice QUÉ peticiones faltan por avisar; aquí se manda UN Telegram por petición (force_reply: Alberto contesta
// deslizando o escribiendo el número) y, SOLO si salió, se marca en asegura. Cada minuto: el bot espera como mucho 5 min.
// Catalogado y silenciable (`correduria.tarificador-codigo-sms`): silenciado, el bot acaba `requiere_humano` a los 5 min.
// 🚨 Un fallo del puerto NO es «no hay peticiones». Sin datos del cliente ni del riesgo en el mensaje.
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'

import { isCronAuthorized } from '@/lib/cron-auth'
import { tgAskForReply } from '@central/core-telegram'
import { avisoPermitido, avisoEnviado } from '@/lib/telegram/avisos'
import { componerAvisoCodigoSms, leerPeticionesCodigoAsegura, marcarCodigosAvisados } from '@/lib/tarificador-codigo-sms-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const lectura = await leerPeticionesCodigoAsegura()
  // Puerto sin configurar o SQL sin aplicar: no hay relevo posible (el worker ya acaba requiere_humano). No es un fallo del cron.
  if (lectura.estado === 'sin_configurar' || lectura.estado === 'sin_esquema') return NextResponse.json({ ok: true, estado: lectura.estado })
  if (lectura.estado === 'error') {
    console.error('[tarificador-codigo-sms] no se pudo leer las peticiones:', lectura.causa)
    return NextResponse.json({ ok: false, estado: 'sin_datos', causa: lectura.causa })
  }
  if (lectura.pendientes.length === 0) return NextResponse.json({ ok: lectura.ilegibles === 0, pendientes: 0, ilegibles: lectura.ilegibles })

  // ⚠️ Id LITERAL en las dos llamadas: `lib/telegram/catalogo.test.ts` lee el fuente.
  const permitido = await avisoPermitido('correduria.tarificador-codigo-sms')
  const avisados: string[] = []
  const sinEnviar: string[] = []
  if (permitido) {
    for (const p of lectura.pendientes) {
      const salio = (await tgAskForReply(componerAvisoCodigoSms(p)).catch(() => null)) !== null
      if (!salio) { sinEnviar.push(p.id); continue }
      await avisoEnviado('correduria.tarificador-codigo-sms')
      avisados.push(p.id)
    }
  }
  const marcados = await marcarCodigosAvisados(avisados)
  if (!marcados) console.error('[tarificador-codigo-sms] avisados pero sin marcar en asegura (puede repetirse):', avisados)
  if (sinEnviar.length) console.error('[tarificador-codigo-sms] Telegram no salió para:', sinEnviar)
  return NextResponse.json({ ok: sinEnviar.length === 0 && marcados && lectura.ilegibles === 0, pendientes: lectura.pendientes.length, avisados: avisados.length, sinEnviar: sinEnviar.length, ilegibles: lectura.ilegibles, silenciado: !permitido })
}
