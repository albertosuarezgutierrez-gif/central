import Link from 'next/link'
import { redirect } from 'next/navigation'

import { eur } from '@/lib/dinero'
import { rentabilidadDeIdentidad, type RentabilidadDeIdentidad } from '@/lib/patrimonio/rentabilidad-bd'
import { PRIMER_ANIO } from '@/lib/patrimonio/rentabilidad'
import { AVISO } from '@/lib/patrimonio/rentabilidad-textos'
import { puertaDeSesion } from '@/lib/puertas-portal'
import { getIdentidad } from '@/lib/session'

export const dynamic = 'force-dynamic'

const cent = (c: number) => eur(c / 100)
const fechaEs = (f: string) => f.split('-').reverse().join('/')

function Datos({ d }: { d: RentabilidadDeIdentidad }) {
  const r = d.resultado
  const sinInmuebles = d.inmuebles.length === 0
  return (
    <>
      {sinInmuebles ? (
        <section className="seccion"><p style={{ margin: 0 }}>Todavía no hay inmuebles que calcular.</p></section>
      ) : (
        r.inmuebles.map((i) => {
          const info = d.inmuebles.find((x) => x.id === i.inmuebleId)
          return (
            <section key={i.inmuebleId} className="seccion" aria-labelledby={`rent-${i.inmuebleId}`}>
              <h2 id={`rent-${i.inmuebleId}`} style={{ margin: 0, overflowWrap: 'anywhere' }}>{info?.alias ?? 'Inmueble'}</h2>
              {info?.titular && <p className="suave" style={{ margin: '0 0 8px', fontSize: 13 }}>{info.titular}</p>}
              <dl style={{ margin: 0, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
                {([
                  ['Ingresos (renta devengada)', cent(i.ingresos)],
                  ['Gastos confirmados', cent(i.gastos)],
                  ['Seguros', cent(i.seguros)],
                  ['Beneficio', cent(i.beneficio)],
                  ['Margen', i.margenPct === null ? '—' : `${i.margenPct.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} style={{ minWidth: 0 }}>
                    <dt className="suave" style={{ fontSize: 13 }}>{k}</dt>
                    <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{v}</dd>
                  </div>
                ))}
              </dl>
              {i.gastosSinConfirmar > 0 && (
                <p style={{ margin: '8px 0 0' }}>
                  Tienes {i.gastosSinConfirmar} {i.gastosSinConfirmar === 1 ? 'factura' : 'facturas'} sin revisar: no cuentan hasta que las confirmes.{' '}
                  <Link href="/patrimonio/gastos">Revisarlas</Link>
                </p>
              )}
              {i.avisos.length > 0 && (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
                  {i.avisos.map((a) => <li key={a} className="suave" style={{ fontSize: 14 }}>{AVISO[a]}</li>)}
                </ul>
              )}
              <p style={{ margin: '8px 0 0' }}>
                <Link href={`/patrimonio/inmueble/${i.inmuebleId}`} style={{ display: 'inline-block', minHeight: 44, paddingBlock: 10 }}>Abrir el inmueble</Link>
              </p>
            </section>
          )
        })
      )}
      {r.sinImputar > 0 && (
        <p className="suave" style={{ fontSize: 14 }}>
          Además hay {cent(r.sinImputar)} de gastos que no están asignados a ningún inmueble (por ejemplo, la gestoría): no se reparten solos.
        </p>
      )}
    </>
  )
}

/**
 * «Rentabilidad» del patrimonio (24/10/2026, P14): renta devengada − gastos confirmados − seguros, por inmueble y año.
 * 🚨 Todo parte de `accesosPatrimonio()` (dentro de `rentabilidadDeIdentidad`). Una lectura que falla NO se pinta como
 * «0 €»; los seguros que no se pueden contar se DICEN; lo que no se ha confirmado no cuenta, y se avisa.
 */
export default async function RentabilidadPage({ searchParams }: { searchParams: Promise<{ anio?: string | string[] }> }) {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')
  if (!(await puertaDeSesion('patrimonio', 'lectura'))) redirect('/inicio')
  const { anio } = await searchParams
  let datos: RentabilidadDeIdentidad | null = null
  let fallo = false
  try {
    datos = await rentabilidadDeIdentidad(identidad.id, anio)
  } catch (e) {
    console.error('[patrimonio/rentabilidad]', e instanceof Error ? e.message : e)
    fallo = true
  }
  const actual = datos?.periodo.anio ?? new Date().getFullYear()
  const anios = Array.from({ length: actual - PRIMER_ANIO + 1 }, (_, k) => actual - k)

  return (
    <>
      <p className="antetitulo">Patrimonio</p>
      <h1>Rentabilidad</h1>
      {fallo ? (
        <section className="seccion"><p role="status" style={{ margin: 0 }}>Ahora no hemos podido calcular tu rentabilidad. Vuelve a intentarlo en un rato; no significa que sea cero.</p></section>
      ) : datos === null ? (
        <section className="seccion"><p style={{ margin: 0 }}>No tienes ningún patrimonio asignado en este portal.</p></section>
      ) : (
        <>
          <p className="suave" style={{ marginTop: 0 }}>
            Del {fechaEs(datos.periodo.desde)} al {fechaEs(datos.periodo.hasta)}{datos.periodo.enCurso ? ' (hasta hoy)' : ''}. Es un cálculo orientativo con lo que has anotado y confirmado; no sustituye a tu contabilidad.
          </p>
          <p style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '0 0 12px' }}>
            {anios.map((a) => (
              <Link key={a} className={a === datos!.periodo.anio ? 'boton' : 'boton-tenue'} style={{ minHeight: 44 }} href={`/patrimonio/rentabilidad?anio=${a}`} aria-current={a === datos!.periodo.anio ? 'page' : undefined}>
                {a}
              </Link>
            ))}
          </p>
          <Datos d={datos} />
        </>
      )}
      {datos && (
        <p style={{ marginTop: 16 }}>
          <Link href={`/patrimonio/rentabilidad/fiscal?anio=${datos.periodo.anio}`} style={{ display: 'inline-block', minHeight: 44, paddingBlock: 10 }}>Informe fiscal de {datos.periodo.anio}</Link>
        </p>
      )}
      <p style={{ marginTop: 24 }}>
        <Link href="/patrimonio">← Todo el patrimonio</Link>
      </p>
    </>
  )
}
