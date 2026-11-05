import { NextResponse } from 'next/server'
import { esModeloAeat, esModeloAnual, esPeriodoModelo } from '@central/module-contabilidad'
import { leerContexto } from '@/lib/contexto'
import { conEmpresa } from '@/lib/db'
import { repoF4Sql } from '@/lib/repo-f4'
import { repoSql } from '@/lib/repo'
import { calcularConDatos, guardarCalculo } from '@/lib/impuestos'
import { cargarEntradaModelo } from '@/lib/impuestos-carga'

// POST /api/impuestos/calcular { modelo, anio, periodo, complementaria? } — calcula el modelo como BORRADOR y lo guarda (dueño o gestor).
// Nada se presenta ni se envía: es un borrador revisable. Recalcular un borrador lo sustituye; uno revisado hay que devolverlo antes;
// uno presentado solo admite una complementaria pedida expresamente.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as { modelo?: unknown; anio?: unknown; periodo?: unknown; complementaria?: unknown } | null
  if (!b || !esModeloAeat(b.modelo) || !esPeriodoModelo(b.periodo) || typeof b.anio !== 'number' || !Number.isInteger(b.anio) || b.anio < 2000 || b.anio > 2200) {
    return NextResponse.json({ error: 'datos_no_validos', errores: ['modelo, anio y periodo obligatorios'] }, { status: 400 })
  }
  if (esModeloAnual(b.modelo) !== (b.periodo === '0A')) return NextResponse.json({ error: 'periodo_invalido', errores: [`el modelo ${b.modelo} ${esModeloAnual(b.modelo) ? 'es anual (0A)' : 'es trimestral (1T-4T)'}`] }, { status: 400 })
  const carga = await cargarEntradaModelo(c.empresaId, b.modelo, b.anio, b.periodo)
  const calculo = calcularConDatos(carga.entrada)
  const id = c.empresaId.toLowerCase()
  const g = await conEmpresa(c.empresaId, async (tx) => {
    const r = await guardarCalculo(repoF4Sql(tx, id), calculo, carga.extra, { usuarioId: c.usuarioId, complementaria: b.complementaria === true })
    if (r.ok) await repoSql(tx, id).auditar({ actor: 'usuario', usuarioId: c.usuarioId, accion: 'calcular_declaracion', entidad: 'declaraciones', entidadId: r.id, detalle: { modelo: b.modelo, anio: b.anio, periodo: b.periodo, version: r.version, resultado: calculo.resultado } })
    return r
  }, { timeout: 30_000 }).catch(() => null)
  if (g === null) return NextResponse.json({ error: 'impuestos_no_disponible', errores: ['No se pudo completar la operación (¿falta aplicar el esquema de la fase 4, 0004_impuestos.sql?).'] }, { status: 503 })
  if (!g.ok) return NextResponse.json({ error: 'no_guardado', errores: g.errores }, { status: 409 })
  return NextResponse.json({ id: g.id, version: g.version, resultado: calculo.resultado, noSoportado: calculo.noSoportado }, { status: g.creada ? 201 : 200 })
}
