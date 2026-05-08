'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

// ─── Design tokens (idénticos a owner/page.tsx) ───────────────
const C = {
  paper: '#F6F1E7', paper2: '#EFE7D6', bone: '#FBF8F1',
  ink: '#1A1714', ink2: '#3A332C', ink3: '#6B5F52', ink4: '#9A8D7C',
  rule: '#D8CDB6',
  red: '#D9442B', redD: '#A8311E', redS: '#F4D8CF',
  amber: '#E8A33B', amberS: '#F7E3B6',
  green: '#3F7D44', greenS: '#D4E4D2',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

// ─── Logo de demo (SVG inline → data URL) ────────────────────
// Tenedor + cuchillo sobre fondo vermilion. Sirve para probar el QR con logo.
const DEMO_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <rect width="120" height="120" rx="20" fill="#D9442B"/>
  <!-- Tenedor -->
  <line x1="42" y1="28" x2="42" y2="92" stroke="#F6F1E7" stroke-width="4" stroke-linecap="round"/>
  <line x1="34" y1="28" x2="34" y2="50" stroke="#F6F1E7" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="42" y1="28" x2="42" y2="50" stroke="#F6F1E7" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="50" y1="28" x2="50" y2="50" stroke="#F6F1E7" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M34 50 Q34 58 42 58 Q50 58 50 50" stroke="#F6F1E7" stroke-width="3.5" fill="none"/>
  <!-- Cuchillo -->
  <line x1="78" y1="28" x2="78" y2="92" stroke="#F6F1E7" stroke-width="4" stroke-linecap="round"/>
  <path d="M78 28 L88 42 Q90 50 78 54" stroke="#F6F1E7" stroke-width="3.5" fill="none" stroke-linecap="round"/>
</svg>`

const DEMO_LOGO_DATA_URL =
  'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(DEMO_LOGO_SVG)))

// ─── Helpers ─────────────────────────────────────────────────
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// ─── Component ───────────────────────────────────────────────
export default function CartaPublicPanel({ onClose }: { onClose: () => void }) {
  const [rest, setRest] = useState<{ nombre: string; slug: string } | null>(null)
  const [restLoading, setRestLoading] = useState(true)
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)

  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })

  useEffect(() => {
    fetch('/api/owner/restaurante', { headers: sh() })
      .then(r => r.json())
      .then(d => {
        if (d.restaurante) setRest({ nombre: d.restaurante.nombre, slug: d.restaurante.slug })
        setRestLoading(false)
      })
      .catch(() => setRestLoading(false))
    // ESC para cerrar
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const cartaUrl = rest ? `https://ia-rest.vercel.app/carta/${rest.slug}` : ''

  const qrSrc = useCallback(
    (size: number) =>
      `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(cartaUrl)}&ecc=H&color=1A1714&bgcolor=F6F1E7&margin=1`,
    [cartaUrl]
  )

  // ── Upload logo ──────────────────────────────────────────────
  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setLogoDataUrl(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  // ── Descargar QR PNG alta resolución ─────────────────────────
  const downloadQR = async () => {
    if (!rest) return
    setGenerating(true)
    const SIZE = 900

    try {
      const canvas = document.createElement('canvas')
      canvas.width = SIZE
      canvas.height = SIZE
      const ctx = canvas.getContext('2d')!

      // 1. Dibujar QR
      const qrImg = await loadImage(qrSrc(SIZE))
      ctx.drawImage(qrImg, 0, 0, SIZE, SIZE)

      // 2. Superponer logo si se subió
      if (logoDataUrl) {
        const logoImg = await loadImage(logoDataUrl)
        const logoSize = Math.round(SIZE * 0.21)
        const cx = SIZE / 2
        const cy = SIZE / 2
        const halfLogo = logoSize / 2

        // Círculo blanco de fondo (margen 14px)
        ctx.fillStyle = '#F6F1E7'
        ctx.beginPath()
        ctx.arc(cx, cy, halfLogo + 14, 0, Math.PI * 2)
        ctx.fill()

        // Clip circular → dibujar logo
        ctx.save()
        ctx.beginPath()
        ctx.arc(cx, cy, halfLogo, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(logoImg, cx - halfLogo, cy - halfLogo, logoSize, logoSize)
        ctx.restore()
      }

      // 3. Descargar
      canvas.toBlob(blob => {
        if (!blob) { setGenerating(false); return }
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `qr-carta-${rest.slug}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        setGenerating(false)
      }, 'image/png')
    } catch (err) {
      console.error('Error generando QR:', err)
      setGenerating(false)
    }
  }

  // ── Abrir carta → imprimir → guardar PDF ─────────────────────
  const openPDF = () => {
    if (!rest) return
    window.open(`/carta/${rest.slug}?imprimir=1`, '_blank')
  }

  // ── Copiar URL ───────────────────────────────────────────────
  const copyUrl = async () => {
    await navigator.clipboard.writeText(cartaUrl).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(26,23,20,.48)',
          backdropFilter: 'blur(3px)',
          zIndex: 200,
        }}
      />

      {/* Panel modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        zIndex: 201,
        background: C.paper,
        border: `1px solid ${C.rule}`,
        borderRadius: 12,
        padding: 32,
        width: 'min(540px, 94vw)',
        maxHeight: '92vh',
        overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(26,23,20,.28)',
      }}>

        {/* ── Título ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.15em', color: C.red, textTransform: 'uppercase', marginBottom: 4 }}>
              Carta digital
            </div>
            <div style={{ fontFamily: SE, fontSize: 24, color: C.ink }}>QR y PDF</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink3, padding: 4, marginTop: -4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {restLoading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontFamily: SM, fontSize: 11, color: C.ink3, letterSpacing: '.12em' }}>
            CARGANDO…
          </div>
        ) : !rest ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontFamily: SN, fontSize: 14, color: C.ink3 }}>
            No se pudo cargar el restaurante
          </div>
        ) : (
          <>
            {/* ── URL pública ── */}
            <section style={{ marginBottom: 28 }}>
              <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.12em', color: C.ink3, textTransform: 'uppercase', marginBottom: 8 }}>
                URL de la carta
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{
                  flex: 1, fontFamily: SM, fontSize: 12, color: C.ink2,
                  background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 4,
                  padding: '9px 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {cartaUrl}
                </div>
                <button
                  onClick={copyUrl}
                  style={{
                    background: copied ? C.green : C.bone,
                    color: copied ? C.paper : C.ink2,
                    border: `1px solid ${copied ? C.green : C.rule}`,
                    borderRadius: 4, padding: '9px 14px',
                    fontFamily: SN, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                    transition: 'all .2s',
                  }}>
                  {copied ? '✓ Copiado' : 'Copiar'}
                </button>
              </div>
            </section>

            {/* ── QR Preview + Logo upload ── */}
            <section style={{ display: 'flex', gap: 20, marginBottom: 24, alignItems: 'flex-start' }}>

              {/* QR preview */}
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.12em', color: C.ink3, textTransform: 'uppercase', marginBottom: 8 }}>
                  Vista previa
                </div>
                <div style={{
                  width: 152, height: 152,
                  border: `2px solid ${C.rule}`, borderRadius: 8,
                  overflow: 'hidden', background: '#F6F1E7',
                  position: 'relative',
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrSrc(304)} alt="QR carta" style={{ width: '100%', height: '100%' }} />
                  {/* Logo overlay preview */}
                  {logoDataUrl && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      pointerEvents: 'none',
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: '#F6F1E7',
                        boxShadow: '0 0 0 5px #F6F1E7',
                        overflow: 'hidden',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={logoDataUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Logo upload */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.12em', color: C.ink3, textTransform: 'uppercase', marginBottom: 8 }}>
                  Logo del restaurante (opcional)
                </div>
                <div
                  onClick={() => logoRef.current?.click()}
                  style={{
                    border: `2px dashed ${logoDataUrl ? C.green : C.rule}`,
                    borderRadius: 8, padding: '18px 12px',
                    textAlign: 'center', cursor: 'pointer',
                    background: logoDataUrl ? C.greenS : C.bone,
                    transition: 'all .2s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                    minHeight: 100,
                  }}>
                  {logoDataUrl ? (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.2" strokeLinecap="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      <div style={{ fontFamily: SN, fontSize: 12, fontWeight: 600, color: C.green }}>Logo cargado</div>
                      <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>Clic para cambiar</div>
                    </>
                  ) : (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.ink3} strokeWidth="1.7" strokeLinecap="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                      </svg>
                      <div style={{ fontFamily: SN, fontSize: 12, fontWeight: 600, color: C.ink3 }}>Subir logo</div>
                      <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4 }}>PNG · SVG · JPG</div>
                      <div style={{ fontFamily: SN, fontSize: 10, color: C.ink4 }}>Se centra en el QR</div>
                    </>
                  )}
                  <input ref={logoRef} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" hidden onChange={handleLogo} />
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                  {!logoDataUrl && (
                    <button
                      onClick={() => setLogoDataUrl(DEMO_LOGO_DATA_URL)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: SN, fontSize: 11, color: C.red, padding: 0, fontWeight: 600 }}>
                      Usar logo de demo →
                    </button>
                  )}
                  {logoDataUrl && (
                    <button
                      onClick={() => { setLogoDataUrl(null); if (logoRef.current) logoRef.current.value = '' }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: SN, fontSize: 11, color: C.ink4, padding: 0, textDecoration: 'underline' }}>
                      Quitar logo
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* ── Nota pegatinas ── */}
            <div style={{
              background: C.amberS, border: `1px solid ${C.amber}`,
              borderRadius: 6, padding: '10px 14px', marginBottom: 24,
              fontFamily: SN, fontSize: 12, color: C.ink2, lineHeight: 1.6,
            }}>
              <strong>Para pegatinas de mesa:</strong> descarga el QR en alta resolución (900×900 px) y llévalo a imprimir. Recomendado 5×5 cm, laminado mate.
            </div>

            {/* ── Acciones ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* Descargar QR */}
              <button
                onClick={downloadQR}
                disabled={generating}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: C.ink, color: C.paper,
                  border: 'none', borderRadius: 6,
                  padding: '13px 20px',
                  fontFamily: SN, fontSize: 14, fontWeight: 600,
                  cursor: generating ? 'not-allowed' : 'pointer',
                  opacity: generating ? .65 : 1,
                  transition: 'all .15s',
                }}>
                {/* QR icon */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
                  <path d="M14 14h2v2h-2zM18 14h3M18 16v2M14 18h2v2M18 20h3v-2"/>
                </svg>
                {generating ? 'Generando QR…' : 'Descargar QR (PNG alta resolución)'}
              </button>

              {/* Descargar PDF */}
              <button
                onClick={openPDF}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: C.red, color: C.paper,
                  border: 'none', borderRadius: 6,
                  padding: '13px 20px',
                  fontFamily: SN, fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', transition: 'all .15s',
                }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" />
                </svg>
                Descargar carta en PDF
              </button>

              {/* Ver como cliente */}
              <a
                href={cartaUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: C.bone, color: C.ink2,
                  border: `1px solid ${C.rule}`, borderRadius: 6,
                  padding: '13px 20px',
                  fontFamily: SN, fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', textDecoration: 'none',
                  transition: 'all .15s',
                }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
                </svg>
                Ver carta como cliente
              </a>
            </div>
          </>
        )}
      </div>
    </>
  )
}
