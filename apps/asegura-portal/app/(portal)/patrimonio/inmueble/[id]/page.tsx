import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { puede } from '@central/module-patrimonio'

import { eur } from '@/lib/dinero'
import { contratosDelInmueble } from '@/lib/patrimonio/contratos-bd'
import { gastosDeTitular } from '@/lib/patrimonio/gastos-bd'
import type { TitularGastos } from '@/lib/patrimonio/gastos-api'
import { titularDeInmueble } from '@/lib/patrimonio/gastos-vista'
import { inmuebleAutorizado } from '@/lib/patrimonio/inmuebles-bd'
import { obligacionesDeInmueble, type ObligacionesDeInmueble } from '@/lib/patrimonio/obligaciones-api'
import { puertosObligaciones } from '@/lib/patrimonio/obligaciones-bd'
import { segurosDeInmueble, type SegurosDeInmueble } from '@/lib/patrimonio/seguros-inmueble-api'
import { puertosSegurosInmueble } from '@/lib/patrimonio/seguros-inmueble-bd'
import { ETIQUETA_USO } from '@/lib/patrimonio/usos'
import { puertaDeSesion } from '@/lib/puertas-portal'
import { getIdentidad } from '@/lib/session'

import { Documentos } from './Documentos'
import { GastosDeEstePiso } from './GastosDeEstePiso'
import { HipotecaInmueble } from './HipotecaInmueble'
import { NuevoContrato } from './NuevoContrato'
import { ObligacionesPropias } from './ObligacionesPropias'
import { SegurosInmueble } from './SegurosInmueble'
import { UnidadesEdificio } from './UnidadesEdificio'

export const dynamic = 'force-dynamic'

const noConsta = 'No consta'
const triestado = (v: boolean | null) => (v === null ? noConsta : v ? 'Sí' : 'No')

/**
 * Ficha del inmueble. 🚨 El id de la URL NO consulta por sí solo: `inmuebleAutorizado()` lo busca DENTRO de los
 * titulares que esta sesión puede ver (`accesosPatrimonio`). Si no existe o no es tuyo: 404 (nunca 403).
 * `null` = «No consta», jamás 0.
 */
export default async function InmueblePage({ params }: { params: Promise<{ id: string }> }) {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')
  if (!(await puertaDeSesion('patrimonio', 'lectura'))) redirect('/inicio')
  const { id } = await params
  const ficha = await inmuebleAutorizado(identidad.id, id)
  if (ficha === null) notFound()
  const i = ficha.inmueble
  // Archivado: los contratos vivos no se listan (sus páginas dan 404) y no se ofrece ninguna alta.
  const [contratos, seguros, recordatorios, gastos] = await Promise.all([
    ficha.archivado ? Promise.resolve([]) : contratosDelInmueble(identidad.id, i.id),
    // Un fallo leyendo los seguros no tumba la ficha: la sección dice «no hemos podido comprobarlo».
    segurosDeInmueble(puertosSegurosInmueble(identidad.id), i.id).catch((e: unknown): SegurosDeInmueble | null | 'error' => {
      console.error('[patrimonio/inmueble] seguros:', e instanceof Error ? e.message : e)
      return 'error'
    }),
    // Igual para los recordatorios: un fallo no tumba la ficha ni se pinta como «no tienes ninguno».
    obligacionesDeInmueble(puertosObligaciones(identidad.id), i.id).catch((e: unknown): ObligacionesDeInmueble | null | 'error' => {
      console.error('[patrimonio/inmueble] obligaciones:', e instanceof Error ? e.message : e)
      return 'error'
    }),
    // Gastos de ESTE piso (mismos accesos que /patrimonio/gastos). Un fallo no tumba la ficha ni se pinta como «sin gastos».
    ficha.archivado
      ? Promise.resolve(null)
      : gastosDeTitular(identidad.id, ficha.clienteId)
          .then((t): TitularGastos | null | 'error' => (t === null ? null : titularDeInmueble(t, i.id)))
          .catch((e: unknown): TitularGastos | null | 'error' => {
            console.error('[patrimonio/inmueble] gastos:', e instanceof Error ? e.message : e)
            return 'error'
          }),
  ])
  const fechaEs = (f: string) => f.split('-').reverse().join('/')

  const filas: [string, string][] = [
    ['Titular', ficha.titularNombre || noConsta],
    ...(ficha.edificio ? [['Edificio', ficha.edificio.alias] as [string, string]] : []),
    ['Uso', ETIQUETA_USO[i.uso]],
    ['Dirección', i.direccion === null ? noConsta : ficha.calleSinValidar ? `${i.direccion} (calle por validar: no casa con el callejero del Catastro)` : i.direccion],
    // Unidad de un edificio sin división horizontal: la RC es la del edificio (una sola), salvo que la unidad tenga una propia.
    ['Referencia catastral', ficha.referenciaCatastralEfectiva === null ? noConsta : i.referenciaCatastral === null && ficha.edificio ? `${ficha.referenciaCatastralEfectiva} (la del edificio)` : ficha.referenciaCatastralEfectiva],
    ['Superficie', i.superficieM2 === null ? noConsta : `${i.superficieM2.toLocaleString('es-ES')} m²`],
    ['Año de construcción', i.anioConstruccion === null ? noConsta : String(i.anioConstruccion)],
    ['En comunidad de propietarios', triestado(i.enComunidad)],
    ['Suministros anotados', i.suministros.length === 0 ? 'Ninguno anotado' : i.suministros.join(', ')],
    ['Valor de reconstrucción estimado', ficha.valorReconstruccionCent === null ? noConsta : eur(ficha.valorReconstruccionCent / 100)],
  ]

  return (
    <>
      <p className="antetitulo">Patrimonio</p>
      <h1 style={{ overflowWrap: 'anywhere' }}>{i.alias}</h1>
      {ficha.archivado && (
        <p role="note" className="suave" style={{ margin: '0 0 12px' }}>
          <strong>Archivado.</strong> Este inmueble ya no está activo: lo ves en solo lectura, con sus documentos.
        </p>
      )}
      <section className="seccion">
        <dl style={{ margin: 0, display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {filas.map(([k, v]) => (
            <div key={k} style={{ minWidth: 0 }}>
              <dt className="suave" style={{ fontSize: 13 }}>{k}</dt>
              <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      {ficha.edificio && (
        <p style={{ margin: '0 0 12px' }}>
          <Link href={`/patrimonio/inmueble/${ficha.edificio.id}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, overflowWrap: 'anywhere' }}>
            Es una unidad de «{ficha.edificio.alias}»: ver el edificio
          </Link>
        </p>
      )}
      {i.uso === 'edificio' && (
        <section className="seccion" aria-labelledby="unidades-edificio">
          <h2 id="unidades-edificio">Unidades</h2>
          <UnidadesEdificio edificioId={i.id} unidades={ficha.unidades} criterio={i.repartoCriterio ?? null} puedeEditar={!ficha.archivado && puede(ficha.nivel, 'alta_baja')} />
          <p style={{ margin: '12px 0 0' }}>
            <Link href="/patrimonio/rentabilidad" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Rentabilidad del edificio y de cada unidad</Link>
          </p>
        </section>
      )}
      <section className="seccion" aria-labelledby="seguros-inmueble">
        <h2 id="seguros-inmueble">Seguros</h2>
        {seguros === 'error' || seguros === null ? (
          <p className="aviso-linea" role="status">Ahora no hemos podido comprobar los seguros de este inmueble. Vuelve a intentarlo en un rato.</p>
        ) : (
          <SegurosInmueble datos={seguros} soloLectura={ficha.archivado} />
        )}
      </section>
      {!ficha.archivado && puede(ficha.nivel, 'pedir_precio') && (
        <section className="seccion" aria-labelledby="hipoteca-inmueble">
          <h2 id="hipoteca-inmueble">Hipoteca</h2>
          <HipotecaInmueble inmuebleId={i.id} inicial={ficha.hipoteca} />
        </section>
      )}
      {!ficha.archivado && (
        <section className="seccion" aria-labelledby="gastos-inmueble">
          <h2 id="gastos-inmueble">Gastos de este piso</h2>
          <p className="suave" style={{ marginTop: 0, fontSize: 14 }}>
            Gastos fijos, comunidad y derramas de este piso. Todos los gastos del titular están en <Link href="/patrimonio/gastos">Gastos</Link>.
          </p>
          {gastos === 'error' || gastos === null ? (
            <p className="aviso-linea" role="status">Ahora no hemos podido comprobar los gastos de este piso. Vuelve a intentarlo en un rato.</p>
          ) : (
            <GastosDeEstePiso titular={gastos} inmuebleId={i.id} alias={i.alias} />
          )}
        </section>
      )}
      <section className="seccion" aria-labelledby="recordatorios-inmueble">
        <h2 id="recordatorios-inmueble">Recordatorios y obligaciones</h2>
        <p className="suave" style={{ marginTop: 0, fontSize: 14 }}>
          IBI, comunidad, revisión de la caldera… Los verás en el <Link href="/herramientas/calendario">calendario</Link> y te avisaremos desde la campana.
        </p>
        {recordatorios === 'error' || recordatorios === null ? (
          <p className="aviso-linea" role="status">Ahora no hemos podido leer los recordatorios de este inmueble. Vuelve a intentarlo en un rato.</p>
        ) : (
          <ObligacionesPropias datos={recordatorios} />
        )}
      </section>
      {!ficha.archivado && (
      <section className="seccion">
        <h2>Contratos</h2>
        {contratos.length === 0 ? (
          <p>No hay contratos anotados en este inmueble.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'grid', gap: 8 }}>
            {contratos.map((c) => (
              <li key={c.id} style={{ minWidth: 0 }}>
                <Link href={`/patrimonio/contrato/${c.id}`} style={{ display: 'inline-block', minHeight: 44, paddingBlock: 10, overflowWrap: 'anywhere' }}>
                  Desde el {fechaEs(c.inicio)}
                  {c.terminadoEn ? ` · terminado el ${fechaEs(c.terminadoEn)}` : c.fin ? ` · fin pactado ${fechaEs(c.fin)}` : ''}
                  {' · '}renta inicial {eur(c.rentaMensualCent / 100)}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {puede(ficha.nivel, 'alta_baja') && <NuevoContrato inmuebleId={i.id} />}
      </section>
      )}
      <section className="seccion">
        <h2>Documentos</h2>
        <Documentos clienteId={ficha.clienteId} inmuebleId={i.id} />
      </section>
      <p style={{ marginTop: 24 }}>
        <Link href="/patrimonio">← Todo el patrimonio</Link>
      </p>
    </>
  )
}
