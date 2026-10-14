import { NextResponse } from 'next/server'
import { validarCambioPreferencias } from '@central/module-seguros-portal'

import { configuracionAvisosDeSesion, guardarConfiguracionAvisosDeSesion } from '@/lib/avisos-preferencias'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET/POST /api/configuracion/avisos (13/10/2026) — canal, antelación, «no molestar» y umbral de subida de
 * precio (fase B) de la identidad
 * de la COOKIE, más lo que la bienvenida de avisos necesita saber (último «Ahora no», vista de
 * corredor). Sin fila = valores de siempre (`resolverPreferenciasAvisos`).
 *
 * Las escrituras en vista de corredor las corta `middleware.ts` (403 `modo_corredor`).
 */
export async function GET() {
  const c = await configuracionAvisosDeSesion()
  if (!c) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  return NextResponse.json(c)
}

export async function POST(req: Request) {
  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!cuerpo || typeof cuerpo !== 'object') return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })
  // «Solo por correo» no se ofrece en el portal: recibos, siniestros, recordatorios… solo existen como
  // notificación y la persona se quedaría sin ningún canal. La validación del módulo lo sigue admitiendo
  // (la columna y los crons lo entienden); esta ruta es la que lo corta.
  if (cuerpo.canal === 'correo') return NextResponse.json({ error: 'canal_no_disponible' }, { status: 400 })
  const v = validarCambioPreferencias({
    canal: cuerpo.canal,
    diasAntelacion: cuerpo.diasAntelacion,
    noMolestar: cuerpo.noMolestar,
    umbralSubidaPrima: cuerpo.umbralSubidaPrima,
  })
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const ok = await guardarConfiguracionAvisosDeSesion(v.datos)
  if (!ok) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  return NextResponse.json({ ok: true })
}
