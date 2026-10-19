import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import {
  cerrarPerdidaSeguimiento, pendientesSeguimiento, recordarSeguimiento, validarCerrar, validarRecordar,
} from '@/lib/correo-seguimiento-lead'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * `POST /api/operador/correo/seguimiento-lead` (19/10/2026, F5) — seguimiento de un lead en su hilo. Lo llama el cron
 * del triaje de plataforma; `recordar` y `cerrar_perdida` SOLO tras el botón de Alberto (o con el modo automático que él
 * activó para ese tipo). Ver `lib/correo-seguimiento-lead.ts`.
 *   { accion:'pendientes' } → 200 { estado:'ok', hilos[{hiloId, clienteId, pila, oportunidadIds, ramos, seguimiento}] }
 *     | 503 { estado:'sin_migracion' }  (sin email ni textos)
 *   { accion:'recordar', hiloId, etapa, ancla, asunto, texto, idempotencia, actor } → 200 enviado | 404 no_encontrado |
 *     409 ya_no_toca | email_no_es_de_la_ficha | baja_de_correos | 502 rechazado | 503 sin_proveedor | sin_migracion
 *   { accion:'cerrar_perdida', hiloId, actor } → 200 cerrado | ya_cerrado · 404 · 503 sin_migracion
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = await req.json().catch(() => null)
  const accion = (cuerpo as { accion?: unknown } | null)?.accion
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    if (accion === 'pendientes') {
      const r = await pendientesSeguimiento(correduria.id)
      return NextResponse.json(r, { status: r.estado === 'ok' ? 200 : 503 })
    }
    if (accion === 'recordar') {
      const v = validarRecordar(cuerpo)
      if (!v.ok) return NextResponse.json({ estado: 'invalido', motivo: v.motivo }, { status: 400 })
      const r = await recordarSeguimiento(correduria.id, v.valor)
      const status = r.estado === 'enviado' ? 200 : r.estado === 'no_encontrado' ? 404
        : r.estado === 'ya_no_toca' || r.estado === 'email_no_es_de_la_ficha' || r.estado === 'baja_de_correos' ? 409
        : r.estado === 'sin_proveedor' || r.estado === 'sin_migracion' ? 503 : 502
      return NextResponse.json(r, { status })
    }
    if (accion === 'cerrar_perdida') {
      const v = validarCerrar(cuerpo)
      if (!v.ok) return NextResponse.json({ estado: 'invalido', motivo: v.motivo }, { status: 400 })
      const r = await cerrarPerdidaSeguimiento(correduria.id, v.valor)
      const status = r.estado === 'cerrado' || r.estado === 'ya_cerrado' ? 200 : r.estado === 'no_encontrado' ? 404 : 503
      return NextResponse.json(r, { status })
    }
    return NextResponse.json({ estado: 'invalido', motivo: 'accion desconocida' }, { status: 400 })
  } catch (e) {
    // Un fallo ANTES de enviar no ha mandado nada; después de enviar, `recordarSeguimiento` no lanza.
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/correo/seguimiento-lead', e) }, { status: 500 })
  }
})
