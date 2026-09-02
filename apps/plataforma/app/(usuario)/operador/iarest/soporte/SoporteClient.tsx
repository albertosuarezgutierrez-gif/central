'use client'
import { useEffect, useState, useCallback } from 'react'
import { Pagina } from '@/components/ui'

type Ticket = {
  id: string
  asunto: string
  estado: 'abierto' | 'escalado' | 'resuelto'
  resuelto_por: string | null
  created_at: string
  updated_at: string
  local_id: string
  restaurantes: { nombre: string } | null
}

const ESTADOS = ['', 'abierto', 'escalado', 'resuelto'] as const
type EstadoFiltro = typeof ESTADOS[number]

const estadoColor: Record<string, string> = {
  abierto: 'var(--info)',
  escalado: 'var(--negative)',
  resuelto: 'var(--positive)',
}

function fecha(s: string) {
  return new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function SoporteClient() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState<EstadoFiltro>('')
  const [selected, setSelected] = useState<Ticket | null>(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const cargar = useCallback(() => {
    setLoading(true); setError('')
    const qs = filtro ? `?estado=${filtro}` : ''
    fetch(`/api/admin/iarest/soporte${qs}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => setTickets(d.tickets ?? []))
      .catch(e => setError(`Error (${e})`))
      .finally(() => setLoading(false))
  }, [filtro])

  useEffect(() => { cargar() }, [cargar])

  async function cambiarEstado(ticket: Ticket, estado: string) {
    setBusy(true)
    const r = await fetch('/api/admin/iarest/soporte', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: ticket.id, estado }),
    })
    if (r.ok) {
      setTickets(ts => ts.map(t => t.id === ticket.id ? { ...t, estado: estado as Ticket['estado'] } : t))
      if (selected?.id === ticket.id) setSelected(s => s ? { ...s, estado: estado as Ticket['estado'] } : s)
    }
    setBusy(false)
  }

  async function enviarRespuesta(ticket: Ticket) {
    if (!reply.trim()) return
    setBusy(true); setMsg('')
    const r = await fetch('/api/admin/iarest/soporte', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: ticket.id, texto: reply.trim() }),
    })
    if (r.ok) { setReply(''); setMsg('Respuesta enviada.') }
    else { const e = await r.json().catch(() => ({})); setMsg(e.error || 'Error al enviar.') }
    setBusy(false)
  }

  return (
    <Pagina ancho="lectura">
      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '20px' }}>🎫 Soporte · ia-rest</h1>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {ESTADOS.map(e => (
          <button
            key={e}
            onClick={() => { setFiltro(e); setSelected(null) }}
            style={{
              padding: '5px 14px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer',
              border: '1px solid var(--border)',
              background: filtro === e ? 'var(--primary)' : 'var(--surface)',
              color: filtro === e ? '#fff' : 'var(--text)',
              fontWeight: filtro === e ? 700 : 400,
            }}
          >
            {e || 'Todos'}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: 'var(--muted)' }}>Cargando…</p>}
      {error && <p style={{ color: '#e53' }}>{error}</p>}

      <div className="soporte-layout" style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 360px' : '1fr', gap: '16px' }}>
        <div>
          {tickets.length === 0 && !loading && (
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '48px' }}>Sin tickets.</p>
          )}
          {tickets.map(t => (
            <div
              key={t.id}
              onClick={() => { setSelected(t); setReply(''); setMsg('') }}
              style={{
                background: 'var(--surface)', border: `1px solid ${selected?.id === t.id ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: '8px',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '2px' }}>{t.asunto}</div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    {t.restaurantes?.nombre || t.local_id} · {fecha(t.updated_at)}
                  </div>
                </div>
                <span style={{
                  fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px',
                  background: (estadoColor[t.estado] || '#888') + '20',
                  color: estadoColor[t.estado] || '#888',
                  whiteSpace: 'nowrap',
                }}>
                  {t.estado}
                </span>
              </div>
            </div>
          ))}
        </div>

        {selected && (
          <div className="soporte-panel" style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '20px', alignSelf: 'start',
          }}>
            <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>{selected.asunto}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px' }}>
              {selected.restaurantes?.nombre || selected.local_id} · {fecha(selected.created_at)}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--muted)' }}>CAMBIAR ESTADO</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {['abierto', 'escalado', 'resuelto'].map(e => (
                  <button
                    key={e}
                    disabled={busy || selected.estado === e}
                    onClick={() => cambiarEstado(selected, e)}
                    style={{
                      padding: '4px 10px', borderRadius: '12px', fontSize: '12px', cursor: 'pointer',
                      border: `1px solid ${estadoColor[e] || 'var(--border)'}`,
                      background: selected.estado === e ? (estadoColor[e] + '20') : 'transparent',
                      color: estadoColor[e] || 'var(--text)',
                      fontWeight: selected.estado === e ? 700 : 400,
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--muted)' }}>RESPONDER</div>
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                placeholder="Escribe tu respuesta…"
                rows={4}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px', fontSize: '13px',
                  border: '1px solid var(--border)', borderRadius: '6px',
                  background: 'transparent', color: 'var(--text)', resize: 'vertical',
                }}
              />
              {msg && <div style={{ fontSize: '12px', color: msg.includes('Error') ? '#e53' : 'var(--primary)', marginTop: '4px' }}>{msg}</div>}
              <button
                disabled={busy || !reply.trim()}
                onClick={() => enviarRespuesta(selected)}
                style={{
                  marginTop: '8px', padding: '8px 16px', borderRadius: '6px', fontSize: '13px',
                  background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer',
                  opacity: busy || !reply.trim() ? 0.5 : 1,
                }}
              >
                Enviar respuesta
              </button>
            </div>
          </div>
        )}
      </div>
    </Pagina>
  )
}
