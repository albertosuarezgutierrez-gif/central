import Link from 'next/link'
import type { ResumenFinanciero } from '@/lib/finanzas'
import type { EstadoDeclaracion } from '@/lib/comparativa-declaracion'
import { eur } from '@/lib/dinero'

// 🧾 Segmento FISCAL del Inicio unificado (/banca?tab=fiscal). Es la previsión de la declaración de la
// renta que quedó huérfana al fusionar Resumen+Banca: fusiona lo que antes estaba en /finanzas/fiscal y
// /finanzas/proyeccion (mismo motor `calcularEstadoDeclaracion` que /finanzas/fiscal). Server component
// puro (sin estado cliente): la página lo alimenta ya calculado. El bloque fiscal es SIEMPRE del año
// completo (la declaración es anual). Para el detalle completo + deducciones enlaza a /finanzas/fiscal.

type Fiscal = ResumenFinanciero['fiscal']
type ComparativaDecl = EstadoDeclaracion['hoy']

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px',
}

// ── Barra visual de tramos IRPF (fuente única de tramos: servidor) ──
function TramoBar({ tramosIRPF, base }: { tramosIRPF: Fiscal['tramosIRPF']; base: number }) {
  const MAX = 80000
  const COLORES = ['#68d391', '#4fd1c5', '#63b3ed', '#f6ad55', '#fc8181', '#feb2b2']
  const pct = Math.min((base / MAX) * 100, 98)
  return (
    <div>
      <div style={{ position: 'relative', height: '20px', borderRadius: '6px', overflow: 'hidden', display: 'flex', marginTop: '10px' }}>
        {tramosIRPF.map((t, i) => {
          const hasta = Math.min(t.hasta ?? MAX, MAX)
          const width = Math.max(0, ((hasta - t.desde) / MAX) * 100)
          return (
            <div key={i} title={`${(t.tipo * 100).toFixed(0)}%: ${eur(t.desde)} – ${t.hasta ? eur(t.hasta) : '∞'}`}
              style={{ width: `${width}%`, background: COLORES[i] ?? '#e2e8f0', height: '100%' }} />
          )
        })}
        {base > 0 && <div style={{ position: 'absolute', top: 0, bottom: 0, width: '3px', background: '#2d3748', left: `${pct}%` }} />}
      </div>
      {base > 0 && (
        <div style={{ position: 'relative', height: '18px', marginTop: '2px' }}>
          <span style={{ position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)', fontSize: '10px', fontWeight: 700, color: '#2d3748', whiteSpace: 'nowrap' }}>▲ {eur(base)}</span>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
        {tramosIRPF.filter(t => t.importe > 0 || t.desde === 0).map((t, i) => (
          <span key={i} style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', background: COLORES[i] ?? '#e2e8f0' }} />
            {(t.tipo * 100).toFixed(0)}%{t.importe > 0 && <strong> → {eur(t.importe)}</strong>}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── "Mi declaración": un momento (hoy / fin de año) con las dos modalidades (solo yo / conjunta) ──
function MomentoCard({ titulo, sub, c }: { titulo: string; sub: string; c: ComparativaDecl }) {
  const filas = [
    { label: '👤 Solo yo', resultado: c.separada.titular.resultado, base: c.separada.titular.base, recomendada: c.recomendacion === 'separada' },
    { label: '🤝 Conjunta con Pilar', resultado: c.conjunta.resultado, base: c.conjunta.base, recomendada: c.recomendacion === 'conjunta' },
  ]
  return (
    <div style={{ padding: '14px', border: '1px solid var(--border)', borderRadius: '8px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700 }}>{titulo}</div>
      <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '10px' }}>{sub}</div>
      {filas.map(f => (
        <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '6px', marginBottom: '6px', border: `1px solid ${f.recomendada ? 'var(--primary)' : 'var(--border)'}`, background: f.recomendada ? 'var(--primary-light)' : 'transparent' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600 }}>{f.label} {f.recomendada && <span style={{ fontSize: '10px', background: 'var(--primary)', color: '#fff', padding: '1px 6px', borderRadius: '8px' }}>✓ mejor</span>}</div>
            <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Base: {eur(f.base)}</div>
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap', color: f.resultado <= 0 ? 'var(--primary)' : '#e53e3e' }}>
            {f.resultado <= 0 ? 'Devuelven' : 'A pagar'} {eur(Math.abs(f.resultado))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function FiscalResumen({ fiscal, declaracion, year }: {
  fiscal: Fiscal | null
  declaracion: EstadoDeclaracion | null
  year: number
}) {
  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      <style>{`@media (max-width: 768px) { .fiscal-seg-cols { grid-template-columns: 1fr !important; } }`}</style>

      {/* Mi declaración: hoy vs fin de año, solo yo vs conjunta (fusiona Fiscal + Proyección) */}
      {declaracion ? (
        <div style={card}>
          <div style={{ marginBottom: '12px' }}>
            <strong>🧾 Mi declaración {declaracion.year} — cómo voy y cómo acabaría</strong>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>Resultado estimado hoy y proyectado a 31/12, declarando solo o en conjunta con Pilar.</div>
          </div>
          <div className="fiscal-seg-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <MomentoCard titulo="📍 Hoy" sub={`Con lo devengado hasta ahora (base ${eur(declaracion.bases.hoy)})`} c={declaracion.hoy} />
            <MomentoCard titulo="🔮 Fin de año (estimación)" sub={`+ ${eur(declaracion.bases.deltaFuturo)} de reservas futuras y recurrentes → base ${eur(declaracion.bases.finAnio)}`} c={declaracion.finAnio} />
          </div>
          {/* Palanca de gasto: cuánto ahorra meter más gasto deducible antes del 31/12 */}
          <div style={{ marginTop: '12px', fontSize: '12px', padding: '10px 12px', background: '#c6f6d5', borderRadius: '6px', color: '#22543d', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div>💡 <strong>Cada 1.000 € más de gasto deducible ⇒ ~{declaracion.palanca.ahorroPorMilGasto} € menos de cuota</strong> (tramo marginal proyectado: {(declaracion.palanca.tipoMarginal * 100).toFixed(0)}%). No hay salto de golpe al cambiar de tramo: solo el exceso tributa al tipo alto.</div>
            {declaracion.palanca.gastoParaBajarTramo !== null && declaracion.palanca.tipoPrevio !== null && declaracion.palanca.gastoParaBajarTramo > 0 && (
              <div>🎯 Para que la base proyectada baje al tramo del {(declaracion.palanca.tipoPrevio * 100).toFixed(0)}%: <strong>{eur(declaracion.palanca.gastoParaBajarTramo)}</strong> de gasto antes del 31/12 ({declaracion.mesesRestantes} meses restantes) → ahorro ~<strong>{eur(declaracion.palanca.ahorroBajarTramo ?? 0)}</strong>.</div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ ...card, fontSize: '12px', color: 'var(--muted)' }}>No se pudo calcular «Mi declaración» ahora mismo. El resto de la lente sigue disponible.</div>
      )}

      {/* Base imponible + barra de tramos IRPF (año completo) */}
      {fiscal ? (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <strong>📊 Base imponible y tramos {year}</strong>
            <Link href="/finanzas/fiscal" style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>Detalle y deducciones →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '4px' }}>
            <div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Base imponible est.</div><div style={{ fontSize: '18px', fontWeight: 700 }}>{eur(fiscal.baseImponibleEstimada)}</div></div>
            <div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Tipo efectivo</div><div style={{ fontSize: '18px', fontWeight: 700 }}>{(fiscal.tipoEfectivo * 100).toFixed(1)}%</div></div>
            <div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Tramo marginal</div><div style={{ fontSize: '18px', fontWeight: 700 }}>{(fiscal.tramoActual.tipo * 100).toFixed(0)}%</div></div>
            <div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Retenciones pagadas</div><div style={{ fontSize: '18px', fontWeight: 700 }}>{eur(fiscal.retencionesAcumuladas)}</div></div>
          </div>
          <TramoBar tramosIRPF={fiscal.tramosIRPF} base={fiscal.baseImponibleEstimada} />
          {fiscal.margenHastaProximoTramo != null && (
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '10px' }}>Para subir de tramo: {eur(fiscal.margenHastaProximoTramo)} más de base.</div>
          )}
        </div>
      ) : (
        <div style={{ ...card, fontSize: '12px', color: 'var(--muted)' }}>No hay datos fiscales para {year} todavía.</div>
      )}

      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>El bloque fiscal es siempre del año completo (la declaración es anual, no del intervalo). Orientativo, no sustituye a la asesoría.</div>
    </div>
  )
}
