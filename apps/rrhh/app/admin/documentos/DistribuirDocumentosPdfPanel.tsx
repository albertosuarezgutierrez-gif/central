'use client'
import { useState } from 'react'
import Card from '@/components/ui/Card'
import { carpetaAdmiteFirma } from '@/lib/envio-staging'

type Opcion = { id: string; etiqueta: string }
type Doc = {
  desde: number; hasta: number
  estado: 'ok' | 'ya_enviado' | 'no_identificado' | 'error'
  empleado_nombre: string | null; error?: string
  aviso?: { email_estado: string } | null
}
type Respuesta = { paginas: number; documentos: Doc[]; ok: number; ya_enviados: number; no_identificados: number; errores: number }

const pag = (d: Doc) => d.desde === d.hasta ? `Pág. ${d.desde}` : `Págs. ${d.desde}-${d.hasta}`

export default function DistribuirDocumentosPdfPanel({ carpetas }: { carpetas: Opcion[] }) {
  const [file, setFile] = useState<File | null>(null)
  const [carpeta, setCarpeta] = useState('')
  const [titulo, setTitulo] = useState('')
  const [firma, setFirma] = useState(false)
  const [avisar, setAvisar] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [res, setRes] = useState<Respuesta | null>(null)
  const [msg, setMsg] = useState('')

  const admiteFirma = !carpeta || carpetaAdmiteFirma(carpeta)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !carpeta || procesando) return
    setProcesando(true); setMsg(''); setRes(null)
    try {
      const fd = new FormData()
      fd.set('file', file); fd.set('carpeta', carpeta); fd.set('titulo', titulo)
      fd.set('requiere_firma', firma && admiteFirma ? '1' : '0'); fd.set('avisar', avisar ? '1' : '0')
      const r = await fetch('/api/admin/documentos/distribuir-pdf', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (r.ok) {
        setRes(j as Respuesta)
        setMsg(`✓ ${j.ok} documentos entregados${j.ya_enviados ? `, ${j.ya_enviados} ya estaban` : ''}${j.no_identificados ? `, ${j.no_identificados} sin identificar` : ''}${j.errores ? `, ${j.errores} con error` : ''} (${j.paginas} páginas)`)
        setFile(null)
      } else {
        setMsg(r.status === 413 ? 'Archivo demasiado grande (máx. ~4 MB)' : (j.error ?? 'Error al procesar'))
      }
    } catch {
      setMsg('Error de red')
    }
    setProcesando(false)
  }

  return (
    <Card as="section" className="mb-4 min-w-0 max-w-xl">
      <h2 className="mb-1 text-base font-medium">Distribuir documentos desde un PDF</h2>
      <p className="text-ink-3 mb-3 text-xs">
        Sube UN PDF con los documentos de varios empleados (contratos, EPIs, certificados…). La IA identifica al empleado de cada
        página y deja su documento en su expediente. Las páginas seguidas del mismo empleado forman un solo documento; las que no
        se identifican con seguridad <b>no se asignan</b>.
      </p>
      <form onSubmit={enviar} className="grid gap-2.5" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <label className="grid gap-1 text-sm text-ink-2">Carpeta / tipo
          <select value={carpeta} onChange={e => { setCarpeta(e.target.value); if (!carpetaAdmiteFirma(e.target.value)) setFirma(false) }} required
            className="min-h-[44px] rounded border border-line px-2 text-sm">
            <option value="">Elegir…</option>
            {carpetas.map(c => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-ink-2">Título (opcional)
          <input value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={120} placeholder="Por defecto, el nombre de la carpeta"
            className="min-h-[44px] rounded border border-line px-2 text-sm" />
        </label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" checked={firma && admiteFirma} disabled={!admiteFirma} onChange={e => setFirma(e.target.checked)} />
          Requiere firma del empleado{!admiteFirma && <span className="text-ink-3 text-xs"> (no en esta carpeta)</span>}
        </label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" checked={avisar} onChange={e => setAvisar(e.target.checked)} />
          Avisar a cada empleado (email y notificación)
        </label>
        <input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} required />
        <button type="submit" disabled={procesando || !file || !carpeta} className="min-h-[44px]">
          {procesando ? '🤖 Procesando con IA…' : '🤖 Distribuir documentos con IA'}
        </button>
      </form>

      {msg && <p className={`mt-2 text-sm ${msg.startsWith('✓') ? 'text-ok' : 'text-alert'}`}>{msg}</p>}

      {res && res.documentos.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <ul className="grid gap-1 text-xs">
            {res.documentos.map((d, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="text-ink-3 w-20 shrink-0">{pag(d)}</span>
                {d.estado === 'ok' && <><span className="text-ok">✓</span><span>{d.empleado_nombre}</span></>}
                {d.estado === 'ya_enviado' && <><span className="text-ink-3">=</span><span>{d.empleado_nombre}</span><span className="text-ink-3">(ya estaba)</span></>}
                {d.estado === 'no_identificado' && <span className="text-warn">— No identificado (no asignado)</span>}
                {d.estado === 'error' && <span className="text-alert">{d.empleado_nombre}: error {d.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
