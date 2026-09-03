'use client'
import { useState, useCallback, useEffect } from 'react'

// «Pregúntale» de una fila de /operador/agentes.
//
// No es un chat CON el agente —no hay nadie al otro lado: son crons y sesiones efímeras— sino
// sobre su expediente (ficha + semáforo + huella de sus pasadas + veredicto del vigía), que es lo
// que uno pregunta de verdad: «¿cuándo pasó?», «¿por qué está en rojo?», «¿por qué no me avisó?».
// El contexto lo monta el servidor en /api/operador/agente-consulta.

const SUGERENCIAS = [
  '¿Cuándo pasó por última vez y qué dejó dicho?',
  '¿Por qué está en ese color?',
  'Si fallara, ¿cómo me enteraría?',
]

type Turno = { rol: 'tu' | 'ia'; texto: string; error?: boolean }

export default function PreguntarAgente({ id, nombre }: { id: string; nombre: string }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [cargando, setCargando] = useState(false)

  // Escape cierra: el modal tapa la tabla entera en móvil y quedarse encerrado es lo más molesto.
  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [abierto])

  const enviar = useCallback(async (pregunta: string) => {
    const q = pregunta.trim()
    if (!q || cargando) return
    setTexto('')
    setTurnos(t => [...t, { rol: 'tu', texto: q }])
    setCargando(true)
    try {
      const r = await fetch('/api/operador/agente-consulta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agente: id, mensaje: q }),
      })
      const j = await r.json().catch(() => ({}))
      // Un fallo se enseña COMO fallo: una respuesta vacía se leería como «no hay nada que contar».
      if (!r.ok || typeof j?.respuesta !== 'string') {
        setTurnos(t => [...t, { rol: 'ia', texto: j?.error || `No se pudo consultar (HTTP ${r.status}).`, error: true }])
      } else {
        setTurnos(t => [...t, { rol: 'ia', texto: j.respuesta }])
      }
    } catch (e: any) {
      setTurnos(t => [...t, { rol: 'ia', texto: 'No se pudo consultar: ' + String(e?.message || e).slice(0, 140), error: true }])
    } finally {
      setCargando(false)
    }
  }, [id, cargando])

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        title={`Preguntar sobre ${nombre}`}
        style={{
          border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
          borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          minHeight: 32, whiteSpace: 'nowrap',
        }}
      >💬 preguntar</button>
    )
  }

  return (
    <>
      <button onClick={() => setAbierto(false)} style={{
        border: '1px solid var(--border)', background: 'var(--primary)', color: '#fff',
        borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        minHeight: 32, whiteSpace: 'nowrap',
      }}>💬 cerrar</button>

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Consulta sobre ${nombre}`}
        onClick={e => { if (e.target === e.currentTarget) setAbierto(false) }}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
        }}
      >
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
          width: '95vw', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <header style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{nombre}</div>
              <div style={{ color: 'var(--muted)', fontSize: 11 }}>
                Respondo leyendo su expediente. No soy el agente: no puedo lanzarlo ni pararlo.
              </div>
            </div>
            <button onClick={() => setAbierto(false)} aria-label="Cerrar" style={{
              marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--muted)',
              fontSize: 20, cursor: 'pointer', lineHeight: 1, minWidth: 44, minHeight: 44,
            }}>×</button>
          </header>

          <div style={{ padding: 14, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {turnos.length === 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {SUGERENCIAS.map(s => (
                  <button key={s} onClick={() => enviar(s)} style={{
                    border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)',
                    borderRadius: 999, padding: '8px 12px', fontSize: 12, cursor: 'pointer', minHeight: 36,
                    textAlign: 'left',
                  }}>{s}</button>
                ))}
              </div>
            )}
            {turnos.map((t, i) => (
              <div key={i} style={{
                alignSelf: t.rol === 'tu' ? 'flex-end' : 'flex-start',
                maxWidth: '90%', borderRadius: 12, padding: '8px 12px', fontSize: 13,
                whiteSpace: 'pre-wrap', lineHeight: 1.45,
                background: t.rol === 'tu' ? 'var(--primary-light)' : t.error ? 'var(--warning-bg)' : 'var(--surface)',
                color: t.error ? 'var(--warning)' : 'var(--text)',
                border: '1px solid var(--border)',
              }}>{t.texto}</div>
            ))}
            {cargando && <div style={{ color: 'var(--muted)', fontSize: 12 }}>Leyendo su expediente…</div>}
          </div>

          <form
            onSubmit={e => { e.preventDefault(); enviar(texto) }}
            style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border)' }}
          >
            <input
              value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder="Pregunta lo que quieras de este agente…"
              autoFocus
              style={{
                flex: 1, minWidth: 0, border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text)', borderRadius: 10, padding: '10px 12px', fontSize: 14, minHeight: 44,
              }}
            />
            <button type="submit" disabled={cargando || !texto.trim()} style={{
              border: 'none', background: 'var(--primary)', color: '#fff', borderRadius: 10,
              padding: '0 16px', fontSize: 14, fontWeight: 600, minHeight: 44,
              cursor: cargando || !texto.trim() ? 'default' : 'pointer',
              opacity: cargando || !texto.trim() ? 0.5 : 1,
            }}>Enviar</button>
          </form>
        </div>
      </div>
    </>
  )
}
