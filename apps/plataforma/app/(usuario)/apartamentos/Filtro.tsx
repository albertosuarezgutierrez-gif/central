'use client'
import { useRouter, useSearchParams } from 'next/navigation'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export default function Filtro({ year, month }: { year: number; month: number | null }) {
  const router = useRouter()
  const sp = useSearchParams()
  const now = new Date()
  const years = [now.getFullYear() + 1, now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2]

  const update = (key: 'year' | 'month', value: string) => {
    const params = new URLSearchParams(sp.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`/apartamentos?${params.toString()}`)
  }

  const sel: React.CSSProperties = {
    fontSize: '13px', color: 'var(--text)', background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', outline: 'none', cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <select value={year} onChange={e => update('year', e.target.value)} style={sel}>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <select value={month ?? ''} onChange={e => update('month', e.target.value)} style={sel}>
        <option value="">Año completo</option>
        {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
      </select>
    </div>
  )
}
