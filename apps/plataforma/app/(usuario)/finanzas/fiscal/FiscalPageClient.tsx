'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition, type CSSProperties } from 'react'
import type { ResumenFinanciero } from '@/lib/finanzas'
import { eur, eurSinDecimales } from '@/lib/dinero'

type Props = { initialData: ResumenFinanciero | null; initialComparativa: EstadoDeclaracion | null; year: number; quarter: number }

function fmt(n: number) {
  return eur(n)
}

// ── Barra visual de tramos IRPF ──────────────────────────────────────────────
function TramoBar({ tramosIRPF, base }: { tramosIRPF: ResumenFinanciero['fiscal']['tramosIRPF']; base: number }) {
  const MAX = 80000
  const COLORES = ['#68d391', '#4fd1c5', '#63b3ed', '#f6ad55', '#fc8181', '#feb2b2']
  const pct = Math.min((base / MAX) * 100, 98)
  return (
    <div>
      <div style={{ position: 'relative', height: '20px', borderRadius: '6px', overflow: 'hidden', display: 'flex', marginTop: '10px' }}>
        {tramosIRPF.map((t, i) => {
          const desde = t.desde
          const hasta = Math.min(t.hasta ?? MAX, MAX)
          const width = Math.max(0, ((hasta - desde) / MAX) * 100)
          return (
            <div key={i} title={`${(t.tipo * 100).toFixed(0)}%: ${fmt(desde)} – ${t.hasta ? fmt(t.hasta) : '∞'}`}
              style={{ width: `${width}%`, background: COLORES[i] ?? '#e2e8f0', height: '100%' }} />
          )
        })}
        {base > 0 && (
          <div style={{ position: 'absolute', top: 0, bottom: 0, width: '3px', background: '#2d3748', left: `${pct}%` }} />
        )}
      </div>
      {base > 0 && (
        <div style={{ position: 'relative', height: '18px', marginTop: '2px' }}>
          <span style={{ position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)', fontSize: '10px', fontWeight: 700, color: '#2d3748', whiteSpace: 'nowrap' }}>▲ {fmt(base)}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>
        <span>0€</span><span>20.000€</span><span>35.000€</span><span>60.000€</span><span>80.000€+</span>
      </div>
      {/* Leyenda de tramos */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
        {tramosIRPF.filter(t => t.importe > 0 || t.desde === 0).map((t, i) => (
          <span key={i} style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', background: COLORES[i] ?? '#e2e8f0' }} />
            {(t.tipo * 100).toFixed(0)}%
            {t.importe > 0 && <strong> → {fmt(t.importe)}</strong>}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Formulario de situación familiar ─────────────────────────────────────────
const inputStyle: CSSProperties = { padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px', width: '100%' }
const labelStyle: CSSProperties = { fontSize: '11px', color: 'var(--muted)', marginBottom: '3px', display: 'block' }

function SituacionFamiliarForm({ ded, onClose, onSaved }: { ded: ResumenFinanciero['deducciones']; onClose: () => void; onSaved: () => void }) {
  const [perfil, setPerfil] = useState(ded.perfil)
  const [hijos, setHijos] = useState(ded.descendientes.map(h => ({ ...h })))
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof perfil, v: unknown) => setPerfil(p => ({ ...p, [k]: v }))

  async function guardar() {
    setSaving(true)
    const res = await fetch('/api/finanzas/perfil', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ perfil, descendientes: hijos }),
    })
    setSaving(false)
    if (res.ok) { onSaved(); onClose() }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px', zIndex: 50, overflowY: 'auto' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '24px', maxWidth: '560px', width: '100%', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>⚙️ Mi situación familiar y fiscal</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted)' }}>×</button>
        </div>
        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Hijos / descendientes</div>
        {hijos.map((h, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 70px auto', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
            <input style={inputStyle} placeholder="Nombre" value={h.nombre} onChange={e => setHijos(hs => hs.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))} />
            <input style={inputStyle} type="date" value={h.fechaNacimiento} onChange={e => setHijos(hs => hs.map((x, j) => j === i ? { ...x, fechaNacimiento: e.target.value } : x))} />
            <input style={inputStyle} type="number" placeholder="% disc." value={h.gradoDiscapacidad} onChange={e => setHijos(hs => hs.map((x, j) => j === i ? { ...x, gradoDiscapacidad: Number(e.target.value) } : x))} />
            <button onClick={() => setHijos(hs => hs.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '16px' }}>×</button>
          </div>
        ))}
        <button onClick={() => setHijos(hs => [...hs, { id: '', nombre: '', fechaNacimiento: '', gradoDiscapacidad: 0, computoCompleto: true }])} style={{ fontSize: '12px', color: 'var(--primary)', background: 'none', border: '1px dashed var(--border)', borderRadius: '6px', padding: '6px', cursor: 'pointer', width: '100%', marginBottom: '16px' }}>+ Añadir hijo</button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>Comunidad autónoma</label>
            <select style={inputStyle} value={perfil.comunidadAutonoma} onChange={e => set('comunidadAutonoma', e.target.value)}>
              <option value="andalucia">Andalucía</option>
              <option value="otra">Otra</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Familia numerosa</label>
            <select style={inputStyle} value={perfil.familiaNumerosa ?? ''} onChange={e => set('familiaNumerosa', e.target.value || null)}>
              <option value="">No</option>
              <option value="general">General</option>
              <option value="especial">Especial</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Aportación plan de pensiones</label>
            <input style={inputStyle} type="number" value={perfil.aportacionPlanPensiones} onChange={e => set('aportacionPlanPensiones', Number(e.target.value))} />
          </div>
          <div>
            <label style={labelStyle}>Gasto guardería (anual)</label>
            <input style={inputStyle} type="number" value={perfil.gastoGuarderiaAnual} onChange={e => set('gastoGuarderiaAnual', Number(e.target.value))} />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginBottom: '8px' }}>
          <input type="checkbox" checked={perfil.declaracionConjunta} onChange={e => set('declaracionConjunta', e.target.checked)} />
          Declaración conjunta
        </label>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontSize: '13px' }}>Cancelar</button>
          <button onClick={guardar} disabled={saving} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}

export default function FiscalPageClient({ initialData, initialComparativa, year: initYear, quarter: initQuarter }: Props) {
  const router = useRouter()
  const [data, setData] = useState<ResumenFinanciero | null>(initialData)
  const [year, setYear] = useState(initYear)
  const [quarter, setQuarter] = useState(initQuarter)
  const [isPending, startTransition] = useTransition()
  const [formOpen, setFormOpen] = useState(false)

  function navigate(y: number, q: number) {
    setYear(y); setQuarter(q)
    startTransition(async () => {
      const res = await fetch(`/api/finanzas?year=${y}&quarter=${q}`)
      if (res.ok) setData(await res.json())
    })
    router.push(`/finanzas/fiscal?year=${y}&quarter=${q}`, { scroll: false })
  }

  const refresh = () => navigate(year, quarter)

  const d = data
  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 16px' }}>
      <style>{`
        @media (max-width: 768px) {
          .fiscal-cols { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, flex: 1 }}>🏛️ Fiscal — IRPF estimado</h1>
        <select
          value={year}
          onChange={e => navigate(parseInt(e.target.value), quarter)}
          style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px' }}
        >
          {(d?.yearsDisponibles ?? [year]).map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['Año', 'Q1', 'Q2', 'Q3', 'Q4'] as const).map((label, i) => (
            <button key={i} onClick={() => navigate(year, i)} style={{
              padding: '5px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: '1px solid var(--border)',
              background: quarter === i ? 'var(--primary)' : 'var(--surface)', color: quarter === i ? '#fff' : 'var(--text)', fontWeight: quarter === i ? 700 : 400,
            }}>{label}</button>
          ))}
        </div>
        <a href={`/api/finanzas/export?year=${year}`} style={{ fontSize: '12px', padding: '6px 12px', background: 'var(--primary)', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}>
          ⬇ CSV gestoría
        </a>
        {isPending && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Cargando…</span>}
      </div>

      {!d ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>Sin datos para este periodo.</div>
      ) : (
        <>
          {/* Mi declaración: hoy vs fin de año, solo vs conjunta — el resumen de la página */}
          <DeclaracionBlock year={year} initial={initialComparativa} initialYear={initYear} />

          {/* Bloque principal: base imponible + tramos */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '16px' }}>📊 Cálculo base imponible y tramos</div>
            <div className="fiscal-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              {/* Cálculo */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Desglose base imponible</div>
                {[
                  { label: 'Rend. actividad económica (correduría)', valor: d.correduria.ingresosBrutos - d.correduria.gastosDeducibles },
                  { label: 'Rend. capital inmobiliario (pisos)', valor: d.pisos.total.resultado },
                  { label: 'Reducción declaración conjunta', valor: -d.fiscal.reduccionConjunta },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--muted)' }}>{r.label}</span>
                    <span style={{ fontWeight: 600, color: r.valor >= 0 ? 'var(--text)' : 'var(--primary)' }}>{r.valor >= 0 ? '' : '−'}{fmt(Math.abs(r.valor))}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 700, padding: '8px 0' }}>
                  <span>Base imponible estimada</span>
                  <span style={{ color: '#805ad5' }}>{fmt(d.fiscal.baseImponibleEstimada)}</span>
                </div>
                <div style={{ fontSize: '11px', padding: '6px 8px', background: 'var(--primary-light)', borderRadius: '4px', color: 'var(--muted)', marginTop: '4px' }}>
                  Retenciones ya pagadas (correduría 15%): <strong style={{ color: 'var(--text)' }}>{fmt(d.fiscal.retencionesAcumuladas)}</strong>
                </div>
                {(d.fiscal.exento ?? 0) > 0 && (
                  <div style={{ fontSize: '11px', padding: '6px 8px', background: '#e6fffa', borderRadius: '4px', color: '#234e52', marginTop: '6px' }}>
                    🕊️ Ingresos exentos (no tributan): <strong>{fmt(d.fiscal.exento)}</strong> — cobrados de verdad pero FUERA de la base imponible (p.ej. prestación por paternidad, Art. 7.h LIRPF). Por eso la base es menor que el dinero cobrado.
                  </div>
                )}
                {(d.amortizables?.total ?? 0) > 0 && (
                  <div style={{ fontSize: '11px', padding: '6px 8px', background: '#e9d8fd', borderRadius: '4px', color: '#553c9a', marginTop: '6px' }}>
                    📦 Amortizables: <strong>{fmt(d.amortizables.total)}</strong> — NO deducidos este año; se amortizan en varios años
                  </div>
                )}
              </div>

              {/* Tramos visuales */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Tramos IRPF {year}</div>
                <TramoBar tramosIRPF={d.fiscal.tramosIRPF} base={d.fiscal.baseImponibleEstimada} />
                <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '6px', border: `1px solid ${d.fiscal.tramoActual.tipo >= 0.37 ? '#feb2b2' : 'var(--border)'}`, background: d.fiscal.tramoActual.tipo >= 0.37 ? '#fff5f5' : 'var(--primary-light)', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span><strong>Tramo marginal: {(d.fiscal.tramoActual.tipo * 100).toFixed(0)}%</strong> ({fmt(d.fiscal.tramoActual.desde)}–{d.fiscal.tramoActual.hasta ? fmt(d.fiscal.tramoActual.hasta) : '∞'})</span>
                  </div>
                  {d.fiscal.margenHastaProximoTramo !== null && (
                    <div style={{ color: 'var(--muted)' }}>Para subir de tramo: {fmt(d.fiscal.margenHastaProximoTramo)} más de ingresos · tipo efectivo {(d.fiscal.tipoEfectivo * 100).toFixed(1)}%</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Tabla trimestral */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '12px' }}>📆 Evolución trimestral</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: '8px', fontSize: '12px' }}>
              {['Trim.', 'Ingresos', 'Gastos ded.', 'Resultado'].map(h => (
                <div key={h} style={{ fontWeight: 600, color: 'var(--muted)', textAlign: h !== 'Trim.' ? 'right' : 'left' }}>{h}</div>
              ))}
              {d.fiscal.trimestres.map(t => (
                <>
                  <div key={`q${t.q}`} style={{ fontWeight: 600, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>Q{t.q}</div>
                  <div style={{ textAlign: 'right', padding: '5px 0', borderBottom: '1px solid var(--border)', color: 'var(--primary)' }}>{fmt(t.ingresos)}</div>
                  <div style={{ textAlign: 'right', padding: '5px 0', borderBottom: '1px solid var(--border)', color: '#e53e3e' }}>{fmt(t.gastosDeducibles)}</div>
                  <div style={{ textAlign: 'right', padding: '5px 0', borderBottom: '1px solid var(--border)', fontWeight: 600, color: t.resultado >= 0 ? 'var(--primary)' : '#e53e3e' }}>{fmt(t.resultado)}</div>
                </>
              ))}
            </div>
          </div>

          {/* Deducciones y cuota */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>🧮 Deducciones y cuota estimada</div>
                <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>Fuente: {d.deducciones.fuente} · Revisado {d.deducciones.revisado}</div>
              </div>
              <button onClick={() => setFormOpen(true)} style={{ fontSize: '12px', padding: '6px 12px', background: 'var(--primary)', color: '#fff', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>⚙️ Mi situación familiar</button>
            </div>
            <div className="fiscal-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                {(() => {
                  const r = d.deducciones.resultado
                  return (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--muted)' }}>Mínimo personal y familiar</span>
                        <span style={{ fontWeight: 600 }}>{fmt(r.minimoPersonalYFamiliar)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--muted)' }}>Cuota íntegra (tras mínimos)</span>
                        <span style={{ fontWeight: 600 }}>{fmt(r.cuotaIntegra)}</span>
                      </div>
                      {r.deducciones.map(dd => (
                        <div key={dd.clave} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ color: 'var(--muted)' }}>− {dd.concepto}{dd.ambito === 'andalucia' ? ' 🌅' : ''}{dd.reembolsable ? ' ♻️' : ''}</span>
                          <span style={{ fontWeight: 600, color: 'var(--primary)' }}>−{fmt(dd.importe)}</span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--muted)' }}>− Retenciones ya pagadas</span>
                        <span style={{ fontWeight: 600, color: 'var(--primary)' }}>−{fmt(r.retenciones)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', padding: '10px 12px', borderRadius: '8px', background: r.resultado <= 0 ? '#c6f6d5' : '#fff5f5', border: `1px solid ${r.resultado <= 0 ? '#9ae6b4' : '#feb2b2'}` }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: r.resultado <= 0 ? '#22543d' : '#742a2a' }}>{r.resultado <= 0 ? '✓ Te sale a DEVOLVER' : '⚠️ Te sale a PAGAR'}</span>
                        <span style={{ fontSize: '18px', fontWeight: 800, color: r.resultado <= 0 ? '#22543d' : '#742a2a' }}>{fmt(Math.abs(r.resultado))}</span>
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '6px' }}>♻️ reembolsable · 🌅 Andalucía</div>
                      {r.deducciones.some(dd => dd.clave === 'maternidad') && (
                        <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>ℹ️ La maternidad se prorratea por meses en el año de nacimiento, pero no está topada por las cotizaciones de la madre ese periodo — orientativa; el borrador AEAT manda.</div>
                      )}
                    </>
                  )
                })()}
              </div>
              <div>
                {d.deducciones.avisos.map((a, i) => (
                  <div key={i} style={{ fontSize: '12px', padding: '8px 10px', background: '#fefcbf', border: '1px solid #faf089', borderRadius: '6px', marginBottom: '6px', color: '#744210' }}>💡 {a}</div>
                ))}
                {d.deducciones.sugerencias.length > 0 && (
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>PODRÍAS ESTAR DEJANDO</div>
                    {d.deducciones.sugerencias.map(s => (
                      <div key={s.clave} style={{ fontSize: '12px', padding: '6px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginBottom: '4px' }}>☐ {s.motivo}</div>
                    ))}
                  </div>
                )}
                {d.deducciones.historico.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>HISTÓRICO</div>
                    {d.deducciones.historico.map(h => (
                      <div key={h.anio} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                        <span><strong>{h.anio}</strong></span>
                        <span style={{ color: h.resultado <= 0 ? 'var(--primary)' : '#e53e3e' }}>{h.resultado <= 0 ? '▼' : '▲'} {fmt(Math.abs(h.resultado))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {formOpen && <SituacionFamiliarForm ded={d.deducciones} onClose={() => setFormOpen(false)} onSaved={refresh} />}
        </>
      )}
    </main>
  )
}

// ── Mi declaración: hoy vs fin de año, solo vs conjunta ──────────────────────
type EscenarioDecl = { base: number; cuota: number; resultado: number }
type ComparativaDecl = {
  conjunta: EscenarioDecl
  separada: { titular: EscenarioDecl; conyuge: EscenarioDecl; total: number }
  ahorroConjunta: number
  recomendacion: 'conjunta' | 'separada'
}
type EstadoDeclaracion = {
  year: number
  hoy: ComparativaDecl
  finAnio: ComparativaDecl
  bases: { hoy: number; finAnio: number; deltaFuturo: number }
  palanca: { tipoMarginal: number; ahorroPorMilGasto: number; gastoParaBajarTramo: number | null; tipoPrevio: number | null; ahorroBajarTramo: number | null }
  mesesRestantes: number
}

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
            <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Base: {fmt(f.base)}</div>
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap', color: f.resultado <= 0 ? 'var(--primary)' : '#e53e3e' }}>
            {f.resultado <= 0 ? 'Devuelven' : 'A pagar'} {fmt(Math.abs(f.resultado))}
          </div>
        </div>
      ))}
    </div>
  )
}

function DeclaracionBlock({ year, initial, initialYear }: { year: number; initial: EstadoDeclaracion | null; initialYear: number }) {
  // Para el año inicial usamos la comparativa ya calculada en el servidor (sin spinner).
  const [estado, setEstado] = useState<EstadoDeclaracion | null>(year === initialYear ? initial : null)
  const [error, setError] = useState(false)

  useEffect(() => {
    // El año inicial ya viene resuelto desde SSR → no hace falta pedirlo otra vez.
    if (year === initialYear && initial) { setEstado(initial); setError(false); return }
    let vivo = true
    setEstado(null)
    setError(false)
    fetch(`/api/finanzas/comparativa?year=${year}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(j => { if (vivo) setEstado(j) })
      .catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [year, initialYear, initial])

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', marginBottom: '20px' }}>
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>🧾 Mi declaración — cómo voy y cómo acabaría</div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>Resultado estimado hoy y proyectado a 31/12, declarando solo o en conjunta</div>
      </div>

      {error ? (
        <div style={{ fontSize: '12px', color: '#e53e3e', textAlign: 'center', padding: '16px' }}>No se pudo calcular. Recarga la página.</div>
      ) : !estado ? (
        <div style={{ fontSize: '12px', color: 'var(--muted)', textAlign: 'center', padding: '16px' }}>Calculando…</div>
      ) : (
        <>
          <div className="fiscal-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <MomentoCard titulo="📍 Hoy" sub={`Con lo devengado hasta ahora (base ${fmt(estado.bases.hoy)})`} c={estado.hoy} />
            <MomentoCard titulo="🔮 Fin de año (estimación)" sub={`+ ${fmt(estado.bases.deltaFuturo)} de reservas futuras y recurrentes → base ${fmt(estado.bases.finAnio)}`} c={estado.finAnio} />
          </div>

          {/* Palanca de gasto: cuánto ahorra meter más gasto deducible antes del 31/12 */}
          <div style={{ marginTop: '12px', fontSize: '12px', padding: '10px 12px', background: '#c6f6d5', borderRadius: '6px', color: '#22543d', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div>💡 <strong>Cada 1.000€ más de gasto deducible ⇒ ~{eurSinDecimales(estado.palanca.ahorroPorMilGasto)} menos de cuota</strong> (tramo marginal proyectado: {(estado.palanca.tipoMarginal * 100).toFixed(0)}%). No hay salto de golpe al cambiar de tramo: solo el exceso tributa al tipo alto.</div>
            {estado.palanca.gastoParaBajarTramo !== null && estado.palanca.tipoPrevio !== null && estado.palanca.gastoParaBajarTramo > 0 && (
              <div>🎯 Para que la base proyectada baje al tramo del {(estado.palanca.tipoPrevio * 100).toFixed(0)}%: <strong>{fmt(estado.palanca.gastoParaBajarTramo)}</strong> de gasto antes del 31/12 ({estado.mesesRestantes} meses restantes) → ahorro ~<strong>{fmt(estado.palanca.ahorroBajarTramo ?? 0)}</strong>.</div>
            )}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '6px' }}>
            Orientativo: «Hoy» usa lo devengado real; «Fin de año» proyecta reservas futuras + patrones recurrentes y anualiza retenciones y los datos de Pilar. La modalidad definitiva la confirma la asesoría con el borrador de la AEAT.
          </div>
        </>
      )}
    </div>
  )
}
