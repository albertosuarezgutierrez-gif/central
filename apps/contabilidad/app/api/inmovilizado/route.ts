import { NextResponse } from 'next/server'
import { CATEGORIAS_ACTIVO } from '@central/module-contabilidad'
import { leerContexto } from '@/lib/contexto'
import { ejecutarF5 } from '@/lib/cierre-carga'
import { altaActivo, amortizarPeriodo, bajaDeActivo, guardarTabla } from '@/lib/cierre'

// POST /api/inmovilizado { accion: 'alta' | 'amortizar' | 'baja' | 'tabla', … } — inmovilizado y amortizaciones (dueño o gestor; la tabla, solo el dueño).
//   alta      { origen?, refExterna, descripcion, categoria, fechaAlta, valorAdquisicion (céntimos), valorResidual?, porcentajePb?, yaContabilizado?, cuentaContrapartida? }
//             Idempotente por (origen, refExterna): así lo usan otras verticales (p. ej. RRHH) con origen = 'rrhh'.
//   amortizar { anio, mes? }          · baja { ref, fecha, precioVenta?, cuentaContrapartida? }          · tabla { filas: FilaTablaAmortizacion[] }
// Todo o nada: si algo no se puede asentar, la transacción se revierte entera. Esquema 0005 sin aplicar → 503.
export const dynamic = 'force-dynamic'

const num = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) ? v : undefined)
const txt = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '')

export async function POST(req: Request) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b.accion !== 'string') return NextResponse.json({ error: 'datos_no_validos', errores: ['accion obligatoria'] }, { status: 400 })
  const meta = { usuarioId: c.usuarioId, hoy: new Date() }
  try {
    if (b.accion === 'alta') {
      if (typeof b.categoria !== 'string' || !(CATEGORIAS_ACTIVO.includes(b.categoria) || /^[a-z0-9_]{1,40}$/.test(b.categoria))) return NextResponse.json({ error: 'datos_no_validos', errores: ['categoría no válida'] }, { status: 400 })
      const categoria = b.categoria
      const r = await ejecutarF5(c.empresaId, (repo, f5) => altaActivo(repo, f5, {
        origen: txt(b.origen, 64) || 'manual', refExterna: txt(b.refExterna, 64), descripcion: txt(b.descripcion), categoria, fechaAlta: txt(b.fechaAlta, 10),
        valorAdquisicion: num(b.valorAdquisicion) ?? NaN, ...(num(b.valorResidual) !== undefined ? { valorResidual: num(b.valorResidual) } : {}),
        ...(num(b.porcentajePb) !== undefined ? { porcentajePb: num(b.porcentajePb) } : {}), ...(b.yaContabilizado === false ? { yaContabilizado: false } : {}),
      }, { ...(typeof b.cuentaContrapartida === 'string' ? { cuentaContrapartida: b.cuentaContrapartida.slice(0, 12) } : {}) }, meta))
      return r.ok ? NextResponse.json(r, { status: r.duplicado ? 200 : 201 }) : NextResponse.json({ error: 'alta_no_valida', errores: r.errores }, { status: 422 })
    }
    if (b.accion === 'amortizar') {
      const r = await ejecutarF5(c.empresaId, (repo, f5) => amortizarPeriodo(repo, f5, { anio: num(b.anio) ?? NaN, ...(num(b.mes) !== undefined ? { mes: num(b.mes) } : {}) }, meta))
      return r.ok ? NextResponse.json(r, { status: 200 }) : NextResponse.json({ error: 'amortizacion_no_valida', errores: r.errores }, { status: 422 })
    }
    if (b.accion === 'baja') {
      const r = await ejecutarF5(c.empresaId, (repo, f5) => bajaDeActivo(repo, f5, {
        ref: txt(b.ref, 64), fecha: txt(b.fecha, 10), ...(num(b.precioVenta) !== undefined ? { precioVenta: num(b.precioVenta) } : {}),
        ...(typeof b.cuentaContrapartida === 'string' ? { cuentaContrapartida: b.cuentaContrapartida.slice(0, 12) } : {}),
      }, meta))
      return r.ok ? NextResponse.json(r, { status: 201 }) : NextResponse.json({ error: 'baja_no_valida', errores: r.errores }, { status: 422 })
    }
    if (b.accion === 'tabla') {
      if (c.rol !== 'dueno') return NextResponse.json({ error: 'Solo el dueño puede cambiar la tabla de amortización' }, { status: 403 })
      if (!Array.isArray(b.filas)) return NextResponse.json({ error: 'datos_no_validos', errores: ['filas obligatorias'] }, { status: 400 })
      const filas = (b.filas as Record<string, unknown>[]).map((f) => ({
        categoria: txt(f.categoria, 40), descripcion: txt(f.descripcion), cuentaActivo: txt(f.cuentaActivo, 12), cuentaAmortizacionAcumulada: txt(f.cuentaAmortizacionAcumulada, 12),
        cuentaGasto: txt(f.cuentaGasto, 12), porcentajeMaximoPb: num(f.porcentajeMaximoPb) ?? NaN, periodoMaximoAnios: num(f.periodoMaximoAnios) ?? NaN, certeza: 'media' as const,
      }))
      const r = await ejecutarF5(c.empresaId, async (_repo, f5) => guardarTabla(f5, filas, meta))
      return r.ok ? NextResponse.json(r, { status: 201 }) : NextResponse.json({ error: 'tabla_no_valida', errores: r.errores }, { status: 422 })
    }
  } catch {
    return NextResponse.json({ error: 'cierre_no_disponible', errores: ['No se pudo completar la operación (¿falta aplicar el esquema de la fase 5, 0005_cierre.sql?).'] }, { status: 503 })
  }
  return NextResponse.json({ error: 'datos_no_validos', errores: ['accion desconocida'] }, { status: 400 })
}
