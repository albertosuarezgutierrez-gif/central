import { NextResponse } from 'next/server'
import { validarNifCif } from '@central/core-fiscal'
import { leerContexto } from '@/lib/contexto'
import { ejecutarF6 } from '@/lib/f6-carga'
import { importarPlan, importarSaldosIniciales, importarTerceros } from '@/lib/onboarding'
import { respuestaDeErrorBdFase } from '@/lib/errores-bd'

// POST /api/onboarding { accion: 'plan' | 'saldos' | 'terceros', csv, fecha? (saldos: AAAA-MM-DD) } — importación guiada, todo o nada.
//   plan     → añade cuentas (no pisa las existentes)         · saldos → asiento de apertura inicial (debe cuadrar al céntimo)
//   terceros → clientes/proveedores con NIF validado (algoritmo de core-fiscal)
// CSV de hasta 2 MB. Cualquier error de fila → no se importa nada y se devuelve la lista por línea.
export const dynamic = 'force-dynamic'
const MAX_CSV = 2_000_000

export async function POST(req: Request) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as { accion?: unknown; csv?: unknown; fecha?: unknown } | null
  if (!b || typeof b.csv !== 'string' || !b.csv.trim()) return NextResponse.json({ error: 'datos_no_validos', errores: ['csv obligatorio'] }, { status: 400 })
  if (b.csv.length > MAX_CSV) return NextResponse.json({ error: 'datos_no_validos', errores: ['el CSV supera 2 MB'] }, { status: 413 })
  const csv = b.csv
  const respuesta = (r: { ok: true } | { ok: false; errores: { linea: number; motivo: string }[]; conflicto?: true }, extra: object) =>
    r.ok ? NextResponse.json({ ...r, ...extra }, { status: 201 })
      : NextResponse.json({ error: r.conflicto ? 'apertura_ya_existe' : 'importacion_no_valida', errores: r.errores.map((e) => (e.linea ? `línea ${e.linea}: ${e.motivo}` : e.motivo)) }, { status: r.conflicto ? 409 : 422 })
  try {
    if (b.accion === 'plan') return respuesta(await ejecutarF6(c.empresaId, (repo, f6) => importarPlan(repo, f6, csv)), {})
    if (b.accion === 'saldos') {
      const fecha = typeof b.fecha === 'string' ? b.fecha : ''
      return respuesta(await ejecutarF6(c.empresaId, (repo) => importarSaldosIniciales(repo, csv, fecha, { usuarioId: c.usuarioId })), {})
    }
    if (b.accion === 'terceros') return respuesta(await ejecutarF6(c.empresaId, (_repo, f6) => importarTerceros(f6, csv, (nif) => validarNifCif(nif), c.usuarioId)), {})
  } catch (e) {
    const { status, body } = respuestaDeErrorBdFase(e, '0006_gestoria.sql')
    return NextResponse.json(body, { status })
  }
  return NextResponse.json({ error: 'datos_no_validos', errores: ['accion: plan | saldos | terceros'] }, { status: 400 })
}
