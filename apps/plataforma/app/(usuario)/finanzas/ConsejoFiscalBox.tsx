// 🧭 "Qué haría yo": bloque presentacional del consejo fiscal breve. Sin estado ni hooks → sirve tanto
// para el server component (/banca?tab=fiscal · FiscalResumen) como para el client component
// (/finanzas/fiscal · DeclaracionBlock). Toda la lógica y las cifras vienen de lib/consejo-fiscal.ts
// (determinista, sin IA): aquí solo se pinta. Va ARRIBA del bloque "Mi declaración", como titular.
import { consejoFiscal, type EntradaConsejo } from '@/lib/consejo-fiscal'

export default function ConsejoFiscalBox({ estado }: { estado: EntradaConsejo }) {
  const c = consejoFiscal(estado, new Date())
  const pagar = c.tono === 'pagar'
  // Cálido si sale a pagar (llama a la acción), verde si devuelven. Mismos hex que el resto del módulo.
  const bg = pagar ? 'var(--warning-bg)' : 'var(--positive-bg)'
  const fg = pagar ? 'var(--warning)' : 'var(--positive)'
  return (
    <div style={{ padding: '12px 14px', background: bg, borderRadius: '8px', color: fg, display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700 }}>🧭 Qué haría yo</div>
      <div style={{ fontSize: '12px' }}>{c.titular}</div>
      {c.acciones.map((a, i) => (
        <div key={i} style={{ fontSize: '12px' }}>{a.icono} <strong>{a.texto}</strong></div>
      ))}
    </div>
  )
}
