'use client'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { CalendarRange } from 'lucide-react'
import { periodoLabel, MESES, type Periodo } from './periodo'

// Selector de intervalo COMPARTIDO de la sección finanzas: Mes / Trimestre / Año / Rango libre.
// La URL es la fuente de estado (?year=&quarter= o ?desde=&hasta=); el server component re-renderiza
// con los datos del nuevo periodo. Extraído del selector de /finanzas/gastos (patrón de referencia)
// para que la Radiografía y el resto de pantallas usen UNA sola implementación.
// Los helpers puros (periodoLabel/MESES/Periodo) viven en ./periodo (SIN 'use client') para que los
// server components puedan usarlos. Se re-exporta SOLO el tipo por compatibilidad; el server que
// necesite periodoLabel() debe importarlo de './periodo' (importar la función de este módulo cliente
// vuelve a romper con "call client function from the server").
export type { Periodo } from './periodo'

type PeriodoMode = 'trimestre' | 'mes' | 'rango'

export default function IntervaloSelector({ basePath, periodo }: { basePath: string; periodo: Periodo }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const initModo: PeriodoMode = periodo.desde
    ? (periodo.desde.slice(8) === '01' && Number(periodo.hasta.slice(8)) >= 28 && periodo.desde.slice(0, 7) === periodo.hasta.slice(0, 7) ? 'mes' : 'rango')
    : 'trimestre'
  const [modo, setModo] = useState<PeriodoMode>(initModo)
  const [year, setYear] = useState(periodo.year)
  const [quarter, setQuarter] = useState(periodo.quarter)
  const [mes, setMes] = useState(periodo.desde ? (Number(periodo.desde.slice(5, 7)) || new Date().getMonth() + 1) : new Date().getMonth() + 1)
  const [desde, setDesde] = useState(periodo.desde || '')
  const [hasta, setHasta] = useState(periodo.hasta || '')

  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear - 1, currentYear - 2].filter(y => y >= 2023)

  function nav(y: number, q: number, d?: string, h?: string) {
    const p = new URLSearchParams()
    p.set('year', String(y)); p.set('quarter', String(q))
    if (d) p.set('desde', d)
    if (h) p.set('hasta', h)
    startTransition(() => router.push(`${basePath}?${p}`, { scroll: false }))
  }

  function navTrimestre(y: number, q: number) {
    setYear(y); setQuarter(q); setDesde(''); setHasta(''); nav(y, q)
  }
  function navMes(y: number, m: number) {
    const mm = String(m).padStart(2, '0')
    const lastDay = new Date(y, m, 0).getDate()
    const d = `${y}-${mm}-01`; const h = `${y}-${mm}-${lastDay}`
    setYear(y); setMes(m); setDesde(d); setHasta(h); setQuarter(0); nav(y, 0, d, h)
  }
  function navRango() {
    if (!desde || !hasta) return
    nav(year, 0, desde, hasta)
  }

  // ─── Por qué DOS estilos y no uno (02/09/2026) ─────────────────────────────────────────────
  // Antes cada botón era una pastilla con su propio borde: 3 modos + 12 meses = quince cajas
  // idénticas apiladas al abrir el panel, con el mismo peso visual que las TARJETAS de datos que
  // vienen justo debajo. Un control de navegación no puede pesar como el contenido que filtra.
  // Ahora el modo es un SEGMENTADO (un solo borde alrededor de los tres, sin bordes dentro) y los
  // meses/trimestres son CHIPS sin borde que solo se rellenan al estar activos.
  const segStyle = (activo: boolean) => ({
    padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
    border: 'none', background: activo ? 'var(--primary)' : 'transparent',
    color: activo ? '#fff' : 'var(--muted)',
    fontWeight: activo ? 700 : 500, whiteSpace: 'nowrap' as const,
  })
  const chipStyle = (activo: boolean) => ({
    padding: '5px 11px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
    border: '1px solid transparent',
    background: activo ? 'var(--primary)' : 'var(--bg)',
    color: activo ? '#fff' : 'var(--text)',
    fontWeight: activo ? 700 : 400,
  })

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
        <div
          className="iv-pills"
          style={{
            display: 'inline-flex', gap: 2, padding: 3, borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--bg)',
          }}
        >
          {(['mes', 'trimestre', 'rango'] as PeriodoMode[]).map(m => (
            <button key={m} onClick={() => setModo(m)} style={segStyle(modo === m)}>
              {m === 'trimestre' ? 'Trimestre / Año' : m === 'mes' ? 'Por mes' : 'Rango libre'}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <select
          value={year}
          onChange={e => { const y = parseInt(e.target.value); if (modo === 'trimestre') navTrimestre(y, quarter); else if (modo === 'mes') navMes(y, mes); else setYear(y) }}
          style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px' }}
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {isPending && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Cargando…</span>}
      </div>

      {modo === 'trimestre' && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(['Año', 'Q1', 'Q2', 'Q3', 'Q4'] as const).map((label, i) => (
            <button key={i} onClick={() => navTrimestre(year, i)} style={chipStyle(quarter === i && !desde)}>{label}</button>
          ))}
        </div>
      )}
      {modo === 'mes' && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {MESES.map((m, i) => (
            <button key={i} onClick={() => navMes(year, i + 1)} style={chipStyle(mes === i + 1 && !!desde)}>{m}</button>
          ))}
        </div>
      )}
      {modo === 'rango' && (
        <div className="iv-filtros" style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px' }} />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px' }} />
          </div>
          <button onClick={navRango} disabled={!desde || !hasta} style={{ padding: '7px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'var(--primary)', color: '#fff', fontSize: '13px', fontWeight: 600, opacity: (!desde || !hasta) ? 0.5 : 1 }}>Aplicar</button>
        </div>
      )}

      <div style={{
        marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)',
        fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <CalendarRange size={13} strokeWidth={1.75} aria-hidden />
        Periodo: <strong style={{ color: 'var(--text)' }}>{periodoLabel(periodo)}</strong>
      </div>
    </div>
  )
}
