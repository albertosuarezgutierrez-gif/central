'use client'
import { useState } from 'react'
import { Activity } from 'lucide-react'
import Bloque from './Bloque'
import { etiquetaSemana, type TablaLineaBase } from '@/lib/linea-base-correduria'

/**
 * Línea base semanal (§N.2 de ASegura OS): cuánto trabajo entra y cuánto se hace a mano, semana a
 * semana, ANTES de automatizar. «—» = esa semana no se medía o no se pudo leer; nunca es 0.
 * Se carga al abrir: es para mirar de vez en cuando, no en cada visita.
 */
const celda = { padding: '6px 8px', textAlign: 'right' as const, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' as const }

function esTabla(v: unknown): v is TablaLineaBase {
  const t = v as TablaLineaBase | null
  return !!t && Array.isArray(t.semanas) && Array.isArray(t.filas) && Array.isArray(t.automatica) && Array.isArray(t.avisos)
}

export default function LineaBase() {
  const [tabla, setTabla] = useState<TablaLineaBase | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function cargar() {
    if (tabla || cargando) return
    setCargando(true); setError(null)
    const res = await fetch('/api/correduria/linea-base', { cache: 'no-store' }).catch(() => null)
    const j = (res ? await res.json().catch(() => null) : null) as { tabla?: unknown } | null
    if (res?.ok && esTabla(j?.tabla)) setTabla(j.tabla)
    else setError('No se ha podido leer la línea base. No significa que no haya actividad.')
    setCargando(false)
  }

  return (
    <Bloque Icono={Activity} titulo="Línea base semanal"
      sub="Lo que entra y lo que se hace a mano cada semana, para medir si la automatización ahorra trabajo de verdad. «—» es «no se medía todavía», no cero.">
      <details onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) void cargar() }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, minHeight: 44, display: 'flex', alignItems: 'center' }}>
          Ver las últimas semanas
        </summary>
        {cargando && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Cargando…</p>}
        {error && <p style={{ fontSize: 13, color: 'var(--warning)' }}>{error}</p>}
        {tabla && (
          <>
            {tabla.avisos.map((a) => <p key={a} style={{ fontSize: 13, color: 'var(--warning)', margin: '0 0 6px' }}>{a}</p>)}
            <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 560, width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...celda, textAlign: 'left' }}>Semana del lunes</th>
                    {tabla.semanas.map((s) => <th key={s} style={celda}>{etiquetaSemana(s)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {tabla.filas.map((f) => (
                    <tr key={f.id}>
                      <td style={{ ...celda, textAlign: 'left', whiteSpace: 'normal' }}>{f.etiqueta}</td>
                      {f.celdas.map((c, i) => (
                        <td key={tabla.semanas[i]} style={{ ...celda, color: c.n === null ? 'var(--muted)' : undefined }}
                          title={c.n === null ? 'No se medía todavía o no se pudo leer' : c.parcial ? 'Semana incompleta' : undefined}>
                          {c.n === null ? '—' : c.parcial ? `${c.n}*` : c.n}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...celda, textAlign: 'left', whiteSpace: 'normal', fontWeight: 600 }}>Hecho por el sistema</td>
                    {tabla.automatica.map((p, i) => (
                      <td key={tabla.semanas[i]} style={{ ...celda, fontWeight: 600, color: p === null ? 'var(--muted)' : undefined }}>
                        {p === null ? '—' : `${Math.round(p * 100)} %`}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>
              * semana incompleta (la en curso o la primera que se midió). Los minutos que dedicas a cada proceso no se miden:
              haría falta cronometrarlos; la señal que sí hay son los cambios hechos a mano.
            </p>
          </>
        )}
      </details>
    </Bloque>
  )
}
