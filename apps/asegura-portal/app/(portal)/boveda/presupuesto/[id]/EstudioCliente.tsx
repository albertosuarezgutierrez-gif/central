import { eur } from '@/lib/dinero'
import type { OpcionCliente } from '@/lib/presupuesto'
import { opcionesSinColumna, ordenColumnas, type EstadoCeldaEstudio, type VistaEstudio } from '@/lib/estudio-cliente'
import type { AvisoPerdidas } from '@/lib/todas-las-opciones'
import { AceptarOpcion } from './AceptarOpcion'
import { LogoCompania } from './LogoCompania'
import { Plegable } from './RestoDeOpciones'

/**
 * El ESTUDIO del presupuesto (21/10/2026): el MISMO que el PDF (lo arma asegura, `estudio-cliente.ts`), para los dos
 * orígenes (Avant2 y ofertas). Componente de SERVIDOR; solo `AceptarOpcion` (el flujo de aceptación con código, SIN
 * cambios) tiene estado.
 *
 *   1. La RECOMENDADA arriba, con su precio grande (si el corredor marcó una).
 *   2. Una tarjeta por opción: logo + compañía + nivel, precio («precio estimado» si lo es) y el botón de aceptar.
 *   3. El resumen con su etiqueta (IA revisada por el corredor, o plantilla), siempre visible.
 *   4. El cuadro de coberturas en tres estados (✓ incluida · ✗ excluida · ? no figura) con leyenda, plegado: tabla
 *      con scroll horizontal desde 700 px y una tarjeta por garantía por debajo (en 320 px no se arrastra nada).
 *
 * 🚨 «No figura» ≠ «No»: lo que la oferta no menciona no se pinta como excluido.
 */
export function EstudioCliente({
  vista, presupuestoId, opciones, caducado, puedeAceptar, bloqueoDatos, corredor, codigoWhatsapp = false, origen, pdf, perdidas = {}, otrasEnLista = false,
}: {
  vista: VistaEstudio
  presupuestoId: string
  /** Las opciones EN DOCUMENTO de la página: de aquí salen la prima que se acepta y la ficha IPID. */
  opciones: OpcionCliente[]
  caducado: boolean
  puedeAceptar: boolean
  bloqueoDatos: string | null
  corredor: boolean
  codigoWhatsapp?: boolean
  origen: 'codeoscopic' | 'ofertas'
  pdf: boolean
  perdidas?: Record<string, AvisoPerdidas | null>
  /** Las opciones que no caben en el cuadro ya salen, con su botón, en «Todas las opciones» (más abajo). */
  otrasEnLista?: boolean
}) {
  const cols = ordenColumnas(vista.columnas)
  const ofertas = cols.filter((c) => c.rol === 'oferta')
  const rec = ofertas.find((c) => c.recomendada) ?? null
  const opcionDe = (id: string | null) => (id ? opciones.find((o) => o.id === id) ?? null : null)
  const indice = (id: string) => vista.columnas.findIndex((c) => c.id === id)
  // 🚨 Ninguna opción en documento sin forma de aceptarla: las que no tienen columna se listan aquí con su botón (o se
  // remite a «Todas las opciones», que las trae todas con el suyo).
  const sinColumna = opcionesSinColumna(vista.columnas, opciones)

  const aceptar = (opcionId: string | null, compania: string) => {
    const o = opcionDe(opcionId)
    if (!puedeAceptar || !o || o.primaEur === null) return null
    return (
      <div style={{ marginTop: 12 }}>
        <AceptarOpcion
          presupuestoId={presupuestoId}
          opcionId={o.id}
          prima={o.primaEur}
          compania={compania}
          corredor={corredor}
          bloqueoDatos={bloqueoDatos}
          codigoWhatsapp={codigoWhatsapp}
          origen={origen}
          perdidas={perdidas[o.id] ?? null}
        />
      </div>
    )
  }

  return (
    <>
      <section className="seccion" aria-labelledby="estudio-titulo">
        <h2 id="estudio-titulo" style={{ marginTop: 0 }}>Tus opciones, comparadas</h2>

        {rec && (
          <article className="presu-tarjeta estudio-destacada" data-recomendada="si" data-caducado={caducado ? 'si' : undefined}>
            <p className="presu-papel">Recomendada por tu corredor</p>
            <div className="presu-compania"><LogoCompania nombre={rec.compania} alto={40} /></div>
            <p className="presu-producto">{rec.etiqueta}</p>
            <p className="presu-importe estudio-importe-grande">
              {rec.primaAnual !== null ? eur(rec.primaAnual) : rec.precio}
              {rec.primaAnual !== null && <span className="presu-anual">al año</span>}
            </p>
            {rec.estimado && <p className="presu-firmeza-texto">Precio estimado: la compañía lo confirma al emitir.</p>}
            {aceptar(rec.opcionId, rec.compania)}
          </article>
        )}

        <div className="presu-tarjetas">
          {ofertas.filter((c) => c !== rec).map((c) => {
            const o = opcionDe(c.opcionId)
            return (
              <article key={c.id} className="presu-tarjeta" data-caducado={caducado ? 'si' : undefined}>
                <div className="presu-compania"><LogoCompania nombre={c.compania} alto={32} /></div>
                <p className="presu-producto">{c.etiqueta}</p>
                <p className="presu-importe">
                  {c.primaAnual !== null ? eur(c.primaAnual) : <span style={{ fontSize: 18 }}>{c.precio}</span>}
                  {c.primaAnual !== null && <span className="presu-anual">al año</span>}
                </p>
                {c.estimado && <p className="presu-firmeza-texto">Precio estimado: la compañía lo confirma al emitir.</p>}
                {o?.ipidId && (
                  <p style={{ margin: '8px 0 0' }}>
                    <a href={`/api/ipid/${o.ipidId}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, overflowWrap: 'anywhere' }}>
                      Ficha informativa (IPID) de {c.compania} ↗
                    </a>
                  </p>
                )}
                {aceptar(c.opcionId, c.compania)}
              </article>
            )
          })}
        </div>

        {sinColumna.length > 0 && (otrasEnLista ? (
          <p className="suave" style={{ margin: '12px 0 0', fontSize: 14 }}>
            {sinColumna.length === 1 ? 'Hay 1 opción más' : `Hay ${sinColumna.length} opciones más`} en «Todas las opciones», más abajo, con su botón para elegirla.
          </p>
        ) : (
          <>
            <h3 style={{ margin: '16px 0 0', fontSize: 16 }}>Otras opciones de este presupuesto</h3>
            <div className="presu-tarjetas">
              {sinColumna.map((o) => (
                <article key={o.id} className="presu-tarjeta" data-caducado={caducado ? 'si' : undefined}>
                  <div className="presu-compania"><LogoCompania nombre={o.compania} alto={28} /></div>
                  <p className="presu-producto">{o.modalidad ?? o.producto}</p>
                  <p className="presu-importe">
                    {o.primaEur === null ? <span className="pendiente">sin precio</span> : eur(o.primaEur)}
                    {o.primaEur !== null && <span className="presu-anual">al año</span>}
                  </p>
                  {o.firmeza === 'estimado' && <p className="presu-firmeza-texto">Precio estimado: la compañía lo confirma al emitir.</p>}
                  {aceptar(o.id, o.compania)}
                </article>
              ))}
            </div>
          </>
        ))}

        {pdf && (
          <p style={{ margin: '14px 0 0' }}>
            <a className="boton-tenue" href={`/api/presupuesto/pdf?id=${presupuestoId}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>
              Descargar el estudio comparativo (PDF)
            </a>
          </p>
        )}
      </section>

      {vista.narrativa && (
        <section className="seccion" aria-labelledby="estudio-resumen">
          <h2 id="estudio-resumen" style={{ marginTop: 0 }}>Análisis y recomendación</h2>
          <p className="suave" style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700 }}>{vista.narrativa.etiqueta}</p>
          {vista.narrativa.resumen && <p style={{ margin: '0 0 8px' }}>{vista.narrativa.resumen}</p>}
          {vista.narrativa.recomendacion && <p style={{ margin: 0 }}>{vista.narrativa.recomendacion}</p>}
        </section>
      )}

      {vista.filas.length > 0 && (
        <section className="seccion" aria-labelledby="estudio-cuadro">
          <h2 id="estudio-cuadro" style={{ marginTop: 0 }}>Coberturas, una a una</h2>
          <p className="suave" style={{ marginTop: 0, fontSize: 14 }}>{vista.textoFuente}</p>
          <Leyenda texto={vista.leyenda} />
          <Plegable titulo="Ver todas las coberturas comparadas">
            {/* ≥ 700 px: tabla con scroll horizontal propio y la primera columna fija. */}
            <div className="ofertas-tabla" style={{ overflowX: 'auto', maxWidth: '100%', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 170 + 140 * cols.length, fontSize: 14 }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ ...celdaCab, position: 'sticky', left: 0, zIndex: 1, textAlign: 'left' }}>Cobertura</th>
                    {cols.map((c) => (
                      <th key={c.id} scope="col" style={{ ...celdaCab, background: c.recomendada ? 'color-mix(in oklab, var(--primary) 10%, var(--surface))' : 'var(--surface)' }}>
                        <span style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}><LogoCompania nombre={c.compania} alto={22} /></span>
                        <span style={{ display: 'block', fontSize: 12, fontWeight: 600, overflowWrap: 'anywhere' }}>{c.rol === 'actual' ? 'Tu póliza actual' : c.nivel ?? c.etiqueta}</span>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{c.precio}</span>
                        {c.recomendada && <span className="presu-papel" style={{ display: 'block', margin: 0 }}>Recomendada</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vista.filas.map((f) => (
                    <tr key={f.clave}>
                      <th scope="row" style={{ ...celda, position: 'sticky', left: 0, background: 'var(--surface)', textAlign: 'left', fontWeight: 500, overflowWrap: 'anywhere' }}>{f.etiqueta}</th>
                      {cols.map((c) => { const x = f.celdas[indice(c.id)]; return <td key={c.id} style={{ ...celda, textAlign: 'center' }}><Celda estado={x?.estado ?? 'nose'} texto={x?.texto ?? 'No figura'} /></td> })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* < 700 px: una tarjeta por cobertura, una línea por opción (apiladas, sin scroll lateral). */}
            <div className="ofertas-cards">
              {vista.filas.map((f) => (
                <article key={f.clave} className="ofertas-card">
                  <h3 style={{ margin: '0 0 8px', fontSize: 15, overflowWrap: 'anywhere' }}>{f.etiqueta}</h3>
                  <dl style={{ margin: 0, display: 'grid', gap: 6 }}>
                    {cols.map((c) => { const x = f.celdas[indice(c.id)]; return (
                      <div key={c.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '0 8px', fontSize: 14 }}>
                        <dt className="suave" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{c.rol === 'actual' ? 'Tu póliza actual' : c.etiqueta}:</dt>
                        <dd style={{ margin: 0 }}><Celda estado={x?.estado ?? 'nose'} texto={x?.texto ?? 'No figura'} /></dd>
                      </div>
                    ) })}
                  </dl>
                </article>
              ))}
            </div>
            {vista.notas.map((n, i) => <p key={i} className="suave presu-nota">{n}</p>)}
          </Plegable>
        </section>
      )}
    </>
  )
}

const ICONO: Record<EstadoCeldaEstudio, { glifo: string; color: string; nombre: string }> = {
  si: { glifo: '✓', color: 'var(--positive)', nombre: 'Incluida' },
  no: { glifo: '✗', color: 'var(--negative)', nombre: 'Excluida' },
  nose: { glifo: '?', color: 'var(--muted)', nombre: 'No figura' },
}

function Celda({ estado, texto }: { estado: EstadoCeldaEstudio; texto: string }) {
  const i = ICONO[estado]
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'baseline', color: estado === 'nose' ? 'var(--muted)' : 'var(--text)', fontWeight: estado === 'nose' ? 400 : 600, overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>
      <span role="img" aria-label={i.nombre} style={{ color: i.color, fontWeight: 700, flex: '0 0 auto' }}>{i.glifo}</span>
      <span>{texto}</span>
    </span>
  )
}

function Leyenda({ texto }: { texto: string }) {
  return (
    <p className="suave" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', margin: '0 0 8px', fontSize: 13 }} aria-label={texto}>
      {(['si', 'no', 'nose'] as const).map((e) => (
        <span key={e} style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline' }}>
          <span aria-hidden="true" style={{ color: ICONO[e].color, fontWeight: 700 }}>{ICONO[e].glifo}</span>
          {e === 'nose' ? 'No figura (no consta; no quiere decir que no esté cubierta)' : ICONO[e].nombre}
        </span>
      ))}
    </p>
  )
}

const celda: React.CSSProperties = { padding: '6px 8px', borderTop: '1px solid var(--border)', verticalAlign: 'middle' }
const celdaCab: React.CSSProperties = { ...celda, borderTop: 'none', verticalAlign: 'bottom', textAlign: 'center', background: 'var(--surface)' }
