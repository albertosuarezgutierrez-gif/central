'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Badge, TablaScroll, btnStyle, cardStyle } from '@/components/ui'
import {
  interpretarEstadisticas,
  textoDuracion,
  textoPorcentaje,
  type FilaBot,
  type LecturaEstadisticas,
  type VentanaBot,
} from '@/lib/tarificador-estadisticas-asegura'

type Dias = 7 | 30
/** Filas que se pintan de golpe (regla de rendimiento): el resto, con «Ver más». */
const PASO = 50

const aviso: React.CSSProperties = {
  margin: 0, padding: 12, borderRadius: 10, border: '1px solid var(--warning)', color: 'var(--warning)', background: 'var(--warning-bg)', overflowWrap: 'anywhere',
}
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, verticalAlign: 'top' }

const tonoOk = (p: number | null) => (p === null ? 'neutral' : p >= 80 ? 'positivo' : p >= 50 ? 'aviso' : 'negativo')

function Chips({ v }: { v: VentanaBot }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      <Badge tono="neutral" title="Atascados esperando que elijas un elemento">{v.atascado} atascados</Badge>
      <Badge tono="neutral" title="Piden una persona (captcha, código…)">{v.requiereHumano} piden persona</Badge>
      <Badge tono="neutral" title="Fallo definitivo del bot">{v.errorDefinitivo} con error</Badge>
    </div>
  )
}

function Atascos({ v }: { v: VentanaBot }) {
  if (!v.topAtascos.length) return <span style={{ color: 'var(--muted)' }}>ninguno</span>
  return (
    <ul style={{ margin: 0, paddingLeft: 16 }}>
      {v.topAtascos.map((a) => <li key={a.clave} style={{ overflowWrap: 'anywhere' }}>{a.clave} ({a.n})</li>)}
    </ul>
  )
}

export default function EstadoBots() {
  const [lectura, setLectura] = useState<LecturaEstadisticas | null>(null)
  const [dias, setDias] = useState<Dias>(7)
  const [cargando, setCargando] = useState(false)
  const [visibles, setVisibles] = useState(PASO)
  const [fallo, setFallo] = useState<string | null>(null)

  // Recarga SIN vaciar la tabla anterior: si falla, se queda y el aviso se pinta encima.
  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await fetch('/api/correduria/tarificador/estadisticas', { cache: 'no-store' })
      const l = interpretarEstadisticas(res.status, await res.json().catch(() => null))
      setLectura((previa) => (l.estado === 'ok' || !previa || previa.estado !== 'ok' ? l : previa))
      if (l.estado !== 'ok') setFallo(l.estado === 'error' ? l.causa : 'sin_configurar')
      else setFallo(null)
    } catch {
      setFallo('red')
      setLectura((previa) => previa ?? { estado: 'error', causa: 'red' })
    } finally {
      setCargando(false)
    }
  }, [])
  useEffect(() => { void cargar() }, [cargar])

  const filas: FilaBot[] = lectura?.estado === 'ok' ? lectura.filas : []
  const ventana = (f: FilaBot) => (dias === 7 ? f.d7 : f.d30)

  return (
    <section style={{ ...cardStyle, display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div role="group" aria-label="Periodo" style={{ display: 'flex', gap: 8 }}>
          {([7, 30] as const).map((d) => (
            <button key={d} type="button" aria-pressed={dias === d} onClick={() => setDias(d)}
              style={{ ...btnStyle, minHeight: 44, fontWeight: dias === d ? 700 : 400, borderColor: dias === d ? 'var(--primary)' : undefined }}>
              Últimos {d} días
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void cargar()} disabled={cargando} style={{ ...btnStyle, minHeight: 44, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <RefreshCw size={14} strokeWidth={1.75} /> {cargando ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>

      {fallo === 'sin_configurar' && <p style={aviso}>Falta configurar el puerto de asegura (ASEGURA_OPERADOR_SECRET) en plataforma.</p>}
      {fallo && fallo !== 'sin_configurar' && <p style={aviso}>No se ha podido leer ({fallo}).{filas.length ? ' Se muestra la última lectura buena.' : ''}</p>}
      {lectura?.estado === 'ok' && lectura.atascosDisponibles === false && (
        <p style={aviso}>Asegura aún no tiene aplicado el SQL de bots atascados (2026-10-14e): el top de atascos aparece vacío por eso, no porque no los haya.</p>
      )}
      {lectura?.estado === 'ok' && lectura.ilegibles > 0 && <p style={aviso}>Hay {lectura.ilegibles} fila(s) que no se han podido leer.</p>}
      {!lectura && <p style={{ margin: 0, color: 'var(--muted)' }}>Cargando…</p>}
      {lectura?.estado === 'ok' && filas.length === 0 && <p style={{ margin: 0, color: 'var(--muted)' }}>Ningún trabajo del bot en los últimos 30 días.</p>}

      {filas.length > 0 && (
        <TablaScroll>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={th}>Compañía · ramo</th><th style={th}>Versión</th><th style={th}>Trabajos</th><th style={th}>Con precio</th>
                <th style={th}>Atascados / fallos</th><th style={th}>Tiempo hasta precio</th><th style={th}>Dónde se atasca (top 5)</th>
              </tr>
            </thead>
            <tbody>
              {filas.slice(0, visibles).map((f) => {
                const v = ventana(f)
                return (
                  <tr key={`${f.compania}|${f.ramo}|${f.botVersion ?? ''}`} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}><strong>{f.compania}</strong> · {f.ramo}</td>
                    <td style={td}>{f.botVersion ?? <span style={{ color: 'var(--muted)' }}>sin versión</span>}</td>
                    {v ? (
                      <Fragment>
                        <td style={td}>{v.total.toLocaleString('es-ES')}</td>
                        <td style={td}><Badge tono={tonoOk(v.pctOk)}>{textoPorcentaje(v.pctOk)}</Badge></td>
                        <td style={td}>
                          <div style={{ marginBottom: 4 }}>{textoPorcentaje(v.pctProblema)}</div>
                          <Chips v={v} />
                        </td>
                        <td style={td}>{textoDuracion(v.tiempoMedioSeg)}</td>
                        <td style={td}><Atascos v={v} /></td>
                      </Fragment>
                    ) : (
                      <td style={{ ...td, color: 'var(--muted)' }} colSpan={5}>Sin trabajos en estos {dias} días</td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TablaScroll>
      )}
      {filas.length > visibles && (
        <button type="button" onClick={() => setVisibles((n) => n + PASO)} style={{ ...btnStyle, minHeight: 44 }}>Ver más ({filas.length - visibles})</button>
      )}
    </section>
  )
}
