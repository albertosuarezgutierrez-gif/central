import { NextResponse } from 'next/server'
import { leerContexto } from '@/lib/contexto'
import { conRepo } from '@/lib/db'
import { registrarFacturaRecibida } from '@/lib/compras'
import { capturarReversion, revirtiendo } from '@/lib/revertir'

// POST /api/compras — alta MANUAL de una factura recibida (dueño o gestor de la empresa de la sesión).
// Valida forma y NIF (core-fiscal), rechaza el duplicado (NIF + nº), asienta por el puerto de hechos y recuerda al proveedor.
// Todo o nada: si el hecho no llega a «asentado» la transacción se revierte y no queda nada a medias.
// El adjunto es solo una REFERENCIA (texto); aquí no se sube ningún fichero.
export const dynamic = 'force-dynamic'

const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export async function POST(req: Request) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const p = b?.proveedor as Record<string, unknown> | undefined
  if (!b || !p || typeof p !== 'object' || !Array.isArray(b.lineas) || b.lineas.length > 200) {
    return NextResponse.json({ error: 'datos_no_validos', errores: ['proveedor y líneas (máx. 200) obligatorios'] }, { status: 400 })
  }
  const entrada = {
    proveedor: { nif: txt(p.nif, 20), nombre: txt(p.nombre, 200), ...(p.tipo === 'acreedor' ? { tipo: 'acreedor' as const } : {}) },
    numero: txt(b.numero, 60), fecha: txt(b.fecha, 10), ...(txt(b.fechaContable, 10) ? { fechaContable: txt(b.fechaContable, 10) } : {}),
    lineas: (b.lineas as Record<string, unknown>[]).map((l) => ({ base: l?.base as number, tipoIva: l?.tipoIva as number, ...(txt(l?.categoria, 41) ? { categoria: txt(l?.categoria, 41) } : {}) })),
    ...(b.retencionPct !== undefined && b.retencionPct !== null && b.retencionPct !== '' ? { retencionPct: Number(b.retencionPct) } : {}),
    ...(txt(b.adjuntoRef, 300) ? { adjuntoRef: txt(b.adjuntoRef, 300) } : {}),
    origen: 'manual' as const,
  }
  const r = await capturarReversion(conRepo(c.empresaId, revirtiendo((repo) => registrarFacturaRecibida(repo, entrada, { usuarioId: c.usuarioId, hoy: new Date() })), { timeout: 20_000 }))
  if (!r.ok) return NextResponse.json({ error: r.motivo, errores: r.errores }, { status: r.motivo === 'duplicado' ? 409 : 422 })
  return NextResponse.json({ facturaId: r.facturaId, asientoId: r.asientoId, total: r.total, aPagar: r.aPagar }, { status: 201 })
}
