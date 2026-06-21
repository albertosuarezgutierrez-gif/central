// components/qr/SelectorIdioma.tsx
// Selector de idioma minimalista para el menú QR del cliente
'use client'

import { IDIOMAS_CARTA, CodigoIdioma } from '@/lib/useIdiomasCarta'

interface Props {
  idioma: CodigoIdioma
  onChange: (lang: CodigoIdioma) => void
}

export default function SelectorIdioma({ idioma, onChange }: Props) {
  return (
    <div style={{
      display: 'flex',
      gap: 4,
      flexWrap: 'wrap',
      justifyContent: 'center',
      padding: '8px 16px',
    }}>
      {IDIOMAS_CARTA.map(({ code, flag, label }) => {
        const activo = idioma === code
        return (
          <button
            key={code}
            onClick={() => onChange(code as CodigoIdioma)}
            title={label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 20,
              border: activo ? 'none' : '1px solid #2E2720',
              background: activo ? '#D9442B' : '#1E1A15',
              color: activo ? '#F6F1E7' : '#8C7B69',
              fontSize: 12,
              fontWeight: activo ? 700 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s',
              transform: activo ? 'scale(1.05)' : 'scale(1)',
            }}
          >
            <span style={{ fontSize: 14 }}>{flag}</span>
            <span style={{ display: 'none', fontSize: 11 }}
              className="lang-label"
            >{label}</span>
          </button>
        )
      })}
    </div>
  )
}
