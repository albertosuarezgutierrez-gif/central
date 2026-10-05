import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { simularGoogleContactos } from '@/lib/google-contactos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * POST /api/operador/google-contactos/simular — qué haría la sincronización con la agenda de
 * Google, SIN escribir en Google ni en vínculos/cola (lee la agenda entera; no crea la etiqueta).
 * Informe: crear / vincular (dentro y fuera de la etiqueta) / conflictos de nombre / teléfonos
 * ambiguos / no normalizables / tope de 25.000; PII mínima (nombre + teléfono enmascarado).
 * Deja `simulada_en`: activar (`…/activar`) exige haber simulado. Auditado como escritura del puerto.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const r = await simularGoogleContactos(correduria.id)
    const status = r.estado === 'ok' ? 200 : r.estado === 'sin_conexion' ? 404 : r.estado === 'revocada' ? 409 : 503
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/google-contactos/simular', e) }, { status: 500 })
  }
})
