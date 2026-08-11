'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

// 💬 Mini-chat "Pregunta a tus cuentas" embebido en /banca. Reutiliza TAL CUAL el agente contable
// (`POST /api/contable/chat` → `lib/contable/cerebro.ts::responder`), que ya conoce todas las cuentas,
// negocios y la posición fiscal. Aquí es una versión ligera de solo texto: si el agente propone una
// ACCIÓN (conciliar/clasificar), enlazamos al chat completo /contable para confirmarla. Bajo demanda.
type Turno = { rol: 'user' | 'bot'; texto: string; acciones?: number }
const SUGERENCIAS = [
  '¿Cuánto llevo gastado este mes?',
  '¿Cuánto ha cobrado la correduría este año?',
  '¿En qué tramo de IRPF estoy?',
]

export default function MiniChatContable({ periodoLabel }: { periodoLabel: string }) {
  const [abierto, setAbierto] = useState(false)
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const finRef = useRef<HTMLDivElement>(null)

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [turnos, cargando])

  async function enviar(mensaje: string) {
    const m = mensaje.trim()
    if (!m || cargando) return
    setTexto('')
    setTurnos(prev => [...prev, { rol: 'user', texto: m }])
    setCargando(true)
    try {
      const res = await fetch('/api/contable/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: m }),
      })
      const data = await res.json().catch(() => ({})) as { respuesta?: string; acciones?: unknown[] }
      setTurnos(prev => [...prev, { rol: 'bot', texto: data.respuesta || 'No he podido responder ahora mismo.', acciones: Array.isArray(data.acciones) ? data.acciones.length : 0 }])
    } catch {
      setTurnos(prev => [...prev, { rol: 'bot', texto: 'No se pudo consultar al agente. Inténtalo de nuevo.' }])
    } finally { setCargando(false) }
  }

  return (
    <section style={{ marginBottom: '32px' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <strong style={{ fontSize: '15px' }}>💬 Pregunta a tus cuentas</strong>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Tu agente contable, con el contexto de todos tus negocios · {periodoLabel}</div>
          </div>
          <button onClick={() => setAbierto(o => !o)}
            style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer', background: abierto ? 'var(--surface)' : 'var(--primary)', color: abierto ? 'var(--text)' : '#fff', fontSize: '13px', fontWeight: 600 }}>
            {abierto ? 'Cerrar' : '💬 Preguntar'}
          </button>
        </div>

        {abierto && (
          <div style={{ marginTop: '14px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            {turnos.length === 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                {SUGERENCIAS.map(s => (
                  <button key={s} onClick={() => enviar(s)}
                    style={{ padding: '6px 10px', borderRadius: '999px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '12px', cursor: 'pointer' }}>{s}</button>
                ))}
              </div>
            )}

            {turnos.length > 0 && (
              <div style={{ maxHeight: '340px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
                {turnos.map((t, i) => (
                  <div key={i} style={{ alignSelf: t.rol === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                    <div style={{
                      fontSize: '13px', lineHeight: 1.5, whiteSpace: 'pre-wrap', padding: '9px 12px', borderRadius: '10px',
                      background: t.rol === 'user' ? 'var(--primary)' : 'var(--primary-light)',
                      color: t.rol === 'user' ? '#fff' : 'var(--text)',
                    }}>{t.texto}</div>
                    {t.rol === 'bot' && !!t.acciones && t.acciones > 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                        💡 El agente propone {t.acciones} acción{t.acciones === 1 ? '' : 'es'}. <Link href="/contable" style={{ color: 'var(--primary)', fontWeight: 600 }}>Ábrelas en el chat completo →</Link>
                      </div>
                    )}
                  </div>
                ))}
                {cargando && <div style={{ alignSelf: 'flex-start', fontSize: '12px', color: 'var(--muted)' }}>Pensando…</div>}
                <div ref={finRef} />
              </div>
            )}

            <form onSubmit={e => { e.preventDefault(); enviar(texto) }} style={{ display: 'flex', gap: '8px' }}>
              <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Pregunta lo que quieras sobre tus cuentas…"
                style={{ flex: 1, minWidth: 0, padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px' }} />
              <button type="submit" disabled={cargando || !texto.trim()}
                style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', cursor: cargando || !texto.trim() ? 'default' : 'pointer', background: 'var(--primary)', color: '#fff', fontSize: '13px', fontWeight: 600, opacity: cargando || !texto.trim() ? 0.6 : 1 }}>
                Enviar
              </button>
            </form>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px' }}>
              Para adjuntar facturas/tickets o confirmar acciones, usa el <Link href="/contable" style={{ color: 'var(--primary)', fontWeight: 600 }}>chat completo →</Link>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
