'use client'

// La nota libre de una variante («probando a nombre del padre»), en las pantallas de pedir precio.
// Viaja con la cotización y sale en el historial del riesgo. Opcional, ≤200 caracteres.

import { cardStyle } from '@/components/ui'

export const NOTA_MAX = 200

export function NotaVariante({ nota, onNota, children }: { nota: string; onNota: (v: string) => void; children?: React.ReactNode }) {
  return (
    <div style={{ ...cardStyle, padding: 14 }}>
      <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600 }}>
        Nota de esta variante (opcional)
        <input
          value={nota}
          onChange={(e) => onNota(e.target.value.slice(0, NOTA_MAX))}
          maxLength={NOTA_MAX}
          placeholder="p. ej. probando a nombre del padre"
          style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, minHeight: 44, background: 'var(--surface)', color: 'var(--text)', width: '100%', fontWeight: 400 }}
        />
      </label>
      <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
        Sale en «Presupuestos de este riesgo» para saber qué se probó en cada una.
      </span>
      {children}
    </div>
  )
}
