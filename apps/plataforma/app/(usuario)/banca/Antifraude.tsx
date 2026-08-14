'use client'
import { useState } from 'react'
import { eur } from '@/lib/dinero'

// 🚨 Cargos raros / antifraude (bajo demanda). Pide a /api/banca/antifraude que revise los cargos del
// periodo con REGLAS deterministas (no IA — para dinero es más fiable): posible cobro doble, comercio
// nunca visto con importe alto, subida fuerte de un recurrente, y cargos financieros. Solo avisa.
type Aviso = { tipo: 'doble' | 'nuevo' | 'subida' | 'financiero'; comercio: string; importe: number; fecha: string | null; motivo: string }
type Resultado = { avisos: Aviso[]; revisados?: number; nota?: string }

const TIPO_LABEL: Record<Aviso['tipo'], { icon: string; label: string }> = {
  doble: { icon: '🔁', label: 'Posible cobro doble' },
  nuevo: { icon: '🆕', label: 'Comercio nuevo' },
  subida: { icon: '📈', label: 'Subió de precio' },
  financiero: { icon: '💸', label: 'Cargo financiero' },
}

export default function Antifraude({ desde, hasta, periodoLabel }: {
  desde: string; hasta: string; periodoLabel: string
}) {
  const [estado, setEstado] = useState<'idle' | 'cargando' | 'listo'>('idle')
  const [res, setRes] = useState<Resultado | null>(null)

  async function revisar() {
    setEstado('cargando'); setRes(null)
    try {
      const r = await fetch('/api/banca/antifraude', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desde, hasta }),
      })
      setRes(await r.json() as Resultado)
    } catch {
      setRes({ avisos: [], nota: 'No se pudo completar la revisión.' })
    } finally { setEstado('listo') }
  }

  return (
    <section style={{ marginBottom: '32px' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <strong style={{ fontSize: '15px' }}>🚨 Cargos raros</strong>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Cobros dobles, comercios nuevos y subidas fuera de lo normal · {periodoLabel}</div>
          </div>
          <button onClick={revisar} disabled={estado === 'cargando'}
            style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', cursor: estado === 'cargando' ? 'default' : 'pointer', background: 'var(--primary)', color: '#fff', fontSize: '13px', fontWeight: 600, opacity: estado === 'cargando' ? 0.6 : 1 }}>
            {estado === 'cargando' ? 'Revisando…' : estado === 'listo' ? '↻ Volver a revisar' : '🚨 Revisar cargos raros'}
          </button>
        </div>

        {res && (
          <div style={{ marginTop: '14px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            {/* La nota puede convivir con los avisos: dice qué NO se ha podido revisar (p. ej. sin
                histórico previo no se sabe qué comercio es nuevo). Ocultar los avisos cuando hay
                nota escondía hallazgos reales; ocultar la nota haría pasar un hueco por un "ok". */}
            {res.nota && (
              <div style={{ fontSize: '13px', color: 'var(--text)', background: 'var(--warning-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px', marginBottom: res.avisos.length ? '10px' : 0 }}>
                ⚠️ {res.nota}
              </div>
            )}
            {res.avisos.length === 0 ? (!res.nota &&
              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                Nada raro entre los cargos del periodo{typeof res.revisados === 'number' ? ` (revisé ${res.revisados})` : ''}. 👍
              </div>
            ) : (
              <>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '10px' }}>
                  Revisión por reglas (no IA). Orientativo — confírmalo tú.
                </div>
                {res.avisos.map((a, i) => {
                  const t = TIPO_LABEL[a.tipo]
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, flexShrink: 0, padding: '2px 8px', borderRadius: '999px', background: 'var(--primary-light)', color: 'var(--text)' }}>
                        {t.icon} {t.label}
                      </span>
                      <div style={{ flex: 1, minWidth: '140px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.comercio}</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{a.fecha ? `${a.fecha} · ` : ''}{a.motivo}</div>
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 700, flexShrink: 0, textAlign: 'right' }}>{eur(a.importe)}</div>
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
