'use client'

import { useState, useEffect, useCallback } from 'react'
import { copyToClipboard } from '@/lib/clipboard'

// ─── Design tokens ────────────────────────────────────────────
const C = {
  paper: '#F6F1E7', bone: '#FBF8F1',
  ink: '#1A1714', ink2: '#3A332C', ink3: '#6B5F52', ink4: '#9A8D7C',
  rule: '#D8CDB6',
  red: '#D9442B',
  amber: '#E8A33B', amberS: '#F7E3B6',
  green: '#3F7D44', greenS: '#D4E4D2',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

type Rest = { nombre: string; slug: string; logo_url: string | null }

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

export default function CartaPublicPanel({ onClose }: { onClose: () => void }) {
  const [rest, setRest] = useState<Rest | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })

  useEffect(() => {
    fetch('/api/owner/restaurante', { headers: sh() })
      .then(r => r.json())
      .then(d => {
        if (d.restaurante) setRest({
          nombre: d.restaurante.nombre,
          slug: d.restaurante.slug,
          logo_url: d.restaurante.logo_url ?? null,
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const cartaUrl = rest ? `https://www.iarest.es/carta/${rest.slug}` : ''

  const qrSrc = useCallback(
    (size: number) =>
      `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(cartaUrl)}&ecc=H&color=1A1714&bgcolor=F6F1E7&margin=1`,
    [cartaUrl]
  )

  const downloadQR = async () => {
    if (!rest) return
    setGenerating(true)
    const SIZE = 900
    try {
      const canvas = document.createElement('canvas')
      canvas.width = SIZE; canvas.height = SIZE
      const ctx = canvas.getContext('2d')!

      const qrImg = await loadImage(qrSrc(SIZE))
      ctx.drawImage(qrImg, 0, 0, SIZE, SIZE)

      if (rest.logo_url) {
        const logoImg = await loadImage(rest.logo_url).catch(() => null)
        if (logoImg) {
          const CIRCLE_R = Math.round(SIZE * 0.11)
          const cx = SIZE / 2, cy = SIZE / 2

          ctx.fillStyle = '#F6F1E7'
          ctx.beginPath()
          ctx.arc(cx, cy, CIRCLE_R + 14, 0, Math.PI * 2)
          ctx.fill()

          ctx.save()
          ctx.beginPath()
          ctx.arc(cx, cy, CIRCLE_R, 0, Math.PI * 2)
          ctx.clip()

          const scale = Math.min(
            (CIRCLE_R * 2) / logoImg.naturalWidth,
            (CIRCLE_R * 2) / logoImg.naturalHeight
          )
          const dw = logoImg.naturalWidth * scale
          const dh = logoImg.naturalHeight * scale
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(cx - CIRCLE_R, cy - CIRCLE_R, CIRCLE_R * 2, CIRCLE_R * 2)
          ctx.drawImage(logoImg, cx - dw / 2, cy - dh / 2, dw, dh)
          ctx.restore()
        }
      }

      canvas.toBlob(blob => {
        if (!blob) { setGenerating(false); return }
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `qr-carta-${rest.slug}.png`
        document.body.appendChild(a); a.click()
        document.body.removeChild(a); URL.revokeObjectURL(url)
        setGenerating(false)
      }, 'image/png')
    } catch {
      setGenerating(false)
    }
  }

  const openPDF = () => rest && window.open(`/carta/${rest.slug}?imprimir=1`, '_blank')

  const copyUrl = async () => {
    await copyToClipboard(cartaUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(26,23,20,.48)',
        backdropFilter: 'blur(3px)', zIndex: 200,
      }} />

      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 201, background: C.paper, border: `1px solid ${C.rule}`,
        borderRadius: 12, padding: 'clamp(20px,4vw,32px)',
        width: 'min(480px, 94vw)', maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(26,23,20,.28)',
      }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.15em', color: C.red, textTransform: 'uppercase', marginBottom: 4 }}>
              Carta digital
            </div>
            <div style={{ fontFamily: SE, fontSize: 22, color: C.ink }}>QR y PDF</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink3, padding: 4, marginTop: -4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontFamily: SM, fontSize: 11, color: C.ink3, letterSpacing: '.12em' }}>CARGANDO…</div>
        ) : !rest ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontFamily: SN, fontSize: 14, color: C.ink3 }}>No se pudo cargar el restaurante</div>
        ) : (
          <>
            {/* QR + info */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>

              {/* QR preview con logo overlay */}
              <div style={{ flexShrink: 0, position: 'relative', width: 120, height: 120 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrSrc(240)} alt="QR" style={{ width: 120, height: 120, border: `2px solid ${C.rule}`, borderRadius: 8, display: 'block' }} />
                {rest.logo_url && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'none',
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: '#F6F1E7', boxShadow: '0 0 0 4px #F6F1E7',
                      overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={rest.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                  </div>
                )}
              </div>

              {/* URL + estado logo */}
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontFamily: SM, fontSize: 9, fontWeight: 700, letterSpacing: '.12em', color: C.ink3, textTransform: 'uppercase', marginBottom: 6 }}>
                  URL de la carta
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  <div style={{
                    flex: 1, fontFamily: SM, fontSize: 10, color: C.ink2,
                    background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 4,
                    padding: '7px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {cartaUrl}
                  </div>
                  <button onClick={copyUrl} style={{
                    background: copied ? C.green : C.bone, color: copied ? C.paper : C.ink2,
                    border: `1px solid ${copied ? C.green : C.rule}`,
                    borderRadius: 4, padding: '7px 12px',
                    fontFamily: SN, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    transition: 'all .2s', whiteSpace: 'nowrap',
                  }}>
                    {copied ? '✓' : 'Copiar'}
                  </button>
                </div>

                {rest.logo_url ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: C.greenS, border: `1px solid #B8D4BA`,
                    borderRadius: 4, padding: '6px 10px',
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round">
                      <path d="M20 6 9 17l-5-5"/>
                    </svg>
                    <span style={{ fontFamily: SN, fontSize: 11, color: C.green, fontWeight: 600 }}>Logo configurado</span>
                    <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>· aparece en carta y QR</span>
                  </div>
                ) : (
                  <div style={{
                    background: C.amberS, border: `1px solid ${C.amber}44`,
                    borderRadius: 4, padding: '6px 10px',
                    fontFamily: SN, fontSize: 11, color: '#7A5A1A', lineHeight: 1.5,
                  }}>
                    Sin logo · ve a <strong>Restaurante</strong> para subir uno
                  </div>
                )}
              </div>
            </div>

            {/* Nota pegatinas */}
            <div style={{
              background: C.amberS, border: `1px solid ${C.amber}`,
              borderRadius: 6, padding: '10px 14px', marginBottom: 20,
              fontFamily: SN, fontSize: 12, color: C.ink2, lineHeight: 1.6,
            }}>
              <strong>Para pegatinas de mesa:</strong> descarga el QR en alta resolución (900×900 px). Recomendado 5×5 cm, laminado mate.
            </div>

            {/* Acciones */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={downloadQR} disabled={generating} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: C.ink, color: C.paper, border: 'none', borderRadius: 6,
                padding: '13px 20px', fontFamily: SN, fontSize: 14, fontWeight: 600,
                cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? .65 : 1,
                transition: 'opacity .15s',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
                  <path d="M14 14h2v2h-2zM18 14h3M18 16v2M14 18h2v2M18 20h3v-2"/>
                </svg>
                {generating ? 'Generando…' : `Descargar QR${rest.logo_url ? ' (con logo)' : ''}`}
              </button>

              <button onClick={openPDF} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: C.red, color: C.paper, border: 'none', borderRadius: 6,
                padding: '13px 20px', fontFamily: SN, fontSize: 14, fontWeight: 600,
                cursor: 'pointer',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8"/>
                </svg>
                Descargar carta en PDF
              </button>

              <a href={cartaUrl} target="_blank" rel="noopener noreferrer" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: C.bone, color: C.ink2, border: `1px solid ${C.rule}`,
                borderRadius: 6, padding: '13px 20px',
                fontFamily: SN, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', textDecoration: 'none',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>
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
