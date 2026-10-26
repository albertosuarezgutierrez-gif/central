import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { puede } from '@central/module-patrimonio'

import { eur } from '@/lib/dinero'
import { contratosDelInmueble } from '@/lib/patrimonio/contratos-bd'
import { inmuebleAutorizado } from '@/lib/patrimonio/inmuebles-bd'
import { obligacionesDeInmueble, type ObligacionesDeInmueble } from '@/lib/patrimonio/obligaciones-api'
import { puertosObligaciones } from '@/lib/patrimonio/obligaciones-bd'
import { segurosDeInmueble, type SegurosDeInmueble } from '@/lib/patrimonio/seguros-inmueble-api'
import { puertosSegurosInmueble } from '@/lib/patrimonio/seguros-inmueble-bd'
import { ETIQUETA_USO } from '@/lib/patrimonio/usos'
import { getIdentidad } from '@/lib/session'

import { Documentos } from './Documentos'
import { HipotecaInmueble } from './HipotecaInmueble'
import { NuevoContrato } from './NuevoContrato'
import { ObligacionesPropias } from './ObligacionesPropias'
import { SegurosInmueble } from './SegurosInmueble'

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
  const { id } = await params
  const ficha = await inmuebleAutorizado(identidad.id, id)
  if (ficha === null) notFound()
  const i = ficha.inmueble
  // Archivado: los contratos vivos no se listan (sus páginas dan 404) y no se ofrece ninguna alta.
  const [contratos, seguros, recordatorios] = await Promise.all([
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
  ])
  const fechaEs = (f: string) => f.split('-').reverse().join('/')

  const filas: [string, string][] = [
    ['Titular', ficha.titularNombre || noConsta],
    ['Uso', ETIQUETA_USO[i.uso]],
    ['Dirección', i.direccion === null ? noConsta : ficha.calleSinValidar ? `${i.direccion} (calle por validar: no casa con el callejero del Catastro)` : i.direccion],
    ['Referencia catastral', i.referenciaCatastral ?? noConsta],
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
