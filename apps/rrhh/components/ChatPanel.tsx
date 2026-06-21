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
    <section className="my-3 rounded-card border border-line bg-card p-4">
      <h2 className="mb-2 text-base">Chat</h2>
      <div className="flex max-h-[260px] flex-col gap-1.5 overflow-y-auto">
        {mensajes.map(m => {
          const mio = m.remitente === yo
          return (
            <div
              key={m.id}
              className={`max-w-[80%] rounded-[13px] px-3 py-1.5 text-sm ${
                mio ? 'self-end rounded-br-[4px] bg-accent text-white' : 'self-start rounded-bl-[4px] bg-paper-2 text-ink'
              }`}
            >
              {m.texto}
            </div>
          )
        })}
        {mensajes.length === 0 && <p className="text-ink-3">Sin mensajes todavía</p>}
        <div ref={finRef} />
      </div>
      <form onSubmit={enviar} className="mt-2 flex gap-2">
        <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribe un mensaje…" className="flex-1" />
        <button type="submit">Enviar</button>
      </form>
    </section>
  )
}
