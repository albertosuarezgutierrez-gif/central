'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { calcularEstado, type EstadoFactura } from '@/lib/sivra/facturas-control'
import { eur } from '@/lib/dinero'

type ProvRow = {
  id: string; label: string; destino: string; importeAprox: string
  driveUrl: string | null; importe: number | null; diaHabitual?: number | null
}

const BADGE: Record<EstadoFactura, { icon: string; label: string; bg: string; color: string }> = {
  ok:        { icon: '✅', label: 'En Drive',  bg: '#f0fdf4', color: '#166534' },
  pendiente: { icon: '⏳', label: 'En plazo',  bg: '#fefce8', color: '#854d0e' },
  falta:     { icon: '❌', label: 'Falta',     bg: '#fef2f2', color: '#991b1b' },
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const DESTINO_LABEL: Record<string, string> = {
  turistico_pisos:  'Pisos turísticos',
  turistico_duplex: 'Dúplex',
  personal:         'Personal',
}

export default function FacturasControlPage() {
  const now = new Date()
  const [año, setAño]   = useState(now.getFullYear())
  const [mes, setMes]   = useState(now.getMonth() + 1)
  const [rows, setRows] = useState<ProvRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [msg, setMsg]   = useState<{ id: string; text: string; ok: boolean } | null>(null)
  const [narrow, setNarrow] = useState(false)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Móvil: pintamos tarjetas apiladas en vez de la tabla (que se corta por la derecha).
  // Se decide tras montar para no duplicar los <input file> por fila (colisión de refs).
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const sync = () => setNarrow(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/sivra/facturas-control?año=${año}&mes=${mes}`)
      const d = await r.json()
      setRows(d.proveedores || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [año, mes])

  useEffect(() => { load() }, [load])

  const handleUpload = async (provId: string, file: File, importe: string) => {
    setUploading(provId)
    setMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('proveedor', provId)
      fd.append('año', String(año))
      fd.append('mes', String(mes))
      if (importe) fd.append('importe', importe)
      const r = await fetch('/api/sivra/facturas-control', { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error')
      setMsg({ id: provId, text: 'Subido a Drive ✓', ok: true })
      await load()
    } catch (e: unknown) {
      setMsg({ id: provId, text: e instanceof Error ? e.message : 'Error', ok: false })
    }
    setUploading(null)
  }

  const counts = {
    ok:        rows.filter(r => calcularEstado(r.driveUrl, año, mes) === 'ok').length,
    falta:     rows.filter(r => calcularEstado(r.driveUrl, año, mes) === 'falta').length,
    pendiente: rows.filter(r => calcularEstado(r.driveUrl, año, mes) === 'pendiente').length,
  }

  // Acción de subida (input file oculto + botón + mensaje) — compartida por tabla y tarjetas.
  const renderAccion = (row: ProvRow, estado: EstadoFactura) => {
    if (estado === 'ok') return null
    const isUp   = uploading === row.id
    const rowMsg = msg?.id === row.id ? msg : null
    return (
      <>
        <input
          type="file"
          accept=".pdf,application/pdf"
          ref={el => { fileRefs.current[row.id] = el }}
          style={{ display: 'none' }}
          onChange={async e => {
            const file = e.target.files?.[0]
            if (!file) return
            const importe = prompt('Importe (€, opcional):') || ''
            await handleUpload(row.id, file, importe)
            e.target.value = ''
          }}
        />
        <button
          onClick={() => fileRefs.current[row.id]?.click()}
          disabled={isUp}
          style={{ padding: '5px 12px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: isUp ? 'not-allowed' : 'pointer', opacity: isUp ? 0.6 : 1 }}
        >
          {isUp ? 'Subiendo…' : '📎 Subir PDF'}
        </button>
        {rowMsg && (
          <div style={{ fontSize: 11, marginTop: 4, color: rowMsg.ok ? '#166534' : '#991b1b' }}>{rowMsg.text}</div>
        )}
      </>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Control de facturas
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={mes}
            onChange={e => setMes(Number(e.target.value))}
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: '#fff', cursor: 'pointer' }}
          >
            {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={año}
            onChange={e => setAño(Number(e.target.value))}
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: '#fff', cursor: 'pointer' }}
          >
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {!loading && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {counts.ok > 0 && <Chip label={`${counts.ok} en Drive`} bg="#f0fdf4" color="#166534" />}
          {counts.falta > 0 && <Chip label={`${counts.falta} ${counts.falta === 1 ? 'falta' : 'faltan'}`} bg="#fef2f2" color="#991b1b" />}
          {counts.pendiente > 0 && <Chip label={`${counts.pendiente} en plazo`} bg="#fefce8" color="#854d0e" />}
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, fontSize: 13, color: 'var(--muted)' }}>Cargando…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 24, fontSize: 13, color: 'var(--muted)' }}>Sin proveedores esperados este mes.</div>
        ) : narrow ? (
          // Móvil: tarjetas apiladas (la tabla de 5 columnas no cabe a 320-640px).
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {rows.map(row => {
              const estado = calcularEstado(row.driveUrl, año, mes)
              const badge  = BADGE[estado]
              const accion = renderAccion(row, estado)
              return (
                <div key={row.id} style={{ padding: 14, borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14, minWidth: 0 }}>
                      {row.driveUrl
                        ? <a href={row.driveUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>{row.label}</a>
                        : row.label}
                    </div>
                    <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: badge.bg, color: badge.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {badge.icon} {badge.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    <span>{DESTINO_LABEL[row.destino] ?? row.destino}</span>
                    {row.diaHabitual != null && <span>~{row.diaHabitual} {MESES[mes - 1].slice(0, 3).toLowerCase()}</span>}
                    <span>{row.importe != null ? eur(row.importe) : row.importeAprox}</span>
                  </div>
                  {accion && <div>{accion}</div>}
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.02)' }}>
                  {['Estado', 'Proveedor', 'Destino', 'Importe aprox.', 'Acción'].map(col => (
                    <th key={col} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const estado = calcularEstado(row.driveUrl, año, mes)
                  const badge  = BADGE[estado]
                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: badge.bg, color: badge.color, whiteSpace: 'nowrap' }}>
                          {badge.icon} {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--text)' }}>
                        {row.driveUrl
                          ? <a href={row.driveUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>{row.label}</a>
                          : row.label}
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 8 }}>
                          {row.diaHabitual != null && <span>~{row.diaHabitual} {MESES[mes - 1].slice(0, 3).toLowerCase()}</span>}
                          {row.importe != null && <span>{eur(row.importe)}</span>}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>
                        {DESTINO_LABEL[row.destino] ?? row.destino}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{row.importeAprox}</td>
                      <td style={{ padding: '10px 14px' }}>{renderAccion(row, estado)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Chip({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{ padding: '4px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: bg, color }}>
      {label}
    </span>
  )
}
