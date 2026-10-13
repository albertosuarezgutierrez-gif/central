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
import { tgSendButtons, tgSendPhoto } from '@central/core-telegram'
import { botonesEmision, componerAvisoEmision, leerAvisosEmision, marcarAvisosEmision } from '@/lib/tarificador-emision-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * EMISIÓN del robot (10/10/2026): peticiones de botón (captura de la pantalla previa + «✅ Emitir»/«❌ Cancelar») y
 * desenlaces. Va al chat de Alberto sin pasar por el catálogo de silenciables: es la respuesta a una emisión que él
 * mismo pidió, y callarla dejaría la solicitud caducar sin que lo sepa. Solo se marca en asegura lo que salió.
 */
async function avisarEmisiones(): Promise<Record<string, unknown>> {
  const lectura = await leerAvisosEmision()
  if (lectura.estado === 'sin_configurar' || lectura.estado === 'sin_esquema') return { estado: lectura.estado }
  if (lectura.estado === 'error') {
    console.error('[tarificador-emision] no se pudo leer los avisos:', lectura.causa)
    return { estado: 'sin_datos', causa: lectura.causa }
  }
  const avisados: string[] = []
  const sinEnviar: string[] = []
  for (const a of lectura.pendientes) {
    const texto = componerAvisoEmision(a)
    let salio: boolean
    if (a.tipo === 'pedir_autorizacion') {
      // Sin hash de la pantalla previa no hay botón que firmar: no se manda (interpretarAvisosEmision ya lo descarta).
      if (!a.hashDatos) { sinEnviar.push(a.trabajoId); continue }
      // La captura primero (si la hay); los botones, en su propio mensaje (sendPhoto no lleva teclado aquí).
      if (a.capturaBase64) await tgSendPhoto({ data: Buffer.from(a.capturaBase64, 'base64'), nombre: 'pantalla-previa.png' }, '🖊️ Pantalla previa a emitir').catch(() => null)
      salio = (await tgSendButtons(texto, botonesEmision(a.trabajoId, a.hashDatos)).catch(() => null)) !== null
    } else {
      salio = (await tgSend(texto).catch(() => null)) !== null
    }
    if (salio) avisados.push(a.trabajoId)
    else sinEnviar.push(a.trabajoId)
  }
  const marcados = await marcarAvisosEmision(avisados)
  if (!marcados) console.error('[tarificador-emision] avisados pero sin marcar en asegura (puede repetirse):', avisados)
  return { estado: 'ok', pendientes: lectura.pendientes.length, avisados: avisados.length, sinEnviar: sinEnviar.length, ilegibles: lectura.ilegibles, marcados }
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const emision = await avisarEmisiones().catch((e: unknown) => ({ estado: 'error', causa: e instanceof Error ? e.message : String(e) }))

  const lectura = await leerVerificacionesAsegura()
  if (lectura.estado !== 'ok') {
    const causa = lectura.estado === 'sin_configurar' ? 'puerto sin configurar (ASEGURA_OPERADOR_SECRET)' : lectura.causa
    console.error('[tarificador-verificacion] no se pudo leer los trabajos parados:', causa)
    return NextResponse.json({ ok: false, estado: 'sin_datos', causa, emision })
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
    emision,
  })
}
