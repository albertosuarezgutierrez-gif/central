import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { clienteOrigenDe } from '@/lib/cartera-ficha'
import { precalificarSaludNueva, type ResueltosSaludNueva } from '@/lib/codeoscopic/desde-cartera-salud'
import { resolverConfig, explicarConfig, simulacionActiva } from '@/lib/codeoscopic/config'
import { estadoConsumo } from '@/lib/codeoscopic/cotizar'
import { estadosCiviles, emparejar, lineasDeSeguro, saludDisponible, type Opcion } from '@/lib/codeoscopic/catalogos'
import { sanearSupuestos, sanearReparos, type SupuestoPublico, type ReparoPublico } from '@/lib/codeoscopic/precalificar-publica'
import { registrarErrorCartera } from '@/lib/error-cartera'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/operador/codeoscopic/precalificar-salud-nuevo?clienteId=` — la
 * ficha de SALUD para un cliente que HOY no tiene ninguna póliza, gratis.
 * Hermana de `/precalificar-vida-nuevo`, mismo patrón.
 *
 * 🚨 **No gasta NADA.** Toda respuesta lleva `gastado: '0,00€'`.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const clienteId = (new URL(req.url).searchParams.get('clienteId') ?? '').trim()
  if (clienteId === '') {
    return error(400, 'otro', 'falta el parámetro clienteId')
  }

  let correduriaId: string
  try {
    const c = await correduriaUnica()
    if (!c) {
      return error(
        503,
        'sin_correduria',
        'La base responde pero no hay ninguna correduría, así que ni se consulta la cartera sin ' +
          'filtro ni se precalifica. Esto NO significa que el cliente no exista.',
      )
    }
    correduriaId = c.id
  } catch (e) {
    return error(502, registrarErrorCartera('precalificar-salud-nuevo/correduria', e), 'No se ha podido resolver la correduría.')
  }

  let origen: Awaited<ReturnType<typeof clienteOrigenDe>>
  try {
    origen = await clienteOrigenDe(correduriaId, clienteId)
  } catch (e) {
    return error(
      502,
      registrarErrorCartera('precalificar-salud-nuevo/ficha', e),
      'No se ha podido leer la ficha de este cliente. Esto NO significa que el cliente no exista: ' +
        'significa que la consulta a la cartera ha fallado.',
    )
  }
  if (!origen) {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'cliente no encontrado en la cartera de esta correduría', gastado: '0,00€' },
      { status: 404 },
    )
  }

  const simulacion = simulacionActiva(process.env)

  const r = resolverConfig(process.env, { ignorarInterruptor: true })
  if (r.estado !== 'lista') {
    return NextResponse.json({ estado: 'sin_configurar', mensaje: explicarConfig(r), gastado: '0,00€' }, { status: 503 })
  }
  const cfg = r.config

  const [civiles, lineas] = await Promise.all([
    estadosCiviles(cfg).then(
      (o): Opcion[] | null => o,
      (): Opcion[] | null => null,
    ),
    lineasDeSeguro(cfg).catch((): Opcion[] => []),
  ])

  const estadoCivil = civiles === null ? null : emparejar(civiles, origen.cliente.estadoCivil)
  const estadoCivilMotivo =
    civiles === null
      ? 'No se ha podido leer el catálogo de estados civiles de Codeoscopic.'
      : estadoCivil !== null
        ? null
        : origen.cliente.estadoCivil === null || origen.cliente.estadoCivil.trim() === ''
          ? 'La ficha del cliente no dice el estado civil, así que no hay nada que emparejar: elígelo a mano.'
          : `La ficha dice «${origen.cliente.estadoCivil}» y el catálogo de Codeoscopic no tiene esa opción ` +
            'con ese nombre exacto. No se preselecciona por parecido: elígela a mano.'

  const salud = saludDisponible(lineas)

  const resueltos: ResueltosSaludNueva = {
    estadoCivilId: estadoCivil?.id ?? null,
    capital: null,
    modalidadDeseada: null,
  }
  const pre = precalificarSaludNueva(origen.cliente, resueltos, hoyIso())

  const consumo = await estadoConsumo(correduriaId)

  const supuestos: SupuestoPublico[] = sanearSupuestos(pre.supuestos)
  const faltan: ReparoPublico[] = sanearReparos(pre.faltan)

  return NextResponse.json(
    {
      estado: 'ok',
      etiquetaCliente: origen.etiqueta,
      faltan,
      supuestos,
      estadoCivil,
      estadoCivilMotivo,
      salud,
      consumo,
      simulacion,
      gastado: '0,00€',
    },
    { status: 200 },
  )
}

function error(status: number, causa: string, mensaje: string) {
  return NextResponse.json({ estado: 'error', causa, mensaje, gastado: '0,00€' }, { status })
}

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10)
}
