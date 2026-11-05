import { NextResponse } from 'next/server'
import { leerContexto } from '@/lib/contexto'
import { ejecutarF5 } from '@/lib/cierre-carga'
import { altaPeriodificacion, cerrarEjercicio, periodificarCierre } from '@/lib/cierre'

// POST /api/cierre { accion: 'periodificacion' | 'periodificar' | 'cerrar', … } — periodificaciones y cierre del ejercicio.
//   periodificacion { ref, tipo: 'gasto'|'ingreso', descripcion, cuentaOrigen, importe (céntimos), inicio, fin }
//   periodificar    { anio }                      → asiento 480/485 al 31/12 y su reversa el 1/1 (dueño o gestor)
//   cerrar          { anio, confirmar: true }     → regularización, cierre y apertura; el ejercicio queda CERRADO y es DEFINITIVO (solo el dueño)
// Todo o nada. Esquema 0005 sin aplicar → 503.
export const dynamic = 'force-dynamic'

const num = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) ? v : NaN)
const txt = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '')

export async function POST(req: Request) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b.accion !== 'string') return NextResponse.json({ error: 'datos_no_validos', errores: ['accion obligatoria'] }, { status: 400 })
  const meta = { usuarioId: c.usuarioId, hoy: new Date() }
  try {
    if (b.accion === 'periodificacion') {
      const tipo = b.tipo === 'ingreso' ? 'ingreso' : b.tipo === 'gasto' ? 'gasto' : null
      if (!tipo) return NextResponse.json({ error: 'datos_no_validos', errores: ['tipo debe ser gasto o ingreso'] }, { status: 400 })
      const r = await ejecutarF5(c.empresaId, async (_repo, f5) => altaPeriodificacion(f5, { ref: txt(b.ref, 64), tipo, descripcion: txt(b.descripcion), cuentaOrigen: txt(b.cuentaOrigen, 12), importe: num(b.importe), inicio: txt(b.inicio, 10), fin: txt(b.fin, 10) }, meta))
      return r.ok ? NextResponse.json(r, { status: 201 }) : NextResponse.json({ error: 'periodificacion_no_valida', errores: r.errores }, { status: 422 })
    }
    if (b.accion === 'periodificar') {
      const r = await ejecutarF5(c.empresaId, (repo, f5) => periodificarCierre(repo, f5, num(b.anio), meta))
      return r.ok ? NextResponse.json(r, { status: 200 }) : NextResponse.json({ error: 'periodificar_no_valido', errores: r.errores }, { status: 422 })
    }
    if (b.accion === 'cerrar') {
      if (c.rol !== 'dueno') return NextResponse.json({ error: 'Solo el dueño puede cerrar el ejercicio' }, { status: 403 })
      if (b.confirmar !== true) return NextResponse.json({ error: 'confirmacion_requerida', errores: ['El cierre es definitivo: confirma expresamente'] }, { status: 400 })
      const r = await ejecutarF5(c.empresaId, (repo, f5) => cerrarEjercicio(repo, f5, num(b.anio), meta))
      return r.ok ? NextResponse.json(r, { status: 201 }) : NextResponse.json({ error: 'cierre_no_valido', errores: r.errores }, { status: 422 })
    }
  } catch {
    return NextResponse.json({ error: 'cierre_no_disponible', errores: ['No se pudo completar la operación (¿falta aplicar el esquema de la fase 5, 0005_cierre.sql?).'] }, { status: 503 })
  }
  return NextResponse.json({ error: 'datos_no_validos', errores: ['accion desconocida'] }, { status: 400 })
}
