import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { anularSolicitud, crearSolicitud, solicitudesDeOportunidad } from '@/lib/solicitud-datos'
import { auditado } from '@/lib/auditoria'
import { mensajeSolicitud } from '@central/module-seguros'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * «Pídele los datos al cliente» (24/09/2026), lado corredor.
 *   GET  ?oportunidadId=            → sus solicitudes (respuestas descifradas)
 *   POST { oportunidadId, actor }   → crea el enlace (o dice que ya hay uno vivo: su token no se puede
 *                                     volver a dar, solo guardamos el hash) · 201 con `token` si es nuevo
 *   POST { accion:'anular', id }    → el enlace deja de funcionar
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const oportunidadId = (new URL(req.url).searchParams.get('oportunidadId') ?? '').trim()
    const lista = await solicitudesDeOportunidad(correduria.id, oportunidadId)
    if (lista === null) return NextResponse.json({ estado: 'error', motivo: 'no se pudieron leer' }, { status: 503 })
    return NextResponse.json({ estado: 'ok', solicitudes: lista }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/solicitud-datos', e) }, { status: 503 })
  }
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (b?.accion === 'anular') {
      const r = await anularSolicitud(correduria.id, typeof b.id === 'string' ? b.id : '')
      return NextResponse.json(r.ok ? { estado: 'ok' } : r, { status: r.ok ? 200 : r.status })
    }
    const actor = typeof b?.actor === 'string' && b.actor.trim() ? b.actor.trim().slice(0, 200) : 'plataforma'
    const r = await crearSolicitud(correduria.id, typeof b?.oportunidadId === 'string' ? b.oportunidadId : '', actor)
    if (!r.ok) return NextResponse.json(r, { status: r.status })
    // La URL completa solo existe al crear (el token no se guarda en claro).
    const base = (process.env.ASEGURA_PORTAL_URL ?? 'https://clientes.grupoasegura.es').replace(/\/+$/, '')
    const url = r.token ? `${base}/datos/${r.token}` : null
    return NextResponse.json(
      { estado: 'ok', id: r.id, nueva: r.nueva, ramo: r.ramo, caduca: r.caduca, url, mensaje: url ? mensajeSolicitud(r.ramo, url) : null },
      { status: r.nueva ? 201 : 200 },
    )
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/solicitud-datos', e) }, { status: 503 })
  }
})
