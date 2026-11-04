'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Badge, Stat, TablaScroll, btnStyle, cardStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import {
  ETIQUETA_CANAL,
  ETIQUETA_ESTADO_BOT,
  ETIQUETA_TIPO_ERROR,
  interpretarEstado,
  nombreClave,
  textoMes,
  textoPct,
  textoPrima,
  type FilaEstado,
  type LecturaEstado,
  type Ventana,
} from '@/lib/tarificador-estado-asegura'

/** Filas que se pintan de golpe (regla de rendimiento): el resto, con «Ver más». */
const PASO = 50

const aviso: React.CSSProperties = {
  margin: 0, padding: 12, borderRadius: 10, border: '1px solid var(--warning)', color: 'var(--warning)', background: 'var(--warning-bg)', overflowWrap: 'anywhere',
}
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, verticalAlign: 'top' }
const tenue: React.CSSProperties = { color: 'var(--muted)', fontSize: 12 }

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' })

function CeldaVentana({ v }: { v: Ventana | null }) {
  if (!v) return <span style={tenue}>sin datos</span>
  if (v.ok + v.error === 0) return <span style={tenue}>sin trabajos</span>
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <span style={{ color: 'var(--positive)', fontWeight: 600 }}>{v.ok} ok</span>
      {' · '}
      <span style={{ color: v.error > 0 ? 'var(--negative)' : 'var(--muted)', fontWeight: v.error > 0 ? 600 : 400 }}>{v.error} error</span>
    </span>
  )
}

function CeldaPrecio({ f }: { f: FilaEstado }) {
  const p = f.ultimoPrecio
  if (!p) return <span style={tenue}>nunca</span>
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      <strong>{textoPrima(p.primaEur)}</strong>
      <span style={tenue}>{fechaCorta(p.fecha)} · {ETIQUETA_CANAL[p.canal]}</span>
    </div>
  )
}

function CeldaError({ f }: { f: FilaEstado }) {
  const e = f.ultimoError
  if (!e) return <span style={tenue}>ninguno</span>
  const donde = e.origen ? `${e.origen.replace(/^https?:\/\//, '')}${e.ruta ?? ''}` : null
  return (
    <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
      <span><strong>{ETIQUETA_TIPO_ERROR[e.tipo]}</strong>{e.clave && <span style={tenue}> · {e.clave}</span>}</span>
      {donde && <code style={{ fontSize: 11, overflowWrap: 'anywhere', color: 'var(--muted)' }}>{donde}</code>}
      <span style={tenue}>{fechaCorta(e.fecha)}{e.modo && e.modo !== 'tarificar' ? ` · ${e.modo}` : ''}</span>
    </div>
  )
}

export default function EstadoTarificador() {
  const [lectura, setLectura] = useState<LecturaEstado | null>(null)
  const [cargando, setCargando] = useState(false)
  const [visibles, setVisibles] = useState(PASO)
  const [fallo, setFallo] = useState<string | null>(null)

  // Recarga SIN vaciar la tabla anterior: si falla, se queda y el aviso se pinta encima.
  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await fetch('/api/correduria/tarificador/estado', { cache: 'no-store' })
      const l = interpretarEstado(res.status, await res.json().catch(() => null))
      setLectura((previa) => (l.estado === 'ok' || !previa || previa.estado !== 'ok' ? l : previa))
      setFallo(l.estado === 'ok' ? null : l.estado === 'error' ? l.causa : 'sin_configurar')
    } catch {
      setFallo('red')
      setLectura((previa) => previa ?? { estado: 'error', causa: 'red' })
    } finally {
      setCargando(false)
    }
  }, [])
  useEffect(() => { void cargar() }, [cargar])

  const ok = lectura?.estado === 'ok' ? lectura : null
  const filas = ok?.filas ?? []
  const i = ok?.indicadores

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => void cargar()} disabled={cargando} style={{ ...btnStyle, minHeight: 44, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <RefreshCw size={14} strokeWidth={1.75} /> {cargando ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>

      {fallo === 'sin_configurar' && <p style={aviso}>Falta configurar el puerto de asegura (ASEGURA_OPERADOR_SECRET) en plataforma.</p>}
      {fallo && fallo !== 'sin_configurar' && <p style={aviso}>No se ha podido leer ({fallo}).{filas.length ? ' Se muestra la última lectura buena.' : ''}</p>}
      {!lectura && <p style={{ margin: 0, color: 'var(--muted)' }}>Cargando…</p>}

      {ok && i && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))' }}>
          <Stat label="Bots activos" value={i.bots.activo}
            sub={`${i.bots.pilotaje} en pilotaje · ${i.bots.exploracion} en exploración`} />
          <Stat label="Con precio (7 días)" value={i.okBot7d} color="var(--positive)"
            sub={`${textoPct(i.pctOk7d)} de los trabajos del bot`} />
          <Stat label="Con error (7 días)" value={i.errorBot7d} color={i.errorBot7d > 0 ? 'var(--negative)' : undefined}
            sub="atascados, piden persona o fallo definitivo" />
          <Stat label="Gasto Avant2 del mes" value={ok.avant2 ? eur(ok.avant2.totalEur) : '—'}
            sub={ok.avant2 ? `${ok.avant2.facturables} cotizaciones · ${textoMes(ok.avant2.mes)}` : 'no se ha podido leer el consumo'} />
        </div>
      )}

      {ok && ok.avant2 && ok.avant2.porRamo.length > 0 && (
        <section style={{ ...cardStyle, display: 'grid', gap: 8 }}>
          <strong style={{ fontSize: 14 }}>Avant2 este mes, por ramo</strong>
          <span style={tenue}>Cada cotización de Avant2 pide precio a todas las compañías a la vez: su coste es del ramo, no de una compañía.</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ok.avant2.porRamo.map((r) => (
              <Badge key={r.ramo} tono="neutral">{nombreClave(r.ramo)}: {eur(r.eur)} ({r.n})</Badge>
            ))}
          </div>
        </section>
      )}

      {ok && ok.fuentesAusentes.length > 0 && (
        <p style={aviso}>Falta en la BD de asegura: {ok.fuentesAusentes.join(', ')}. Lo que depende de ahí no se muestra; no es que esté a cero.</p>
      )}
      {ok && ok.ilegibles > 0 && <p style={aviso}>Hay {ok.ilegibles} fila(s) que no se han podido leer.</p>}
      {ok && filas.length === 0 && <p style={{ margin: 0, color: 'var(--muted)' }}>Todavía no hay ningún precio ni ningún bot.</p>}

      {filas.length > 0 && (
        <section style={{ ...cardStyle, display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <TablaScroll>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={th}>Compañía · ramo</th><th style={th}>Bot</th><th style={th}>Último precio</th>
                  <th style={th}>7 días</th><th style={th}>30 días</th><th style={th}>Último error</th>
                </tr>
              </thead>
              <tbody>
                {filas.slice(0, visibles).map((f) => {
                  const e = ETIQUETA_ESTADO_BOT[f.estadoBot]
                  return (
                    <tr key={`${f.compania}|${f.ramo}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={td}><strong>{nombreClave(f.compania)}</strong> · {nombreClave(f.ramo)}</td>
                      <td style={td}><Badge tono={e.tono} title={e.ayuda}>{e.texto}</Badge></td>
                      <td style={td}><CeldaPrecio f={f} /></td>
                      <td style={td}><CeldaVentana v={f.d7} /></td>
                      <td style={td}><CeldaVentana v={f.d30} /></td>
                      <td style={{ ...td, maxWidth: 280 }}><CeldaError f={f} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TablaScroll>
          {filas.length > visibles && (
            <button type="button" onClick={() => setVisibles((v) => v + PASO)} style={{ ...btnStyle, minHeight: 44, justifySelf: 'start' }}>
              Ver más ({filas.length - visibles})
            </button>
          )}
          <span style={tenue}>
            «ok / error» cuenta solo trabajos del bot de tarificar (sin la prueba de humo nocturna). El error enseña solo el tipo y la página
            donde pasó, nunca los datos del cliente.
          </span>
        </section>
      )}
    </div>
  )
}
