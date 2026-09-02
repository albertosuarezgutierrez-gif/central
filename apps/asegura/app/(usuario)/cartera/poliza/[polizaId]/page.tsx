import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSession } from '@/lib/session'
import { correduriaUnica } from '@/lib/cartera'
import { origenRetarificacion, type OrigenRetarificacion } from '@/lib/cartera-ficha'
import { precalificarAuto, type Resueltos } from '@/lib/codeoscopic/desde-cartera'
import {
  precalificarHogarCartera,
  partirDireccion,
  type ResueltosHogar,
} from '@/lib/codeoscopic/desde-cartera-hogar'
import { resolverConfig } from '@/lib/codeoscopic/config'
import {
  estadosCiviles,
  tiposDeGaraje,
  municipiosPorCp,
  fechaMatriculacionDeMatricula,
  emparejar,
  lineasDeSeguro,
  hogarDisponible,
  catalogoHogar,
  tiposDeVia,
  elegirDefecto,
  pareceOpcionPropietario,
  DEFECTOS_HOGAR,
  DEFECTO_TIPO_VIA,
  type CatalogoHogar,
  type DisponibilidadHogar,
  type Opcion,
} from '@/lib/codeoscopic/catalogos'
import { estadoConsumo } from '@/lib/codeoscopic/cotizar'
// La ficha de hogar (filas, grupos y procedencias) la arma una pieza PURA que
// comparten las tres puertas del expediente. Vive en `lib/`, no en la pantalla:
// duplicar aquí la tabla de catálogos era la forma de que las dos copias
// divergieran sin que nada fallase.
import { resumen as armarResumenHogar, CATALOGOS_PANTALLA, CAMPO_DE_CATALOGO } from '@/lib/codeoscopic/resumen-hogar'
import Retarificador from './retarificador'
import RetarificadorHogar, { type DefectosHogar } from './retarificador-hogar'

export const dynamic = 'force-dynamic'

/**
 * Pantalla de retarificación de UNA póliza.
 *
 * Todo lo que se hace aquí, en el servidor, es GRATIS: leer la ficha, resolver
 * los catálogos y preguntar la fecha de matriculación por la matrícula. Lo que
 * cuesta 0,50€ es el botón, y por eso el botón está en un componente aparte y
 * llama a su propio puerto `POST`.
 *
 * El orden de la pantalla es el orden del razonamiento: primero qué se sabe,
 * luego qué se ha SUPUESTO (que es la letra pequeña del precio), luego qué
 * falta, y solo al final el botón.
 *
 * Ramifica por el ramo (`origen.tipo`): auto y hogar tienen cada uno su
 * pantalla; cualquier otro ramo se explica con el `motivo` de
 * `retarificabilidad()` y no tiene botón.
 */
export default async function RetarificarPage({
  params,
}: {
  params: Promise<{ polizaId: string }>
}) {
  await requireSession()
  const { polizaId } = await params

  const correduria = await correduriaUnica().catch(() => null)
  if (!correduria) {
    return (
      <div className="card">
        <h2>⚠️ No se ha podido resolver la correduría</h2>
        <p>Sin ese dato no se consulta la cartera ni se cotiza.</p>
      </div>
    )
  }

  // Un fallo de BD al leer la ficha NO puede quedarse en una pantalla en blanco:
  // «no se ha podido leer» y «esta póliza no existe» son cosas distintas y se
  // arreglan en sitios distintos, así que se dicen distinto. El mensaje va
  // ENTERO porque es lo único que apunta a la causa (credenciales, permisos,
  // conexión…) sin ir a los logs del pooler.
  let origen: OrigenRetarificacion | null
  try {
    origen = await origenRetarificacion(correduria.id, polizaId)
  } catch (e) {
    return (
      <div className="card err">
        <h2>⚠️ No se ha podido leer la ficha de esta póliza</h2>
        <p>
          Esto NO significa que la póliza no exista: significa que la consulta a la cartera ha fallado. No se cotiza
          sobre una ficha que no se ha podido leer.
        </p>
        <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {e instanceof Error ? e.message : String(e)}
        </p>
      </div>
    )
  }
  if (!origen) notFound()

  if (origen.tipo === 'auto') return <PantallaAuto origen={origen} polizaId={polizaId} correduriaId={correduria.id} />
  if (origen.tipo === 'hogar') return <PantallaHogar origen={origen} polizaId={polizaId} correduriaId={correduria.id} />

  return (
    <div className="grid">
      <Cabecera origen={origen} detalle={`ramo ${origen.tipo}`} />
      <div className="card">
        <h2>Esta póliza no se puede retarificar todavía</h2>
        <p>{origen.retarificacion.motivo ?? `Hoy no se retarifica el ramo «${origen.tipo}».`}</p>
      </div>
    </div>
  )
}

function Cabecera({ origen, detalle }: { origen: OrigenRetarificacion; detalle: string }) {
  return (
    <div>
      <p className="muted">
        <Link href="/cartera">← Cartera</Link>
      </p>
      <h1>Retarificar</h1>
      <p className="muted">
        {origen.etiqueta} · {detalle}
      </p>
    </div>
  )
}

// ─── AUTO ────────────────────────────────────────────────────────────────────

async function PantallaAuto({
  origen,
  polizaId,
  correduriaId,
}: {
  origen: OrigenRetarificacion
  polizaId: string
  correduriaId: string
}) {
  // ── Catálogos y matrícula: todo gratis, y con el interruptor apagado ───────
  const r = resolverConfig(process.env, { ignorarInterruptor: true })
  let civiles: Opcion[] = []
  let garajes: Opcion[] = []
  let municipios: Opcion[] = []
  let fechaMatriculacion: string | null = null
  let notaMatricula: string | null = null
  let fallaCatalogo: string | null = null

  if (r.estado === 'lista') {
    const cp = origen.cliente.codigoPostal
    const [c, g, m, f] = await Promise.all([
      estadosCiviles(r.config).catch((e: unknown) => errar(e)),
      tiposDeGaraje(r.config).catch((e: unknown) => errar(e)),
      cp ? municipiosPorCp(r.config, cp).catch((e: unknown) => errar(e)) : Promise.resolve([]),
      origen.poliza.matricula
        ? fechaMatriculacionDeMatricula(r.config, origen.poliza.matricula)
        : Promise.resolve({ estado: 'error' as const, detalle: 'la póliza no tiene matrícula' }),
    ])
    civiles = c
    garajes = g
    municipios = m
    if (civiles.length === 0 && garajes.length === 0) {
      fallaCatalogo =
        'No se han podido leer los catálogos de Codeoscopic. Sin ellos no hay ids válidos que ' +
        'mandar, así que no se puede cotizar todavía. Esto no es un problema de la ficha.'
    }
    if (f.estado === 'ok') {
      fechaMatriculacion = f.fecha
      notaMatricula =
        'La ha devuelto Codeoscopic desde la matrícula. El propio fabricante avisa de que es ' +
        'APROXIMADA: orienta para el precio, no vale para emitir.'
    } else if (f.estado === 'no-encontrada') {
      notaMatricula =
        'Codeoscopic no ha encontrado la fecha de esta matrícula. Eso es «no la he encontrado», ' +
        'no «el coche no tiene fecha»: hay que ponerla a mano.'
    } else {
      notaMatricula = `No se ha podido preguntar la fecha de matriculación (${f.detalle}). Tampoco es una ausencia: no se sabe.`
    }
  } else {
    fallaCatalogo =
      'Codeoscopic no está configurado en este entorno, así que no hay catálogos ni se puede cotizar.'
  }

  const estadoCivilAuto = emparejar(civiles, origen.cliente.estadoCivil)

  const resueltos: Resueltos = {
    municipioId: municipios.length === 1 ? Number(municipios[0].id) : null,
    estadoCivilId: estadoCivilAuto?.id ?? null,
    fechaMatriculacion,
    codigoVehiculo: null, // lo elige el corredor: es el único que no se deduce
    garaje: null,
  }

  const pre = precalificarAuto(origen.cliente, origen.poliza, resueltos, hoyIso())
  const consumo = await estadoConsumo(correduriaId)

  return (
    <div className="grid">
      <Cabecera origen={origen} detalle={`matrícula ${origen.poliza.matricula ?? '—'}`} />

      {fallaCatalogo && <div className="card err">{fallaCatalogo}</div>}

      <div className="card">
        <h2>Lo que se manda desde la ficha</h2>
        <p className="muted">
          Se pide precio como si se cambiara de compañía: la póliza actual pasa a ser la
          «anterior», que es lo que da la antigüedad y el bonus.
        </p>
        <div className="table-wrap">
          <table>
            <tbody>
              <Fila etiqueta="Compañía actual (código DGS)" valor={origen.poliza.codigoEntidadDgs} />
              <Fila etiqueta="Póliza anterior" valor={origen.poliza.numeroPoliza} />
              <Fila etiqueta="Asegurado desde" valor={origen.poliza.fechaEfectoInicial} />
              <Fila etiqueta="Vencimiento actual" valor={origen.poliza.fechaVencimiento} />
              <Fila
                etiqueta="Siniestros anotados"
                valor={String(origen.poliza.siniestrosRegistrados)}
              />
              <Fila etiqueta="Fecha de matriculación" valor={fechaMatriculacion} nota={notaMatricula} />
            </tbody>
          </table>
        </div>
      </div>

      <Supuestos supuestos={pre.supuestos} />

      <Retarificador
        polizaId={polizaId}
        faltanInicial={pre.faltan}
        garajes={garajes}
        civiles={civiles}
        municipios={municipios}
        estadoCivilAuto={estadoCivilAuto}
        fechaMatriculacion={fechaMatriculacion}
        consumo={'error' in consumo ? { error: consumo.error } : consumo}
        deshabilitado={fallaCatalogo !== null}
      />
    </div>
  )
}

// ─── HOGAR ───────────────────────────────────────────────────────────────────

async function PantallaHogar({
  origen,
  polizaId,
  correduriaId,
}: {
  origen: OrigenRetarificacion
  polizaId: string
  correduriaId: string
}) {
  // ── Todo gratis: catálogos, tipos de vía, municipios y los ramos habilitados ──
  const r = resolverConfig(process.env, { ignorarInterruptor: true })
  let civiles: Opcion[] = []
  let municipios: Opcion[] = []
  let vias: Opcion[] = []
  const catalogos: Partial<Record<CatalogoHogar, Opcion[]>> = {}
  const fallosCatalogo: string[] = []
  let ramo: DisponibilidadHogar = { estado: 'desconocido' }
  let fallaConfig: string | null = null

  const cpRiesgo = origen.hogar?.cp ?? origen.cliente.codigoPostal

  if (r.estado === 'lista') {
    const cfg = r.config
    const [c, m, l, v, ...cats] = await Promise.all([
      estadosCiviles(cfg).catch((e: unknown) => errar(e)),
      cpRiesgo ? municipiosPorCp(cfg, cpRiesgo).catch((e: unknown) => errar(e)) : Promise.resolve([]),
      lineasDeSeguro(cfg).catch((e: unknown) => errar(e)),
      tiposDeVia(cfg).catch((): Opcion[] | null => null),
      ...CATALOGOS_PANTALLA.map((n) =>
        catalogoHogar(cfg, n).catch((): Opcion[] | null => null),
      ),
    ])
    civiles = c
    municipios = m
    ramo = hogarDisponible(l)
    // `null` = no se pudo leer; `[]` = llegó vacío. Los nueve son obligatorios
    // para el vendor, y el tipo de vía también: cualquiera bloquea el botón.
    if (v === null || v.length === 0) fallosCatalogo.push('road-types')
    else vias = v
    CATALOGOS_PANTALLA.forEach((n, i) => {
      const lista = cats[i]
      if (lista === null || lista.length === 0) fallosCatalogo.push(n)
      else catalogos[n] = lista
    })
    if (civiles.length === 0) fallosCatalogo.push('marital-statuses')
  } else {
    fallaConfig =
      'Codeoscopic no está configurado en este entorno, así que no hay catálogos ni se puede cotizar.'
  }

  const estadoCivilAuto = emparejar(civiles, origen.cliente.estadoCivil)

  // ── Los defectos: el id del ejemplo del portal si el catálogo lo trae; si no,
  // la primera opción. Los nueve van como SUPUESTO para que se vean. El tipo de
  // vía se empareja con la dirección de la ficha y solo es supuesto si no casa.
  const defectos = {} as DefectosHogar
  for (const n of CATALOGOS_PANTALLA) defectos[n] = elegirDefecto(catalogos[n] ?? [], DEFECTOS_HOGAR[n])?.id ?? null
  const viaDeLaFicha = emparejar(vias, partirDireccion(origen.hogar?.direccion ?? null).tipoVia)
  const viaDefecto = viaDeLaFicha ?? elegirDefecto(vias, DEFECTO_TIPO_VIA)
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
      tipoVia: viaDeLaFicha === null && viaDefecto !== null,
      ...Object.fromEntries(CATALOGOS_PANTALLA.map((n) => [CAMPO_DE_CATALOGO[n], true])),
    },
  }
  const pre = precalificarHogarCartera(
    origen.cliente,
    { numeroPoliza: origen.poliza.numeroPoliza, fechaVencimiento: origen.poliza.fechaVencimiento, hogar: origen.hogar },
    resueltos,
    hoyIso(),
  )
  const consumo = await estadoConsumo(correduriaId)

  // La ficha se arma AQUÍ, en el servidor: es gratis y así el primer pintado ya
  // sale completo. El cliente solo la rehace cuando alguien corrige una fila.
  const fichaHogar = armarResumenHogar(pre, {
    catalogos,
    estadosCiviles: civiles,
    municipios,
    nivel: 'corredor',
  })

  const h = origen.hogar

  const estadoRamo =
    ramo.estado === 'disponible' ? (
      <p className="badge ok">Hogar tarifica para esta organización · id del ramo: <code>{ramo.id}</code></p>
    ) : ramo.estado === 'ausente' ? (
      <div className="card err">
        Hogar NO está entre los ramos que Codeoscopic tarifica para esta organización (hay: {ramo.ramos.join(', ')}).
        El botón queda deshabilitado hasta que lo den de alta.
      </div>
    ) : (
      <div className="card err">
        No se ha podido comprobar si hogar tarifica para esta organización: la lista de ramos no llegó. No es
        «no tarifica», es «no se sabe» — y sin saberlo no se cotiza.
      </div>
    )

  return (
    <div className="grid">
      <Cabecera origen={origen} detalle={`hogar · ${h?.localidad ?? h?.cp ?? 'riesgo sin localizar'}`} />

      {fallaConfig && <div className="card err">{fallaConfig}</div>}
      {!fallaConfig && estadoRamo}

      <RetarificadorHogar
        polizaId={polizaId}
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
        primaActual={origen.primaAnual}
        deshabilitado={fallaConfig !== null}
      />
    </div>
  )
}

// ─── Piezas comunes ──────────────────────────────────────────────────────────

function Supuestos({
  supuestos,
}: {
  supuestos: Array<{ campo: string; valor: unknown; porque: string; optimista?: boolean }>
}) {
  if (supuestos.length === 0) return null
  return (
    <div className="card">
      <h2>⚠️ Lo que se ha supuesto</h2>
      <p className="muted">
        Ninguno de estos datos está en la ficha. El precio sale con ellos, así que forman parte
        de la letra pequeña: si alguno no es cierto, la prima real cambia.
      </p>
      <ul>
        {supuestos.map((s, i) => (
          <li key={`${s.campo}-${String(s.valor)}-${i}`}>
            <strong>{s.campo}</strong>: <code>{String(s.valor)}</code> — {s.porque}
            {s.optimista && (
              <>
                {' '}
                <span className="badge warn">puede abaratar el precio</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Fila({
  etiqueta,
  valor,
  nota,
}: {
  etiqueta: string
  valor: string | null
  nota?: string | null
}) {
  return (
    <tr>
      <th style={{ textAlign: 'left', width: '40%' }}>{etiqueta}</th>
      <td>
        {/* Un hueco se dice, no se pinta como 0 ni como vacío. */}
        {valor ?? <span className="muted">no consta</span>}
        {nota && (
          <>
            <br />
            <span className="muted" style={{ fontSize: 12 }}>
              {nota}
            </span>
          </>
        )}
      </td>
    </tr>
  )
}

function errar(_e: unknown): Opcion[] {
  // El catálogo vacío se detecta arriba y se dice; aquí solo se evita que un
  // fallo tumbe la página entera.
  return []
}

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10)
}
