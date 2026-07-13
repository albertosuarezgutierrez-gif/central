'use client'
import { useState } from 'react'
import { eur } from '@/lib/dinero'

// 📈 Benchmark entre pisos: compara la rentabilidad de los pisos turísticos del mes sobre el P&L que
// ya calcula la página (getPLMensual). Todo se pinta en cliente con los datos que llegan por props
// (cero fetch extra); solo la LECTURA en lenguaje natural es bajo demanda (botón → IA gratis).
type PisoBench = {
  propertyId: string
  nombre: string
  reservas: number
  ingresos: number
  gastosTotal: number
  resultado: number
  margen: number
}

export default function BenchmarkPisos({ pisos, mes, periodoLabel }: {
  pisos: PisoBench[]
  mes: string
  periodoLabel: string
}) {
  const [estado, setEstado] = useState<'idle' | 'cargando' | 'listo'>('idle')
  const [texto, setTexto] = useState('')

  // Menos de 2 pisos: no hay nada que comparar.
  if (pisos.length < 2) return null

  async function leerIA() {
    setEstado('cargando'); setTexto('')
    try {
      const res = await fetch('/api/banca/benchmark-pisos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes }),
      })
      const data = await res.json().catch(() => ({})) as { texto?: string }
      setTexto(data.texto || 'No se pudo obtener la lectura.')
    } catch {
      setTexto('No se pudo obtener la lectura. Inténtalo de nuevo.')
    } finally {
      setEstado('listo')
    }
  }

  // Orden: mayor margen primero. La barra se escala al margen máximo (positivo) del conjunto.
  const orden = pisos.slice().sort((a, b) => b.margen - a.margen)
  const lider = orden[0]
  const rezagado = orden[orden.length - 1]
  const maxMargen = Math.max(...orden.map(p => p.margen), 1)
  const margenMedio = orden.reduce((s, p) => s + p.margen, 0) / orden.length
  const resultadoTotal = orden.reduce((s, p) => s + p.resultado, 0)

  return (
    <section style={{ marginBottom: '32px' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '4px' }}>
          <div>
            <strong style={{ fontSize: '15px' }}>📈 Benchmark entre pisos</strong>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Qué piso rinde más y cuál arrastra · {periodoLabel}</div>
          </div>
          <button onClick={leerIA} disabled={estado === 'cargando'}
            style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)', cursor: estado === 'cargando' ? 'default' : 'pointer', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px', fontWeight: 600, opacity: estado === 'cargando' ? 0.6 : 1 }}>
            {estado === 'cargando' ? 'Leyendo…' : estado === 'listo' ? '↻ Volver a leer' : '✨ Lectura IA'}
          </button>
        </div>

        {/* Resumen de cabecera */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--muted)', margin: '10px 0 14px' }}>
          <span>Margen medio <strong style={{ color: 'var(--text)' }}>{margenMedio.toFixed(0)}%</strong></span>
          <span>Resultado del mes <strong style={{ color: resultadoTotal >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{eur(resultadoTotal)}</strong></span>
          <span>🥇 Líder <strong style={{ color: 'var(--text)' }}>{lider.nombre}</strong> ({lider.margen.toFixed(0)}%)</span>
          {rezagado.propertyId !== lider.propertyId && (
            <span>🐢 Arrastra <strong style={{ color: 'var(--text)' }}>{rezagado.nombre}</strong> ({rezagado.margen.toFixed(0)}%)</span>
          )}
        </div>

        {/* Barras por piso, ordenadas por margen */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {orden.map((p, i) => {
            const ancho = Math.max(0, Math.min(100, (p.margen / maxMargen) * 100))
            const color = p.margen < 0 ? 'var(--negative)' : i === 0 ? 'var(--positive)' : 'var(--primary)'
            return (
              <div key={p.propertyId}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', fontSize: '13px', marginBottom: '3px' }}>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {i === 0 ? '🥇 ' : ''}{p.nombre}
                    <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}> · {p.reservas} reserva{p.reservas === 1 ? '' : 's'}</span>
                  </span>
                  <span style={{ flexShrink: 0, fontSize: '12px', color: 'var(--muted)' }}>
                    {eur(p.ingresos)} − {eur(p.gastosTotal)} = <strong style={{ color: p.resultado >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{eur(p.resultado)}</strong>
                    {' '}<strong style={{ color: 'var(--text)' }}>{p.margen.toFixed(0)}%</strong>
                  </span>
                </div>
                <div style={{ height: '8px', background: 'var(--primary-light)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${ancho}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width .2s' }} />
                </div>
              </div>
            )
          })}
        </div>

        {texto && (
          <div style={{ marginTop: '14px', fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text)', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            {texto}
          </div>
        )}
      </div>
    </section>
  )
}
