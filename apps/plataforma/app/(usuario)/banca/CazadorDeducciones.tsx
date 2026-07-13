'use client'
import { useState } from 'react'
import { eur } from '@/lib/dinero'

// 🧾 Cazador de deducciones (bajo demanda). Pide a /api/banca/cazador-deducciones que revise los gastos
// PERSONALES del periodo y marque los que parecen deducibles (negocio/pisos), con el ahorro fiscal
// estimado. La IA solo SUGIERE: Alberto aplica la reclasificación por candidato (POST /api/banca/destino,
// que aprende regla y reaplica a los iguales, igual que el libro). No corre en cada carga.
type Candidato = {
  id: string; fecha: string | null; concepto: string; banco: string; importe: number
  bucketSugerido: 'negocio' | 'renta'; destinoSugerido: 'turistico_pisos' | null; motivo: string
}
type Caza = {
  candidatos: Candidato[]; totalDeducible: number; ahorroEstimado: number; tramoMarginal: number
  analizados: number; revisadosTotal: number; nota?: string
}
// Mismos destinos que el libro (sin actividad_pilar, que es de las cuentas de Pilar).
const DESTINOS = ['turistico_pisos', 'turistico_duplex', 'seguros', 'personal'] as const

export default function CazadorDeducciones({ year, quarter, desde, hasta, periodoLabel, destinoLabel }: {
  year: number; quarter: number; desde: string; hasta: string; periodoLabel: string
  destinoLabel: Record<string, string>
}) {
  const [estado, setEstado] = useState<'idle' | 'cargando' | 'listo'>('idle')
  const [caza, setCaza] = useState<Caza | null>(null)
  const [aplicados, setAplicados] = useState<Record<string, string>>({})   // id → destino aplicado

  async function buscar() {
    setEstado('cargando'); setCaza(null); setAplicados({})
    try {
      const res = await fetch('/api/banca/cazador-deducciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, quarter, desde, hasta }),
      })
      setCaza(await res.json() as Caza)
    } catch {
      setCaza({ candidatos: [], totalDeducible: 0, ahorroEstimado: 0, tramoMarginal: 0, analizados: 0, revisadosTotal: 0, nota: 'No se pudo completar la búsqueda.' })
    } finally { setEstado('listo') }
  }

  async function aplicar(id: string, destino: string) {
    setAplicados(prev => ({ ...prev, [id]: destino }))
    await fetch('/api/banca/destino', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, destino }),
    }).catch(() => setAplicados(prev => { const n = { ...prev }; delete n[id]; return n }))
  }

  const pendientes = caza?.candidatos.filter(c => !aplicados[c.id]) ?? []

  return (
    <section style={{ marginBottom: '32px' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <strong style={{ fontSize: '15px' }}>🧾 Cazador de deducciones</strong>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Gastos personales del periodo que quizá sean deducibles · {periodoLabel}</div>
          </div>
          <button onClick={buscar} disabled={estado === 'cargando'}
            style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', cursor: estado === 'cargando' ? 'default' : 'pointer', background: 'var(--primary)', color: '#fff', fontSize: '13px', fontWeight: 600, opacity: estado === 'cargando' ? 0.6 : 1 }}>
            {estado === 'cargando' ? 'Buscando…' : estado === 'listo' ? '↻ Volver a buscar' : '🧾 Buscar deducciones que se me escapan'}
          </button>
        </div>

        {caza && (
          <div style={{ marginTop: '14px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            {caza.nota ? (
              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>{caza.nota}</div>
            ) : caza.candidatos.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                No he encontrado gastos personales que parezcan deducibles en este periodo (revisé {caza.analizados} de {caza.revisadosTotal}). 👍
              </div>
            ) : (
              <>
                <div style={{ fontSize: '13px', marginBottom: '10px' }}>
                  Encontré <strong>{caza.candidatos.length}</strong> gasto{caza.candidatos.length === 1 ? '' : 's'} que podría{caza.candidatos.length === 1 ? '' : 'n'} ser deducible{caza.candidatos.length === 1 ? '' : 's'}:
                  {' '}<strong>{eur(caza.totalDeducible)}</strong> deducible → ahorro estimado <strong style={{ color: 'var(--positive)' }}>{eur(caza.ahorroEstimado)}</strong>
                  {' '}<span style={{ color: 'var(--muted)' }}>(tramo {(caza.tramoMarginal * 100).toFixed(0)}%)</span>.
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>Sugerencias de la IA — confírmalas tú; al aplicar, el sistema aprende y lo reaplica a los iguales. Orientativo, no sustituye a tu gestor.</div>
                </div>
                {pendientes.length === 0 && (
                  <div style={{ fontSize: '13px', color: 'var(--positive)' }}>✅ Aplicadas todas las sugerencias.</div>
                )}
                {caza.candidatos.map(c => {
                  const hecho = aplicados[c.id]
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderTop: '1px solid var(--border)', opacity: hecho ? 0.5 : 1, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', width: '72px', flexShrink: 0 }}>{c.fecha || '—'}</div>
                      <div style={{ flex: 1, minWidth: '140px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.concepto}</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                          {c.bucketSugerido === 'renta' ? '🏖️ Parece de los pisos' : '🏢 Parece de la actividad'} · {c.motivo}
                        </div>
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, width: '84px', textAlign: 'right', flexShrink: 0 }}>{eur(c.importe)}</div>
                      {hecho ? (
                        <span style={{ fontSize: '12px', color: 'var(--positive)', flexShrink: 0, width: '150px', textAlign: 'right' }}>✅ {destinoLabel[hecho] || hecho}</span>
                      ) : (
                        <select defaultValue={c.destinoSugerido || ''} onChange={e => { if (e.target.value) aplicar(c.id, e.target.value) }}
                          title="Reclasificar el negocio de este movimiento"
                          style={{ padding: '5px 6px', fontSize: '12px', flexShrink: 0, maxWidth: '150px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
                          <option value="">Aplicar a…</option>
                          {DESTINOS.map(d => <option key={d} value={d}>{destinoLabel[d] || d}</option>)}
                        </select>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
