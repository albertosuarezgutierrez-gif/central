'use client'
import { useState } from 'react'
import SolicitudesEmpleado from '@/components/SolicitudesEmpleado'
import FichajeEmpleado from '@/components/FichajeEmpleado'
import ActivarPush from '@/components/ActivarPush'
import Wordmark from '@/components/Wordmark'
import { estiloMarca } from '@/lib/branding'

type Carpeta = { id: string; etiqueta: string }
type Doc = { id: string; carpeta: string; nombre: string; estado_firma: string; creada_at: string; url: string | null }
type Branding = { nombre: string; color_primario: string | null; logo_url: string | null }

const CONSENTIMIENTO = 'He leído el documento y lo firmo electrónicamente. Acepto que esta firma electrónica avanzada (Reglamento eIDAS, art. 26) queda vinculada a mi identidad y al contenido del documento, y tiene la misma validez que mi firma manuscrita.'

export default function ExpedienteEmpleado({ visibles, subibles, inicial, branding, tieneFichaje }: { visibles: Carpeta[]; subibles: Carpeta[]; inicial: Doc[]; branding?: Branding; tieneFichaje?: boolean }) {
  const [docs, setDocs] = useState<Doc[]>(inicial)
  const [carpeta, setCarpeta] = useState(subibles[0]?.id ?? '')
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const [firmarDoc, setFirmarDoc] = useState<Doc | null>(null)
  const [nombreFirma, setNombreFirma] = useState('')
  const [codigo, setCodigo] = useState('')
  const [otp, setOtp] = useState<{ enviado: boolean; email_parcial?: string } | null>(null)
  const [firmando, setFirmando] = useState(false)
  const [firmaError, setFirmaError] = useState('')
  const etiqueta = (id: string) => visibles.find(c => c.id === id)?.etiqueta ?? id

  async function recargar() {
    const r = await fetch('/api/e/expediente'); if (r.ok) setDocs((await r.json()).documentos)
  }

  async function abrirFirma(d: Doc) {
    setFirmarDoc(d); setNombreFirma(''); setCodigo(''); setFirmaError(''); setOtp(null)
    // Pide un código OTP por email (refuerzo). Si no hay email/SMTP, se firma sin él.
    const r = await fetch(`/api/e/expediente/${d.id}/firmar/codigo`, { method: 'POST' })
    setOtp(r.ok ? await r.json() : { enviado: false })
  }

  async function confirmarFirma() {
    if (!firmarDoc) return
    setFirmando(true); setFirmaError('')
    const r = await fetch(`/api/e/expediente/${firmarDoc.id}/firmar`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nombre_confirmado: nombreFirma, codigo: codigo || undefined }),
    })
    if (r.ok) { setFirmarDoc(null); setNombreFirma(''); setCodigo(''); await recargar() }
    else setFirmaError((await r.json()).error ?? 'No se pudo firmar')
    setFirmando(false)
  }
  async function subir(file: File) {
    setSubiendo(true); setError('')
    const fd = new FormData(); fd.set('carpeta', carpeta); fd.set('file', file)
    const r = await fetch('/api/e/expediente', { method: 'POST', body: fd })
    if (r.ok) await recargar(); else setError((await r.json()).error ?? 'Error')
    setSubiendo(false)
  }

  return (
    <main className="mx-auto max-w-[520px]" style={estiloMarca(branding?.color_primario) as React.CSSProperties}>
      <header className="mb-4 flex flex-col items-center gap-2 border-b border-line bg-accent px-4 pb-5 pt-6 text-center text-white">
        {branding?.logo_url
          ? <img src={branding.logo_url} alt={branding.nombre || 'Logo'} className="max-h-20 w-auto max-w-[220px] object-contain" />
          : <Wordmark className="text-2xl text-white" />}
        {branding?.nombre && (
          <p className="mt-1 text-xs font-semibold uppercase tracking-widest opacity-80">{branding.nombre}</p>
        )}
        <span className="mt-1 rounded-full bg-white/20 px-3 py-0.5 text-xs font-medium text-white">Portal del empleado</span>
      </header>
      <div className="p-4">

      <p className="mb-2"><ActivarPush endpoint="/api/e/push/subscribe" /></p>

      {tieneFichaje && <FichajeEmpleado />}

      <SolicitudesEmpleado />

      <section className="my-3 rounded-card border border-line bg-card p-4">
        <h2 className="mb-2 text-base">Enviar un documento</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={carpeta} onChange={e => setCarpeta(e.target.value)}>
            {subibles.map(c => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
          </select>
          <input type="file" disabled={subiendo} onChange={e => { const f = e.target.files?.[0]; if (f) subir(f); e.currentTarget.value = '' }} />
        </div>
        {subiendo && <p className="text-ink-3 text-sm">Subiendo…</p>}
        {error && <p className="text-alert text-sm">{error}</p>}
      </section>

      <section className="my-3 rounded-card border border-line bg-card p-4">
        <h2 className="mb-2 text-base">Mis documentos</h2>
        <ul className="grid gap-1.5">
          {docs.map(d => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-2 text-sm">
              {d.url
                ? <a href={d.url} target="_blank" rel="noreferrer" className="text-accent no-underline hover:underline">{d.nombre}</a>
                : <span>{d.nombre}</span>}
              <span className="text-ink-3 text-xs">· {etiqueta(d.carpeta)}</span>
              {d.estado_firma === 'firmado' && <span className="text-ok text-xs font-semibold">· ✔ Firmado</span>}
              {d.estado_firma === 'firmado' && (
                <a href={`/v/${d.id}`} target="_blank" rel="noreferrer" className="text-accent text-xs no-underline hover:underline">· Verificar</a>
              )}
              {d.estado_firma === 'pendiente' && d.carpeta !== 'datos_personales' && d.carpeta !== 'formacion' && (
                <button onClick={() => abrirFirma(d)} className="ml-auto px-2 py-0.5 text-xs">Firmar</button>
              )}
            </li>
          ))}
          {docs.length === 0 && <li className="text-ink-3 text-sm">Aún no tienes documentos</li>}
        </ul>
      </section>

      {firmarDoc && (
        <div onClick={() => setFirmarDoc(null)} className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <div onClick={e => e.stopPropagation()} className="w-full max-w-sm rounded-[18px] border border-line bg-card p-5">
            <h2 className="text-base">Firmar documento</h2>
            <p className="mt-1 text-sm font-medium">{firmarDoc.nombre}</p>
            <p className="mt-3 text-xs leading-relaxed text-ink-2">{CONSENTIMIENTO}</p>
            {otp?.enviado && (
              <>
                <label className="mt-3 block text-xs text-ink-2">
                  Código enviado a tu email{otp.email_parcial ? ` (${otp.email_parcial})` : ''}:
                </label>
                <input className="mt-1 w-full tracking-widest" value={codigo} inputMode="numeric" maxLength={6}
                  onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))} placeholder="6 dígitos" />
              </>
            )}
            <label className="mt-3 block text-xs text-ink-2">Escribe tu nombre completo para firmar:</label>
            <input className="mt-1 w-full" value={nombreFirma} onChange={e => setNombreFirma(e.target.value)} placeholder="Nombre y apellidos" />
            {firmaError && <p className="mt-2 text-alert text-sm">{firmaError}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={confirmarFirma}
                disabled={firmando || !nombreFirma.trim() || (!!otp?.enviado && codigo.length !== 6)}
                className="flex-1">
                {firmando ? 'Firmando…' : 'Firmar'}
              </button>
              <button onClick={() => setFirmarDoc(null)} className="bg-paper-2 text-ink-2 hover:bg-line">Cancelar</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </main>
  )
}
