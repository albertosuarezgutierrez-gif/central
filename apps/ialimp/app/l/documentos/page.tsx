'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import LogoIalimp from '@/components/LogoIalimp'

type Carpeta = { id: string; etiqueta: string }
type Doc = { id: string; carpeta: string; nombre: string; estado_firma: string; creada_at: string; url: string | null }

const CONSENTIMIENTO = 'He leído el documento y lo firmo electrónicamente. Acepto que esta firma electrónica avanzada (Reglamento eIDAS, art. 26) queda vinculada a mi identidad y al contenido del documento, y tiene la misma validez que mi firma manuscrita.'

const C = {
  primary: 'var(--brand-primary)', light: 'var(--brand-light)',
  bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4', warn: '#d97706', red: '#dc2626', redBg: '#fef2f2',
}

export default function DocumentosLimpiadora() {
  const router = useRouter()
  const [docs, setDocs] = useState<Doc[]>([])
  const [carpetas, setCarpetas] = useState<Carpeta[]>([])
  const [loading, setLoading] = useState(true)
  const [limpiadora, setLimpiadora] = useState<any>(null)
  const [firmarDoc, setFirmarDoc] = useState<Doc | null>(null)
  const [nombreFirma, setNombreFirma] = useState('')
  const [codigo, setCodigo] = useState('')
  const [otp, setOtp] = useState<{ enviado: boolean; email_parcial?: string } | null>(null)
  const [firmando, setFirmando] = useState(false)
  const [firmaError, setFirmaError] = useState('')
  const etiqueta = (id: string) => carpetas.find(c => c.id === id)?.etiqueta ?? id

  async function recargar() {
    const r = await fetch('/api/l/expediente')
    if (r.status === 401) { router.replace('/l/login'); return }
    if (r.ok) { const d = await r.json(); setDocs(d.documentos); setCarpetas(d.carpetas) }
    setLoading(false)
  }
  useEffect(() => { recargar() }, [])
  useEffect(() => { fetch('/api/l/auth').then(r => r.json()).then(d => { if (d?.limpiadora) setLimpiadora(d.limpiadora) }).catch(() => {}) }, [])

  async function abrirFirma(d: Doc) {
    setFirmarDoc(d); setNombreFirma(''); setCodigo(''); setFirmaError(''); setOtp(null)
    const r = await fetch(`/api/l/expediente/${d.id}/firmar/codigo`, { method: 'POST' })
    setOtp(r.ok ? await r.json() : { enviado: false })
  }
  async function confirmarFirma() {
    if (!firmarDoc) return
    setFirmando(true); setFirmaError('')
    const r = await fetch(`/api/l/expediente/${firmarDoc.id}/firmar`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nombre_confirmado: nombreFirma, codigo: codigo || undefined }),
    })
    if (r.ok) { setFirmarDoc(null); await recargar() }
    else setFirmaError((await r.json()).error ?? 'No se pudo firmar')
    setFirmando(false)
  }

  const brandVars = limpiadora ? ({
    ['--brand-primary' as any]: limpiadora.color_primario, ['--brand-light' as any]: limpiadora.color_light,
  }) : undefined

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, fontFamily: "'Nunito', -apple-system, sans-serif", ...(brandVars || {}) }}>
      {/* Header */}
      <div style={{ background: 'var(--brand-primary)', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/l')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 36, height: 36, borderRadius: 10, fontSize: 18, cursor: 'pointer' }}>←</button>
          <div style={{ flex: 1 }}>
            <LogoIalimp size={15} style={{ marginBottom: 2, display: 'inline-block' }} nombre={limpiadora?.marca_nombre} logoUrl={limpiadora?.logo_url} />
            <div style={{ color: 'white', fontWeight: 800, fontSize: 18 }}>Mis documentos</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px' }}>
        {loading && <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>⏳ Cargando…</div>}

        {!loading && docs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '56px 16px', color: '#94a3b8' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>📄</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#334155' }}>Aún no tienes documentos</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Aquí verás tus nóminas y documentos para firmar</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {docs.map(d => (
            <div key={d.id} style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 4px rgba(15,23,42,.06)' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: C.light, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                {d.carpeta === 'nominas' ? '💶' : '📄'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {d.url
                  ? <a href={d.url} target="_blank" rel="noreferrer" style={{ fontWeight: 700, fontSize: 14, color: C.text, textDecoration: 'none' }}>{d.nombre}</a>
                  : <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{d.nombre}</span>}
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  {etiqueta(d.carpeta)} · {new Date(d.creada_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                  {d.estado_firma === 'firmado' && <span style={{ color: C.ok, fontWeight: 700 }}> · ✔ Firmado</span>}
                </div>
              </div>
              {d.estado_firma === 'pendiente' && (
                <button onClick={() => abrirFirma(d)} style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 10, border: 'none', background: 'var(--brand-primary)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Firmar
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Modal de firma */}
      {firmarDoc && (
        <div onClick={() => setFirmarDoc(null)} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 400, background: 'white', borderRadius: 18, padding: 22, maxHeight: '90vh', overflowY: 'auto', fontFamily: 'inherit' }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Firmar documento</h2>
            <p style={{ marginTop: 4, fontSize: 14, fontWeight: 600, color: C.text }}>{firmarDoc.nombre}</p>
            <p style={{ marginTop: 12, fontSize: 12, lineHeight: 1.5, color: C.muted }}>{CONSENTIMIENTO}</p>
            {otp?.enviado && (
              <>
                <label style={{ marginTop: 14, display: 'block', fontSize: 12, color: C.muted }}>
                  Código enviado a tu email{otp.email_parcial ? ` (${otp.email_parcial})` : ''}:
                </label>
                <input value={codigo} inputMode="numeric" maxLength={6} onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))} placeholder="6 dígitos"
                  style={{ marginTop: 6, width: '100%', padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 16, letterSpacing: '0.3em', outline: 'none', fontFamily: 'inherit' }} />
              </>
            )}
            {otp && !otp.enviado && (
              <p style={{ marginTop: 12, fontSize: 12, color: C.warn }}>⚠️ No hay email configurado: avisa a tu responsable para poder firmar con código.</p>
            )}
            <label style={{ marginTop: 14, display: 'block', fontSize: 12, color: C.muted }}>Escribe tu nombre completo para firmar:</label>
            <input value={nombreFirma} onChange={e => setNombreFirma(e.target.value)} placeholder="Nombre y apellidos"
              style={{ marginTop: 6, width: '100%', padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
            {firmaError && <p style={{ marginTop: 10, fontSize: 13, color: C.red }}>{firmaError}</p>}
            <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
              <button onClick={confirmarFirma} disabled={firmando || !nombreFirma.trim() || (!!otp?.enviado && codigo.length !== 6)}
                style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: 'var(--brand-primary)', color: 'white', fontSize: 15, fontWeight: 800, cursor: 'pointer', opacity: (firmando || !nombreFirma.trim() || (!!otp?.enviado && codigo.length !== 6)) ? 0.5 : 1, fontFamily: 'inherit' }}>
                {firmando ? 'Firmando…' : 'Firmar'}
              </button>
              <button onClick={() => setFirmarDoc(null)} style={{ padding: '12px 16px', borderRadius: 12, border: `1px solid ${C.border}`, background: 'white', color: C.muted, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
