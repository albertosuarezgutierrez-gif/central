// ────────────────────────────────────────────────────────────────────────────
// Seguimiento de presupuestos enviados (28/09/2026): avisa a Alberto por Telegram de los presupuestos
// que el cliente no consta que haya abierto, o que abrió y no eligió.
//
// Asegura decide QUÉ toca avisar (un aviso por etapa y presupuesto) y lo sirve por el puerto; aquí se
// compone el mensaje, se manda y, SOLO si el Telegram salió, se marca `seguimiento_avisado`. Si el
// Telegram no sale, no se marca: la pasada siguiente lo reintenta. Si el aviso está silenciado en
// /telegram tampoco se marca — Alberto no lo ha visto, y marcarlo sería un «ya te lo dije» falso.
//
// 🚨 Un fallo del puerto NO es «no hay pendientes»: se registra y se manda UN aviso «no se pudo leer».
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'

import { isCronAuthorized } from '@/lib/cron-auth'
import { tgSend } from '@/lib/telegram'
import { avisoPermitido, avisoEnviado } from '@/lib/telegram/avisos'
import { urlFichaCliente } from '@/lib/leads-web'
import {
  componerAvisoSeguimiento,
  leerSeguimientoPresupuestosAsegura,
  marcarSeguimientoAvisadoAsegura,
} from '@/lib/seguimiento-presupuestos-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ACTOR = 'agente:seguimiento-presupuestos'

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const lectura = await leerSeguimientoPresupuestosAsegura()

  if (lectura.estado !== 'ok') {
    const causa = lectura.estado === 'sin_configurar' ? 'puerto sin configurar (ASEGURA_OPERADOR_SECRET o BD de asegura)' : lectura.causa
    console.error('[correduria-seguimiento-presupuestos] no se pudo leer el seguimiento:', causa)
    // ⚠️ Id LITERAL en las dos llamadas: `lib/telegram/catalogo.test.ts` lee el fuente.
    let avisado = false
    if (await avisoPermitido('correduria.seguimiento-presupuesto')) {
      avisado = (await tgSend(`⚠️ No se pudo leer el seguimiento de presupuestos (${causa}). No sé si hay clientes pendientes de llamar: míralo en /correduria.`).catch(() => null)) !== null
      if (avisado) await avisoEnviado('correduria.seguimiento-presupuesto')
    }
    return NextResponse.json({ ok: false, estado: 'sin_datos', causa, avisado })
  }

  const ahora = new Date()
  const permitido = await avisoPermitido('correduria.seguimiento-presupuesto')
  let enviados = 0
  let marcados = 0
  const sinMarcar: string[] = []
  const sinEnviar: string[] = []

  if (permitido) {
    for (const p of lectura.pendientes) {
      const texto = componerAvisoSeguimiento(p, { ahora, urlFicha: (id) => urlFichaCliente(id) })
      const salio = (await tgSend(texto).catch(() => null)) !== null
      if (!salio) {
        sinEnviar.push(p.id)
        continue
      }
      enviados++
      await avisoEnviado('correduria.seguimiento-presupuesto')
      if (await marcarSeguimientoAvisadoAsegura({ id: p.id, etapa: p.etapa, actor: ACTOR })) marcados++
      else sinMarcar.push(p.id) // Se repetirá en la próxima pasada: mejor un aviso doble que uno perdido.
    }
    if (lectura.ilegibles > 0) {
      await tgSend(`⚠️ Seguimiento de presupuestos: ${lectura.ilegibles} presupuesto(s) llegan de asegura sin poder leerse. No se ha avisado de ellos.`).catch(() => null)
    }
  }

  if (sinMarcar.length) console.error('[correduria-seguimiento-presupuestos] avisados pero sin marcar en asegura:', sinMarcar)
  if (sinEnviar.length) console.error('[correduria-seguimiento-presupuestos] Telegram no salió para:', sinEnviar)

  return NextResponse.json({
    ok: sinEnviar.length === 0 && sinMarcar.length === 0 && lectura.ilegibles === 0,
    pendientes: lectura.pendientes.length,
    enviados,
    marcados,
    sinEnviar: sinEnviar.length,
    sinMarcar: sinMarcar.length,
    ilegibles: lectura.ilegibles,
    silenciado: !permitido,
  })
}
