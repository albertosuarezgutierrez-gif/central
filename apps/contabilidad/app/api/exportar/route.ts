import { NextResponse } from 'next/server'
import { exportar, aLatin1, type FormatoExport } from '@central/module-contabilidad'
import { leerContexto } from '@/lib/contexto'
import { conRepo } from '@/lib/db'
import { LIMITE_ASIENTOS_LIBRO } from '@/lib/repo-f5'

// GET /api/exportar?formato=a3|sage|holded&que=diario|plan&anio=AAAA[&codigoA3=42&longitudCuenta=12] — descarga del diario o del plan de cuentas.
// Solo la empresa de la sesión (RLS + contexto revalidado en BD). ⚠ TODOS los formatos están «pendientes de contrastar con un fichero real»: la
// respuesta lo dice en la cabecera `x-formato-pendiente-contrastar` y la pantalla /exportar lo repite. Un diario truncado NO se entrega (estaría incompleto).
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const formato = q.get('formato') as FormatoExport | null
  const que = q.get('que') ?? 'diario'
  if (formato !== 'a3' && formato !== 'sage' && formato !== 'holded') return NextResponse.json({ error: 'formato: a3 | sage | holded' }, { status: 400 })
  if (que !== 'diario' && que !== 'plan') return NextResponse.json({ error: 'que: diario | plan' }, { status: 400 })
  const anio = Number(q.get('anio'))
  if (que === 'diario' && !(Number.isInteger(anio) && anio >= 2000 && anio <= 2200)) return NextResponse.json({ error: 'anio obligatorio (2000-2200)' }, { status: 400 })
  const a3 = formato === 'a3' ? { codigoEmpresa: q.get('codigoA3') ?? '', ...(q.get('longitudCuenta') ? { longitudCuenta: Number(q.get('longitudCuenta')) } : {}) } : undefined
  try {
    const datos = await conRepo(c.empresaId, async (repo) => {
      const cuentas = (await repo.planCuentas()).map((x) => ({ codigo: x.codigo, nombre: x.nombre }))
      if (que === 'plan') return { cuentas, asientos: [], truncado: false }
      const hasta = `${anio}-12-31`
      const { asientos, truncado } = await repo.asientosPeriodo({ desde: `${anio}-01-01`, hasta, limite: LIMITE_ASIENTOS_LIBRO })
      return { cuentas, asientos, truncado }
    }, { timeout: 30_000 })
    if (datos.truncado) return NextResponse.json({ error: 'diario_truncado', errores: ['El ejercicio tiene demasiados asientos para una sola descarga.'] }, { status: 422 })
    const r = exportar(formato, que, datos, a3)
    await conRepo(c.empresaId, (repo) => repo.auditar({ actor: 'usuario', usuarioId: c.usuarioId, accion: 'exportar', entidad: formato, detalle: { que, anio: que === 'diario' ? anio : null, lineas: r.lineas } })).catch(() => undefined)
    const nombre = `${que}-${formato}${que === 'diario' ? `-${anio}` : ''}.${r.extension}`
    const cuerpo = r.codificacion === 'latin1' ? aLatin1(r.contenido) : new TextEncoder().encode(r.contenido)
    return new Response(Buffer.from(cuerpo), {
      headers: {
        'cache-control': 'no-store', 'content-disposition': `attachment; filename="${nombre}"`, 'x-formato-pendiente-contrastar': 'true',
        'content-type': r.codificacion === 'latin1' ? 'text/plain; charset=iso-8859-1' : 'text/csv; charset=utf-8',
      },
    })
  } catch (e) {
    // Los errores del generador (asiento descuadrado, cuenta fuera del plan, código de empresa A3…) son del usuario: 422 con su mensaje.
    if (e instanceof Error && e.name === 'ErrorContable') return NextResponse.json({ error: 'exportacion_no_valida', errores: [e.message] }, { status: 422 })
    return NextResponse.json({ error: 'error_interno', errores: ['No se pudo generar el fichero.'] }, { status: 500 })
  }
}
