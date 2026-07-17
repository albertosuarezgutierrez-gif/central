'use client'
import { useEffect, useState } from 'react'
import AgenteEmpresas from './AgenteEmpresas'

const PAGE = 50
const CUADRANTE: Record<string, { label: string; color: string }> = {
  caza: { label: '🎯 Zona caza', color: 'var(--primary)' },
  declive: { label: '⚠️ Declive', color: 'var(--warning, #b45309)' },
  sano: { label: '😴 Sano', color: 'var(--muted)' },
  ignorar: { label: '🚫 Ignorar', color: 'var(--muted)' },
}

interface PuntoRadar {
  clave: string; concursos: number; disoluciones: number; dificultad: number; cuadrante: string
}
interface Empresa {
  empresa: string; empresaNorm: string; provincia: string | null; score: number; motivo: string
}
interface Datos {
  empresas: Empresa[]; radar: PuntoRadar[]; total: number; provincias: string[]
}

export default function EmpresasClient({ inicial }: { inicial: Datos | null }) {
  const [data, setData] = useState<Datos | null>(inicial)
  const [prov, setProv] = useState('')
  const [visibles, setVisibles] = useState(PAGE)
  const [cargando, setCargando] = useState(false)
  const [ingiriendo, setIngiriendo] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  function recargar(p = prov) {
    setCargando(true)
    const qs = new URLSearchParams()
    if (p) qs.set('provincia', p)
    fetch(`/api/empresas?${qs.toString()}`)
      .then((r) => r.json())
      .then((d: Datos) => {
        setData(d)
        setVisibles(PAGE)
      })
      .catch(() => setAviso('No se pudieron cargar las empresas.'))
      .finally(() => setCargando(false))
  }

  useEffect(() => {
    if (!inicial) recargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function ingestaManual() {
    setIngiriendo(true)
    setAviso(null)
    try {
      const r = await fetch('/api/empresas/ingesta-manual', { method: 'POST' })
      const j = await r.json()
      setAviso(j.ok ? `Ingesta OK: ${j.eventos} eventos del ${j.fecha}.` : `Ingesta con error: ${j.error ?? 'desconocido'}`)
    } catch {
      setAviso('No se pudo lanzar la ingesta.')
    } finally {
      setIngiriendo(false)
      recargar()
    }
  }

  const empresas = data?.empresas ?? []
  const radar = data?.radar ?? []
  const provincias = data?.provincias ?? []

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: '0 auto', color: 'var(--text)' }}>
      <h1 style={{ fontSize: 22, margin: '4px 0' }}>Empresas en dificultad</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 0 }}>
        Feed de eventos de dificultad (BORME) por provincia. Fase 1 (gratis). El filtro de facturación llega con el enriquecimiento (Fase 2).
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
        <select
          value={prov}
          onChange={(e) => {
            setProv(e.target.value)
            recargar(e.target.value)
          }}
          style={{ minHeight: 44, padding: '0 10px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
        >
          <option value="">Todas las provincias</option>
          {provincias.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button
          onClick={ingestaManual}
          disabled={ingiriendo}
          style={{ minHeight: 44, padding: '0 14px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--primary)', color: '#fff', cursor: ingiriendo ? 'default' : 'pointer' }}
        >
          {ingiriendo ? 'Actualizando…' : 'Actualizar BORME (hoy)'}
        </button>
      </div>

      {aviso && <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{aviso}</div>}

      <AgenteEmpresas provincia={prov} />

      <h2 style={{ fontSize: 16, marginTop: 16 }}>Radar por provincia</h2>
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520, fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={{ padding: 10 }}>Provincia</th>
              <th style={{ padding: 10 }}>Concursos</th>
              <th style={{ padding: 10 }}>Disoluciones</th>
              <th style={{ padding: 10 }}>Dificultad</th>
              <th style={{ padding: 10 }}>Cuadrante</th>
            </tr>
          </thead>
          <tbody>
            {radar.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 12, color: 'var(--muted)' }}>Sin datos todavía. Pulsa «Actualizar BORME».</td></tr>
            )}
            {radar.map((r) => (
              <tr key={r.clave} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: 10 }}>{r.clave}</td>
                <td style={{ padding: 10 }}>{r.concursos}</td>
                <td style={{ padding: 10 }}>{r.disoluciones}</td>
                <td style={{ padding: 10 }}>{r.dificultad}</td>
                <td style={{ padding: 10, color: CUADRANTE[r.cuadrante]?.color }}>{CUADRANTE[r.cuadrante]?.label ?? r.cuadrante}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, marginTop: 20 }}>
        Empresas ({empresas.length}){cargando ? ' · cargando…' : ''}
      </h2>
      <div style={{ opacity: cargando ? 0.5 : 1, display: 'grid', gap: 8 }}>
        {empresas.length === 0 && !cargando && (
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>Sin empresas en el periodo. Pulsa «Actualizar BORME» para ingerir el día.</div>
        )}
        {empresas.slice(0, visibles).map((e) => (
          <div key={e.empresaNorm} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12, background: 'var(--surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong>{e.empresa}</strong>
              <span style={{ fontWeight: 700, color: e.score >= 70 ? 'var(--primary)' : 'var(--muted)' }}>{e.score}/100</span>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>{e.provincia ?? '—'} · {e.motivo}</div>
          </div>
        ))}
      </div>
      {empresas.length > visibles && (
        <button
          onClick={() => setVisibles((v) => v + 100)}
          style={{ marginTop: 12, minHeight: 44, padding: '0 14px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}
        >
          Ver más ({empresas.length - visibles} restantes)
        </button>
      )}
    </div>
  )
}
