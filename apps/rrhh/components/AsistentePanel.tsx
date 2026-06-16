'use client'
import { useEffect, useRef, useState } from 'react'

type Msg = { role: 'user' | 'assistant'; content: string }

const BIENVENIDA = '¡Hola! Soy tu asistente. Pregúntame sobre tus nóminas, documentos y vacaciones. Puedes escribirme en tu idioma.'
const EJEMPLOS = [
  '¿Tengo algún documento por firmar?',
  '¿Cuál es mi última nómina?',
  '¿Qué solicitudes tengo y en qué estado están?',
]

/** Asistente IA del empleado: chat que responde con sus propios datos (solo lectura). */
export default function AsistentePanel() {
  const [mensajes, setMensajes] = useState<Msg[]>([])
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const finRef = useRef<HTMLDivElement>(null)

  useEffect(() => { finRef.current?.scrollIntoView() }, [mensajes.length, cargando])

  async function preguntar(pregunta: string) {
    const t = pregunta.trim()
    if (!t || cargando) return
    setTexto('')
    const hilo: Msg[] = [...mensajes, { role: 'user', content: t }]
    setMensajes(hilo)
    setCargando(true)
    try {
      const r = await fetch('/api/e/asistente', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: hilo }),
      })
      const j = await r.json().catch(() => ({}))
      const respuesta = r.ok && j.respuesta ? j.respuesta : (j.error ?? 'No he podido responder ahora mismo.')
      setMensajes(m => [...m, { role: 'assistant', content: respuesta }])
    } catch {
      setMensajes(m => [...m, { role: 'assistant', content: 'No he podido responder ahora mismo. Inténtalo de nuevo.' }])
    } finally {
      setCargando(false)
    }
  }

  return (
    <section className="my-3 rounded-card border border-line bg-card p-4">
      <h2 className="text-base">🤖 Asistente</h2>
      <p className="mb-2 text-ink-3 text-sm">Pregúntame sobre tus nóminas, documentos y vacaciones</p>

      <div className="flex max-h-[300px] flex-col gap-1.5 overflow-y-auto">
        {mensajes.length === 0 && <div className="max-w-[80%] self-start rounded-[13px] rounded-bl-[4px] bg-paper-2 px-3 py-1.5 text-sm text-ink">{BIENVENIDA}</div>}
        {mensajes.map((m, i) => (
          <div
            key={i}
            className={`max-w-[80%] whitespace-pre-wrap rounded-[13px] px-3 py-1.5 text-sm ${
              m.role === 'user' ? 'self-end rounded-br-[4px] bg-accent text-white' : 'self-start rounded-bl-[4px] bg-paper-2 text-ink'
            }`}
          >
            {m.content}
          </div>
        ))}
        {cargando && <div className="max-w-[80%] self-start rounded-[13px] rounded-bl-[4px] bg-paper-2 px-3 py-1.5 text-sm text-ink-3">escribiendo…</div>}
        <div ref={finRef} />
      </div>

      {mensajes.length === 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EJEMPLOS.map(ej => (
            <button key={ej} type="button" onClick={() => preguntar(ej)}
              className="rounded-full bg-paper-2 px-3 py-1 text-xs text-ink-2 hover:bg-line">
              {ej}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={e => { e.preventDefault(); preguntar(texto) }} className="mt-2 flex gap-2">
        <input value={texto} onChange={e => setTexto(e.target.value)} disabled={cargando}
          placeholder="Escribe tu pregunta…" className="flex-1" />
        <button type="submit" disabled={cargando || !texto.trim()}>Enviar</button>
      </form>
    </section>
  )
}
