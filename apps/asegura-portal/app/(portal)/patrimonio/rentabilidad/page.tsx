import Link from 'next/link'
import { redirect } from 'next/navigation'

import { eur } from '@/lib/dinero'
import { ordenarConUnidades } from '@/lib/patrimonio/edificio-vista'
import { rentabilidadDeIdentidad, type RentabilidadDeIdentidad } from '@/lib/patrimonio/rentabilidad-bd'
import { PRIMER_ANIO } from '@/lib/patrimonio/rentabilidad'
import { AVISO } from '@/lib/patrimonio/rentabilidad-textos'
import { puertaDeSesion } from '@/lib/puertas-portal'
import { getIdentidad } from '@/lib/session'

export const dynamic = 'force-dynamic'

const cent = (c: number) => eur(c / 100)
const fechaEs = (f: string) => f.split('-').reverse().join('/')

type Fila = RentabilidadDeIdentidad['resultado']['inmuebles'][number]
type Vista = RentabilidadDeIdentidad['resultado']['edificios'][number]

const MOTIVO_REPARTO: Record<string, string> = {
  sin_criterio: 'todavía no has elegido cómo repartirlos',
  sin_unidades: 'el edificio no tiene unidades',
  falta_superficie: 'falta la superficie de alguna unidad',
  falta_porcentaje: 'falta el porcentaje de alguna unidad',
  porcentajes_no_suman: 'los porcentajes no suman 100',
}

const pctEs = (m: number | null) => (m === null ? '—' : `${m.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`)

function Cifras({ filas }: { filas: [string, string][] }) {
  return (
    <dl style={{ margin: 0, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {filas.map(([k, v]) => (
        <div key={k} style={{ minWidth: 0 }}>
          <dt className="suave" style={{ fontSize: 13 }}>{k}</dt>
          <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Tarjeta({ i, info, sangria }: { i: Fila; info: RentabilidadDeIdentidad['inmuebles'][number] | undefined; sangria: boolean }) {
  return (
    <section className="seccion" aria-labelledby={`rent-${i.inmuebleId}`} style={sangria ? { marginLeft: 12 } : undefined}>
      <h2 id={`rent-${i.inmuebleId}`} style={{ margin: 0, overflowWrap: 'anywhere' }}>{info?.alias ?? 'Inmueble'}</h2>
      {info?.titular && <p className="suave" style={{ margin: '0 0 8px', fontSize: 13 }}>{info.titular}</p>}
      <Cifras filas={[
        ['Ingresos (renta devengada)', cent(i.ingresos)],
        ['Gastos confirmados', cent(i.gastos)],
        ['Seguros', cent(i.seguros)],
        ['Beneficio', cent(i.beneficio)],
        ['Margen', pctEs(i.margenPct)],
      ]} />
      {i.gastosSinConfirmar > 0 && (
        <p style={{ margin: '8px 0 0' }}>
          Tienes {i.gastosSinConfirmar} {i.gastosSinConfirmar === 1 ? 'factura' : 'facturas'} sin revisar: no cuentan hasta que las confirmes.{' '}
          <Link href="/patrimonio/gastos" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Revisarlas</Link>
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
}

/** Edificio sin división horizontal: el total del edificio entero y la comparativa entre sus unidades (27/10/2026). */
function Edificio({ v, d }: { v: Vista; d: RentabilidadDeIdentidad }) {
  const info = d.inmuebles.find((x) => x.id === v.edificioId)
  const alias = (id: string) => d.inmuebles.find((x) => x.id === id)?.alias ?? 'Unidad'
  return (
    <section className="seccion" aria-labelledby={`rent-${v.edificioId}`}>
      <h2 id={`rent-${v.edificioId}`} style={{ margin: 0, overflowWrap: 'anywhere' }}>{info?.alias ?? 'Edificio'} · edificio entero</h2>
      {info?.titular && <p className="suave" style={{ margin: '0 0 8px', fontSize: 13 }}>{info.titular} · {v.unidadIds.length} {v.unidadIds.length === 1 ? 'unidad' : 'unidades'}</p>}
      <Cifras filas={[
        ['Ingresos (renta devengada)', cent(v.total.ingresos)],
        ['Gastos confirmados', cent(v.total.gastos)],
        ['Seguros', cent(v.total.seguros)],
        ['Beneficio', cent(v.total.beneficio)],
        ['Margen', pctEs(v.total.margenPct)],
      ]} />
      {v.reparto.ok ? (
        <p className="suave" style={{ margin: '8px 0 0', fontSize: 14 }}>
          Los gastos del edificio se reparten entre las unidades {v.reparto.criterio === 'm2' ? 'por sus m²' : 'por el porcentaje que has fijado'}.
        </p>
      ) : (
        <p className="aviso-linea" role="status" style={{ margin: '8px 0 0' }}>
          {v.gastosSinRepartir > 0 ? `Hay ${cent(v.gastosSinRepartir)} de gastos del edificio sin repartir` : 'Los gastos del edificio no se reparten'} porque {MOTIVO_REPARTO[v.reparto.motivo]}: cuentan en el total del edificio, no en ningún piso.{' '}
          <Link href={`/patrimonio/inmueble/${v.edificioId}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Configurar el reparto</Link>
        </p>
      )}
      {v.propio.gastosSinConfirmar > 0 && (
        <p style={{ margin: '8px 0 0' }}>
          El edificio tiene {v.propio.gastosSinConfirmar} {v.propio.gastosSinConfirmar === 1 ? 'factura' : 'facturas'} sin revisar: no cuentan hasta que las confirmes.{' '}
          <Link href="/patrimonio/gastos" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Revisarlas</Link>
        </p>
      )}
      {v.propio.avisos.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
          {v.propio.avisos.map((a) => <li key={a} className="suave" style={{ fontSize: 14 }}>{AVISO[a]}</li>)}
        </ul>
      )}
      {v.comparativa.length > 0 && (
        <>
          <h3 style={{ margin: '12px 0 8px' }}>Comparativa entre unidades</h3>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            {v.comparativa.map((c) => (
              <li key={c.inmuebleId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
                <span style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{c.puesto}. {alias(c.inmuebleId)}{c.ingresos === 0 ? ' (sin renta)' : ''}</span>
                <span style={{ textAlign: 'right' }}>{cent(c.beneficio)} <span className="suave" style={{ fontSize: 13 }}>· {pctEs(c.margenPct)}</span></span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}

function Datos({ d }: { d: RentabilidadDeIdentidad }) {
  const r = d.resultado
  const sinInmuebles = d.inmuebles.length === 0
  const vistas = new Map(r.edificios.map((v) => [v.edificioId, v]))
  const padre = new Map(d.inmuebles.map((x) => [x.id, x.edificioId]))
  const ordenadas = ordenarConUnidades(r.inmuebles.map((i) => ({ ...i, id: i.inmuebleId, inmueblePadreId: padre.get(i.inmuebleId) ?? null })))
  return (
    <>
      {sinInmuebles ? (
        <section className="seccion"><p style={{ margin: 0 }}>Todavía no hay inmuebles que calcular.</p></section>
      ) : (
        ordenadas.map(({ fila: i, edificioId }) => {
          const v = vistas.get(i.inmuebleId)
          if (v) return <Edificio key={i.inmuebleId} v={v} d={d} />
          return <Tarjeta key={i.inmuebleId} i={i} info={d.inmuebles.find((x) => x.id === i.inmuebleId)} sangria={edificioId !== null && vistas.has(edificioId)} />
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
        <Link href="/patrimonio" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>← Todo el patrimonio</Link>
      </p>
    </>
  )
}
