import { eur } from '@/lib/dinero'
import type { OpcionCliente } from '@/lib/presupuesto'
import {
  TEXTOS_OFERTAS, cuadroOfertas, esRecomendada, garantiasTarjeta, ordenarOfertas,
} from '@/lib/presupuesto-ofertas-vista'
import { etiquetaPapeles, textoFranquicia } from '@/lib/presupuesto-vista'
import { AceptarOpcion } from './AceptarOpcion'
import { LogoCompania } from './LogoCompania'

/**
 * El estudio de un presupuesto de origen `ofertas` (ramos libres: comunidades, comercio…): una tarjeta
 * por compañía, la recomendada por el corredor destacada, y el cuadro garantía × compañía.
 * Componente de SERVIDOR; solo `AceptarOpcion` (cliente) tiene estado. Lo que se afirma sale de
 * `lib/presupuesto-ofertas-vista.ts`.
 *
 * 📱 El cuadro son DOS pintados del mismo dato y el CSS enseña uno: tabla con scroll horizontal y la
 * primera columna fija desde 700 px, y una tarjeta por garantía (filas etiquetadas por compañía) por
 * debajo — una comparación que hay que arrastrar en 320 px no se compara.
 *
 * 🚨 «No figura» ≠ «No»: una garantía que la oferta no menciona no se pinta como excluida.
 */
export function EstudioOfertas({
  presupuestoId, opciones, caducado, puedeAceptar, bloqueoDatos, corredor, pdf,
}: {
  presupuestoId: string
  opciones: OpcionCliente[]
  caducado: boolean
  puedeAceptar: boolean
  bloqueoDatos: string | null
  corredor: boolean
  /** Se ofrece el PDF (ya enviado). */
  pdf: boolean
}) {
  const orden = ordenarOfertas(opciones)
  const cuadro = cuadroOfertas(orden)

  return (
    <>
      <section className="seccion">
        <h2 style={{ marginTop: 0 }}>{TEXTOS_OFERTAS.titulo}</h2>

        {orden.length === 0 ? (
          <p className="pendiente">{TEXTOS_OFERTAS.sinOfertas}</p>
        ) : (
          <div className="presu-tarjetas">
            {orden.map((o) => {
              const g = garantiasTarjeta(o)
              const papel = etiquetaPapeles(o.papeles, false)
              return (
                <article key={o.id} className="presu-tarjeta" data-caducado={caducado ? 'si' : undefined} data-recomendada={esRecomendada(o) ? 'si' : undefined}>
                  {papel !== null && <p className="presu-papel">{papel}</p>}
                  <div className="presu-compania"><LogoCompania nombre={o.compania} alto={34} /></div>
                  <p className="presu-producto">{o.producto}</p>

                  <p className="presu-importe">
                    {o.primaEur === null ? <span className="pendiente">sin precio</span> : eur(o.primaEur)}
                    <span className="presu-anual">al año</span>
                  </p>
                  <p className="presu-firmeza-texto">{TEXTOS_OFERTAS.firmeza}</p>
                  <p className="presu-franquicia">{textoFranquicia(o.franquiciaEur, eur)}</p>

                  {g.sinLeer ? (
                    <p className="pendiente" style={{ fontSize: 13 }}>{TEXTOS_OFERTAS.sinLeer}</p>
                  ) : g.items.length > 0 ? (
                    <ul className="presu-clave">
                      {g.items.map((t, i) => <li key={i}>{t}</li>)}
                      {g.resto > 0 && <li className="suave">y {g.resto} más en el cuadro de abajo</li>}
                    </ul>
                  ) : null}

                  {o.avisos.length > 0 && (
                    <ul className="presu-avisos">
                      {o.avisos.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  )}
                  {o.ipidId && (
                    <p style={{ margin: '8px 0 0' }}>
                      <a href={`/api/ipid/${o.ipidId}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, overflowWrap: 'anywhere' }}>
                        Ficha informativa (IPID) de {o.compania} ↗
                      </a>
                    </p>
                  )}

                  {puedeAceptar && o.primaEur !== null && (
                    <div style={{ marginTop: 12 }}>
                      <AceptarOpcion
                        presupuestoId={presupuestoId}
                        opcionId={o.id}
                        prima={o.primaEur}
                        compania={o.compania}
                        corredor={corredor}
                        bloqueoDatos={bloqueoDatos}
                        origen="ofertas"
                      />
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}

        {pdf && (
          <p style={{ margin: '14px 0 0' }}>
            <a className="boton-tenue" href={`/api/presupuesto/pdf?id=${presupuestoId}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>
              {TEXTOS_OFERTAS.pdf}
            </a>
            <span className="suave" style={{ display: 'block', fontSize: 13, marginTop: 4 }}>{TEXTOS_OFERTAS.pdfPista}</span>
          </p>
        )}
      </section>

      {cuadro.filas.length > 0 && (
        <section className="seccion" aria-labelledby="cuadro-ofertas-titulo">
          <h2 id="cuadro-ofertas-titulo" style={{ marginTop: 0 }}>{TEXTOS_OFERTAS.comparativoTitulo}</h2>
          {cuadro.sinLeer.length > 0 && (
            <p className="pendiente" style={{ fontSize: 14 }}>
              Las garantías de {cuadro.sinLeer.join(', ')} no se han podido leer. Eso no quiere decir que no cubra nada: pídeme su condicionado.
            </p>
          )}

          {/* ≥ 700 px: tabla. */}
          <div className="ofertas-tabla" style={{ overflowX: 'auto', maxWidth: '100%', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 170 + 140 * cuadro.columnas.length, fontSize: 14 }}>
              <thead>
                <tr>
                  <th scope="col" style={{ ...celdaCab, position: 'sticky', left: 0, zIndex: 1, textAlign: 'left' }}>Garantía</th>
                  {cuadro.columnas.map((c) => (
                    <th key={c.id} scope="col" style={{ ...celdaCab, background: c.recomendada ? 'color-mix(in oklab, var(--primary) 10%, var(--surface))' : 'var(--surface)' }}>
                      <span style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}><LogoCompania nombre={c.compania} alto={26} /></span>
                      {c.recomendada && <span className="presu-papel" style={{ display: 'block', margin: 0 }}>Recomendada</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cuadro.filas.map((f) => (
                  <tr key={f.clave}>
                    <th scope="row" style={{ ...celda, position: 'sticky', left: 0, background: 'var(--surface)', textAlign: 'left', fontWeight: 500, overflowWrap: 'anywhere' }}>{f.nombre}</th>
                    {f.celdas.map((c, j) => (
                      <td key={j} style={{ ...celda, textAlign: 'center', color: COLOR[c.tono], fontWeight: c.tono === 'no_figura' ? 400 : 600, overflowWrap: 'anywhere' }}>{c.texto}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* < 700 px: una tarjeta por garantía, con una fila por compañía. */}
          <div className="ofertas-cards">
            {cuadro.filas.map((f) => (
              <article key={f.clave} className="ofertas-card">
                <h3 style={{ margin: '0 0 8px', fontSize: 15, overflowWrap: 'anywhere' }}>{f.nombre}</h3>
                <dl style={{ margin: 0, display: 'grid', gap: 6 }}>
                  {f.celdas.map((c, j) => (
                    <div key={j} style={{ display: 'flex', flexWrap: 'wrap', gap: '0 8px', fontSize: 14 }}>
                      <dt className="suave" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{cuadro.columnas[j].compania}:</dt>
                      <dd style={{ margin: 0, color: COLOR[c.tono], fontWeight: c.tono === 'no_figura' ? 400 : 600, overflowWrap: 'anywhere' }}>{c.texto}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>

          <p className="suave presu-nota">{TEXTOS_OFERTAS.nota}</p>
        </section>
      )}
    </>
  )
}

const COLOR = { si: 'var(--positive)', no: 'var(--negative)', no_figura: 'var(--muted)' } as const
const celda: React.CSSProperties = { padding: '6px 8px', borderTop: '1px solid var(--border)', verticalAlign: 'middle' }
const celdaCab: React.CSSProperties = { ...celda, borderTop: 'none', verticalAlign: 'bottom', textAlign: 'center', background: 'var(--surface)' }
