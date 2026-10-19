import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { guardarAdjuntoLead } from '@/lib/correo-respuesta-lead'
import { validarAdjunto } from '@/lib/correo-respuesta-lead-puro'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * `POST /api/operador/correo/adjunto` (19/10/2026, F2) — un adjunto (foto/PDF) de la respuesta de un lead en su hilo.
 *   { hiloId, from, gmailMessageId, nombre, mime, base64 } → 200 { estado:'guardado' | 'repetido' }
 *   · 503 { estado:'sin_clave' } (sin PII_ENCRYPTION_KEY NO se guarda) · 503 { estado:'sin_tabla' } · 409 { estado:'sin_hilo' }
 * Se guarda CIFRADO y nadie lo lee (ni IA ni Telegram). Ver `lib/correo-respuesta-lead.ts`.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const v = validarAdjunto(await req.json().catch(() => null))
  if (!v.ok) return NextResponse.json({ estado: 'invalido', motivo: v.motivo }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    const r = await guardarAdjuntoLead(correduria.id, v.valor)
    const status = r.estado === 'guardado' || r.estado === 'repetido' ? 200 : r.estado === 'sin_hilo' ? 409 : 503
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/correo/adjunto', e) }, { status: 500 })
  }
})
