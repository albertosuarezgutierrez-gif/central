import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { crearRegularizacion, decidirRegularizacion, editarRegularizacion, regularizacionesDePoliza } from '@/lib/regularizacion-rc'
import { leerBotonRrc } from '@/lib/regularizacion-rc-telegram'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Regularización de RC (03/11/2026): pedir al cliente la facturación real del periodo. NADA sale sin ✅ de Alberto.
 *   POST { accion:'crear', polizaId | numeroPoliza, periodoDesde, periodoHasta, compania?, actor }
 *        → 201 creada (borrador + Telegram con botones) · 200 ya_existe (misma póliza+periodo) · 422 invalida
 *          404 no_encontrada · 409 ambigua / no_viva · 503 sin_migracion
 *        Lo llamará la FASE 1 del agente de correo con `peticionRegularizacionDesdeEvento(evento)` de
 *        `@central/module-seguros/regularizacion-rc` (idempotente: un recordatorio del mismo periodo no abre otra).
 *   POST { accion:'decidir', decision:'env'|'no', id, version } — el botón ✅/❌ que reenvía plataforma (`rrc_*`)
 *        → 200 enviada · descartada · sin_cambios · obsoleta · sin_destino
 *          503 canal_no_disponible (sin proveedor de correo: NO salió) ≠ 502 envio_fallido (el envío falló)
 *   POST { accion:'editar', id, texto } — el ✏️ (respuesta de Alberto en Telegram) → 200 editada · 409 sin_cambios · 422
 *   GET  ?polizaId= → sus regularizaciones con la respuesta descifrada (`null` + `ilegible` si no se puede leer)
 */
const STATUS: Record<string, number> = {
  creada: 201, invalida: 422, no_encontrada: 404, ambigua: 409, no_viva: 409, sin_migracion: 503,
  canal_no_disponible: 503, envio_fallido: 502, sin_cambios: 200,
}

export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    const polizaId = (new URL(req.url).searchParams.get('polizaId') ?? '').trim()
    const r = await regularizacionesDePoliza(correduria.id, polizaId)
    if (!Array.isArray(r)) return NextResponse.json(r, { status: 503 })
    return NextResponse.json({ estado: 'ok', regularizaciones: r }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/regularizacion-rc', e) }, { status: 503 })
  }
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    if (b?.accion === 'crear') {
      const actor = typeof b.actor === 'string' && b.actor.trim() ? b.actor.trim().slice(0, 200) : 'plataforma'
      const r = await crearRegularizacion(correduria.id, { polizaId: b.polizaId, numeroPoliza: b.numeroPoliza, periodoDesde: b.periodoDesde, periodoHasta: b.periodoHasta, compania: b.compania, actor })
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 200 })
    }
    if (b?.accion === 'decidir') {
      const d = leerBotonRrc(typeof b.decision === 'string' ? b.decision : '', [String(b.id ?? ''), String(b.version ?? '')])
      if (!d || d.accion === 'mod') return NextResponse.json({ estado: 'invalida' }, { status: 422 })
      const r = await decidirRegularizacion(correduria.id, { accion: d.accion, id: d.id, version: d.version })
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 200 })
    }
    if (b?.accion === 'editar') {
      const id = typeof b.id === 'string' ? b.id : ''
      if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ estado: 'invalida' }, { status: 422 })
      const r = await editarRegularizacion(correduria.id, id, b.texto)
      return NextResponse.json(r, { status: r.estado === 'sin_cambios' ? 409 : STATUS[r.estado] ?? 200 })
    }
    return NextResponse.json({ estado: 'invalida', motivo: 'accion desconocida' }, { status: 422 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/regularizacion-rc', e) }, { status: 500 })
  }
})
