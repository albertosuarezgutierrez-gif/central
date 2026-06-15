'use client'
import { useEffect, useRef, useState } from 'react'

type Mensaje = { id: string; remitente: 'gestor' | 'titular'; texto: string; creada_at: string }

/** Panel de chat reutilizable (gestor y empleado). `endpoint` GET/POST devuelve {mensajes}. `yo` = lado actual. */
export default function ChatPanel({ endpoint, yo }: { endpoint: string; yo: 'gestor' | 'titular' }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [texto, setTexto] = useState('')
  const finRef = useRef<HTMLDivElement>(null)

  async function cargar() {
    const r = await fetch(endpoint); if (r.ok) setMensajes((await r.json()).mensajes)
  }
  useEffect(() => { cargar(); const t = setInterval(cargar, 5000); return () => clearInterval(t) }, [endpoint])
  useEffect(() => { finRef.current?.scrollIntoView() }, [mensajes.length])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const t = texto.trim(); if (!t) return
    setTexto('')
    await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto: t }) })
    await cargar()
  }

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, margin: '12px 0' }}>
      <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>💬 Chat</h2>
      <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {mensajes.map(m => {
          const mio = m.remitente === yo
          return (
            <div key={m.id} style={{ alignSelf: mio ? 'flex-end' : 'flex-start', background: mio ? '#dcf8c6' : '#f1f1f1',
              borderRadius: 8, padding: '6px 10px', maxWidth: '80%' }}>
              {m.texto}
            </div>
          )
        })}
        {mensajes.length === 0 && <p style={{ color: '#aaa' }}>Sin mensajes todavía</p>}
        <div ref={finRef} />
      </div>
      <form onSubmit={enviar} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribe un mensaje…" style={{ flex: 1 }} />
        <button type="submit">Enviar</button>
      </form>
    </section>
  )
}
