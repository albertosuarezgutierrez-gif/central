export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { resumenContable } from '@central/module-materiales'

// GET /api/materiales/informe?tipo=valoracion|activos|historial
// Devuelve HTML listo para imprimir/guardar como PDF desde el navegador.

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const url = new URL(req.url)
  const tipo = url.searchParams.get('tipo') ?? 'valoracion'
  const fecha = new Date().toISOString().slice(0, 10)

  const { data: matsRaw } = await supabase
    .from('materiales')
    .select('id, nombre, categoria, tipo, estado, cantidad_total, cantidad_disponible, precio_compra, coste_reposicion, unidad, stock_minimo, activo')
    .eq('restaurante_id', rid).eq('activo', true).order('nombre')

  const mats = (matsRaw ?? []).map(r => ({
    id: r.id as string,
    negocioId: rid,
    nombre: r.nombre as string,
    categoria: (r.categoria as string | null) ?? '',
    tipo: ((r.tipo ?? 'activo') as 'activo' | 'consumible'),
    estado: ((r.estado ?? 'operativo') as 'operativo' | 'deteriorado' | 'en_reparacion' | 'baja'),
    cantidadTotal: (r.cantidad_total ?? 0) as number,
    cantidadDisponible: (r.cantidad_disponible ?? 0) as number,
    stockMinimo: r.stock_minimo as number | null ?? null,
    precioCompra: (r.precio_compra ?? 0) as number,
    costeReposicion: (r.coste_reposicion ?? 0) as number,
    unidad: (r.unidad ?? '') as string,
    activo: (r.activo ?? true) as boolean,
    codigoInterno: null, garantiaHasta: null, documentos: [],
    descripcion: null, espacioId: null, proveedorId: null, creadoEn: null,
  }))

  let titulo: string
  let thead: string
  let rows: string

  if (tipo === 'activos') {
    titulo = 'Activos por estado'
    thead = '<tr><th>Material</th><th>Categoría</th><th>Estado</th><th>Total</th><th>Disponible</th><th>Valor compra</th></tr>'
    rows = mats.filter(m => m.tipo === 'activo').map(m =>
      `<tr><td>${esc(m.nombre)}</td><td>${esc(m.categoria ?? '—')}</td><td>${esc(m.estado)}</td><td>${m.cantidadTotal}</td><td>${m.cantidadDisponible}</td><td>€${(m.precioCompra * m.cantidadTotal).toFixed(2)}</td></tr>`
    ).join('')

  } else if (tipo === 'historial') {
    titulo = 'Historial de movimientos'
    const { data: movs } = await supabase
      .from('materiales_movimientos')
      .select('tipo, cantidad, notas, fecha, material:material_id(nombre)')
      .eq('restaurante_id', rid)
      .order('fecha', { ascending: false })
      .limit(500)
    thead = '<tr><th>Fecha</th><th>Material</th><th>Tipo</th><th>Cant.</th><th>Notas</th></tr>'
    rows = (movs ?? []).map(mv => {
      const matRaw = mv.material as unknown
      const matNombre = Array.isArray(matRaw) ? (matRaw[0] as { nombre: string } | undefined)?.nombre : (matRaw as { nombre: string } | null)?.nombre
      return `<tr><td>${esc(mv.fecha as string)}</td><td>${esc(matNombre ?? '—')}</td><td>${esc(mv.tipo as string)}</td><td>${mv.cantidad}</td><td>${esc((mv.notas as string | null) ?? '')}</td></tr>`
    }).join('')

  } else {
    titulo = 'Valoración de inventario'
    const resumen = resumenContable(mats, [])
    thead = '<tr><th>Material</th><th>Categoría</th><th>Tipo</th><th>Total</th><th>Disponible</th><th>P. compra</th><th>Valor stock</th></tr>'
    rows = mats.map(m =>
      `<tr><td>${esc(m.nombre)}</td><td>${esc(m.categoria ?? '—')}</td><td>${esc(m.tipo)}</td><td>${m.cantidadTotal}</td><td>${m.cantidadDisponible}</td><td>€${m.precioCompra.toFixed(2)}</td><td>€${(m.cantidadDisponible * m.costeReposicion).toFixed(2)}</td></tr>`
    ).join('')
    rows += `<tr class="total"><td colspan="6">TOTAL VALOR DISPONIBLE</td><td>€${resumen.valorInventario.toFixed(2)}</td></tr>`
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${esc(titulo)} — ${fecha}</title>
<style>
  body{font-family:system-ui,sans-serif;color:#1a1a1a;padding:32px;font-size:13px}
  h1{font-size:20px;margin:0 0 4px}
  .sub{color:#666;margin:0 0 20px;font-size:12px}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{text-align:left;padding:7px 10px;border-bottom:1px solid #e5e5e5}
  th{font-weight:700;background:#f5f5f5;font-size:12px}
  tr.total td{font-weight:700;border-top:2px solid #333;background:#f5f5f5}
  .btn{float:right;padding:7px 18px;cursor:pointer;background:#1a1a1a;color:#fff;border:0;border-radius:4px;font-size:13px}
  @media print{.btn{display:none}body{padding:0}}
</style>
</head>
<body>
<button class="btn" onclick="window.print()">🖨 Imprimir / PDF</button>
<h1>${esc(titulo)}</h1>
<p class="sub">Generado: ${fecha} · ${mats.length} materiales</p>
<table><thead>${thead}</thead><tbody>${rows}</tbody></table>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
