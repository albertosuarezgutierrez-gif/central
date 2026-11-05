import { NextResponse } from 'next/server'
import { leerContexto } from '@/lib/contexto'
import { conRepo } from '@/lib/db'
import { registrarAsientoManual } from '@/lib/servicio'

// Asiento manual (dueño o gestor de la empresa de la sesión). El núcleo valida cuadre, cuentas hoja y ejercicio abierto;
// la BD lo vuelve a exigir (triggers de 0001). Importes en céntimos enteros (el formulario ya los convierte).
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as { fecha?: unknown; concepto?: unknown; apuntes?: unknown } | null
  if (!b || !Array.isArray(b.apuntes) || typeof b.concepto !== 'string' || typeof b.fecha !== 'string' || b.apuntes.length > 100) {
    return NextResponse.json({ error: 'datos_no_validos', errores: ['fecha, concepto y apuntes (máx. 100) obligatorios'] }, { status: 400 })
  }
  const apuntes = (b.apuntes as Record<string, unknown>[]).map((p) => ({
    cuenta: String(p?.cuenta ?? ''), debe: p?.debe as number, haber: p?.haber as number,
    ...(typeof p?.documento === 'string' && p.documento.trim() ? { documento: p.documento.trim().slice(0, 120) } : {}),
  }))
  const r = await conRepo(c.empresaId, (repo) => registrarAsientoManual(repo, { fecha: b.fecha as string, concepto: (b.concepto as string).trim().slice(0, 300), apuntes }, { actor: 'usuario', usuarioId: c.usuarioId }))
  if (!r.ok) return NextResponse.json({ error: 'asiento_no_valido', errores: r.errores }, { status: 422 })
  return NextResponse.json({ id: r.id, numero: r.numero }, { status: 201 })
}
