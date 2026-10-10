import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import {
  AMPLIACION_CENTS,
  callbackAmpliar,
  eur,
  leerArgAmpliar,
  mesClave,
  textoAviso,
  textoBloqueo,
  topeDelMes,
} from '@/lib/codeoscopic/tope-euros'
import { ampliarTope, eventosPendientes, leerGastoMes, marcarNotificados } from '@/lib/codeoscopic/tope-euros-bd'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Tope de gasto de Avant2 en EUROS por mes (decisión de Alberto, 29/09/2026). Puerto para
 * plataforma, que es quien tiene el bot de Telegram.
 *
 *   GET                                   → { estado:'ok', mes, gastadoCents, topeCents, pendientes }
 *                                           (cada pendiente trae su `texto` HTML y su `boton`, o null)
 *   POST { accion:'notificado', ids }     → marca avisos/bloqueos ya mandados por Telegram
 *   POST { accion:'ampliar', arg, autorizadoPor, callbackId? }
 *                                         → +30 € al mes en curso desde el nivel del botón
 *
 * Nada de aquí llama al vendor ni gasta. El GET es lectura pura (no anota nada).
 * 🚨 Si no se puede leer el gasto, 500 con la causa — nunca `gastadoCents: 0`.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const gasto = await leerGastoMes(correduria.id)
    if (gasto.gastadoCents === null || gasto.ampliadoCents === null) {
      return NextResponse.json({ estado: 'error', motivo: 'no se ha podido leer el gasto del mes' }, { status: 500 })
    }
    // El texto y el botón salen de AQUÍ (una sola fuente, `tope-euros.ts`): plataforma solo los
    // reenvía a Telegram.
    const pendientes = (await eventosPendientes(correduria.id)).map((e) => ({
      ...e,
      texto: e.tipo === 'aviso' ? textoAviso(e.gastadoCents, e.mes) : textoBloqueo(e.gastadoCents, e.nivelCents, e.mes),
      boton:
        e.tipo === 'bloqueo'
          ? { texto: `✅ Autorizar +${eur(AMPLIACION_CENTS)} este mes`, callback: callbackAmpliar(e.mes, e.nivelCents) }
          : null,
    }))
    return NextResponse.json({
      estado: 'ok',
      mes: mesClave(new Date()),
      gastadoCents: gasto.gastadoCents,
      topeCents: topeDelMes(gasto.ampliadoCents),
      pendientes,
    })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/codeoscopic/tope', e) }, { status: 500 })
  }
}

// Auditado: una ampliación mueve el tope de gasto y tiene que quedar quién y cuándo.
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })

    if (cuerpo.accion === 'notificado') {
      const ids = Array.isArray(cuerpo.ids) ? cuerpo.ids.map(String) : []
      const n = await marcarNotificados(correduria.id, ids)
      return NextResponse.json({ estado: 'ok', marcados: n })
    }

    if (cuerpo.accion === 'ampliar') {
      const pedida = leerArgAmpliar(typeof cuerpo.arg === 'string' ? cuerpo.arg : '')
      const autorizadoPor = typeof cuerpo.autorizadoPor === 'string' ? cuerpo.autorizadoPor.trim() : ''
      if (!pedida || !autorizadoPor) {
        return NextResponse.json({ estado: 'invalido', motivo: 'botón o autor no válidos' }, { status: 422 })
      }
      const callbackId = typeof cuerpo.callbackId === 'string' && cuerpo.callbackId.trim() ? cuerpo.callbackId.trim().slice(0, 200) : null
      const r = await ampliarTope(correduria.id, pedida, { autorizadoPor, callbackId })
      return NextResponse.json(r, { status: r.estado === 'rechazado' ? 409 : 200 })
    }

    return NextResponse.json({ estado: 'invalido', motivo: 'acción desconocida' }, { status: 422 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/codeoscopic/tope', e) }, { status: 500 })
  }
})
