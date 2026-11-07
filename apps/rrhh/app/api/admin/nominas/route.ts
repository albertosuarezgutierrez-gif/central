import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { listarNominas, listarPeriodosConNominas, periodoActual, parsePeriodo } from '@/lib/nominas'

export async function GET(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const { searchParams } = new URL(req.url)
    const periodoParam = searchParams.get('periodo')

    if (!periodoParam) {
      const periodos = await listarPeriodosConNominas(empresa_id)
      return NextResponse.json({ periodos })
    }

    try { parsePeriodo(periodoParam) } catch {
      return NextResponse.json({ error: 'Período inválido' }, { status: 400 })
    }

    const nominas = await listarNominas(empresa_id, periodoParam)
    return NextResponse.json({ nominas, periodo: periodoParam })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
}

/**
 * «Aprobar lote»: confirma varias nóminas en una operación reutilizando TAL CUAL la ruta de confirmar (no se toca ni se
 * duplica su lógica: PDF, documento del empleado, guarda `desgloseConfirmable`, envío a contabilidad). Cada una se confirma
 * por separado con la sesión de ESTA petición (la ruta llama a su propio `getSesion()` y filtra por su empresa): una que no
 * sea de la empresa da 404 y no se confirma. Secuencial; el resultado dice, POR ID, cuáles salieron y por qué no las demás.
 * Cada confirmación genera un PDF y espera a contabilidad (hasta 10 s): se procesan como mucho LOTE_CONFIRMAR por llamada y
 * con presupuesto de tiempo; las que no caben vuelven en `pendientes` (sin tocar) para la siguiente llamada.
 */
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Lo que se procesa por llamada (cabe en maxDuration). */
const LOTE_CONFIRMAR = 25
/** Lo que se admite en la petición (el resto sale en `pendientes`). */
const MAX_IDS = 500
const PRESUPUESTO_MS = 45_000

export async function POST(req: Request) {
  try {
    await getSesion()
    const cuerpo = await req.json().catch(() => ({}))
    const ids: unknown = cuerpo?.ids
    if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ error: 'Selecciona al menos una nómina' }, { status: 400 })
    if (ids.length > MAX_IDS) return NextResponse.json({ error: `Máximo ${MAX_IDS} nóminas por petición` }, { status: 400 })
    const unicos = [...new Set(ids.map(String))]
    if (!unicos.every(id => UUID.test(id))) return NextResponse.json({ error: 'Identificador de nómina inválido' }, { status: 400 })

    const { POST: confirmarUna } = await import('./[nominaId]/confirmar/route')
    const resultados: { id: string; ok: boolean; error?: string }[] = []
    const inicio = Date.now()
    for (const id of unicos.slice(0, LOTE_CONFIRMAR)) {
      if (Date.now() - inicio > PRESUPUESTO_MS) break
      try {
        const r = await confirmarUna(new Request(req.url, { method: 'POST' }), { params: Promise.resolve({ nominaId: id }) })
        const j = await r.json().catch(() => ({}))
        resultados.push(r.ok ? { id, ok: true } : { id, ok: false, error: j?.error ?? `HTTP ${r.status}` })
      } catch (e) {
        resultados.push({ id, ok: false, error: e instanceof Error ? e.message : 'Error al confirmar' })
      }
    }
    const pendientes = unicos.slice(resultados.length)
    const confirmadas = resultados.filter(r => r.ok).length
    return NextResponse.json({ confirmadas, fallidas: resultados.length - confirmadas, resultados, pendientes })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
}
