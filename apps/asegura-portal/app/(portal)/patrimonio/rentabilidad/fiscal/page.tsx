import Link from 'next/link'
import { redirect } from 'next/navigation'

import { eur } from '@/lib/dinero'
import { AVISO_ORIENTATIVO, informeFiscal, type InformeFiscal, type Tratamiento } from '@/lib/patrimonio/fiscal'
import { PRIMER_ANIO } from '@/lib/patrimonio/rentabilidad'
import { rentabilidadDeIdentidad } from '@/lib/patrimonio/rentabilidad-bd'
import { AVISO } from '@/lib/patrimonio/rentabilidad-textos'
import { puertaDeSesion } from '@/lib/puertas-portal'
import { getIdentidad } from '@/lib/session'

export const dynamic = 'force-dynamic'

const cent = (c: number | null) => eur(c === null ? null : c / 100)
const fechaEs = (f: string) => f.split('-').reverse().join('/')
const ETIQUETA: Record<Tratamiento, string> = { deducible: 'Deducible', a_revisar: 'A revisar con tu asesor', no_directo: 'Se recupera por amortización' }

function Fila({ k, v, fuerte }: { k: string; v: string; fuerte?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <dt className="suave" style={{ fontSize: 13 }}>{k}</dt>
      <dd style={{ margin: 0, overflowWrap: 'anywhere', fontWeight: fuerte ? 700 : undefined }}>{v}</dd>
    </div>
  )
}

function Informe({ inf }: { inf: InformeFiscal }) {
  if (inf.arrendados.length === 0) {
    return <section className="seccion"><p style={{ margin: 0 }}>Ningún inmueble tiene renta devengada en {inf.anio}, así que no hay nada que declarar por alquiler.</p></section>
  }
  return (
    <>
      {inf.arrendados.map((i) => (
        <section key={i.inmuebleId} className="seccion" aria-labelledby={`fiscal-${i.inmuebleId}`}>
          <h2 id={`fiscal-${i.inmuebleId}`} style={{ margin: 0, overflowWrap: 'anywhere' }}>{i.alias}</h2>
          {i.titular && <p className="suave" style={{ margin: '0 0 8px', fontSize: 13 }}>{i.titular}</p>}
          <dl style={{ margin: 0, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            <Fila k="Ingresos íntegros (renta devengada)" v={cent(i.ingresosCent)} />
            {i.lineas.map((l) => (
              <div key={l.clave} style={{ minWidth: 0 }}>
                <dt className="suave" style={{ fontSize: 13 }}>{l.etiqueta} · {ETIQUETA[l.tratamiento]}</dt>
                <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>
                  {cent(l.importeCent)}
                  {l.nota && <span className="suave" style={{ display: 'block', fontSize: 13 }}>{l.nota}</span>}
                </dd>
              </div>
            ))}
            <Fila k="Total gastos deducibles" v={cent(i.totalDeducibleCent)} fuerte />
            {i.aRevisarCent > 0 && <Fila k="A revisar con tu asesor (no incluido arriba)" v={cent(i.aRevisarCent)} />}
            {i.noDirectoCent > 0 && <Fila k="Reformas y mobiliario (no incluido arriba)" v={cent(i.noDirectoCent)} />}
            <Fila k="Rendimiento antes de amortización" v={cent(i.rendimientoAntesAmortizacionCent)} fuerte />
            <Fila k="Amortización estimada" v={i.amortizacionCent === null ? 'sin dato (no guardamos el coste de adquisición ni el valor catastral)' : cent(i.amortizacionCent)} />
            <Fila k="Rendimiento neto" v={i.rendimientoNetoCent === null ? 'sin dato: falta la amortización' : cent(i.rendimientoNetoCent)} fuerte />
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
        </section>
      ))}
      {inf.sinIngresos.length > 0 && (
        <p className="suave" style={{ fontSize: 14 }}>Sin renta devengada en {inf.anio} (no entran): {inf.sinIngresos.join(', ')}.</p>
      )}
      {inf.sinImputarCent > 0 && (
        <p className="suave" style={{ fontSize: 14 }}>
          Además hay {cent(inf.sinImputarCent)} de gastos que no están asignados a ningún inmueble (por ejemplo, la gestoría): no se reparten solos.
        </p>
      )}
    </>
  )
}

/**
 * «Informe fiscal del alquiler» (25/10/2026): por inmueble arrendado y año, la rentabilidad reclasificada con el criterio del
 * IRPF. 🚨 Todo parte de `rentabilidadDeIdentidad` (→ `accesosPatrimonio`); lectura fallida ≠ «0 €»; amortización sin dato ≠ 0.
 */
export default async function FiscalPage({ searchParams }: { searchParams: Promise<{ anio?: string | string[] }> }) {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')
  if (!(await puertaDeSesion('patrimonio', 'lectura'))) redirect('/inicio')
  const { anio } = await searchParams
  let inf: InformeFiscal | null = null
  let fallo = false
  try {
    const d = await rentabilidadDeIdentidad(identidad.id, anio)
    if (d) inf = informeFiscal(d.resultado, d.inmuebles, d.periodo)
  } catch (e) {
    console.error('[patrimonio/fiscal]', e instanceof Error ? e.message : e)
    fallo = true
  }
  const actual = inf?.anio ?? new Date().getFullYear()
  const anios = Array.from({ length: actual - PRIMER_ANIO + 1 }, (_, k) => actual - k)

  return (
    <>
      <p className="antetitulo"><Link href="/patrimonio/rentabilidad">Rentabilidad</Link></p>
      <h1>Informe fiscal del alquiler</h1>
      {fallo ? (
        <section className="seccion"><p role="status" style={{ margin: 0 }}>Ahora no hemos podido calcular el informe. Vuelve a intentarlo en un rato; no significa que sea cero.</p></section>
      ) : inf === null ? (
        <section className="seccion"><p style={{ margin: 0 }}>No tienes ningún patrimonio asignado en este portal.</p></section>
      ) : (
        <>
          <p className="suave" role="note" style={{ marginTop: 0 }}>
            {AVISO_ORIENTATIVO} Del {fechaEs(inf.desde)} al {fechaEs(inf.hasta)}{inf.enCurso ? ' (ejercicio en curso: todavía provisional)' : ''}.
          </p>
          <p style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '0 0 12px' }}>
            {anios.map((a) => (
              <Link key={a} className={a === inf!.anio ? 'boton' : 'boton-tenue'} style={{ minHeight: 44 }} href={`/patrimonio/rentabilidad/fiscal?anio=${a}`} aria-current={a === inf!.anio ? 'page' : undefined}>
                {a}
              </Link>
            ))}
          </p>
          <p style={{ margin: '0 0 12px' }}>
            <a className="boton boton-secundario" style={{ minHeight: 44 }} href={`/api/patrimonio/rentabilidad/fiscal?anio=${inf.anio}`} download>Descargar CSV</a>
          </p>
          <Informe inf={inf} />
        </>
      )}
      <p style={{ marginTop: 24 }}>
        <Link href="/patrimonio/rentabilidad">← Rentabilidad</Link>
      </p>
    </>
  )
}
