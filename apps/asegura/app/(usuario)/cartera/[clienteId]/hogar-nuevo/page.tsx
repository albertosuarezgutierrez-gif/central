import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSession } from '@/lib/session'
import { correduriaUnica } from '@/lib/cartera'
import { clienteOrigenDe } from '@/lib/cartera-ficha'
import {
  precalificarHogarCartera,
  direccionDesdeCatastro,
  type CatastroHogar,
  type ResueltosHogar,
} from '@/lib/codeoscopic/desde-cartera-hogar'
import { resolverConfig } from '@/lib/codeoscopic/config'
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
  type CatalogoHogar,
  type DisponibilidadHogar,
  type Opcion,
} from '@/lib/codeoscopic/catalogos'
import { estadoConsumo } from '@/lib/codeoscopic/cotizar'
import { resumen as armarResumenHogar, CATALOGOS_PANTALLA, CAMPO_DE_CATALOGO } from '@/lib/codeoscopic/resumen-hogar'
import { paramsDnploc } from '@central/core-catastro'
import { bajarCatastro } from '@central/core-catastro/http'
import RetarificadorHogar, { type DefectosHogar } from '../../poliza/[polizaId]/retarificador-hogar'

export const dynamic = 'force-dynamic'

const RE_REF20 = /^[0-9A-Z]{20}$/

/**
 * Presupuesto de HOGAR para un cliente que HOY no tiene ninguna póliza: una
 * oportunidad nueva sobre su residencia (o cualquier otra vivienda), tarificada
 * desde el Catastro en vez de desde una ficha. Es la MISMA pantalla y el mismo
 * botón que retarificar una póliza (`RetarificadorHogar`), solo que el riesgo
 * viene de una referencia catastral en vez de la cartera.
 *
 * Se llega aquí desde `/correduria/hogar` en plataforma, que ya consultó el
 * Catastro (gratis) por dirección y sabe la referencia de 20. Sin ella, esta
 * pantalla pide que se pegue: no se adivina qué piso es.
 */
export default async function HogarNuevoPage({
  params,
  searchParams,
}: {
  params: Promise<{ clienteId: string }>
  searchParams: Promise<{ referencia?: string }>
}) {
  await requireSession()
  const { clienteId } = await params
  const { referencia: refCruda } = await searchParams
  const referencia = (refCruda ?? '').replace(/[\s-]/g, '').toUpperCase()

  const correduria = await correduriaUnica().catch(() => null)
  if (!correduria) {
    return (
      <div className="card err">
        <h2>⚠️ No se ha podido resolver la correduría</h2>
        <p>Sin ese dato no se consulta la cartera ni se cotiza.</p>
      </div>
    )
  }

  const origen = await clienteOrigenDe(correduria.id, clienteId).catch(() => null)
  if (!origen) notFound()

  if (!RE_REF20.test(referencia)) {
    return (
      <div className="grid">
        <Cabecera nombre={origen.etiqueta} clienteId={clienteId} />
        <div className="card">
          <h2>Referencia catastral del piso</h2>
          <p className="muted">
            La de 20 caracteres (recibo del IBI, o la que dio el buscador de <code>/correduria/hogar</code> en
            plataforma). La de 14 es la del edificio y no trae m² ni año.
          </p>
          <form method="get" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <input
              name="referencia"
              defaultValue={referencia}
              placeholder="4707007TG3440N0003TR"
              style={{ minHeight: 44, flex: '1 1 260px' }}
            />
            <button type="submit" className="primary" style={{ minHeight: 44 }}>
              Consultar Catastro
            </button>
          </form>
          {refCruda && <p className="err" style={{ marginTop: 8 }}>«{refCruda}» no tiene forma de referencia de 20 caracteres.</p>}
        </div>
      </div>
    )
  }

  // ── El Catastro, gratis, EN EL SERVIDOR: nunca se confía en lo que diga el navegador ──
  let catastro: CatastroHogar | null = null
  let errorCatastro: string | null = null
  try {
    const datos = await bajarCatastro(referencia)
    if (datos === null) {
      errorCatastro = 'El Catastro no tiene nada con esta referencia.'
    } else {
      catastro = {
        metrosCuadrados: datos.superficie,
        anioConstruccion: datos.anioConstruccion,
        codigoPostal: datos.codigoPostal,
        uso: datos.uso,
        direccion: direccionDesdeCatastro(paramsDnploc(datos.direccion)),
      }
    }
  } catch (e) {
    errorCatastro = `No se ha podido consultar el Catastro (${e instanceof Error ? e.message : String(e)}).`
  }

  if (errorCatastro || catastro === null) {
    return (
      <div className="grid">
        <Cabecera nombre={origen.etiqueta} clienteId={clienteId} />
        <div className="card err">
          <h2>⚠️ No se ha podido leer el riesgo</h2>
          <p>{errorCatastro}</p>
          <p className="muted">Esto no significa que la vivienda no exista: no se ha podido consultar.</p>
        </div>
      </div>
    )
  }

  // ── Catálogos y ramos, todo gratis ──────────────────────────────────────────
  const r = resolverConfig(process.env, { ignorarInterruptor: true })
  let civiles: Opcion[] = []
  let municipios: Opcion[] = []
  let vias: Opcion[] = []
  const catalogos: Partial<Record<CatalogoHogar, Opcion[]>> = {}
  const fallosCatalogo: string[] = []
  let ramo: DisponibilidadHogar = { estado: 'desconocido' }
  let fallaConfig: string | null = null

  const cpRiesgo = catastro.codigoPostal ?? origen.cliente.codigoPostal

  if (r.estado === 'lista') {
    const cfg = r.config
    const [c, m, l, v, ...cats] = await Promise.all([
      estadosCiviles(cfg).catch((e: unknown) => errar(e)),
      cpRiesgo ? municipiosPorCp(cfg, cpRiesgo).catch((e: unknown) => errar(e)) : Promise.resolve([]),
      lineasDeSeguro(cfg).catch((e: unknown) => errar(e)),
      tiposDeVia(cfg).catch((): Opcion[] | null => null),
      ...CATALOGOS_PANTALLA.map((n) => catalogoHogar(cfg, n).catch((): Opcion[] | null => null)),
    ])
    civiles = c
    municipios = m
    ramo = hogarDisponible(l)
    if (v === null || v.length === 0) fallosCatalogo.push('road-types')
    else vias = v
    CATALOGOS_PANTALLA.forEach((n, i) => {
      const lista = cats[i]
      if (lista === null || lista.length === 0) fallosCatalogo.push(n)
      else catalogos[n] = lista
    })
    if (civiles.length === 0) fallosCatalogo.push('marital-statuses')
  } else {
    fallaConfig = 'Codeoscopic no está configurado en este entorno, así que no hay catálogos ni se puede cotizar.'
  }

  const estadoCivilAuto = emparejar(civiles, origen.cliente.estadoCivil)

  const defectos = {} as DefectosHogar
  for (const n of CATALOGOS_PANTALLA) defectos[n] = elegirDefecto(catalogos[n] ?? [], DEFECTOS_HOGAR[n])?.id ?? null
  // El tipo de vía SÍ lo da el Catastro (no es un supuesto de la pantalla): se
  // empareja con el catálogo del vendor y solo cae al defecto si no casa.
  const viaDelCatastro = emparejar(vias, catastro.direccion?.tipoVia ?? null)
  const viaDefecto = viaDelCatastro ?? elegirDefecto(vias, DEFECTO_TIPO_VIA)
  defectos['road-types'] = viaDefecto?.id ?? null
  const propietarioEsTomador = pareceOpcionPropietario(elegirDefecto(catalogos.uses ?? [], DEFECTOS_HOGAR.uses))

  const resueltos: ResueltosHogar = {
    municipioId: municipios.length === 1 ? Number(municipios[0].id) : null,
    estadoCivilId: estadoCivilAuto?.id ?? null,
    tipoViaId: defectos['road-types'],
    tipoVivienda: defectos['property-types'],
    uso: defectos.uses,
    ocupacion: defectos['occupancy-types'],
    ubicacion: defectos.locations,
    material: defectos['build-materials'],
    calidad: defectos['build-qualities'],
    alarma: defectos['alarm-types'],
    puertasSecundarias: defectos['door-types'],
    asentamiento: defectos['settlement-types'],
    propietarioEsTomador,
    supuestos: {
      tipoVia: viaDelCatastro === null && viaDefecto !== null,
      ...Object.fromEntries(CATALOGOS_PANTALLA.map((n) => [CAMPO_DE_CATALOGO[n], true])),
    },
  }

  const pre = precalificarHogarCartera(
    origen.cliente,
    { numeroPoliza: null, fechaVencimiento: null, hogar: null },
    resueltos,
    hoyIso(),
    catastro,
  )
  const consumo = await estadoConsumo(correduria.id)

  const fichaHogar = armarResumenHogar(pre, { catalogos, estadosCiviles: civiles, municipios, nivel: 'corredor' })

  const estadoRamo =
    ramo.estado === 'disponible' ? (
      <p className="badge ok">
        Hogar tarifica para esta organización · id del ramo: <code>{ramo.id}</code>
      </p>
    ) : ramo.estado === 'ausente' ? (
      <div className="card err">
        Hogar NO está entre los ramos que Codeoscopic tarifica para esta organización (hay: {ramo.ramos.join(', ')}).
        El botón queda deshabilitado hasta que lo den de alta.
      </div>
    ) : (
      <div className="card err">
        No se ha podido comprobar si hogar tarifica para esta organización: la lista de ramos no llegó. No se cotiza
        a ciegas.
      </div>
    )

  return (
    <div className="grid">
      <Cabecera nombre={origen.etiqueta} clienteId={clienteId} detalle={catastro.direccion?.nombre ?? referencia} />

      <div className="card">
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Oportunidad nueva — sin póliza en la cartera
        </p>
        <p style={{ margin: '4px 0 0' }}>
          Riesgo por Catastro: <strong>referencia {referencia}</strong>
          {catastro.direccion?.nombre && (
            <>
              {' '}
              · {catastro.direccion.tipoVia ?? ''} {catastro.direccion.nombre} {catastro.direccion.numero ?? ''}
              {catastro.direccion.planta ? `, ${catastro.direccion.planta}º` : ''}
              {catastro.direccion.puerta ? ` ${catastro.direccion.puerta}` : ''}
            </>
          )}
          {catastro.metrosCuadrados && <> · {catastro.metrosCuadrados} m²</>}
          {catastro.anioConstruccion && <> · construido en {catastro.anioConstruccion}</>}
        </p>
      </div>

      {fallaConfig && <div className="card err">{fallaConfig}</div>}
      {!fallaConfig && estadoRamo}

      <RetarificadorHogar
        endpoint={`/api/cartera/cliente/${clienteId}/hogar-nuevo`}
        extra={{ referencia }}
        resumen={fichaHogar}
        pre={pre}
        defectos={defectos}
        vias={vias}
        catalogos={catalogos}
        estadosCiviles={civiles}
        municipios={municipios}
        fallosCatalogo={fallosCatalogo}
        ramo={ramo}
        consumo={'error' in consumo ? { error: consumo.error } : consumo}
        primaActual={null}
        deshabilitado={fallaConfig !== null}
      />
    </div>
  )
}

function Cabecera({ nombre, clienteId, detalle }: { nombre: string; clienteId: string; detalle?: string }) {
  return (
    <div>
      <p className="muted">
        <Link href={`/cartera/${clienteId}`}>← {nombre}</Link>
      </p>
      <h1>Presupuesto de hogar</h1>
      <p className="muted">
        {nombre}
        {detalle && ` · ${detalle}`}
      </p>
    </div>
  )
}

function errar(_e: unknown): Opcion[] {
  return []
}

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10)
}
