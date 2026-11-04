'use client'
// Nota de la OT con DICTADO por voz: usa la Web Speech API del navegador (sin servicio externo). El dictado solo RELLENA el cuadro;
// la nota no se guarda hasta que la persona la revisa y pulsa «Guardar nota».
import { useRef, useState, useTransition } from 'react'
import { anadirNotaAccion } from '../acciones'

type Reconocedor = {
  lang: string; interimResults: boolean; continuous: boolean
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null; onerror: (() => void) | null
  start(): void; stop(): void
}
type ConstructorReconocedor = new () => Reconocedor

function constructorVoz(): ConstructorReconocedor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: ConstructorReconocedor; webkitSpeechRecognition?: ConstructorReconocedor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function NotaDictado({ otId }: { otId: string }) {
  const [texto, setTexto] = useState('')
  const [oyendo, setOyendo] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [pend, iniciar] = useTransition()
  const rec = useRef<Reconocedor | null>(null)
  // Se decide en el cliente: sin soporte (p. ej. Firefox) el botón no aparece y se escribe a mano.
  const [soportado] = useState(() => constructorVoz() !== null)

  function alternar() {
    if (oyendo) { rec.current?.stop(); return }
    const C = constructorVoz()
    if (!C) return
    const r = new C()
    r.lang = 'es-ES'; r.interimResults = false; r.continuous = true
    r.onresult = (e) => {
      let nuevo = ''
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) nuevo += e.results[i][0].transcript
      if (nuevo) setTexto((t) => (t ? `${t.trimEnd()} ${nuevo.trim()}` : nuevo.trim()))
    }
    r.onend = () => setOyendo(false)
    r.onerror = () => { setOyendo(false); setMsg({ ok: false, t: 'No se pudo usar el micrófono. Escribe la nota a mano.' }) }
    rec.current = r
    setMsg(null); setOyendo(true)
    r.start()
  }

  function guardar() {
    rec.current?.stop()
    iniciar(async () => {
      const r = await anadirNotaAccion(otId, texto)
      if (r.ok) { setTexto(''); setMsg({ ok: true, t: 'Nota guardada' }); location.reload() } else setMsg({ ok: false, t: r.errores.join(' · ') })
    })
  }

  return (
    <div className="ficha">
      <label className="campo">Nota{soportado ? ' (puedes dictarla; revísala antes de guardar)' : ''}
        <textarea value={texto} maxLength={2000} onChange={(e) => setTexto(e.target.value)} />
      </label>
      <div className="fila">
        {soportado && (
          <button type="button" className={oyendo ? 'btn' : 'btn btn-sec'} aria-pressed={oyendo} onClick={alternar}>
            {oyendo ? 'Parar dictado' : 'Dictar con la voz'}
          </button>
        )}
        <button type="button" className="btn" disabled={pend || !texto.trim()} onClick={guardar}>Guardar nota</button>
      </div>
      {msg && <p className={msg.ok ? 'ok' : 'aviso-error'} role="status">{msg.t}</p>}
    </div>
  )
}
