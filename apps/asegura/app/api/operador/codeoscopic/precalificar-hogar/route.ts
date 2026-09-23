import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { origenRetarificacion, type OrigenRetarificacion } from '@/lib/cartera-ficha'
import { precalificarHogarCartera, partirDireccion, type ResueltosHogar, type CatastroHogar } from '@/lib/codeoscopic/desde-cartera-hogar'
import { catastroPorReferencia, motivoCatastro } from '@/lib/codeoscopic/catastro-referencia'
import { resolverConfig, explicarConfig } from '@/lib/codeoscopic/config'
import {
  estadosCiviles,
  municipiosPorCp,
  lineasDeSeguro,
  hogarDisponible,
  catalogoHogar,
  tiposDeVia,
  emparejar,
  elegirDefecto,
  pareceOpcionPropietario,
  DEFECTOS_HOGAR,
  DEFECTO_TIPO_VIA,
  type Opcion,
} from '@/lib/codeoscopic/catalogos'
import { estadoConsumo } from '@/lib/codeoscopic/cotizar'
import {
  resumen as armarResumenHogar,
  CATALOGOS_PANTALLA,
  CAMPO_DE_CATALOGO,
  type CatalogoPantalla,
} from '@/lib/codeoscopic/resumen-hogar'
import { revisarDatosHogar, type DatosHogar } from '@/lib/codeoscopic/peticion-hogar'
import { registrarErrorCartera } from '@/lib/error-cartera'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DefectosHogar = Record<CatalogoPantalla | 'road-types', string | null>

/**
 * `GET /api/operador/codeoscopic/precalificar-hogar?polizaId=&resueltos=&correcciones=&referencia=`
 * — la ficha de HOGAR de una póliza YA EXISTENTE (retarificar), gratis, para
 * que `apps/plataforma` → `/correduria` la pinte sin saltar a asegura.
 *
 * Hermana de `/precalificar-hogar-nuevo` (oportunidad SIN póliza, riesgo del
 * Catastro): aquí el riesgo sale de la ficha —`origenRetarificacion()`, misma
 * función que usa la pantalla `PantallaHogar` de esta app en
 * `/cartera/poliza/[polizaId]`— y **nunca** cotiza. Cero lógica nueva: es la
 * MISMA secuencia que esa pantalla, expuesta por el puerto para que plataforma
 * no la reimplemente y las dos puedan divergir.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const params = new URL(req.url).searchParams
  const polizaId = (params.get('polizaId') ?? '').trim()
  if (polizaId === '') {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'falta el parámetro polizaId', gastado: '0,00€' },
      { status: 400 },
    )
  }
  const resueltosQuery = leerJson(params.get('resueltos')) ?? {}
  const correccionesQuery = leerJson(params.get('correcciones')) ?? {}
  const referenciaQuery = cadena(params.get('referencia'))

  let correduriaId: string
  try {
    const c = await correduriaUnica()
    if (!c) {
      return NextResponse.json(
        {
          estado: 'error',
          causa: 'sin_correduria',
          mensaje: 'La base responde pero no hay ninguna correduría, así que no se precalifica.',
          gastado: '0,00€',
        },
        { status: 503 },
      )
    }
    correduriaId = c.id
  } catch (e) {
    return NextResponse.json(
      {
        estado: 'error',
        causa: registrarErrorCartera('precalificar-hogar/correduria', e),
        mensaje: 'No se ha podido resolver la correduría.',
        gastado: '0,00€',
      },
      { status: 502 },
    )
  }

  let origen: OrigenRetarificacion | null
  try {
    origen = await origenRetarificacion(correduriaId, polizaId)
  } catch (e) {
    return NextResponse.json(
      {
        estado: 'error',
        causa: registrarErrorCartera('precalificar-hogar/ficha', e),
        mensaje:
          'No se ha podido leer la ficha de esta póliza. Esto NO significa que la póliza no exista: ' +
          'significa que la consulta a la cartera ha fallado.',
        gastado: '0,00€',
      },
      { status: 502 },
    )
  }
  if (!origen) {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'póliza no encontrada en la cartera de esta correduría', gastado: '0,00€' },
      { status: 404 },
    )
  }
  if (origen.tipo !== 'hogar') {
    return NextResponse.json(
      {
        estado: 'error',
        causa: 'otro',
        mensaje: `esta ruta solo precalifica hogar; el ramo de esta póliza es «${origen.tipo}»`,
        gastado: '0,00€',
      },
      { status: 409 },
    )
  }

  // ── El Catastro, solo si el corredor ha elegido el piso (gratis) ─────────
  // Para las pólizas sin m²/año/CP: rellena los huecos, nunca pisa la ficha.
  // La elegida en pantalla manda; si no, la que el corredor guardó en la póliza.
  const referenciaUsada = referenciaQuery?.replace(/[\s-]/g, '').toUpperCase() ?? origen.referenciaCatastral
  let catastro: CatastroHogar | null = null
  if (referenciaUsada !== null) {
    const c = await catastroPorReferencia(referenciaUsada)
    if (c.estado !== 'ok') {
      return NextResponse.json(
        { estado: 'error', causa: 'otro', mensaje: motivoCatastro(c), gastado: '0,00€' },
        { status: c.estado === 'error' ? 503 : 404 },
      )
    }
    catastro = c.catastro
  }

  // ── Catálogos y ramos, todo gratis y con el interruptor APAGADO ───────────
  const r = resolverConfig(process.env, { ignorarInterruptor: true })
  if (r.estado !== 'lista') {
    return NextResponse.json({ estado: 'sin_configurar', mensaje: explicarConfig(r), gastado: '0,00€' }, { status: 503 })
  }
  const cfg = r.config

  const catalogos: Partial<Record<CatalogoPantalla, Opcion[]>> = {}
  const fallosCatalogo: string[] = []
  const cpRiesgo = origen.hogar?.cp ?? catastro?.codigoPostal ?? origen.cliente.codigoPostal

  const [civiles, municipios, lineas, viasRaw, ...cats] = await Promise.all([
    estadosCiviles(cfg).catch((): Opcion[] => []),
    cpRiesgo ? municipiosPorCp(cfg, cpRiesgo).catch((): Opcion[] => []) : Promise.resolve<Opcion[]>([]),
    lineasDeSeguro(cfg).catch((): Opcion[] => []),
    tiposDeVia(cfg).catch((): Opcion[] | null => null),
    ...CATALOGOS_PANTALLA.map((n) => catalogoHogar(cfg, n).catch((): Opcion[] | null => null)),
  ])
  const ramo = hogarDisponible(lineas)
  let vias: Opcion[] = []
  if (viasRaw === null || viasRaw.length === 0) fallosCatalogo.push('road-types')
  else vias = viasRaw
  CATALOGOS_PANTALLA.forEach((n, i) => {
    const lista = cats[i]
    if (lista === null || lista.length === 0) fallosCatalogo.push(n)
    else catalogos[n] = lista
  })
  if (civiles.length === 0) fallosCatalogo.push('marital-statuses')

  const estadoCivilAuto = emparejar(civiles, origen.cliente.estadoCivil)

  const defectos = {} as DefectosHogar
  for (const n of CATALOGOS_PANTALLA) defectos[n] = elegirDefecto(catalogos[n] ?? [], DEFECTOS_HOGAR[n])?.id ?? null
  // El tipo de vía se empareja con la dirección de la FICHA (póliza o gemela);
  // si la ficha no trae calle, con la del Catastro; solo después, el defecto.
  const viaDeLaFicha =
    emparejar(vias, partirDireccion(origen.hogar?.direccion ?? null).tipoVia) ??
    (origen.hogar?.direccion ? null : emparejar(vias, catastro?.direccion?.tipoVia ?? null))
  const viaDefecto = viaDeLaFicha ?? elegirDefecto(vias, DEFECTO_TIPO_VIA)
  defectos['road-types'] = viaDefecto?.id ?? null
  const propietarioEsTomador = pareceOpcionPropietario(elegirDefecto(catalogos.uses ?? [], DEFECTOS_HOGAR.uses))

  // Lo que la pantalla ya haya elegido (`resueltosQuery`) manda sobre el
  // defecto; sin nada elegido, se calcula igual que `PantallaHogar`.
  const resueltos: ResueltosHogar = {
    municipioId: numero(resueltosQuery.municipioId) ?? (municipios.length === 1 ? Number(municipios[0].id) : null),
    estadoCivilId: cadena(resueltosQuery.estadoCivilId) ?? estadoCivilAuto?.id ?? null,
    tipoViaId: cadena(resueltosQuery.tipoViaId) ?? defectos['road-types'],
    tipoVivienda: cadena(resueltosQuery.tipoVivienda) ?? defectos['property-types'],
    uso: cadena(resueltosQuery.uso) ?? defectos.uses,
    ocupacion: cadena(resueltosQuery.ocupacion) ?? defectos['occupancy-types'],
    ubicacion: cadena(resueltosQuery.ubicacion) ?? defectos.locations,
    material: cadena(resueltosQuery.material) ?? defectos['build-materials'],
    calidad: cadena(resueltosQuery.calidad) ?? defectos['build-qualities'],
    alarma: cadena(resueltosQuery.alarma) ?? defectos['alarm-types'],
    puertasSecundarias: cadena(resueltosQuery.puertasSecundarias) ?? defectos['door-types'],
    asentamiento: cadena(resueltosQuery.asentamiento) ?? defectos['settlement-types'],
    propietarioEsTomador:
      typeof resueltosQuery.propietarioEsTomador === 'boolean' ? resueltosQuery.propietarioEsTomador : propietarioEsTomador,
    supuestos: {
      tipoVia: resueltosQuery.tipoViaId === undefined && viaDeLaFicha === null && viaDefecto !== null,
      ...Object.fromEntries(
        CATALOGOS_PANTALLA.map((n) => [CAMPO_DE_CATALOGO[n], resueltosQuery[CAMPO_DE_CATALOGO[n]] === undefined]),
      ),
    },
  }

  const pre = precalificarHogarCartera(
    origen.cliente,
    { numeroPoliza: origen.poliza.numeroPoliza, fechaVencimiento: origen.poliza.fechaVencimiento, hogar: origen.hogar },
    resueltos,
    hoyIso(),
    catastro,
  )

  // Correcciones libres (texto/número/euros/fecha/sí-no), igual que el navegador.
  const corregidos = new Set(Object.keys(correccionesQuery))
  const preFinal =
    corregidos.size === 0
      ? pre
      : {
          ...pre,
          datos: { ...pre.datos, ...correccionesQuery } as Partial<DatosHogar>,
          faltan: revisarDatosHogar({ ...pre.datos, ...correccionesQuery } as Partial<DatosHogar>),
          supuestos: pre.supuestos.filter((s) => !corregidos.has(s.campo as string)),
        }

  const consumo = await estadoConsumo(correduriaId)
  const resumen = armarResumenHogar(preFinal, { catalogos, estadosCiviles: civiles, municipios, corregidos, nivel: 'corredor' })

  return NextResponse.json({
    estado: 'ok',
    polizaId,
    etiquetaCliente: origen.etiqueta,
    primaActual: origen.primaAnual,
    ...(catastro
      ? {
          catastro: {
            referencia: referenciaUsada,
            /** La que ya está guardada en la póliza (no hace falta ofrecer guardarla). */
            guardada: origen.referenciaCatastral !== null && referenciaUsada === origen.referenciaCatastral,
            direccionLegible: direccionLegible(catastro),
            metrosCuadrados: catastro.metrosCuadrados,
            anioConstruccion: catastro.anioConstruccion,
            codigoPostal: catastro.codigoPostal,
          },
        }
      : {}),
    resumen,
    defectos,
    vias,
    catalogos,
    estadosCiviles: civiles,
    municipios,
    fallosCatalogo,
    ramo,
    consumo,
    gastado: '0,00€',
  })
}

function direccionLegible(catastro: CatastroHogar): string | null {
  const d = catastro.direccion
  if (!d?.nombre) return null
  let s = `${d.tipoVia ?? ''} ${d.nombre} ${d.numero ?? ''}`.replace(/\s+/g, ' ').trim()
  if (d.planta) s += `, ${d.planta}º`
  if (d.puerta) s += ` ${d.puerta}`
  return s
}

function leerJson(v: string | null): Record<string, unknown> | null {
  if (!v) return null
  try {
    const j: unknown = JSON.parse(v)
    return typeof j === 'object' && j !== null && !Array.isArray(j) ? (j as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function numero(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10)
}
