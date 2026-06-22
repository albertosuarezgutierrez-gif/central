'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition, type CSSProperties } from 'react'
import type { ResumenFinanciero, MovResumen } from '@/lib/finanzas'

type Props = {
  initialData: ResumenFinanciero | null
  year: number
  quarter: number
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
function fmtS(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
function pct(a: number, b: number) {
  if (!b) return null
  const d = ((a - b) / Math.abs(b)) * 100
  return d
}

const TIPO_LABEL: Record<string, string> = {
  nomina: 'Nómina', proveedor: 'Proveedor', impuestos: 'Impuestos',
  suministros: 'Suministros', alquiler: 'Alquiler', comision_bancaria: 'Comisión banco',
  cobro_cliente: 'Cobro cliente', transferencia: 'Transferencia', tarjeta: 'Tarjeta',
  prestamo: 'Préstamo', seguro: 'Seguro', otros: 'Otros',
}

function VerifBadge({ v }: { v: { confirmados: number; total: number } }) {
  if (!v.total) return null
  const all = v.confirmados === v.total
  return (
    <span style={{
      fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '10px',
      background: all ? '#c6f6d5' : '#fefcbf',
      color: all ? '#276749' : '#744210',
      border: `1px solid ${all ? '#9ae6b4' : '#f6e05e'}`,
    }}>
      {v.confirmados}/{v.total} ✓
    </span>
  )
}

function MovTable({ movs, onConfirmar }: { movs: MovResumen[]; onConfirmar?: (id: string, confirmado: boolean) => void }) {
  if (!movs.length) return <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '8px 0 0' }}>Sin movimientos en este periodo.</p>
  return (
    <div style={{ marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
      {movs.map(m => (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', fontSize: '12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ color: 'var(--muted)', whiteSpace: 'nowrap', minWidth: '36px' }}>{m.fecha?.slice(5) ?? '—'}</div>
          <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{m.concepto}</div>
          <div style={{ fontWeight: 600, color: m.importe >= 0 ? 'var(--primary)' : '#e53e3e', whiteSpace: 'nowrap' }}>
            {m.importe >= 0 ? '+' : ''}{fmt(m.importe)}
          </div>
          {onConfirmar && (
            <button
              onClick={() => onConfirmar(m.id, !m.confirmado)}
              title={m.confirmado ? 'Verificado — pulsa para desmarcar' : 'Marcar como verificado'}
              style={{
                fontSize: '11px', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', flexShrink: 0,
                border: `1px solid ${m.confirmado ? '#9ae6b4' : 'var(--border)'}`,
                background: m.confirmado ? '#c6f6d5' : 'var(--surface)',
                color: m.confirmado ? '#276749' : 'var(--muted)',
                fontWeight: m.confirmado ? 700 : 400,
              }}
            >{m.confirmado ? '✓' : '✓'}</button>
          )}
        </div>
      ))}
    </div>
  )
}

function MiniChart({ porMes, color = 'var(--primary)' }: { porMes: { mes: string; ingresos: number; gastos: number }[]; color?: string }) {
  if (!porMes.length) return null
  const max = Math.max(...porMes.map(m => Math.max(m.ingresos, m.gastos)), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '40px', marginTop: '10px' }}>
      {porMes.map(m => (
        <div key={m.mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '36px', gap: '2px' }}>
            <div style={{ width: '100%', height: `${(m.gastos / max) * 36}px`, background: '#fc8181', borderRadius: '2px 2px 0 0', minHeight: m.gastos > 0 ? '2px' : 0 }} />
            <div style={{ width: '100%', height: `${(m.ingresos / max) * 36}px`, background: color, borderRadius: '2px 2px 0 0', minHeight: m.ingresos > 0 ? '2px' : 0 }} />
          </div>
          <div style={{ fontSize: '9px', color: 'var(--muted)' }}>{m.mes.slice(5)}</div>
        </div>
      ))}
    </div>
  )
}

function FilaResultado({ label, ingreso, gasto }: { label: string; ingreso: number; gasto: number }) {
  const res = ingreso - gasto
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px', fontSize: '12px', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ color: 'var(--primary)', textAlign: 'right' }}>{fmt(ingreso)}</span>
      <span style={{ color: '#e53e3e', textAlign: 'right' }}>{fmt(gasto)}</span>
      <span style={{ fontWeight: 600, textAlign: 'right', color: res >= 0 ? 'var(--primary)' : '#e53e3e' }}>{fmt(res)}</span>
    </div>
  )
}

function TramoBar({ tramosIRPF, base }: { tramosIRPF: ResumenFinanciero['fiscal']['tramosIRPF']; base: number }) {
  const MAX = 80000
  const COLORES = ['#68d391', '#4fd1c5', '#63b3ed', '#f6ad55', '#fc8181', '#feb2b2']
  return (
    <div className="finanzas-tramo-bar">
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
        {/* marcador posición actual */}
        {base > 0 && base < MAX && (
          <div style={{
            position: 'absolute', top: 0, bottom: 0, width: '3px',
            background: '#2d3748',
            left: `${Math.min((base / MAX) * 100, 98)}%`,
          }} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>
        <span>0€</span>
        <span>20.000€</span>
        <span>35.000€</span>
        <span>60.000€</span>
        <span>80.000€+</span>
      </div>
    </div>
  )
}

// ── Banner de novedad fiscal (cambio normativo que te beneficia) ─────────────
function NovedadBanner({ novedades, onDescartar }: { novedades: ResumenFinanciero['deducciones']['novedades']; onDescartar: (id: string) => void }) {
  if (!novedades.length) return null
  return (
    <div style={{ marginBottom: '16px' }}>
      {novedades.map(n => (
        <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#c6f6d5', border: '1px solid #9ae6b4', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: '8px' }}>
          <span style={{ fontSize: '20px' }}>📈</span>
          <div style={{ flex: 1, fontSize: '13px', color: '#22543d' }}>
            <strong>Novedad fiscal a tu favor:</strong> «{n.concepto}»
            {n.importeAnterior != null && n.importeNuevo != null && <> sube de {fmt(n.importeAnterior)} a <strong>{fmt(n.importeNuevo)}</strong></>}
            {n.fuenteUrl && <> · <a href={n.fuenteUrl} target="_blank" rel="noreferrer" style={{ color: '#22543d', textDecoration: 'underline' }}>fuente ({n.ambito.toUpperCase()})</a></>}
          </div>
          <button onClick={() => onDescartar(n.id)} style={{ fontSize: '12px', padding: '4px 10px', background: '#fff', border: '1px solid #9ae6b4', borderRadius: '6px', cursor: 'pointer', color: '#22543d', fontWeight: 600 }}>Entendido</button>
        </div>
      ))}
    </div>
  )
}

const inputStyle: CSSProperties = { padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px', width: '100%' }
const labelStyle: CSSProperties = { fontSize: '11px', color: 'var(--muted)', marginBottom: '3px', display: 'block' }

// ── Formulario de situación familiar/fiscal ──────────────────────────────────
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

        {/* Hijos */}
        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Hijos / descendientes</div>
        {hijos.map((h, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 70px auto', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
            <input style={inputStyle} placeholder="Nombre" value={h.nombre} onChange={e => setHijos(hs => hs.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))} />
            <input style={inputStyle} type="date" value={h.fechaNacimiento} onChange={e => setHijos(hs => hs.map((x, j) => j === i ? { ...x, fechaNacimiento: e.target.value } : x))} />
            <input style={inputStyle} type="number" placeholder="% disc." title="Grado de discapacidad" value={h.gradoDiscapacidad} onChange={e => setHijos(hs => hs.map((x, j) => j === i ? { ...x, gradoDiscapacidad: Number(e.target.value) } : x))} />
            <button onClick={() => setHijos(hs => hs.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '16px' }}>×</button>
          </div>
        ))}
        <button onClick={() => setHijos(hs => [...hs, { id: '', nombre: '', fechaNacimiento: '', gradoDiscapacidad: 0, computoCompleto: true }])} style={{ fontSize: '12px', color: 'var(--primary)', background: 'none', border: '1px dashed var(--border)', borderRadius: '6px', padding: '6px', cursor: 'pointer', width: '100%', marginBottom: '16px' }}>+ Añadir hijo</button>

        {/* Situación */}
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
            <label style={labelStyle}>Gasto guardería (anual)</label>
            <input style={inputStyle} type="number" value={perfil.gastoGuarderiaAnual} onChange={e => set('gastoGuarderiaAnual', Number(e.target.value))} />
          </div>
          <div>
            <label style={labelStyle}>Aportación plan de pensiones</label>
            <input style={inputStyle} type="number" value={perfil.aportacionPlanPensiones} onChange={e => set('aportacionPlanPensiones', Number(e.target.value))} />
          </div>
          <div>
            <label style={labelStyle}>Discapacidad titular (%)</label>
            <input style={inputStyle} type="number" value={perfil.gradoDiscapacidadTitular} onChange={e => set('gradoDiscapacidadTitular', Number(e.target.value))} />
          </div>
          <div>
            <label style={labelStyle}>Discapacidad cónyuge (%)</label>
            <input style={inputStyle} type="number" value={perfil.gradoDiscapacidadConyuge} onChange={e => set('gradoDiscapacidadConyuge', Number(e.target.value))} />
          </div>
          <div>
            <label style={labelStyle}>Ascendientes a cargo</label>
            <input style={inputStyle} type="number" value={perfil.ascendientesACargo} onChange={e => set('ascendientesACargo', Number(e.target.value))} />
          </div>
          <div>
            <label style={labelStyle}>Donativos (anual)</label>
            <input style={inputStyle} type="number" value={perfil.donativosAnual} onChange={e => set('donativosAnual', Number(e.target.value))} />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginBottom: '8px' }}>
          <input type="checkbox" checked={perfil.conyugeTrabaja} onChange={e => set('conyugeTrabaja', e.target.checked)} />
          La madre/cónyuge trabaja (autónoma o cuenta ajena) — activa la deducción por maternidad
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginBottom: '16px' }}>
          <input type="checkbox" checked={perfil.declaracionConjunta} onChange={e => set('declaracionConjunta', e.target.checked)} />
          Declaración conjunta
        </label>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontSize: '13px' }}>Cancelar</button>
          <button onClick={guardar} disabled={saving} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Sección de deducciones, cuota, simulador, checklist, calendario, histórico ─
function DeduccionesSection({ ded, tipoMarginal, onEditar }: { ded: ResumenFinanciero['deducciones']; tipoMarginal: number; onEditar: () => void }) {
  const r = ded.resultado
  const [aport, setAport] = useState(0)
  const ahorroSim = Math.round(aport * tipoMarginal)

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', marginTop: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>🧮 Deducciones y cuota estimada</div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>Orientativo · Fuente: {ded.fuente} · Revisado {ded.revisado}</div>
        </div>
        <button onClick={onEditar} style={{ fontSize: '12px', padding: '6px 12px', background: 'var(--primary)', color: '#fff', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>⚙️ Mi situación familiar</button>
      </div>

      <div className="finanzas-fiscal-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Columna izquierda: cadena de cálculo */}
        <div>
          {[
            { label: 'Mínimo personal y familiar', valor: r.minimoPersonalYFamiliar, muted: true },
            { label: 'Cuota íntegra (tras mínimos)', valor: r.cuotaIntegra },
          ].map(x => (
            <div key={x.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--muted)' }}>{x.label}</span>
              <span style={{ fontWeight: 600 }}>{fmt(x.valor)}</span>
            </div>
          ))}
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
          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '6px' }}>♻️ deducción reembolsable (se devuelve aunque no haya cuota) · 🌅 autonómica Andalucía</div>
        </div>

        {/* Columna derecha: simulador + avisos + checklist */}
        <div>
          {/* Simulador */}
          <div style={{ background: 'var(--primary-light)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>🎚️ Simulador «¿y si…?»</div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>Aporto al plan de pensiones: <strong>{fmt(aport)}</strong></div>
            <input type="range" min={0} max={1500} step={100} value={aport} onChange={e => setAport(Number(e.target.value))} style={{ width: '100%' }} />
            <div style={{ fontSize: '12px', marginTop: '6px' }}>Ahorro fiscal estimado (tipo marginal {(tipoMarginal * 100).toFixed(0)} %): <strong style={{ color: 'var(--primary)' }}>{fmt(ahorroSim)}</strong></div>
          </div>

          {/* Avisos de oportunidad */}
          {ded.avisos.map((a, i) => (
            <div key={i} style={{ fontSize: '12px', padding: '8px 10px', background: '#fefcbf', border: '1px solid #faf089', borderRadius: '6px', marginBottom: '6px', color: '#744210' }}>💡 {a}</div>
          ))}

          {/* Checklist: deducciones que te dejas */}
          {ded.sugerencias.length > 0 && (
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px' }}>DEDUCCIONES QUE PODRÍAS ESTAR DEJANDO</div>
              {ded.sugerencias.map(s => (
                <div key={s.clave} style={{ fontSize: '12px', padding: '6px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginBottom: '4px' }}>☐ {s.motivo}</div>
              ))}
            </div>
          )}

          {/* Transiciones de edad */}
          {ded.transiciones.map((t, i) => (
            <div key={i} style={{ fontSize: '11px', color: 'var(--muted)', padding: '4px 0' }}>🎂 <strong>{t.nombre}</strong> {t.aviso}</div>
          ))}
        </div>
      </div>

      {/* Calendario fiscal */}
      <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>📆 Calendario fiscal</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
          {ded.calendario.map(c => (
            <div key={c.clave} style={{ fontSize: '11px', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px' }}>
              <div style={{ fontWeight: 600 }}>{c.etiqueta}</div>
              <div style={{ color: 'var(--muted)' }}>{c.ventana} · {c.detalle}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Histórico interanual */}
      {ded.historico.length > 0 && (
        <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>📊 Histórico — deducciones aplicadas por año</div>
          {ded.historico.map(h => (
            <div key={h.anio} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <span><strong>{h.anio}</strong></span>
              <span style={{ color: 'var(--muted)' }}>Deducciones: <strong style={{ color: 'var(--primary)' }}>{fmt(h.deduccionesTotal)}</strong></span>
              <span style={{ color: h.resultado <= 0 ? 'var(--primary)' : '#e53e3e' }}>{h.resultado <= 0 ? 'Devolución' : 'A pagar'} {fmt(Math.abs(h.resultado))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function FinanzasClient({ initialData, year, quarter }: Props) {
  const router = useRouter()
  const [data, setData] = useState<ResumenFinanciero | null>(initialData)
  const [isPending, startTransition] = useTransition()
  const [showMovs, setShowMovs] = useState<'correduria' | 'pisos' | 'personal' | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  function navigate(y: number, q: number) {
    startTransition(async () => {
      const res = await fetch(`/api/finanzas?year=${y}&quarter=${q}`)
      if (res.ok) setData(await res.json())
    })
    router.push(`/finanzas?year=${y}&quarter=${q}`, { scroll: false })
  }

  const refresh = () => navigate(year, quarter)

  async function handleConfirmar(id: string, confirmado: boolean) {
    await fetch('/api/banca/confirmar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, confirmado }) })
    refresh()
  }

  async function descartarNovedad(id: string) {
    await fetch(`/api/finanzas/novedades/${id}/descartar`, { method: 'POST' })
    refresh()
  }

  const d = data
  const totalIngresos = d ? d.correduria.cobradoNeto + d.pisos.total.ingresos : 0
  const totalGastos = d ? d.correduria.gastosDeducibles + d.pisos.total.gastos + d.personal.total : 0
  const totalResultado = totalIngresos - (d ? d.correduria.gastosDeducibles + d.pisos.total.gastos : 0)
  const antPct = d?.anterior ? pct(totalResultado, d.anterior.resultado) : null

  const periodoLabel = quarter === 0 ? `Año ${year}` : `Q${quarter} ${year}`

  // Gráfico mensual global: combina correduria + pisos por mes
  const allMeses = new Map<string, { ingresos: number; gastos: number }>()
  if (d) {
    for (const m of [...d.correduria.porMes, ...d.pisos.porMes]) {
      const prev = allMeses.get(m.mes) ?? { ingresos: 0, gastos: 0 }
      prev.ingresos += m.ingresos; prev.gastos += m.gastos
      allMeses.set(m.mes, prev)
    }
  }
  const globalMeses = [...allMeses.entries()].sort().map(([mes, v]) => ({ mes, ...v }))
  const maxBar = Math.max(...globalMeses.map(m => Math.max(m.ingresos, m.gastos)), 1)

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 16px' }}>
      <style>{`
        @media (max-width: 768px) {
          .finanzas-kpi-grid { grid-template-columns: 1fr 1fr !important; }
          .finanzas-bloques { grid-template-columns: 1fr !important; }
          .finanzas-fiscal-cols { grid-template-columns: 1fr !important; }
          .finanzas-tramo-bar { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .finanzas-trimestres { grid-template-columns: auto 1fr 1fr 1fr !important; font-size: 11px !important; }
        }
        @media (max-width: 480px) {
          .finanzas-kpi-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Controles ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, flex: 1 }}>💶 Finanzas personales</h1>
        <select
          value={year}
          onChange={e => navigate(parseInt(e.target.value), quarter)}
          style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px' }}
        >
          {(d?.yearsDisponibles ?? [year]).map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['Año', 'Q1', 'Q2', 'Q3', 'Q4'] as const).map((label, i) => (
            <button
              key={i}
              onClick={() => navigate(year, i)}
              style={{
                padding: '5px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
                border: '1px solid var(--border)',
                background: quarter === i ? 'var(--primary)' : 'var(--surface)',
                color: quarter === i ? '#fff' : 'var(--text)',
                fontWeight: quarter === i ? 700 : 400,
              }}
            >{label}</button>
          ))}
        </div>
        {isPending && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Cargando…</span>}
      </div>

      {!d ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>Sin datos para este periodo.</div>
      ) : (
        <>
          {/* ── Banner novedad fiscal ── */}
          <NovedadBanner novedades={d.deducciones.novedades} onDescartar={descartarNovedad} />

          {/* ── KPIs ── */}
          <div className="finanzas-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Ingresos netos', value: totalIngresos, color: 'var(--primary)', sub: periodoLabel },
              { label: 'Gastos totales', value: totalGastos, color: '#e53e3e', sub: 'Negocio + personal' },
              { label: 'Resultado negocio', value: totalResultado, color: totalResultado >= 0 ? 'var(--primary)' : '#e53e3e', sub: antPct !== null ? `${antPct >= 0 ? '↑' : '↓'} ${Math.abs(antPct).toFixed(0)}% vs ${year - 1}` : undefined },
              { label: 'Base imponible est.', value: d.fiscal.baseImponibleEstimada, color: '#805ad5', sub: `Tramo: ${(d.fiscal.tramoActual.tipo * 100).toFixed(0)}%${d.fiscal.margenHastaProximoTramo ? ` · ↑${fmt(d.fiscal.margenHastaProximoTramo)} al siguiente` : ''}` },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{k.label}</div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: k.color }}>{fmt(k.value)}</div>
                {k.sub && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>{k.sub}</div>}
              </div>
            ))}
          </div>

          {/* ── Gráfico evolución mensual ── */}
          {globalMeses.length > 1 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '12px', color: 'var(--muted)' }}>EVOLUCIÓN MENSUAL — INGRESOS VS GASTOS</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '80px' }}>
                {globalMeses.map(m => (
                  <div key={m.mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '68px', gap: '2px' }}>
                      <div title={`Gastos: ${fmt(m.gastos)}`} style={{ width: '100%', height: `${(m.gastos / maxBar) * 68}px`, background: '#fc8181', borderRadius: '2px 2px 0 0', minHeight: m.gastos > 0 ? '2px' : 0 }} />
                      <div title={`Ingresos: ${fmt(m.ingresos)}`} style={{ width: '100%', height: `${(m.ingresos / maxBar) * 68}px`, background: 'var(--primary)', borderRadius: '2px 2px 0 0', minHeight: m.ingresos > 0 ? '2px' : 0 }} />
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--muted)' }}>{m.mes.slice(5)}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '11px' }}>
                <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: 'var(--primary)', borderRadius: '2px', marginRight: '4px' }} />Ingresos</span>
                <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#fc8181', borderRadius: '2px', marginRight: '4px' }} />Gastos</span>
              </div>
            </div>
          )}

          {/* ── Grid 2×2 ── */}
          <div className="finanzas-bloques" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '20px' }}>

            {/* Correduría */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>🛡️ Correduría de seguros</div>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Actividad económica · BBVA · Retención 15%
                    <VerifBadge v={d.correduria.verificacion} />
                  </div>
                </div>
                <button onClick={() => setShowMovs(showMovs === 'correduria' ? null : 'correduria')}
                  style={{ fontSize: '11px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {showMovs === 'correduria' ? 'Ocultar' : 'Ver movs'}
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                {[
                  { label: 'Cobrado neto', value: d.correduria.cobradoNeto, color: 'var(--primary)' },
                  { label: 'Gastos activ.', value: d.correduria.gastosDeducibles, color: '#e53e3e' },
                  { label: 'Resultado', value: d.correduria.resultado, color: d.correduria.resultado >= 0 ? 'var(--primary)' : '#e53e3e' },
                ].map(k => (
                  <div key={k.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{k.label}</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: k.color }}>{fmt(k.value)}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', background: 'var(--primary-light)', borderRadius: '4px', padding: '6px 8px', marginBottom: '6px' }}>
                Bruto para la renta: <strong>{fmt(d.correduria.ingresosBrutos)}</strong> · Retenciones ya pagadas: <strong>{fmt(d.correduria.retencionesEstimadas)}</strong>
              </div>
              <MiniChart porMes={d.correduria.porMes} />
              {d.correduria.porCompania.length > 0 && (
                <div style={{ marginTop: '8px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Ingresos por compañía</div>
                  {d.correduria.porCompania.map(c => (
                    <div key={c.nombre} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                      <span style={{ color: 'var(--text)' }}>{c.nombre}</span>
                      <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{fmt(c.importe)}</span>
                    </div>
                  ))}
                </div>
              )}
              {showMovs === 'correduria' && <MovTable movs={d.correduria.recientes} onConfirmar={handleConfirmar} />}
            </div>

            {/* Pisos */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>🏨 Pisos turísticos</div>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Rendimiento capital inmobiliario
                    <VerifBadge v={d.pisos.verificacion} />
                  </div>
                </div>
                <a href="/apartamentos" style={{ fontSize: '11px', color: 'var(--primary)', textDecoration: 'none' }}>Detalle ↗</a>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)' }} />
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textAlign: 'right' }}>Ingresos</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textAlign: 'right' }}>Gastos</div>
              </div>
              {[
                { label: '🏠 Kutxa (3 pisos)', ing: d.pisos.kutxa.ingresos, gas: d.pisos.kutxa.gastos, sub: 'House Sev · Luxury · Busto Reform' },
                { label: '🏠 BBVA — Duplex', ing: d.pisos.bbva.ingresos, gas: d.pisos.bbva.gastos, sub: 'Duplex Center' },
              ].map(r => (
                <div key={r.label}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                    <div>
                      <div>{r.label}</div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{r.sub}</div>
                    </div>
                    <div style={{ color: 'var(--primary)', fontWeight: 600 }}>{fmt(r.ing)}</div>
                    <div style={{ color: '#e53e3e', fontWeight: 600 }}>{fmt(r.gas)}</div>
                  </div>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px', padding: '6px 0', fontSize: '13px', fontWeight: 700 }}>
                <div>Total pisos</div>
                <div style={{ color: 'var(--primary)' }}>{fmt(d.pisos.total.ingresos)}</div>
                <div style={{ color: '#e53e3e' }}>{fmt(d.pisos.total.gastos)}</div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', background: 'var(--primary-light)', borderRadius: '4px', padding: '5px 8px', marginTop: '4px' }}>
                Resultado: <strong style={{ color: d.pisos.total.resultado >= 0 ? 'var(--primary)' : '#e53e3e' }}>{fmt(d.pisos.total.resultado)}</strong>
                <span style={{ marginLeft: '8px', color: 'var(--muted)' }}>· Amortización: configura valor de construcción</span>
              </div>
              <MiniChart porMes={d.pisos.porMes} color="#48bb78" />
              {showMovs === 'pisos' && <MovTable movs={d.pisos.recientes} onConfirmar={handleConfirmar} />}
              <button onClick={() => setShowMovs(showMovs === 'pisos' ? null : 'pisos')}
                style={{ marginTop: '8px', fontSize: '11px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {showMovs === 'pisos' ? 'Ocultar movimientos' : 'Ver movimientos →'}
              </button>
            </div>

            {/* Personal */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>👤 Gastos personales</div>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    No computan en base imponible
                    <VerifBadge v={d.personal.verificacion} />
                  </div>
                </div>
                <button onClick={() => setShowMovs(showMovs === 'personal' ? null : 'personal')}
                  style={{ fontSize: '11px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {showMovs === 'personal' ? 'Ocultar' : 'Ver movs'}
                </button>
              </div>
              {[
                { label: '🔵 BBVA — Alberto', data: d.personal.bbva },
                { label: '🟣 Kutxa — Familiar', data: d.personal.kutxa },
              ].map(r => (
                <div key={r.label} style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: r.data.gastos === 0 ? '4px' : '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{r.label}</span>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: '#e53e3e' }}>{fmt(r.data.gastos)}</span>
                  </div>
                  {r.data.gastos === 0 && r.label.includes('BBVA') && (
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                      Los gastos BBVA están en Correduría (seguros) y Pisos — no hay gastos personales en esta cuenta.
                    </div>
                  )}
                  {r.data.porCategoria.slice(0, 4).map(c => {
                    const pctVal = r.data.gastos > 0 ? (c.importe / r.data.gastos) * 100 : 0
                    return (
                      <div key={c.categoria} style={{ marginBottom: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '2px' }}>
                          <span style={{ color: 'var(--muted)' }}>{TIPO_LABEL[c.categoria] ?? c.categoria}</span>
                          <span>{fmt(c.importe)}</span>
                        </div>
                        <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px' }}>
                          <div style={{ height: '100%', width: `${pctVal}%`, background: '#805ad5', borderRadius: '2px' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '14px' }}>
                <span>Total personal</span>
                <span style={{ color: '#e53e3e' }}>{fmt(d.personal.total)}</span>
              </div>
              {showMovs === 'personal' && <MovTable movs={d.personal.recientes} onConfirmar={handleConfirmar} />}
            </div>

            {/* Modelo 179 */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '12px' }}>📋 Obligaciones informativas</div>
              <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Modelo 179 — Cesión turística</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px' }}>4 viviendas · Presentación trimestral</div>
              {[
                { q: 'Q1', plazo: '30 abr', meses: 'Ene–Mar' },
                { q: 'Q2', plazo: '31 jul', meses: 'Abr–Jun' },
                { q: 'Q3', plazo: '31 oct', meses: 'Jul–Sep' },
                { q: 'Q4', plazo: '31 ene', meses: 'Oct–Dic' },
              ].map(t => {
                const qNum = parseInt(t.q.slice(1))
                const hoy = new Date()
                const mesActual = hoy.getMonth() + 1
                const mesFinQ = qNum * 3
                const esPasado = mesActual > mesFinQ + 1 || (year < hoy.getFullYear())
                const esActual = mesActual > mesFinQ && mesActual <= mesFinQ + 1 && year === hoy.getFullYear()
                return (
                  <div key={t.q} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                    <span><strong>{t.q}</strong> {t.meses}</span>
                    <span style={{ color: 'var(--muted)' }}>hasta {t.plazo}</span>
                    <span style={{
                      fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                      background: esPasado ? '#c6f6d5' : esActual ? '#fefcbf' : 'var(--border)',
                      color: esPasado ? '#276749' : esActual ? '#744210' : 'var(--muted)',
                      fontWeight: 600,
                    }}>
                      {esPasado ? '✓ Presentar' : esActual ? '⚠️ En plazo' : 'Pendiente'}
                    </span>
                  </div>
                )
              })}
              <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--muted)', background: 'var(--primary-light)', borderRadius: '4px', padding: '6px 8px' }}>
                Los datos de reservas están disponibles en <a href="/apartamentos" style={{ color: 'var(--primary)' }}>Apartamentos</a>. Configura la referencia catastral para exportar automáticamente.
              </div>
            </div>
          </div>

          {/* ── Bloque fiscal ── */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>🏛️ Fiscal — IRPF estimado {year}</div>
                <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>Declaración conjunta · Orientativo, no sustituye asesoría fiscal</div>
              </div>
              <a
                href={`/api/finanzas/export?year=${year}`}
                style={{ fontSize: '12px', padding: '6px 12px', background: 'var(--primary)', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}
              >
                ⬇ CSV gestoría
              </a>
            </div>

            {/* Cálculo base imponible */}
            <div className="finanzas-fiscal-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Cálculo base imponible</div>
                {[
                  { label: 'Rend. actividad económica (correduría)', valor: d.correduria.ingresosBrutos - d.correduria.gastosDeducibles, signo: true },
                  { label: 'Rend. capital inmobiliario (pisos)', valor: d.pisos.total.resultado, signo: true },
                  { label: 'Reducción declaración conjunta', valor: -d.fiscal.reduccionConjunta, signo: true },
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
                <div style={{ fontSize: '11px', color: 'var(--muted)', padding: '6px 8px', background: 'var(--primary-light)', borderRadius: '4px' }}>
                  Retenciones ya pagadas (correduría): <strong>{fmt(d.fiscal.retencionesAcumuladas)}</strong> — se descuentan de la cuota final en la renta
                </div>
              </div>

              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Tramos IRPF 2025</div>
                <TramoBar tramosIRPF={d.fiscal.tramosIRPF} base={d.fiscal.baseImponibleEstimada} />
                <div style={{ marginTop: '12px', fontSize: '12px', padding: '8px', background: d.fiscal.tramoActual.tipo >= 0.37 ? '#fff5f5' : 'var(--primary-light)', borderRadius: '6px', border: `1px solid ${d.fiscal.tramoActual.tipo >= 0.37 ? '#feb2b2' : 'var(--border)'}` }}>
                  <strong>Tramo actual: {(d.fiscal.tramoActual.tipo * 100).toFixed(0)}%</strong>
                  {d.fiscal.margenHastaProximoTramo !== null && (
                    <div style={{ color: 'var(--muted)', marginTop: '3px' }}>
                      Margen al siguiente tramo: <strong>{fmt(d.fiscal.margenHastaProximoTramo)}</strong>
                      <br />Si metes {fmt(d.fiscal.margenHastaProximoTramo)} más de gastos deducibles, reduces el tramo.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tabla trimestral */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Evolución trimestral (actividades + pisos)</div>
              <div className="finanzas-trimestres" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: '8px', fontSize: '12px' }}>
                <div style={{ fontWeight: 600, color: 'var(--muted)' }}>Trimestre</div>
                <div style={{ fontWeight: 600, color: 'var(--muted)', textAlign: 'right' }}>Ingresos</div>
                <div style={{ fontWeight: 600, color: 'var(--muted)', textAlign: 'right' }}>Gastos deducibles</div>
                <div style={{ fontWeight: 600, color: 'var(--muted)', textAlign: 'right' }}>Resultado</div>
                {d.fiscal.trimestres.map(t => (
                  <>
                    <div key={`q${t.q}`} style={{ fontWeight: 600, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>Q{t.q}</div>
                    <div style={{ textAlign: 'right', padding: '6px 0', borderBottom: '1px solid var(--border)', color: 'var(--primary)' }}>{fmt(t.ingresos)}</div>
                    <div style={{ textAlign: 'right', padding: '6px 0', borderBottom: '1px solid var(--border)', color: '#e53e3e' }}>{fmt(t.gastosDeducibles)}</div>
                    <div style={{ textAlign: 'right', padding: '6px 0', borderBottom: '1px solid var(--border)', fontWeight: 600, color: t.resultado >= 0 ? 'var(--primary)' : '#e53e3e' }}>{fmt(t.resultado)}</div>
                  </>
                ))}
              </div>
            </div>
          </div>

          {/* ── Deducciones y cuota ── */}
          <DeduccionesSection ded={d.deducciones} tipoMarginal={d.fiscal.tramoActual.tipo} onEditar={() => setFormOpen(true)} />

          {formOpen && (
            <SituacionFamiliarForm ded={d.deducciones} onClose={() => setFormOpen(false)} onSaved={refresh} />
          )}
        </>
      )}
    </main>
  )
}
