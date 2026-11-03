import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { crearRegularizacion, decidirRegularizacion, editarRegularizacion, regularizacionesDePoliza } from '@/lib/regularizacion-rc'
import { leerBotonRrc } from '@/lib/regularizacion-rc-telegram'
import { decidirRespuestaCompania, editarRespuestaCompania, prepararRespuestaCompania, resolverRegularizacion } from '@/lib/regularizacion-rc-compania'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
 *   ── Fase 3: responder a la COMPAÑÍA (columnas de 2026-11-03c; sin ellas 503 `sin_migracion`) ──
 *   POST { accion:'preparar_compania', id } — (re)propone en Telegram el borrador a la compañía (solo `completada`)
 *   POST { accion:'decidir_compania', id, version } — ✅ `rrc_cenv` → 200 enviada_compania · obsoleta · sin_cambios
 *        · sin_destino_compania (falta buzón elegido: NO se inventa) · 503 canal_no_disponible ≠ 502 envio_fallido
 *   POST { accion:'editar_compania', id, texto } — ✏️ («Para: correo» de un contacto ACTIVO del Directorio y/o texto)
 *        → 200 editada · 422 invalida / buzon_desconocido · 409 sin_cambios
 *   POST { accion:'resolver', id, actor? } — 🏁 cierre MANUAL (sello + tarea del agente de correo cerrada). Idempotente:
 *        200 resuelta · ya_resuelta · 409 no_completada / enviando
 */
const STATUS: Record<string, number> = {
  creada: 201, invalida: 422, no_encontrada: 404, ambigua: 409, no_viva: 409, sin_migracion: 503,
  canal_no_disponible: 503, envio_fallido: 502, confirmacion_fallida: 502, sin_cambios: 200,
  buzon_desconocido: 422, no_completada: 409, enviando: 409, ilegible: 409, adjunto_ilegible: 409,
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
      if (!d || (d.accion !== 'env' && d.accion !== 'no')) return NextResponse.json({ estado: 'invalida' }, { status: 422 })
      const r = await decidirRegularizacion(correduria.id, { accion: d.accion, id: d.id, version: d.version })
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 200 })
    }
    if (b?.accion === 'editar') {
      const id = typeof b.id === 'string' ? b.id : ''
      if (!UUID.test(id)) return NextResponse.json({ estado: 'invalida' }, { status: 422 })
      const r = await editarRegularizacion(correduria.id, id, b.texto)
      return NextResponse.json(r, { status: r.estado === 'sin_cambios' ? 409 : STATUS[r.estado] ?? 200 })
    }
    // ── Fase 3 ──
    const id = typeof b?.id === 'string' ? b.id : ''
    if (b?.accion === 'preparar_compania' || b?.accion === 'decidir_compania' || b?.accion === 'editar_compania' || b?.accion === 'resolver') {
      if (!UUID.test(id)) return NextResponse.json({ estado: 'invalida' }, { status: 422 })
    }
    if (b?.accion === 'preparar_compania') {
      const r = await prepararRespuestaCompania(correduria.id, id)
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 200 })
    }
    if (b?.accion === 'decidir_compania') {
      const d = leerBotonRrc('cenv', [id, String(b.version ?? '')])
      if (!d) return NextResponse.json({ estado: 'invalida' }, { status: 422 })
      const r = await decidirRespuestaCompania(correduria.id, { id: d.id, version: d.version })
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 200 })
    }
    if (b?.accion === 'editar_compania') {
      const r = await editarRespuestaCompania(correduria.id, id, b.texto)
      return NextResponse.json(r.estado === 'editada' ? { estado: r.estado, telegram: r.telegram } : r, { status: r.estado === 'sin_cambios' ? 409 : STATUS[r.estado] ?? 200 })
    }
    if (b?.accion === 'resolver') {
      const actor = typeof b.actor === 'string' && b.actor.trim() ? b.actor.trim().slice(0, 200) : 'plataforma'
      const r = await resolverRegularizacion(correduria.id, id, actor)
      return NextResponse.json(r, { status: STATUS[r.estado] ?? 200 })
    }
    return NextResponse.json({ estado: 'invalida', motivo: 'accion desconocida' }, { status: 422 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/regularizacion-rc', e) }, { status: 500 })
  }
})
