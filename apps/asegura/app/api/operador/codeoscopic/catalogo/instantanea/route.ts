import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { resolverConfig, explicarConfig } from '@/lib/codeoscopic/config'
import { peticion } from '@/lib/codeoscopic/cliente'
import { resumenInstantanea } from '@/lib/codeoscopic/catalogo-companias'
import { recorrerCatalogo } from '@/lib/codeoscopic/catalogo-instantanea'
import { guardarInstantanea, hayCatalogo } from '@/lib/codeoscopic/catalogo-companias-bd'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/operador/codeoscopic/catalogo/instantanea — saca de Avant2 TODO el catálogo POR COMPAÑÍA
 * que es GRATIS (lista cerrada de GET de `lib/codeoscopic/catalogo-companias.ts`: ramos, vendors,
 * productos+configs por ramo, compañías DGS, formas y frecuencias de pago) y lo guarda como una
 * INSTANTÁNEA en `seguros.codeoscopic_catalogo`. Pausa entre llamadas y tope de 60.
 *
 * **No gasta**: ninguna llamada pasa por el libro de consumo porque ninguna es facturable; por eso corre
 * con `ignorarInterruptor` (como `/companias`). Cada path se re-comprueba contra la lista ANTES de llamar.
 * Fail-closed: sin la tabla (SQL 2026-11-04f no aplicado) → 503 `sin_migracion` SIN llamar al vendor.
 * Responde solo el RESUMEN (nº de compañías/productos por ramo): es lo que imprime el workflow.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
  let tabla = false
  try {
    tabla = await hayCatalogo()
  } catch {
    tabla = false
  }
  if (!tabla) {
    return NextResponse.json({ estado: 'sin_migracion', mensaje: 'falta aplicar prisma/sql/2026-11-04f_codeoscopic_catalogo.sql' }, { status: 503 })
  }
  const r = resolverConfig(process.env, { ignorarInterruptor: true })
  if (r.estado !== 'lista') return NextResponse.json({ estado: 'sin_configurar', mensaje: explicarConfig(r) }, { status: 503 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const config = r.config
    const { filas, llamadasHechas } = await recorrerCatalogo((path) =>
      peticion(config, { metodo: 'GET', path, timeoutMs: config.timeoutGenericoMs }),
    )
    const resumen = resumenInstantanea(filas)
    if (resumen.llamadas > 0 && resumen.errores === resumen.llamadas) {
      // Ni una sola respuesta: no se guarda una instantánea que diría «no hay nada».
      return NextResponse.json({ estado: 'error', motivo: 'todas_las_llamadas_fallaron', resumen }, { status: 502 })
    }
    const g = await guardarInstantanea(correduria.id, filas)
    return NextResponse.json({ estado: 'ok', instantaneaId: g.instantaneaId, filas: g.filas, llamadasHechas, resumen, gastado: '0,00€' })
  } catch (e) {
    return NextResponse.json({ estado: 'error', mensaje: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 500 })
  }
})
