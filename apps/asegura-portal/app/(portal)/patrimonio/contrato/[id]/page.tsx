import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { estadoContrato, rentaVigente, type ResultadoActualizacion, type TopeAplicable } from '@central/module-patrimonio'

import { eur } from '@/lib/dinero'
import { contratoAutorizado } from '@/lib/patrimonio/contratos-bd'
import { fechaMadrid } from '@/lib/patrimonio/dia-madrid'
import { getIdentidad } from '@/lib/session'

import { AltaInquilino, AplicarRenta, VerDatosInquilino } from './ContratoAcciones'
import { TopeRenta } from './TopeRenta'

export const dynamic = 'force-dynamic'

const noConsta = 'No consta'
const fecha = (f: string | null) => (f === null ? noConsta : f.split('-').reverse().join('/'))
const cent = (c: number | null) => (c === null ? '—' : eur(c / 100))
const pct = (n: number) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 3 })} %`
const ESTADO = { futuro: 'Todavía no ha empezado', vigente: 'Vigente', terminado: 'Terminado' } as const

/** De dónde sale el tope que se aplica: del cliente, de la ley del año o «no lo tenemos» (nunca un 0 %). */
function textoTope(t: TopeAplicable): string {
  switch (t.origen) {
    case 'cliente':
      return `${pct(t.pct as number)} (el que tú has fijado).`
    case 'cliente_sin_tope':
      return 'sin tope (así lo has indicado).'
    case 'catalogo':
      return `${pct(t.pct as number)} (límite legal de ${t.anio} que tenemos anotado${t.catalogo ? `, según ${t.catalogo.norma}` : ''}).`
    case 'sin_catalogo':
      return `no tenemos anotado ningún límite para ${t.anio}. Si tu contrato o tu zona lo limitan, pon el tuyo.`
  }
}

/** Texto de la propuesta: dice el HECHO, sin inventar un 0 % cuando no tenemos el índice. */
function textoPropuesta(p: ResultadoActualizacion, indice: string | null, descripcion: string | null): string {
  switch (p.estado) {
    case 'sin_clausula':
      return 'El contrato no pacta actualización de la renta: no se actualiza.'
    case 'terminado':
      return 'El contrato ha terminado: no hay actualización que hacer.'
    case 'no_toca':
      return `La próxima actualización toca el ${fecha(p.proximoAniversario)}. Te la propondremos unos 30 días antes.`
    case 'sin_indice':
      return indice === 'otro'
        ? `Toca actualizar el ${fecha(p.proximoAniversario)} con el índice pactado (${descripcion ?? 'otro'}), que no tenemos: calcúlalo con tu asesor.`
        : `Toca actualizar el ${fecha(p.proximoAniversario)}, pero todavía no tenemos el ${indice ?? 'índice'} de referencia. No lo sabemos aún: no es un 0 %.`
    case 'indice_distinto':
      return `El índice disponible (${p.recibido}) no es el que pacta el contrato (${p.esperado}): no se propone nada.`
    case 'propuesta':
      return `Desde el ${fecha(p.aplicableDesde)}: de ${cent(p.rentaActual)} a ${cent(p.rentaNueva)} al mes (${pct(p.pctAplicado)}, ${p.indice} de ${p.periodo}${p.topado ? ', con el tope legal' : ''}).`
  }
}

/**
 * Ficha del contrato. 🚨 El id de la URL NO consulta por sí solo: `contratoAutorizado()` lo busca DENTRO de los titulares
 * que esta sesión puede ver. Si no existe o no es tuyo: 404 (nunca 403). La PII del inquilino NO se carga aquí: se pide
 * bajo demanda («Ver datos», solo nivel Total) por el puente de asegura.
 */
export default async function ContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')
  const { id } = await params
  const f = await contratoAutorizado(identidad.id, id)
  if (f === null) notFound()
  const c = f.contrato
  const hoy = fechaMadrid(new Date())
  const clausula = c.clausula.tipo === 'ninguna' ? 'Sin actualización pactada' : c.clausula.indice === 'otro' ? `Otro índice: ${c.clausula.descripcion ?? noConsta}` : c.clausula.indice

  const filas: [string, string][] = [
    ['Inmueble', f.inmueble.alias],
    ['Estado', ESTADO[estadoContrato(c, hoy)]],
    ['Inicio', fecha(c.inicio)],
    ['Fin pactado', c.fin === null ? noConsta : `${fecha(c.fin)} (con la prórroga de la LAU puede seguir vigente)`],
    ['Terminado el', c.terminadoEn === null ? '—' : fecha(c.terminadoEn)],
    ['Renta mensual vigente', cent(rentaVigente(c, hoy))],
    ['Renta inicial', cent(c.rentaMensual)],
    ['Actualización', clausula],
    ['Fianza', c.fianza === null ? noConsta : cent(c.fianza.importe)],
    ['Fianza depositada', c.fianza?.depositadaEn ? `${fecha(c.fianza.depositadaEn)}${f.fianzaOrganismo ? ` · ${f.fianzaOrganismo}` : ''}` : noConsta],
    ['Seguro exigido al inquilino', c.seguroInquilino === null ? noConsta : c.seguroInquilino.exigido ? 'Sí' : 'No'],
  ]
  const p = f.propuesta

  return (
    <>
      <p className="antetitulo">Patrimonio · Contrato</p>
      <h1 style={{ overflowWrap: 'anywhere' }}>{f.inmueble.alias}</h1>
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
        <h2>Actualización de la renta</h2>
        <p style={{ overflowWrap: 'anywhere' }}>{textoPropuesta(p, c.clausula.tipo === 'indice' ? c.clausula.indice : null, c.clausula.tipo === 'indice' ? c.clausula.descripcion ?? null : null)}</p>
        {p.estado === 'propuesta' && (
          <>
            <p className="suave" style={{ fontSize: 13 }}>
              Esto es un cálculo: confirma con tu asesor si hay límites en tu zona. La nueva renta solo se puede exigir después de
              notificársela al inquilino; aplicarla aquí no le avisa.
            </p>
            {f.puedeAltaBaja && (
              <AplicarRenta contratoId={c.id} desde={p.aplicableDesde} rentaNuevaCent={p.rentaNueva} indice={p.indice} periodo={p.periodo} />
            )}
          </>
        )}
        {c.clausula.tipo === 'indice' && f.topeAplicable !== null && (
          <div style={{ display: 'grid', gap: 8, marginBlock: 12 }}>
            <p style={{ margin: 0, overflowWrap: 'anywhere' }}>
              <strong>Tope de subida:</strong> {textoTope(f.topeAplicable)}
            </p>
            {f.topeAplicable.catalogo !== null && f.topeAplicable.origen !== 'catalogo' && f.topeAplicable.catalogo.pct !== null && (
              <p className="suave" style={{ margin: 0, fontSize: 13 }}>
                El de la ley de {f.topeAplicable.anio} que tenemos es el {pct(f.topeAplicable.catalogo.pct)}.
              </p>
            )}
            <p className="suave" style={{ margin: 0, fontSize: 13 }}>
              Los límites cambian por ley y por zona: puedes ajustarlo a tu contrato. Solo afecta a la próxima propuesta.
              {f.topeAplicable.catalogo !== null && f.topeAplicable.catalogo.estado === 'por_verificar' ? ' El dato de la ley está pendiente de revisión fiscal.' : ''}
            </p>
            {f.puedeAltaBaja && (
              <TopeRenta
                contratoId={c.id}
                modo={f.topePreferencia.modo}
                pctPropio={f.topePreferencia.modo === 'propio' ? f.topePreferencia.pct : null}
              />
            )}
          </div>
        )}
        {f.historial.length > 0 && (
          <>
            <h3 style={{ fontSize: 15 }}>Actualizaciones aplicadas</h3>
            <ul style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 6 }}>
              {f.historial.map((h) => (
                <li key={h.desde} style={{ overflowWrap: 'anywhere' }}>
                  Desde el {fecha(h.desde)}: {cent(h.rentaMensualCent)} al mes
                  {h.indice ? ` (${h.pctAplicado === null ? '—' : pct(h.pctAplicado)} ${h.indice}${h.periodo ? ` de ${h.periodo}` : ''}${h.topado ? ', con tope' : ''})` : ' (anotada sin índice)'}
                  {h.notificada ? ' · notificada' : ' · sin notificar todavía'}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="seccion">
        <h2>Inquilinos</h2>
        {f.inquilinos.length === 0 ? (
          <p>Todavía no has anotado ningún inquilino en este contrato.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {f.inquilinos.map((q) => (
              <li key={q.id} style={{ minWidth: 0 }}>
                <strong style={{ overflowWrap: 'anywhere' }}>{q.nombre}</strong>
                <span className="suave"> · {q.papel === 'avalista' ? 'Avalista' : 'Inquilino'} · {q.tipo === 'sociedad' ? 'Sociedad' : 'Persona'}</span>
                <div className="suave" style={{ fontSize: 13 }}>{q.conCorreo ? 'Con correo anotado' : 'Sin correo anotado (no se le podrá enviar el enlace)'}</div>
                {f.puedeVerPii && <VerDatosInquilino inquilinoId={q.id} />}
              </li>
            ))}
          </ul>
        )}
        {f.puedeAltaBaja && <AltaInquilino contratoId={c.id} />}
      </section>

      <p style={{ marginTop: 24 }}>
        <Link href={`/patrimonio/inmueble/${f.inmueble.id}`}>← Volver al inmueble</Link>
      </p>
    </>
  )
}
