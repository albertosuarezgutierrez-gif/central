import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { puede } from '@central/module-patrimonio'

import { eur } from '@/lib/dinero'
import { contratosDelInmueble } from '@/lib/patrimonio/contratos-bd'
import { inmuebleAutorizado } from '@/lib/patrimonio/inmuebles-bd'
import { ETIQUETA_USO } from '@/lib/patrimonio/usos'
import { getIdentidad } from '@/lib/session'

import { Documentos } from './Documentos'
import { NuevoContrato } from './NuevoContrato'

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
  const contratos = await contratosDelInmueble(identidad.id, i.id)
  const fechaEs = (f: string) => f.split('-').reverse().join('/')

  const filas: [string, string][] = [
    ['Titular', ficha.titularNombre || noConsta],
    ['Uso', ETIQUETA_USO[i.uso]],
    ['Dirección', i.direccion ?? noConsta],
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
