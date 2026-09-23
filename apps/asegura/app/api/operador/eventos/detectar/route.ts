import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { detectarYGuardar } from '@/lib/eventos-cartera'
import { auditado } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Compara la foto de la cartera viva con la anterior y guarda los eventos nuevos (Fase 2 de
 * ASegura OS). Lo lanza el cron `correduria-eventos` de plataforma tras cada pull de CIMA.
 *
 *   POST → { estado:'ok', primeraVez, detectados, nuevos, porTipo, fugasNuevas, polizasEnFoto }
 *
 * `primeraVez: true` = no había foto: se ancla y no se emite nada (no es «no ha pasado nada»).
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const r = await detectarYGuardar(correduria.id)
    return NextResponse.json({ estado: 'ok', ...r })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/eventos/detectar', e) }, { status: 500 })
  }
})
