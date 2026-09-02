'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useCallback, useTransition } from 'react'
import GastosTab from '../GastosTab'
import { eur } from '@/lib/dinero'
import { BtnLink, PageHeader } from '@/components/ui'
import { Receipt } from 'lucide-react'

function fmt(n: number) {
  return eur(n)
}

type Props = {
  year: number
  quarter: number
  desde: string
  hasta: string
}

type PeriodoMode = 'trimestre' | 'mes' | 'rango'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export default function GastosPageClient({ year: initYear, quarter: initQuarter, desde: initDesde, hasta: initHasta }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [year, setYear] = useState(initYear)
  const [quarter, setQuarter] = useState(initQuarter)
  const [modo, setModo] = useState<PeriodoMode>(initDesde ? 'rango' : initQuarter > 0 ? 'trimestre' : 'trimestre')
  const [mes, setMes] = useState(() => {
    if (initDesde) {
      const m = parseInt(initDesde.slice(5, 7))
      return m || new Date().getMonth() + 1
    }
    return new Date().getMonth() + 1
  })
  const [desde, setDesde] = useState(initDesde || '')
  const [hasta, setHasta] = useState(initHasta || '')

  // Años disponibles (aprox)
  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear - 1, currentYear - 2].filter(y => y >= 2023)

  function buildUrl(y: number, q: number, d?: string, h?: string) {
    const p = new URLSearchParams()
    p.set('year', String(y))
    p.set('quarter', String(q))
    if (d) p.set('desde', d)
    if (h) p.set('hasta', h)
    return `/finanzas/gastos?${p}`
  }

  function navegarTrimestre(y: number, q: number) {
    setYear(y); setQuarter(q); setDesde(''); setHasta('')
    startTransition(() => router.push(buildUrl(y, q), { scroll: false }))
  }

  function navegarMes(y: number, m: number) {
    const mesStr = String(m).padStart(2, '0')
    const lastDay = new Date(y, m, 0).getDate()
    const d = `${y}-${mesStr}-01`
    const h = `${y}-${mesStr}-${lastDay}`
    setYear(y); setMes(m); setDesde(d); setHasta(h); setQuarter(0)
    startTransition(() => router.push(buildUrl(y, 0, d, h), { scroll: false }))
  }

  function navegarRango() {
    if (!desde || !hasta) return
    startTransition(() => router.push(buildUrl(year, 0, desde, hasta), { scroll: false }))
  }

  // Parámetros efectivos para GastosTab
  const efectivoYear = year
  const efectivoQuarter = (modo === 'trimestre') ? quarter : 0
  const efectivoDesde = (modo !== 'trimestre') ? desde : ''
  const efectivoHasta = (modo !== 'trimestre') ? hasta : ''

  const periodoLabel = modo === 'trimestre'
    ? (quarter === 0 ? `Año ${year}` : `Q${quarter} ${year}`)
    : modo === 'mes'
    ? `${MESES[(mes - 1)]} ${year}`
    : (desde && hasta ? `${desde} → ${hasta}` : 'Rango')

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 16px' }}>

      {/* Header */}
      <PageHeader
        titulo="Control de gastos"
        icono={<Receipt size={20} strokeWidth={1.75} />}
        acciones={<>
          <select
            value={year}
            onChange={e => {
              const y = parseInt(e.target.value)
              if (modo === 'trimestre') navegarTrimestre(y, quarter)
              else if (modo === 'mes') navegarMes(y, mes)
              else setYear(y)
            }}
            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px' }}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {isPending && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Cargando…</span>}
        </>}
      />

      {/* Filtros de periodo */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px', marginBottom: '20px' }}>
        {/* Selector de modo */}
        <div className="gastos-modo-pills" style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
          {(['trimestre', 'mes', 'rango'] as PeriodoMode[]).map(m => (
            <button
              key={m}
              onClick={() => setModo(m)}
              style={{
                padding: '5px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                border: '1px solid var(--border)',
                background: modo === m ? 'var(--primary)' : 'var(--surface)',
                color: modo === m ? '#fff' : 'var(--text)',
                fontWeight: modo === m ? 700 : 400,
                textTransform: 'capitalize',
              }}
            >{m === 'trimestre' ? 'Por trimestre' : m === 'mes' ? 'Por mes' : 'Rango libre'}</button>
          ))}
        </div>

        {modo === 'trimestre' && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(['Año', 'Q1', 'Q2', 'Q3', 'Q4'] as const).map((label, i) => (
              <button
                key={i}
                onClick={() => navegarTrimestre(year, i)}
                style={{
                  padding: '5px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                  border: '1px solid var(--border)',
                  background: quarter === i ? 'var(--primary)' : 'var(--surface)',
                  color: quarter === i ? '#fff' : 'var(--text)',
                  fontWeight: quarter === i ? 700 : 400,
                }}
              >{label}</button>
            ))}
          </div>
        )}

        {modo === 'mes' && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {MESES.map((m, i) => (
              <button
                key={i}
                onClick={() => navegarMes(year, i + 1)}
                style={{
                  padding: '5px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                  border: '1px solid var(--border)',
                  background: mes === i + 1 ? 'var(--primary)' : 'var(--surface)',
                  color: mes === i + 1 ? '#fff' : 'var(--text)',
                  fontWeight: mes === i + 1 ? 700 : 400,
                }}
              >{m}</button>
            ))}
          </div>
        )}

        {modo === 'rango' && (
          <div className="gastos-filtros" style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Desde</label>
              <input
                type="date"
                value={desde}
                onChange={e => setDesde(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Hasta</label>
              <input
                type="date"
                value={hasta}
                onChange={e => setHasta(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px' }}
              />
            </div>
            <button
              onClick={navegarRango}
              disabled={!desde || !hasta}
              style={{
                padding: '7px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                background: 'var(--primary)', color: '#fff', fontSize: '13px', fontWeight: 600,
                opacity: (!desde || !hasta) ? 0.5 : 1,
              }}
            >Aplicar</button>
          </div>
        )}

        <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--muted)' }}>
          Periodo: <strong style={{ color: 'var(--text)' }}>{periodoLabel}</strong>
        </div>
      </div>

      {/* Export */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <BtnLink
          href={`/api/finanzas/gastos/export?year=${efectivoYear}&quarter=${efectivoQuarter}${efectivoDesde ? `&desde=${efectivoDesde}&hasta=${efectivoHasta}` : ''}`}
          variante="primario"
          tam="sm"
        >
          ⬇ CSV para la asesoría
        </BtnLink>
      </div>

      {/* GastosTab con parámetros del filtro */}
      <GastosTab
        year={efectivoYear}
        quarter={efectivoQuarter}
        desde={efectivoDesde || undefined}
        hasta={efectivoHasta || undefined}
      />
    </main>
  )
}
