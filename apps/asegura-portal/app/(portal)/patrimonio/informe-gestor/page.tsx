import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { eur } from '@/lib/dinero'
import type { InformeEdificio, InformeInmueble } from '@/lib/patrimonio/fiscal'
import type { InformeGestor, TitularGestor } from '@/lib/patrimonio/informe-gestor'
import { informeGestorDeIdentidad, type ResultadoInformeGestor } from '@/lib/patrimonio/informe-gestor-bd'
import { PRIMER_ANIO } from '@/lib/patrimonio/rentabilidad'
import { puertaDeSesion } from '@/lib/puertas-portal'
import { getIdentidad } from '@/lib/session'

import { ImprimirResumen } from '../../resumen/ImprimirResumen'

export const dynamic = 'force-dynamic'

const cent = (c: number | null) => eur(c === null ? null : c / 100)
const sinDato = (c: number | null) => (c === null ? 'sin dato' : cent(c))
const fechaEs = (f: string) => f.split('-').reverse().join('/')

function Fila({ k, v, fuerte }: { k: string; v: string; fuerte?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <dt className="suave" style={{ fontSize: 13 }}>{k}</dt>
      <dd style={{ margin: 0, overflowWrap: 'anywhere', fontWeight: fuerte ? 700 : undefined }}>{v}</dd>
    </div>
  )
}

function Bloque({ titulo, i }: { titulo: string; i: InformeInmueble }) {
  return (
    <div style={{ minWidth: 0 }}>
      <h4 style={{ margin: '12px 0 4px', overflowWrap: 'anywhere' }}>{titulo}</h4>
      <dl style={{ margin: 0, display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <Fila k="Ingresos íntegros" v={cent(i.ingresosCent)} />
        {i.lineas.map((l) => <Fila key={l.clave} k={`${l.etiqueta} (${l.tratamiento === 'deducible' ? 'deducible' : l.tratamiento === 'a_revisar' ? 'a revisar' : 'no directo'})`} v={cent(l.importeCent)} />)}
        <Fila k="Total gastos deducibles" v={cent(i.totalDeducibleCent)} fuerte />
        <Fila k="Rendimiento antes de amortización" v={cent(i.rendimientoAntesAmortizacionCent)} fuerte />
        <Fila k="Amortización estimada" v={sinDato(i.amortizacionCent)} />
        <Fila k="Rendimiento neto" v={sinDato(i.rendimientoNetoCent)} fuerte />
      </dl>
    </div>
  )
}

function Edificio({ e }: { e: InformeEdificio }) {
  return (
    <div style={{ minWidth: 0 }}>
      <h3 style={{ margin: '16px 0 0', overflowWrap: 'anywhere' }}>{e.alias} · edificio</h3>
      <p className="suave" style={{ margin: '0 0 4px', fontSize: 13 }}>Referencia catastral {e.referenciaCatastral ?? 'sin dato'}</p>
      {e.unidades.map((u) => <Bloque key={u.inmuebleId} titulo={`Unidad ${u.alias}`} i={u} />)}
      {e.comunes && <Bloque titulo="Gastos comunes sin repartir" i={e.comunes} />}
      <dl style={{ margin: '12px 0 0', display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <Fila k="Total del edificio · ingresos" v={cent(e.ingresosCent)} />
        <Fila k="Total del edificio · gastos deducibles" v={cent(e.totalDeducibleCent)} />
        <Fila k="Total del edificio · rendimiento antes de amortización" v={cent(e.rendimientoAntesAmortizacionCent)} fuerte />
      </dl>
    </div>
  )
}

function Titular({ t }: { t: TitularGestor }) {
  return (
    <section className="seccion" aria-labelledby={`gestor-${t.titularId}`}>
      <h2 id={`gestor-${t.titularId}`} style={{ margin: 0, overflowWrap: 'anywhere' }}>{t.nombre}</h2>
      {t.elementos.map((el) =>
        el.tipo === 'inmueble'
          ? <Bloque key={el.inmueble.inmuebleId} titulo={el.inmueble.alias} i={el.inmueble} />
          : <Edificio key={el.edificio.edificioId} e={el.edificio} />,
      )}
      <h3 style={{ margin: '16px 0 4px' }}>Total del titular</h3>
      <dl style={{ margin: 0, display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <Fila k="Ingresos íntegros" v={cent(t.totales.ingresosCent)} />
        <Fila k="Gastos deducibles" v={cent(t.totales.totalDeducibleCent)} />
        {t.totales.aRevisarCent > 0 && <Fila k="A revisar (no incluido arriba)" v={cent(t.totales.aRevisarCent)} />}
        {t.totales.noDirectoCent > 0 && <Fila k="Reformas y mobiliario (no incluido arriba)" v={cent(t.totales.noDirectoCent)} />}
        <Fila k="Rendimiento antes de amortización" v={cent(t.totales.rendimientoAntesAmortizacionCent)} fuerte />
        <Fila k="Rendimiento neto" v={sinDato(t.totales.rendimientoNetoCent)} fuerte />
      </dl>
    </section>
  )
}

function Cuerpo({ inf }: { inf: InformeGestor }) {
  if (inf.titulares.length === 0) {
    return <section className="seccion"><p style={{ margin: 0 }}>Ningún inmueble tiene renta devengada en {inf.anio}.</p></section>
  }
  return (
    <>
      {inf.titulares.map((t) => <Titular key={t.titularId} t={t} />)}
      {inf.sinIngresos.length > 0 && <p className="suave" style={{ fontSize: 14 }}>Sin renta devengada en {inf.anio} (no entran): {inf.sinIngresos.join(', ')}.</p>}
      {inf.sinImputarCent > 0 && <p className="suave" style={{ fontSize: 14 }}>Además hay {cent(inf.sinImputarCent)} de gastos sin inmueble asignado: no están en ningún total.</p>}
    </>
  )
}

/**
 * «Informe anual para tu gestor» (P7, 27/10/2026): por titular y año, por inmueble (y unidad), ingresos y gastos clasificados
 * para la renta. Todo parte de `informeGestorDeIdentidad` (→ `accesosPatrimonio`); titular ajeno = 404. Descarga CSV y vista
 * imprimible (el navegador guarda el PDF): sin generador de PDF en servidor, sin dependencias nuevas.
 */
export default async function InformeGestorPage({ searchParams }: { searchParams: Promise<{ anio?: string | string[]; titular?: string | string[] }> }) {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')
  if (!(await puertaDeSesion('patrimonio', 'lectura'))) redirect('/inicio')
  const { anio, titular } = await searchParams
  const titularPedido = Array.isArray(titular) ? titular[0] : titular
  let r: ResultadoInformeGestor | null = null
  let fallo = false
  try {
    r = await informeGestorDeIdentidad(identidad.id, Array.isArray(anio) ? anio[0] : anio, titularPedido)
  } catch (e) {
    console.error('[patrimonio/informe-gestor]', e instanceof Error ? e.message : e)
    fallo = true
  }
  if (r?.kind === 'no_encontrado') notFound()
  const inf = r?.kind === 'ok' ? r.informe : null
  const actual = inf?.anio ?? new Date().getFullYear()
  const anios = Array.from({ length: actual - PRIMER_ANIO + 1 }, (_, k) => actual - k)
  const qTitular = titularPedido ? `&titular=${encodeURIComponent(titularPedido)}` : ''

  return (
    <>
      <p className="antetitulo solo-pantalla"><Link href="/patrimonio/rentabilidad" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Rentabilidad</Link></p>
      <h1>Informe anual para tu gestor</h1>
      {fallo ? (
        <section className="seccion"><p role="status" style={{ margin: 0 }}>Ahora no hemos podido calcular el informe. Vuelve a intentarlo en un rato; no significa que sea cero.</p></section>
      ) : r === null || r.kind !== 'ok' || inf === null ? (
        <section className="seccion"><p style={{ margin: 0 }}>No tienes ningún patrimonio asignado en este portal.</p></section>
      ) : (
        <>
          <p role="note" style={{ marginTop: 0, fontWeight: 600 }}>{inf.textoLegal}.</p>
          <p className="suave" style={{ marginTop: 0 }}>
            Año {inf.anio}: del {fechaEs(inf.desde)} al {fechaEs(inf.hasta)}{inf.enCurso ? ' (ejercicio en curso: todavía provisional)' : ''}.
          </p>
          <div className="solo-pantalla">
            <p style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '0 0 12px' }}>
              {anios.map((a) => (
                <Link key={a} className={a === inf.anio ? 'boton' : 'boton-tenue'} style={{ minHeight: 44 }} href={`/patrimonio/informe-gestor?anio=${a}${qTitular}`} aria-current={a === inf.anio ? 'page' : undefined}>
                  {a}
                </Link>
              ))}
            </p>
            {r.titulares.length > 1 && (
              <p style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '0 0 12px' }}>
                <Link className={titularPedido ? 'boton-tenue' : 'boton'} style={{ minHeight: 44 }} href={`/patrimonio/informe-gestor?anio=${inf.anio}`}>Todos los titulares</Link>
                {r.titulares.map((t) => (
                  <Link key={t.id} className={titularPedido === t.id ? 'boton' : 'boton-tenue'} style={{ minHeight: 44 }} href={`/patrimonio/informe-gestor?anio=${inf.anio}&titular=${encodeURIComponent(t.id)}`}>{t.nombre || 'Titular'}</Link>
                ))}
              </p>
            )}
            <p style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '0 0 12px' }}>
              <a className="boton boton-secundario" style={{ minHeight: 44 }} href={`/api/patrimonio/informe-gestor?anio=${inf.anio}${qTitular}`} download>Descargar CSV</a>
              <ImprimirResumen />
            </p>
          </div>
          <Cuerpo inf={inf} />
        </>
      )}
      <p className="solo-pantalla" style={{ marginTop: 24 }}>
        <Link href="/patrimonio/rentabilidad" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>← Rentabilidad</Link>
      </p>
    </>
  )
}
