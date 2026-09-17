import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { clienteOrigenDe } from '@/lib/cartera-ficha'
import {
  precalificarHogarCartera,
  direccionDesdeCatastro,
  type CatastroHogar,
  type ResueltosHogar,
} from '@/lib/codeoscopic/desde-cartera-hogar'
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
import { paramsDnploc } from '@central/core-catastro'
import { bajarCatastro } from '@central/core-catastro/http'
import { registrarErrorCartera } from '@/lib/error-cartera'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RE_REF20 = /^[0-9A-Z]{20}$/

type DefectosHogar = Record<CatalogoPantalla | 'road-types', string | null>

/**
 * `GET /api/operador/codeoscopic/precalificar-hogar-nuevo?clienteId=&referencia=`
 * — la ficha de HOGAR sin póliza (oportunidad nueva), gratis, para que
 * `apps/plataforma` → `/correduria` la pinte SIN saltar de dominio. Hermana de
 * `/precalificar` (auto) y de `POST /api/operador/codeoscopic/hogar-nuevo`
 * (la que gasta 0,50€): esta consulta el Catastro y los catálogos, arma la
 * ficha entera y **nunca** cotiza — mismo criterio que el resto de `/codeoscopic/*`.
 *
 * Opcionales `resueltos`/`correcciones` (JSON en la query) recalculan la
 * ficha con lo que el corredor haya corregido en pantalla: es la MISMA
 * operación que `retarificador-hogar.tsx` hace en el navegador de asegura,
 * aquí en el servidor porque plataforma no tiene las funciones puras para
 * hacerlo en local sin duplicar la lógica de negocio.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const params = new URL(req.url).searchParams
  const clienteId = (params.get('clienteId') ?? '').trim()
  const referencia = (params.get('referencia') ?? '').replace(/[\s-]/g, '').toUpperCase()
  if (clienteId === '' || !RE_REF20.test(referencia)) {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'faltan clienteId o referencia (20 caracteres)', gastado: '0,00€' },
      { status: 400 },
    )
  }
  const resueltosQuery = leerJson(params.get('resueltos')) ?? {}
  const correccionesQuery = leerJson(params.get('correcciones')) ?? {}

  const correduria = await correduriaUnica().catch(() => null)
  if (!correduria) {
    return NextResponse.json(
      { estado: 'error', causa: 'sin_correduria', mensaje: 'No se ha podido resolver la correduría.', gastado: '0,00€' },
      { status: 503 },
    )
  }

  const origen = await clienteOrigenDe(correduria.id, clienteId).catch(() => null)
  if (!origen) {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'cliente no encontrado en la cartera de esta correduría', gastado: '0,00€' },
      { status: 404 },
    )
  }

  // ── El Catastro, gratis, EN EL SERVIDOR ───────────────────────────────────
  let catastro: CatastroHogar
  try {
    const datos = await bajarCatastro(referencia)
    if (datos === null) {
      return NextResponse.json(
        { estado: 'error', causa: 'otro', mensaje: 'El Catastro no tiene nada con esta referencia.', gastado: '0,00€' },
        { status: 404 },
      )
    }
    catastro = {
      metrosCuadrados: datos.superficie,
      anioConstruccion: datos.anioConstruccion,
      codigoPostal: datos.codigoPostal,
      uso: datos.uso,
      direccion: direccionDesdeCatastro(paramsDnploc(datos.direccion)),
    }
  } catch (e) {
    return NextResponse.json(
      {
        estado: 'error',
        causa: registrarErrorCartera('precalificar-hogar-nuevo/catastro', e),
        mensaje: `No se ha podido consultar el Catastro (${e instanceof Error ? e.message : String(e)}).`,
        gastado: '0,00€',
      },
      { status: 503 },
    )
  }

  // ── Catálogos y ramos, todo gratis y con el interruptor APAGADO ───────────
  const r = resolverConfig(process.env, { ignorarInterruptor: true })
  if (r.estado !== 'lista') {
    return NextResponse.json({ estado: 'sin_configurar', mensaje: explicarConfig(r), gastado: '0,00€' }, { status: 503 })
  }
  const cfg = r.config

  const catalogos: Partial<Record<CatalogoPantalla, Opcion[]>> = {}
  const fallosCatalogo: string[] = []
  const cpRiesgo = catastro.codigoPostal ?? origen.cliente.codigoPostal

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
  // El tipo de vía SÍ lo da el Catastro: se empareja con el catálogo del
  // vendor y solo cae al defecto si no casa.
  const viaDelCatastro = emparejar(vias, catastro.direccion?.tipoVia ?? null)
  const viaDefecto = viaDelCatastro ?? elegirDefecto(vias, DEFECTO_TIPO_VIA)
  defectos['road-types'] = viaDefecto?.id ?? null
  const propietarioEsTomador = pareceOpcionPropietario(elegirDefecto(catalogos.uses ?? [], DEFECTOS_HOGAR.uses))

  // Lo que la pantalla ya haya elegido (`resueltosQuery`) manda sobre el
  // defecto; sin nada elegido, se calcula igual que la página de asegura.
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
      tipoVia: resueltosQuery.tipoViaId === undefined && viaDelCatastro === null && viaDefecto !== null,
      ...Object.fromEntries(
        CATALOGOS_PANTALLA.map((n) => [CAMPO_DE_CATALOGO[n], resueltosQuery[CAMPO_DE_CATALOGO[n]] === undefined]),
      ),
    },
  }

  const pre = precalificarHogarCartera(
    origen.cliente,
    { numeroPoliza: null, fechaVencimiento: null, hogar: null },
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

  const consumo = await estadoConsumo(correduria.id)
  const resumen = armarResumenHogar(preFinal, { catalogos, estadosCiviles: civiles, municipios, corregidos, nivel: 'corredor' })

  return NextResponse.json({
    estado: 'ok',
    referencia,
    etiquetaCliente: origen.etiqueta,
    catastro: {
      direccionLegible: direccionLegible(catastro),
      metrosCuadrados: catastro.metrosCuadrados,
      anioConstruccion: catastro.anioConstruccion,
      codigoPostal: catastro.codigoPostal,
    },
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
