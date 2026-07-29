'use client'
import { useState } from 'react'
import { eur } from '@/lib/dinero'

// ✂️ Fugas en recurrentes (bajo demanda). Pide a /api/banca/fugas que revise los GASTOS recurrentes
// que ya detecta la tesorería y marque los que parecen suscripciones/servicios prescindibles o
// renegociables, con el coste ANUAL. La IA solo sugiere; Alberto decide qué cancelar/renegociar.
type Fuga = { concepto: string; importeMes: number; costeAnual: number; tipo: 'cancelar' | 'renegociar'; motivo: string }
type Resultado = { fugas: Fuga[]; ahorroAnual?: number; revisados?: number; nota?: string }

export default function FugasRecurrentes({ periodoLabel }: { periodoLabel: string }) {
  const [estado, setEstado] = useState<'idle' | 'cargando' | 'listo'>('idle')
  const [res, setRes] = useState<Resultado | null>(null)

  async function buscar() {
    setEstado('cargando'); setRes(null)
    try {
      const r = await fetch('/api/banca/fugas', { method: 'POST' })
      setRes(await r.json() as Resultado)
    } catch {
      setRes({ fugas: [], nota: 'No se pudo completar la búsqueda.' })
    } finally { setEstado('listo') }
  }

  return (
    <section style={{ marginBottom: '32px' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <strong style={{ fontSize: '15px' }}>✂️ Fugas en recurrentes</strong>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Suscripciones y recibos que quizá puedas cancelar o renegociar · {periodoLabel}</div>
          </div>
          <button onClick={buscar} disabled={estado === 'cargando'}
            style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', cursor: estado === 'cargando' ? 'default' : 'pointer', background: 'var(--primary)', color: '#fff', fontSize: '13px', fontWeight: 600, opacity: estado === 'cargando' ? 0.6 : 1 }}>
            {estado === 'cargando' ? 'Buscando…' : estado === 'listo' ? '↻ Volver a buscar' : '✂️ Buscar fugas de dinero'}
          </button>
        </div>

        {res && (
          <div style={{ marginTop: '14px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            {res.nota ? (
              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>{res.nota}</div>
            ) : res.fugas.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                No he encontrado fugas claras entre tus gastos recurrentes{typeof res.revisados === 'number' ? ` (revisé ${res.revisados})` : ''}. 👍
              </div>
            ) : (
              <>
                <div style={{ fontSize: '13px', marginBottom: '10px' }}>
                  Encontré <strong>{res.fugas.length}</strong> posible{res.fugas.length === 1 ? '' : 's'} fuga{res.fugas.length === 1 ? '' : 's'}
                  {typeof res.ahorroAnual === 'number' && res.ahorroAnual > 0 && (
                    <> · ahorro potencial <strong style={{ color: 'var(--positive)' }}>{eur(res.ahorroAnual)}/año</strong></>
                  )}.
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>Sugerencias de la IA — decides tú. Orientativo.</div>
                </div>
                {res.fugas.map((f, i) => (
                  <div key={f.concepto + i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, flexShrink: 0, padding: '2px 8px', borderRadius: '999px', background: 'var(--primary-light)', color: 'var(--text)' }}>
                      {f.tipo === 'cancelar' ? '🚫 Cancelar' : '🤝 Renegociar'}
                    </span>
                    <div style={{ flex: 1, minWidth: '140px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.concepto}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{f.motivo}</div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700 }}>{eur(f.costeAnual)}<span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}>/año</span></div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{eur(f.importeMes)}/vez</div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
