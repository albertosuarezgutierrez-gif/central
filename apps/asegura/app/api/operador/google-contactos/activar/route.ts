import { NextResponse } from 'next/server'
import { z } from 'zod'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { activarGoogleContactos } from '@/lib/google-contactos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const Cuerpo = z.object({ actor: z.string().trim().min(1).max(120) }).strict()

/**
 * POST /api/operador/google-contactos/activar — «simulación revisada: sincroniza». Hasta esta
 * marca (`sync_activada_en`) el cron horario responde `pendiente_activar` y no escribe nada.
 * Exige haber simulado con esta conexión (409 `sin_simular`). Idempotente (`ya_activa`).
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = Cuerpo.safeParse(await req.json().catch(() => null))
  if (!cuerpo.success) return NextResponse.json({ error: 'Cuerpo inválido: { actor: string }' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const r = await activarGoogleContactos(correduria.id, cuerpo.data.actor)
    const status = r.estado === 'ok' || r.estado === 'ya_activa' ? 200 : r.estado === 'sin_conexion' ? 404 : 409
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/google-contactos/activar', e) }, { status: 500 })
  }
})
