import { NextResponse } from 'next/server'
import { borrador200, borrador202, borradorIsCsv, borradorIsHtml, type CalculoIs } from '@central/module-contabilidad'
import { leerContexto } from '@/lib/contexto'
import { conF5 } from '@/lib/cierre-carga'
import { cuentasAnuales } from '@/lib/cierre'
import { entrada200, entrada202 } from '@/lib/sociedades-form'

// GET /api/impuestos/sociedades?modelo=200|202&anio=2026&formato=html|csv|json&… — BORRADOR del modelo 200 (IS) o 202 (pagos fraccionados).
// Sin fichero oficial (diseño pendiente de contrastar) y sin validez ante la AEAT. Un dato no informado hace el resultado `null` (nunca 0).
// Campos 200: ajp, ajn, comp, tipo, ded, ret, pf · campos 202: periodo (1P|2P|3P), modalidad (art40_2|art40_3), cib, dedb, retb, bim, retp, pag, pct.
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const url = new URL(req.url)
  const q = Object.fromEntries(url.searchParams.entries())
  const anio = Number(q.anio)
  const modelo = q.modelo
  const formato = q.formato ?? 'json'
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2200 || (modelo !== '200' && modelo !== '202') || !['html', 'csv', 'json'].includes(formato)) {
    return NextResponse.json({ error: 'parametros_no_validos', errores: ['modelo (200|202), anio y formato (html|csv|json)'] }, { status: 400 })
  }
  let calculo: CalculoIs | undefined
  let errores: string[] = []
  let empresa: { razonSocial: string; nif: string } | null = null
  try {
    const datos = await conF5(c.empresaId, async (repo, f5) => ({ ca: modelo === '200' ? await cuentasAnuales(repo, f5, anio) : null, e: await repo.empresa() }))
    empresa = datos.e ? { razonSocial: datos.e.razonSocial, nif: datos.e.nif } : null
    if (modelo === '200') {
      if (!datos.ca) return NextResponse.json({ error: 'ejercicio_inexistente', errores: [`no existe el ejercicio ${anio}`] }, { status: 404 })
      const r = entrada200(q, anio, datos.ca.pyg.resultadoAntesImpuestos)
      errores = r.errores
      calculo = borrador200(r.entrada)
    } else {
      const r = entrada202(q, anio)
      errores = r.errores
      calculo = borrador202(r.entrada)
    }
  } catch {
    return NextResponse.json({ error: 'no_disponible', errores: ['No se pudo leer el ejercicio.'] }, { status: 503 })
  }
  if (!calculo) return NextResponse.json({ error: 'no_disponible', errores: ['No se pudo calcular el borrador.'] }, { status: 503 })
  const cab = { 'cache-control': 'no-store' }
  const generado = new Date().toISOString().slice(0, 10)
  if (formato === 'html') return new Response(borradorIsHtml(calculo, { empresa: empresa?.razonSocial ?? 'Empresa', ...(empresa ? { nif: empresa.nif } : {}), generado }), { headers: { ...cab, 'content-type': 'text/html; charset=utf-8' } })
  if (formato === 'csv') return new Response(borradorIsCsv(calculo), { headers: { ...cab, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="borrador-${modelo}-${anio}.csv"` } })
  return NextResponse.json({ calculo, errores }, { headers: cab })
}
