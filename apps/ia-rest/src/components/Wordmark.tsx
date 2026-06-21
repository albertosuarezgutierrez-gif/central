import type { ReactElement } from 'react'

// Wordmark corporativo — Catering Joaquín Jaén.
// Si el local es JJ (o se pasa logoUrl), muestra el LOGO real. El fondo blanco del
// JPG se elimina visualmente con mix-blend-mode:multiply sobre fondos claros (crema/blanco).
// Fallback: monograma tipográfico (iniciales) + nombre, en los colores de la marca.

const VERDE = '#02473B'
const ORO = '#9E8152'
const PAPEL = '#FBFAF6'
const LOGO_JJ = '/brands/joaquin-jaen.jpg'

export function Wordmark({ nombre, sub, onDark = false, size = 'md', logoUrl }: {
  nombre: string
  sub?: string
  onDark?: boolean
  size?: 'sm' | 'md'
  logoUrl?: string
}): ReactElement {
  const esJJ = /joaqu|ja[eé]n/i.test(nombre || '')
  const src = logoUrl ?? (esJJ ? LOGO_JJ : undefined)

  // Con logo real: mostramos la imagen (el JPG ya incluye "CATERING · JOAQUÍN JAÉN").
  if (src) {
    const h = size === 'sm' ? 34 : 48
    return (
      <img
        src={src}
        alt={nombre}
        style={{ height: h, width: 'auto', display: 'block', mixBlendMode: onDark ? 'normal' : 'multiply' }}
      />
    )
  }

  // Fallback: monograma + nombre.
  const badge = size === 'sm' ? 34 : 40
  const fs = size === 'sm' ? 16 : 19
  const iniciales = (nombre || 'JJ')
    .replace(/catering/i, '')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '').join('') || 'JJ'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <div style={{
        width: badge, height: badge, flexShrink: 0, borderRadius: 999, background: VERDE, color: ORO,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Newsreader, Georgia, serif', fontWeight: 700, fontSize: fs - 2, letterSpacing: 0.5,
        border: `1.5px solid ${ORO}`,
      }}>{iniciales}</div>
      <div style={{ lineHeight: 1.05, minWidth: 0 }}>
        {sub && <div style={{ fontFamily: 'Inter Tight, system-ui, sans-serif', letterSpacing: 2, fontSize: 9, color: ORO, textTransform: 'uppercase', fontWeight: 700 }}>{sub}</div>}
        <div style={{ fontFamily: 'Newsreader, Georgia, serif', fontSize: fs, fontWeight: 600, color: onDark ? PAPEL : VERDE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nombre}</div>
      </div>
    </div>
  )
}
