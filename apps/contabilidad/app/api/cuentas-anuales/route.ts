import { NextResponse } from 'next/server'
import { memoriaATexto } from '@central/module-contabilidad'
import { leerContexto } from '@/lib/contexto'
import { conF5 } from '@/lib/cierre-carga'
import { cuentasAnuales } from '@/lib/cierre'
import { esClaveLibro, tablaDeLibro } from '@/lib/libros-legales-carga'
import { aCsv, aHtmlImprimible } from '@/lib/informes/exportar'
import { paletaEmpresa, SELLO } from '@/lib/marca'

// GET /api/cuentas-anuales?anio=2026&libro=libro-diario|inventario-apertura|balances-comprobacion|inventario-cierre|balance-abreviado|balance-abreviado-pasivo|pyg-abreviada|memoria&formato=csv|html
// SOLO EXPORTACIÓN para legalizar / depositar (el titular o su gestor lo presenta con certificado). El fichero XBRL del depósito NO está implementado.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const anio = Number(q.get('anio'))
  const libro = q.get('libro') ?? ''
  const formato = q.get('formato') ?? 'csv'
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2200 || (libro !== 'memoria' && !esClaveLibro(libro)) || !['csv', 'html'].includes(formato)) {
    return NextResponse.json({ error: 'parametros_no_validos', errores: ['anio, libro y formato (csv|html) obligatorios'] }, { status: 400 })
  }
  const cab = { 'cache-control': 'no-store' }
  try {
    if (libro === 'memoria') {
      const m = await conF5(c.empresaId, async (repo, f5) => (await cuentasAnuales(repo, f5, anio))?.memoria ?? null)
      if (!m) return NextResponse.json({ error: 'ejercicio_inexistente', errores: [`no existe el ejercicio ${anio}`] }, { status: 404 })
      return new Response(`﻿${memoriaATexto(m)}`, { headers: { ...cab, 'content-type': 'text/plain; charset=utf-8', 'content-disposition': `attachment; filename="memoria-borrador-${anio}.txt"` } })
    }
    const r = await conF5(c.empresaId, async (repo, f5) => {
      const t = await tablaDeLibro(repo, f5, anio, libro as never)
      return { t, empresa: await repo.empresa() }
    })
    if (!r.t.ok) return NextResponse.json({ error: 'libro_no_disponible', errores: [r.t.error] }, { status: 422 })
    const nombre = `${r.t.tabla.clave}-${anio}`
    if (formato === 'html') {
      return new Response(aHtmlImprimible(r.t.tabla, { nombre: r.empresa?.razonSocial ?? 'Contabilidad', color: paletaEmpresa(r.empresa?.colorPrimario)?.brand ?? null, sello: SELLO }, new Date().toISOString().slice(0, 10)), { headers: { ...cab, 'content-type': 'text/html; charset=utf-8' } })
    }
    return new Response(aCsv(r.t.tabla), { headers: { ...cab, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${nombre}.csv"` } })
  } catch {
    return NextResponse.json({ error: 'no_disponible', errores: ['No se pudo leer el ejercicio (¿falta aplicar el esquema de la fase 5?).'] }, { status: 503 })
  }
}
