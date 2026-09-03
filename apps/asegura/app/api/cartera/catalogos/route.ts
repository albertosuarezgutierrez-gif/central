import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { resolverConfig, explicarConfig } from '@/lib/codeoscopic/config'
import {
  marcas,
  modelos,
  versiones,
  tiposDeMotor,
  tiposDeGaraje,
  estadosCiviles,
  municipiosPorCp,
  lineasDeSeguro,
  hogarDisponible,
  catalogoHogar,
  esCatalogoHogar,
  CATALOGOS_HOGAR,
  tiposDeVia,
} from '@/lib/codeoscopic/catalogos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Catálogos de Codeoscopic para los desplegables de la pantalla.
 *
 * 🚨 **Nada de aquí cuesta dinero.** Son `GET` de consulta; la cotización es
 * otra ruta. Por eso este puerto se resuelve con el interruptor de tarificación
 * APAGADO (`ignorarInterruptor`): elegir marca y modelo tiene que poder hacerse
 * antes de encender el gasto, y de hecho es lo que permite dejar la pantalla
 * lista y pulsar «cotizar» solo cuando se quiere pagar.
 */
export async function GET(req: Request) {
  await requireSession()

  const url = new URL(req.url)
  const tipo = url.searchParams.get('tipo')

  const r = resolverConfig(process.env, { ignorarInterruptor: true })
  if (r.estado !== 'lista') {
    return NextResponse.json({ error: explicarConfig(r) }, { status: 503 })
  }
  const config = r.config

  try {
    switch (tipo) {
      case 'marcas':
        return NextResponse.json({ opciones: await marcas(config) })
      case 'modelos': {
        const marcaId = url.searchParams.get('marcaId')
        if (!marcaId) return NextResponse.json({ error: 'falta marcaId' }, { status: 400 })
        return NextResponse.json({ opciones: await modelos(config, marcaId) })
      }
      case 'motores':
        return NextResponse.json({ opciones: await tiposDeMotor(config) })
      case 'versiones': {
        const marcaId = url.searchParams.get('marcaId')
        const modeloId = url.searchParams.get('modeloId')
        // 🚨 `motor` es obligatorio: sin él el vendor devuelve 400 y la pantalla
        // se queda sin versiones — que es justo el dato que hay que elegir.
        // Se rechaza aquí, con su nombre, en vez de dejar que el 400 del vendor
        // llegue crudo a la pantalla (fue lo que pasó el 03/09/2026).
        const motor = url.searchParams.get('motor')
        if (!marcaId || !modeloId || !motor) {
          return NextResponse.json(
            { error: 'faltan marcaId, modeloId y motor' },
            { status: 400 },
          )
        }
        return NextResponse.json({ opciones: await versiones(config, marcaId, modeloId, motor) })
      }
      case 'garajes':
        return NextResponse.json({ opciones: await tiposDeGaraje(config) })
      case 'estados-civiles':
        return NextResponse.json({ opciones: await estadosCiviles(config) })
      case 'municipios': {
        const cp = url.searchParams.get('cp')
        if (!cp) return NextResponse.json({ error: 'falta cp' }, { status: 400 })
        return NextResponse.json({ opciones: await municipiosPorCp(config, cp) })
      }
      // ── Hogar ── los diez catálogos `/home/*`, por nombre CERRADO: el path se
      // construye con él y no se aceptan nombres que no estén en la lista.
      case 'hogar': {
        const nombre = url.searchParams.get('nombre')
        if (!esCatalogoHogar(nombre)) {
          return NextResponse.json(
            { error: `falta o no existe el catálogo de hogar «${nombre ?? ''}»: vale uno de ${CATALOGOS_HOGAR.join(', ')}` },
            { status: 400 },
          )
        }
        return NextResponse.json({ opciones: await catalogoHogar(config, nombre) })
      }
      // Los tipos de vía (`Calle`, `Avenida`…): van en `risk.address.roadType.id` de hogar.
      case 'vias':
        return NextResponse.json({ opciones: await tiposDeVia(config) })
      // Los ramos habilitados para esta organización y, resuelto aquí mismo,
      // si hogar está entre ellos (con su id EXACTO). Tres estados, no dos.
      case 'lineas': {
        const lineas = await lineasDeSeguro(config)
        return NextResponse.json({ opciones: lineas, hogar: hogarDisponible(lineas) })
      }
      default:
        return NextResponse.json({ error: `catálogo desconocido: ${tipo}` }, { status: 400 })
    }
  } catch (e) {
    // Un catálogo que no se puede leer NO se devuelve como lista vacía: eso
    // pintaría «esta marca no tiene modelos» sobre un fallo de red.
    return NextResponse.json(
      { error: `No se pudo leer el catálogo: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }
}
