import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { guardarModulo } from '@/lib/modulos-empresa'
import { validarCambioModulo } from '@/lib/modulos-empresa-reglas'

// PUT { empresa_id, modulo: 'nominas', activo, modo: 'reparto'|'calculo', activado_por } — SOLO el operador
// (RRHH_OPERADOR_SECRET) activa o cambia el modo de un módulo (tabla rrhh.empresa_modulos, migración 0031).
// El responsable de la empresa solo lo ve en /admin/nominas: no hay ruta /api/admin que lo escriba (cepo modulo-nominas.test.ts).
export async function PUT(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const v = validarCambioModulo(await req.json().catch(() => null))
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  if (!(await guardarModulo(v.cambio))) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
  return NextResponse.json({ ok: true, empresa_id: v.cambio.empresaId, modulo: v.cambio.modulo, activo: v.cambio.activo, modo: v.cambio.modo })
}
