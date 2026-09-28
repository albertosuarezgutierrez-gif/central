'use client'
import { useEffect, useMemo, useState } from 'react'

import { eur } from '@/lib/dinero'
import { AVISO_IA, TEXTO_IA_NO_DISPONIBLE } from '@/lib/presupuesto-ia-textos'
import { TEXTO_CELDA, montarTabla, type ColumnaTabla, type EstadoCelda } from '@/lib/tabla-coberturas'
import { CompararIA } from './CompararIA'

export type OpcionResumen = ColumnaTabla & { primaEur: number | null; franquiciaEur: number | null }

const COLOR_CELDA: Record<EstadoCelda, string> = {
  si: 'var(--positive)',
  no: 'var(--negative)',
  ver_texto: 'var(--primary)',
  no_consta: 'var(--muted)',
}

/**
 * «Resumen de tus opciones», tras «Revisa tus datos»:
 *  (A) un párrafo hecho por IA (lo genera asegura UNA vez y lo cachea; si falla, se dice y la tabla
 *      sigue) y una TABLA de coberturas por compañía, con cuatro estados por celda que no se
 *      colapsan: Sí · No · ver texto (abre el literal de la compañía) · no consta.
 *  (B) «Comparar dos opciones con la IA».
 *
 * 📱 La tabla va en un contenedor con scroll horizontal propio y la primera columna fija: con tres
 * compañías no cabe en 320 px y encogerla la haría ilegible.
 */
export function ResumenOpciones({ presupuestoId, opciones, corredor, telefono }: {
  presupuestoId: string
  opciones: OpcionResumen[]
  corredor: boolean
  telefono: { tel: string; texto: string }
}) {
  const tabla = useMemo(() => montarTabla(opciones), [opciones])
  const [resumen, setResumen] = useState<{ estado: 'cargando' } | { estado: 'ok'; texto: string } | { estado: 'no'; texto: string }>(
    corredor ? { estado: 'no', texto: 'Vista de corredor: el resumen con IA lo genera el cliente al abrir su presupuesto.' } : { estado: 'cargando' },
  )
  const [abierta, setAbierta] = useState<{ fila: number; col: number } | null>(null)
  const [comparar, setComparar] = useState(false)

  useEffect(() => {
    if (corredor) return
    let vivo = true
    fetch('/api/presupuesto/ia', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accion: 'resumen', presupuestoId }),
    })
      .then((r) => r.json().catch(() => null))
      .then((j: { estado?: string; texto?: string; motivo?: string } | null) => {
        if (!vivo) return
        if (j?.estado === 'ok' && typeof j.texto === 'string') setResumen({ estado: 'ok', texto: j.texto })
        else setResumen({ estado: 'no', texto: j?.motivo ?? TEXTO_IA_NO_DISPONIBLE })
      })
      .catch(() => vivo && setResumen({ estado: 'no', texto: TEXTO_IA_NO_DISPONIBLE }))
    return () => { vivo = false }
  }, [presupuestoId, corredor])

  const celdaAbierta = abierta ? tabla.filas[abierta.fila]?.celdas[abierta.col] : null

  return (
    <section className="seccion" aria-labelledby="resumen-opciones-titulo">
      <h2 id="resumen-opciones-titulo" style={{ marginTop: 0 }}>Resumen de tus opciones</h2>

      {resumen.estado === 'cargando' ? (
        <p className="suave" role="status" style={{ margin: 0 }}>Preparando el resumen…</p>
      ) : resumen.estado === 'ok' ? (
        <p style={{ margin: 0, lineHeight: 1.55 }}>{resumen.texto}</p>
      ) : (
        <p className="pendiente" style={{ margin: 0 }}>{resumen.texto}</p>
      )}
      <p className="suave" style={{ margin: '8px 0 0', fontSize: 13 }}>{AVISO_IA}</p>

      <h3 style={{ margin: '18px 0 8px', fontSize: 15 }}>Coberturas por compañía</h3>
      {tabla.sinLeer.length > 0 && (
        <p className="pendiente" style={{ margin: '0 0 8px', fontSize: 14 }}>
          {tabla.sinLeer.length === 1
            ? `Las coberturas de ${tabla.sinLeer[0]} no se han podido leer.`
            : `Las coberturas de ${tabla.sinLeer.join(', ')} no se han podido leer.`}{' '}
          Eso no quiere decir que no cubra nada: pídeme su condicionado.
        </p>
      )}

      {tabla.filas.length === 0 ? (
        <p className="pendiente" style={{ margin: 0 }}>
          Ninguna compañía nos ha mandado todavía su lista de coberturas para este presupuesto. Te paso el condicionado de cada una antes de contratar.
        </p>
      ) : (
        <>
          <div style={{ overflowX: 'auto', maxWidth: '100%', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 150 + 112 * tabla.columnas.length, fontSize: 14 }}>
              <thead>
                <tr>
                  <th scope="col" style={{ ...celdaCabecera, position: 'sticky', left: 0, zIndex: 1, textAlign: 'left' }}>Cobertura</th>
                  {opciones.map((o) => (
                    <th key={o.id} scope="col" style={celdaCabecera}>
                      <span style={{ display: 'block', fontWeight: 600, overflowWrap: 'anywhere' }}>{o.compania}</span>
                      <span className="suave" style={{ display: 'block', fontSize: 12, fontWeight: 400 }}>{o.primaEur === null ? 'sin precio' : eur(o.primaEur)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tabla.filas.map((f, i) => (
                  <tr key={f.clave}>
                    <th scope="row" style={{ ...celda, position: 'sticky', left: 0, background: 'var(--surface)', textAlign: 'left', fontWeight: 500, overflowWrap: 'anywhere' }}>
                      {f.nombre}
                    </th>
                    {f.celdas.map((c, j) => {
                      const conTexto = c.estado === 'ver_texto' || c.texto !== null
                      const activa = abierta?.fila === i && abierta.col === j
                      return (
                        <td key={j} style={{ ...celda, textAlign: 'center' }}>
                          {conTexto ? (
                            <button
                              type="button"
                              className="boton-tenue"
                              aria-expanded={activa}
                              onClick={() => setAbierta(activa ? null : { fila: i, col: j })}
                              style={{ minHeight: 44, minWidth: 44, padding: '4px 8px', color: COLOR_CELDA[c.estado], fontWeight: 600 }}
                            >
                              {TEXTO_CELDA[c.estado]}
                            </button>
                          ) : (
                            <span style={{ color: COLOR_CELDA[c.estado], fontWeight: c.estado === 'no_consta' ? 400 : 600 }}>{TEXTO_CELDA[c.estado]}</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {abierta && celdaAbierta && (
            <div role="region" aria-live="polite" style={{ marginTop: 8, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
              <p style={{ margin: 0, fontSize: 14 }}>
                <strong>{opciones[abierta.col]?.compania} · {tabla.filas[abierta.fila]?.nombre}</strong>
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 14, overflowWrap: 'anywhere' }}>
                {celdaAbierta.texto ? `«${celdaAbierta.texto}»` : 'La compañía no dice si la incluye ni manda texto. Pídeme su condicionado.'}
              </p>
              <p className="suave" style={{ margin: '6px 0 0', fontSize: 12 }}>Texto literal que nos manda la compañía.</p>
            </div>
          )}
          <p className="suave presu-nota">
            «ver texto» = la compañía no dice sí ni no: toca para leer lo que manda. «no consta» = no aparece en su lista.
            Lo que manda es el condicionado de cada compañía, y te lo paso entero antes de contratar.
          </p>
        </>
      )}

      {opciones.length >= 2 && (
        comparar ? (
          <CompararIA presupuestoId={presupuestoId} opciones={opciones} tabla={tabla} corredor={corredor} telefono={telefono} onCerrar={() => setComparar(false)} />
        ) : (
          <button type="button" className="boton" style={{ minHeight: 44, marginTop: 14 }} onClick={() => setComparar(true)}>
            Comparar dos opciones con la IA
          </button>
        )
      )}
    </section>
  )
}

const celda: React.CSSProperties = { padding: '6px 8px', borderTop: '1px solid var(--border)', verticalAlign: 'middle' }
const celdaCabecera: React.CSSProperties = { ...celda, borderTop: 'none', background: 'var(--surface)', verticalAlign: 'bottom', textAlign: 'center' }
