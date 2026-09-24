import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { resolverConfig, explicarConfig } from '@/lib/codeoscopic/config'
import {
  lineasDeSeguro,
  vendoresDeSeguro,
  productosDeLinea,
  companiaDisponible,
  mencionaCompania,
} from '@/lib/codeoscopic/catalogos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ConfigCodeoscopic = Parameters<typeof productosDeLinea>[0]
type Opcion = { id: string; nombre: string }
type ProductosPorLinea = Record<
  string,
  { estado: 'ok'; lista: Opcion[] } | { estado: 'error'; mensaje: string }
>

/**
 * Trae los productos de CADA ramo en paralelo y, de paso, en qué ramos
 * aparece la compañía buscada (buscando dentro del JSON crudo del producto,
 * porque su forma no está documentada). Un ramo cuyo listado falle sale con
 * `estado: 'error'`, no como lista vacía: «no se pudo mirar» no es «no hay».
 */
async function productosPorLinea(
  config: ConfigCodeoscopic,
  lineas: Opcion[],
  buscar: string,
): Promise<{ productos: ProductosPorLinea; ramosConLaBuscada: string[] }> {
  const productos: ProductosPorLinea = {}
  const ramosConLaBuscada: string[] = []
  await Promise.all(
    lineas.map(async (l) => {
      try {
        const p = await productosDeLinea(config, l.id)
        productos[l.id] = { estado: 'ok', lista: p.productos }
        if (buscar !== '' && mencionaCompania(p.crudo, buscar)) ramosConLaBuscada.push(l.nombre)
      } catch (e) {
        productos[l.id] = { estado: 'error', mensaje: e instanceof Error ? e.message : String(e) }
      }
    }),
  )
  return { productos, ramosConLaBuscada }
}

/** ¿Está `buscar` entre las compañías, y en qué ramos tiene producto? */
function resolverBuscada(companias: Opcion[], buscar: string, ramosConLaBuscada: string[]) {
  if (buscar === '') return { estado: 'desconocido' as const }
  return { ...companiaDisponible(companias, buscar), nombreBuscado: buscar, ramos: ramosConLaBuscada.sort() }
}

/**
 * GET /api/operador/codeoscopic/companias?buscar=fidelidade — las compañías
 * que Avant2 tiene abiertas para nuestra organización y, por ramo, los
 * productos que tarifican. Con `buscar`, dice además si ESA compañía está
 * (tres estados) y en qué ramos aparece un producto suyo.
 *
 * **No gasta ninguna cotización**: `/insurance-vendors` y
 * `/insurance-lines/{id}/products` son catálogos (GET). Por eso corre, como
 * `/lineas`, con `CODEOSCOPIC_TARIFICACION_ACTIVA` apagado. Es la
 * comprobación de «¿ya nos han dado de alta a X?» sin email y sin pagar.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }
  const r = resolverConfig(process.env, { ignorarInterruptor: true })
  if (r.estado !== 'lista') {
    return NextResponse.json(
      { estado: 'sin_configurar', mensaje: explicarConfig(r), buscada: { estado: 'desconocido' } },
      { status: 200 },
    )
  }
  const buscar = new URL(req.url).searchParams.get('buscar')?.trim() ?? ''
  try {
    const [companias, lineas] = await Promise.all([vendoresDeSeguro(r.config), lineasDeSeguro(r.config)])
    const { productos, ramosConLaBuscada } = await productosPorLinea(r.config, lineas, buscar)
    const buscada = resolverBuscada(companias, buscar, ramosConLaBuscada)
    return NextResponse.json({ estado: 'ok', companias, productos, buscada, gastado: '0,00€' })
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', mensaje: e instanceof Error ? e.message : String(e), buscada: { estado: 'desconocido' } },
      { status: 502 },
    )
  }
}
