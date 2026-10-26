'use client'
import { useState } from 'react'
import SolicitudesEmpleado from '@/components/SolicitudesEmpleado'
import FichajeEmpleado from '@/components/FichajeEmpleado'
import MaterialEmpleado from '@/components/MaterialEmpleado'
import ActivarPush from '@/components/ActivarPush'
import Wordmark from '@/components/Wordmark'
import { estiloMarcaEmpresa } from '@/lib/marca-asegura'
import { LogoAsegura, PieAsegura } from '@/components/MarcaAsegura'
import TarjetaSeguros from '@/components/TarjetaSeguros'

type Carpeta = { id: string; etiqueta: string }
type Doc = { id: string; carpeta: string; nombre: string; estado_firma: string; firmado_empresa_at: string | null; firmado_empresa_nombre: string | null; creada_at: string; url: string | null; resumen?: string | null }
type Aviso = { id: string; tipo: string; titulo: string; cuerpo: string | null; creado_at: string; visto_en: string | null; documento_id: string | null; documento_nombre: string | null; estado_firma: string | null }
type Avisos = { avisos: Aviso[]; sin_ver: number }
type Branding = { nombre: string; color_primario: string | null; logo_url: string | null }

const CONSENTIMIENTO = 'He leído el documento y lo firmo electrónicamente. Acepto que esta firma electrónica avanzada (Reglamento eIDAS, art. 26) queda vinculada a mi identidad y al contenido del documento, y tiene la misma validez que mi firma manuscrita.'

export default function ExpedienteEmpleado({ visibles, subibles, inicial, branding, tieneFichaje, avisosIniciales, marcaAsegura = false, urlSeguros = null }: { marcaAsegura?: boolean; urlSeguros?: string | null; visibles: Carpeta[]; subibles: Carpeta[]; inicial: Doc[]; branding?: Branding; tieneFichaje?: boolean; avisosIniciales?: Avisos | null }) {
  const [docs, setDocs] = useState<Doc[]>(inicial)
  const [avisos, setAvisos] = useState<Avisos | null>(avisosIniciales ?? null)
  const [verAvisos, setVerAvisos] = useState(false)
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

  // Abrir un documento marca sus avisos como vistos (y la primera apertura, que ve RR.HH.).
  function marcarVisto(docId: string) {
    const body = JSON.stringify({ documento_id: docId })
    try {
      if (!navigator.sendBeacon?.('/api/e/avisos/visto', body)) {
        fetch('/api/e/avisos/visto', { method: 'POST', body, keepalive: true }).catch(() => {})
      }
    } catch { /* no bloquea abrir el documento */ }
    setAvisos(a => {
      if (!a) return a
      const quedan = a.avisos.map(x => x.documento_id === docId && !x.visto_en ? { ...x, visto_en: new Date().toISOString() } : x)
      const sinVer = new Set(quedan.filter(x => !x.visto_en).map(x => x.documento_id ?? x.id)).size
      return { avisos: quedan, sin_ver: Math.min(a.sin_ver, sinVer) }
    })
  }

  async function recargar() {
    const r = await fetch('/api/e/expediente'); if (r.ok) setDocs((await r.json()).documentos)
  }

  async function abrirFirma(d: Doc) {
    marcarVisto(d.id)
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
    <main className={`mx-auto max-w-[520px] lg:max-w-5xl${marcaAsegura ? ' marca-asegura' : ''}`} style={estiloMarcaEmpresa(marcaAsegura, branding?.color_primario) as React.CSSProperties}>
      <header className="mb-4 flex flex-col items-center gap-2 border-b border-line bg-accent px-4 pb-5 pt-6 text-center text-white lg:flex-row lg:justify-between lg:gap-4 lg:px-8 lg:text-left">
        {marcaAsegura
          ? <LogoAsegura alto={36} color="#fff" />
          : branding?.logo_url
          ? <img src={branding.logo_url} alt={branding.nombre || 'Logo'} className="max-h-20 w-auto max-w-[220px] object-contain" />
          : <Wordmark claro className="text-2xl" />}
        {!marcaAsegura && branding?.nombre && (
          <p className="mt-1 text-xs font-semibold uppercase tracking-widest opacity-80">{branding.nombre}</p>
        )}
        <span className="mt-1 rounded-full bg-white/20 px-3 py-0.5 text-xs font-medium text-white">Portal del empleado</span>
        <button type="button" className="min-h-[44px] bg-transparent px-3 text-xs text-white/80 underline"
          onClick={async () => { await fetch('/api/e/salir', { method: 'POST' }); location.href = marcaAsegura ? '/e/entrar?m=asegura' : '/e/entrar' }}>
          Salir de este dispositivo
        </button>
      </header>
      <div className="p-4">

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="contents lg:col-start-1 lg:block">
      {marcaAsegura && urlSeguros && <TarjetaSeguros url={urlSeguros} />}
      <p className="mb-2"><ActivarPush endpoint="/api/e/push/subscribe" /></p>

      {avisos && avisos.avisos.length > 0 && (
        <section className="my-3 rounded-card border border-line bg-card p-4">
          <button type="button" onClick={() => setVerAvisos(v => !v)}
            className="flex min-h-[44px] w-full items-center justify-between gap-2 bg-transparent p-0 text-left text-ink">
            <span className="text-base font-semibold">Avisos</span>
            {avisos.sin_ver > 0
              ? <span className="rounded-full bg-alert px-2.5 py-0.5 text-xs font-bold text-white">{avisos.sin_ver} sin ver</span>
              : <span className="text-xs text-ink-3">{verAvisos ? 'Ocultar' : 'Ver'}</span>}
          </button>
          {(verAvisos || avisos.sin_ver > 0) && (
            <ul className="mt-2 grid gap-2">
              {avisos.avisos.filter(a => verAvisos || !a.visto_en).slice(0, verAvisos ? 30 : 5).map(a => {
                const d = a.documento_id ? docs.find(x => x.id === a.documento_id) : null
                return (
                  <li key={a.id} className={`rounded-lg border px-3 py-2 text-sm ${a.visto_en ? 'border-line' : 'border-accent bg-accent-soft'}`}>
                    <p className="font-medium">{a.titulo}</p>
                    {a.cuerpo && <p className="text-xs text-ink-2">{a.cuerpo}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-3">
                      <span>{new Date(a.creado_at).toLocaleDateString('es-ES')}</span>
                      {d?.url && <a href={d.url} target="_blank" rel="noreferrer" onClick={() => marcarVisto(d.id)} className="text-accent no-underline hover:underline">Abrir documento</a>}
                      {d && d.estado_firma === 'pendiente' && d.carpeta !== 'datos_personales' && d.carpeta !== 'formacion' && (
                        <button type="button" onClick={() => abrirFirma(d)} className="ml-auto min-h-[44px] px-3 text-xs">Firmar</button>
                      )}
                      {d && d.estado_firma === 'firmado' && <span className="text-ok">✔ Firmado</span>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      </div>

      <div className="contents lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:block">
      {tieneFichaje && <FichajeEmpleado />}

      <MaterialEmpleado />

      <SolicitudesEmpleado />
      </div>

      <div className="contents lg:col-start-1 lg:block">
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
                ? <a href={d.url} target="_blank" rel="noreferrer" onClick={() => marcarVisto(d.id)} className="text-accent no-underline hover:underline">{d.nombre}</a>
                : <span>{d.nombre}</span>}
              <span className="text-ink-3 text-xs">· {etiqueta(d.carpeta)}</span>
              {d.estado_firma === 'pendiente_empresa' && (
                <span className="text-warn text-xs font-medium">· En espera de firma empresa</span>
              )}
              {d.estado_firma === 'pendiente' && d.firmado_empresa_nombre && (
                <span className="text-ok text-xs">· ✔ Firmado por empresa</span>
              )}
              {d.estado_firma === 'firmado' && <span className="text-ok text-xs font-semibold">· ✔ Firmado por ambas partes</span>}
              {d.estado_firma === 'firmado' && (
                <a href={`/v/${d.id}`} target="_blank" rel="noreferrer" className="text-accent text-xs no-underline hover:underline">· Verificar</a>
              )}
              {d.estado_firma === 'pendiente' && d.carpeta !== 'datos_personales' && d.carpeta !== 'formacion' && (
                <button onClick={() => abrirFirma(d)} className="ml-auto px-3 py-1.5 text-xs">Firmar</button>
              )}
              {d.resumen && <p className="w-full text-xs text-ink-3">{d.resumen}</p>}
            </li>
          ))}
          {docs.length === 0 && <li className="text-ink-3 text-sm">Aún no tienes documentos</li>}
        </ul>
      </section>
      </div>
      </div>

      {firmarDoc && (
        <div onClick={() => setFirmarDoc(null)} className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <div onClick={e => e.stopPropagation()} className="w-full max-w-sm rounded-[18px] border border-line bg-card p-5">
            <h2 className="text-base">Firmar documento</h2>
            <p className="mt-1 text-sm font-medium">{firmarDoc.nombre}</p>
            {firmarDoc.firmado_empresa_nombre && (
              <p className="mt-2 rounded-lg bg-ok/10 px-3 py-2 text-xs text-ok">
                ✔ La empresa ya firmó este documento ({firmarDoc.firmado_empresa_nombre})
              </p>
            )}
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
      {marcaAsegura && <PieAsegura />}
    </main>
  )
}
