'use client'
import { useState } from 'react'

type Resultado = {
  pagina: number
  empleado_nombre: string | null
  estado: 'ok' | 'no_encontrado' | 'error'
  error?: string
}

export default function DistribuirPdfPanel() {
  const [file, setFile] = useState<File | null>(null)
  const [periodo, setPeriodo] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [procesando, setProcesando] = useState(false)
  const [resultados, setResultados] = useState<Resultado[] | null>(null)
  const [msg, setMsg] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setProcesando(true); setMsg(''); setResultados(null)
    const fd = new FormData()
    fd.set('file', file)
    fd.set('periodo', periodo)
    const r = await fetch('/api/admin/nominas/distribuir-pdf', { method: 'POST', body: fd })
    const j = await r.json().catch(() => ({}))
    if (r.ok) {
      setResultados(j.resultados ?? [])
      setMsg(`✓ ${j.distribuidas} nóminas distribuidas de ${j.total} páginas`)
      setFile(null)
    } else {
      setMsg(j.error ?? 'Error al procesar')
    }
    setProcesando(false)
  }

  return (
    <section className="my-4 rounded-card border border-line bg-card p-4 max-w-lg">
      <h2 className="mb-1 text-base font-medium">Distribuir nóminas desde PDF</h2>
      <p className="text-ink-3 mb-3 text-xs">Sube el PDF mensual con todas las nóminas. La IA identifica a cada empleado y les asigna su nómina automáticamente.</p>
      <form onSubmit={enviar} className="grid gap-2.5">
        <div className="flex gap-2 items-center flex-wrap">
          <label className="text-ink-2 text-sm">Período</label>
          <input
            type="month"
            value={periodo}
            onChange={e => setPeriodo(e.target.value)}
            className="border border-line rounded px-2 py-1 text-sm"
            required
          />
        </div>
        <input
          type="file"
          accept="application/pdf"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          required
        />
        <button type="submit" disabled={procesando || !file}>
          {procesando ? '🤖 Procesando con IA…' : '🤖 Distribuir nóminas con IA'}
        </button>
      </form>

      {msg && (
        <p className={`mt-2 text-sm ${msg.startsWith('✓') ? 'text-ok' : 'text-alert'}`}>{msg}</p>
      )}

      {resultados && resultados.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <ul className="grid gap-1 text-xs">
            {resultados.map(r => (
              <li key={r.pagina} className="flex items-center gap-2">
                <span className="text-ink-3 w-14 shrink-0">Pág. {r.pagina}</span>
                {r.estado === 'ok' && (
                  <><span className="text-ok">✓</span><span>{r.empleado_nombre}</span></>
                )}
                {r.estado === 'no_encontrado' && (
                  <span className="text-ink-3">— No identificado</span>
                )}
                {r.estado === 'error' && (
                  <span className="text-alert">Error: {r.error}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
