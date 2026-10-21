import { NextResponse } from 'next/server'
import { normalizarNumeroSolicitud } from '@central/module-seguros'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { historialSolicitud } from '@/lib/solicitud-compania-bd'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COMPANIAS = new Set(['occident', 'reale', 'mapfre', 'allianz'])

/**
 * GET /api/operador/correo/solicitud — historial de una solicitud en la compañía de principio a fin (F1 del agente de
 * correo, 21/10/2026): `?eventoId=<uuid>` (desde una fila de la bandeja) o `?compania=occident&numero=170000001`.
 * → { estado:'ok', solicitud | null, hitos } · 503 `sin_migracion` (falta 2026-10-21_correo_agente_f1.sql) · 422.
 * `solicitud: null` con hitos = la solicitud es anterior al seguimiento (solo hay correos sueltos).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const p = new URL(req.url).searchParams
    const eventoId = p.get('eventoId') ?? ''
    const compania = p.get('compania') ?? ''
    const numero = normalizarNumeroSolicitud(p.get('numero') ?? '')
    const q = UUID.test(eventoId) ? { eventoId } : COMPANIAS.has(compania) && numero ? { compania, numero } : null
    if (!q) return NextResponse.json({ estado: 'invalido', motivo: 'falta eventoId, o compania + numero' }, { status: 422 })
    const r = await historialSolicitud(correduria.id, q)
    if (r === 'sin_migracion') return NextResponse.json({ estado: 'sin_migracion', motivo: 'falta aplicar 2026-10-21_correo_agente_f1.sql' }, { status: 503 })
    return NextResponse.json({ estado: 'ok', ...r }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/correo/solicitud', e) }, { status: 500 })
  }
}
