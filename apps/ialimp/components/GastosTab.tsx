'use client'
import { useState, useEffect } from 'react'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)',
  bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4', warn: '#d97706', warnBg: '#fffbeb',
  red: '#dc2626', redBg: '#fef2f2'
}

// Tipos de gasto con iconos y labels
const TIPOS_GASTO = [
  // Gastos fijos obligatorios
  { value: 'ibi',              label: 'IBI',                      icon: '🏛️', grupo: 'Impuestos y tasas' },
  { value: 'comunidad',        label: 'Comunidad de propietarios', icon: '🏢', grupo: 'Gastos fijos' },
  { value: 'basura',           label: 'Tasa de basura',            icon: '🗑️', grupo: 'Impuestos y tasas' },
  // Seguros
  { value: 'seguro_hogar',     label: 'Seguro del hogar',          icon: '🛡️', grupo: 'Seguros' },
  { value: 'seguro_comunidad', label: 'Seguro de comunidad',       icon: '🛡️', grupo: 'Seguros' },
  { value: 'seguro_vida',      label: 'Seguro de vida / hipoteca', icon: '❤️', grupo: 'Seguros' },
  // Suministros
  { value: 'luz',              label: 'Electricidad',              icon: '💡', grupo: 'Suministros' },
  { value: 'agua',             label: 'Agua',                      icon: '💧', grupo: 'Suministros' },
  { value: 'gas',              label: 'Gas',                       icon: '🔥', grupo: 'Suministros' },
  { value: 'internet',         label: 'Internet / Teléfono',       icon: '📡', grupo: 'Suministros' },
  // Financiero
  { value: 'hipoteca',         label: 'Hipoteca',                  icon: '🏦', grupo: 'Financiero' },
  { value: 'prestamo',         label: 'Préstamo / Derrama',        icon: '💳', grupo: 'Financiero' },
  // Mantenimiento
  { value: 'mantenimiento',    label: 'Mantenimiento / Reforma',   icon: '🔧', grupo: 'Mantenimiento' },
  { value: 'limpieza',         label: 'Limpieza',                  icon: '🧹', grupo: 'Mantenimiento' },
  // Ingresos
  { value: 'alquiler_cobrado', label: 'Alquiler cobrado',          icon: '💰', grupo: 'Ingresos', ingreso: true },
  { value: 'subarriendo',      label: 'Subarriendo cobrado',       icon: '💰', grupo: 'Ingresos', ingreso: true },
  { value: 'touristic',        label: 'Alquiler turístico',        icon: '🏖️', grupo: 'Ingresos', ingreso: true },
  // Otro
  { value: 'otro',             label: 'Otro gasto',                icon: '📋', grupo: 'Otros' },
]

const PERIODICIDADES = [
  { value: 'mensual',     label: 'Mensual'   },
  { value: 'bimestral',   label: 'Bimestral' },
  { value: 'trimestral',  label: 'Trimestral'},
  { value: 'semestral',   label: 'Semestral' },
  { value: 'anual',       label: 'Anual'     },
  { value: 'unico',       label: 'Pago único'},
]

const ALERTAS_OPCIONES = [
  { value: 30,  label: '30 días antes' },
  { value: 60,  label: '60 días antes' },
  { value: 90,  label: '90 días antes' },
]

function tipoConfig(tipo: string) {
  return TIPOS_GASTO.find(t => t.value === tipo) || { icon: '📋', label: tipo, grupo: 'Otros', ingreso: false }
}

function fmtEur(n: number | null | undefined) {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
}

function fmtFecha(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

function BadgeVencimiento({ gasto }: { gasto: any }) {
  if (!gasto.fecha_vencimiento) return null
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    vencido: { bg: C.redBg, color: C.red, label: 'Vencido' },
    proximo: { bg: C.warnBg, color: C.warn, label: `Vence en ${gasto.dias_para_vencer}d` },
    activo:  { bg: C.okBg, color: C.ok, label: `${gasto.dias_para_vencer}d` },
  }
  const s = cfg[gasto.estado_vencimiento] || cfg.activo
  return (
    <span style={{ fontSize: 10, fontWeight: 700, background: s.bg, color: s.color, padding: '2px 7px', borderRadius: 10 }}>
      {s.label}
    </span>
  )
}

interface Props { token: string; propiedades: any[] }

export default function GastosTab({ token, propiedades }: Props) {
  const [gastos, setGastos]         = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [editando, setEditando]     = useState<any>(null)
  const [filtro, setFiltro]         = useState<'todos'|'gastos'|'ingresos'>('todos')
  const [saving, setSaving]         = useState(false)
  const [totales, setTotales]       = useState<any>({})

  const EMPTY = {
    tipo: 'seguro_hogar', nombre: '', importe: '', periodicidad: 'anual',
    fecha_inicio: '', fecha_vencimiento: '', proveedor: '', numero_poliza: '',
    notas: '', alerta_dias: 60, propiedad_id: '', es_ingreso: false
  }
  const [form, setForm] = useState(EMPTY)
  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const r = await fetch(`/api/propietario/${token}/gastos`)
    if (r.ok) {
      const d = await r.json()
      setGastos(d.gastos || [])
      setTotales({ total_gastos: d.total_gastos, total_ingresos: d.total_ingresos, proximos: d.proximos_vencer })
    }
    setLoading(false)
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      ...form,
      importe: form.importe ? Number(form.importe) : null,
      alerta_dias: Number(form.alerta_dias),
      propiedad_id: form.propiedad_id || null,
      es_ingreso: tipoConfig(form.tipo).ingreso || false,
    }
    const url    = editando ? `/api/propietario/${token}/gastos/${editando.id}` : `/api/propietario/${token}/gastos`
    const method = editando ? 'PATCH' : 'POST'
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (r.ok) {
      setShowForm(false)
      setEditando(null)
      setForm(EMPTY)
      await cargar()
    }
    setSaving(false)
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este gasto?')) return
    await fetch(`/api/propietario/${token}/gastos/${id}`, { method: 'DELETE' })
    await cargar()
  }

  function abrirEditar(g: any) {
    setForm({
      tipo: g.tipo, nombre: g.nombre, importe: g.importe || '',
      periodicidad: g.periodicidad || 'anual',
      fecha_inicio: g.fecha_inicio || '', fecha_vencimiento: g.fecha_vencimiento || '',
      proveedor: g.proveedor || '', numero_poliza: g.numero_poliza || '',
      notas: g.notas || '', alerta_dias: g.alerta_dias || 60,
      propiedad_id: g.propiedad_id || '', es_ingreso: g.es_ingreso || false
    })
    setEditando(g)
    setShowForm(true)
  }

  const tipoActual = tipoConfig(form.tipo)

  const gastosFiltrados = gastos.filter(g =>
    filtro === 'todos' ? true :
    filtro === 'ingresos' ? g.es_ingreso :
    !g.es_ingreso
  )

  // Agrupar por tipo para el resumen
  const proximos = gastos.filter(g => g.estado_vencimiento === 'proximo' || g.estado_vencimiento === 'vencido')

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        <div style={{ background: C.redBg, borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.red }}>{fmtEur(totales.total_gastos)}</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Total gastos/año</div>
        </div>
        <div style={{ background: C.okBg, borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.ok }}>{fmtEur(totales.total_ingresos)}</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Ingresos/año</div>
        </div>
        <div style={{ background: totales.proximos > 0 ? C.warnBg : C.bg, borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: totales.proximos > 0 ? C.warn : C.muted }}>{totales.proximos || 0}</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Próximos a vencer</div>
        </div>
      </div>

      {/* Alertas próximas a vencer */}
      {proximos.length > 0 && (
        <div style={{ background: C.warnBg, border: `1px solid ${C.warn}44`, borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.warn, marginBottom: 8 }}>⚠️ Atención — Próximos vencimientos</div>
          {proximos.map(g => (
            <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: C.text }}>
              <span>{tipoConfig(g.tipo).icon} {g.nombre}</span>
              <BadgeVencimiento gasto={g} />
            </div>
          ))}
          <div style={{ marginTop: 10, fontSize: 11, color: C.muted, borderTop: `1px solid ${C.warn}33`, paddingTop: 8 }}>
            Te contactaremos antes del vencimiento para ayudarte a gestionarlo.
          </div>
        </div>
      )}

      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {([['todos','Todos'],['gastos','Gastos'],['ingresos','Ingresos']] as [string,string][]).map(([val, lbl]) => (
            <button key={val} onClick={() => setFiltro(val as any)}
              style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                background: filtro === val ? C.primary : 'white',
                color: filtro === val ? 'white' : C.muted, fontFamily: 'inherit' }}>
              {lbl}
            </button>
          ))}
        </div>
        <button onClick={() => { setShowForm(true); setEditando(null); setForm(EMPTY) }}
          style={{ background: C.primary, color: 'white', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          + Añadir
        </button>
      </div>

      {/* Lista gastos */}
      {loading && <div style={{ textAlign: 'center', padding: 32, color: C.muted }}>Cargando...</div>}

      {!loading && gastosFiltrados.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: C.muted }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          <div style={{ fontWeight: 700, color: C.text }}>Sin gastos registrados</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Añade tus gastos y te avisamos antes de los vencimientos</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {gastosFiltrados.map(g => {
          const tc = tipoConfig(g.tipo)
          return (
            <div key={g.id} style={{
              background: 'white', borderRadius: 12, padding: '12px 14px',
              border: `1px solid ${g.estado_vencimiento === 'vencido' ? C.red + '44' : g.estado_vencimiento === 'proximo' ? C.warn + '44' : C.border}`,
              borderLeft: `3px solid ${g.es_ingreso ? C.ok : C.primary}`
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{tc.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{g.nombre}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
                        {tc.label}
                        {g.proveedor && ` · ${g.proveedor}`}
                        {g.propiedad_nombre && ` · ${g.propiedad_nombre}`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: g.es_ingreso ? C.ok : C.text }}>
                        {g.es_ingreso ? '+' : ''}{fmtEur(g.importe)}
                      </div>
                      <div style={{ fontSize: 10, color: C.muted }}>{g.periodicidad}</div>
                    </div>
                  </div>
                  {g.fecha_vencimiento && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                      <span style={{ fontSize: 11, color: C.muted }}>
                        Vence: {fmtFecha(g.fecha_vencimiento)}
                      </span>
                      <BadgeVencimiento gasto={g} />
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => abrirEditar(g)}
                    style={{ background: C.light, border: 'none', color: C.brand, width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
                    ✏️
                  </button>
                  <button onClick={() => eliminar(g.id)}
                    style={{ background: C.redBg, border: 'none', color: C.red, width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
                    ×
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal añadir/editar */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100, padding: 0 }}>
          <div style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontWeight: 800, fontSize: 17, margin: 0 }}>{editando ? 'Editar gasto' : 'Nuevo gasto'}</h3>
              <button onClick={() => { setShowForm(false); setEditando(null) }}
                style={{ background: 'none', border: 'none', fontSize: 22, color: C.muted, cursor: 'pointer' }}>×</button>
            </div>

            <form onSubmit={guardar}>
              {/* Tipo */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 6 }}>Tipo de gasto</label>
                <select value={form.tipo} onChange={e => f('tipo', e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, background: 'white', fontFamily: 'inherit' }}>
                  {['Impuestos y tasas','Seguros','Suministros','Financiero','Mantenimiento','Ingresos','Otros'].map(grupo => (
                    <optgroup key={grupo} label={grupo}>
                      {TIPOS_GASTO.filter(t => t.grupo === grupo).map(t => (
                        <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Nombre y proveedor */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 4 }}>Descripción *</label>
                  <input value={form.nombre} onChange={e => f('nombre', e.target.value)} required
                    placeholder={tipoActual.label}
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 4 }}>Proveedor / Compañía</label>
                  <input value={form.proveedor} onChange={e => f('proveedor', e.target.value)}
                    placeholder="Mapfre, Ayto. Sevilla…"
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
                </div>
              </div>

              {/* Importe y periodicidad */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 4 }}>Importe (€)</label>
                  <input type="number" step="0.01" value={form.importe} onChange={e => f('importe', e.target.value)}
                    placeholder="0.00"
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 4 }}>Periodicidad</label>
                  <select value={form.periodicidad} onChange={e => f('periodicidad', e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, background: 'white', fontFamily: 'inherit' }}>
                    {PERIODICIDADES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Fechas */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 4 }}>Fecha inicio</label>
                  <input type="date" value={form.fecha_inicio} onChange={e => f('fecha_inicio', e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 4 }}>
                    📅 Fecha vencimiento
                    <span style={{ fontSize: 10, color: C.warn, marginLeft: 4 }}>← clave para alertas</span>
                  </label>
                  <input type="date" value={form.fecha_vencimiento} onChange={e => f('fecha_vencimiento', e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.warn}66`, borderRadius: 10, fontSize: 14, fontFamily: 'inherit', background: form.fecha_vencimiento ? C.warnBg : 'white' }} />
                </div>
              </div>

              {/* Alerta */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 4 }}>Avisarme antes del vencimiento</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {ALERTAS_OPCIONES.map(a => (
                    <button key={a.value} type="button" onClick={() => f('alerta_dias', a.value)}
                      style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        background: form.alerta_dias === a.value ? C.primary : C.bg,
                        color: form.alerta_dias === a.value ? 'white' : C.muted,
                        fontSize: 11, fontWeight: 600 }}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Propiedad (si hay varias) */}
              {propiedades.length > 1 && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 4 }}>Propiedad (opcional)</label>
                  <select value={form.propiedad_id} onChange={e => f('propiedad_id', e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, background: 'white', fontFamily: 'inherit' }}>
                    <option value="">General (todas las propiedades)</option>
                    {propiedades.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
              )}

              {/* Notas */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 4 }}>Notas</label>
                <input value={form.notas} onChange={e => f('notas', e.target.value)}
                  placeholder="Número de póliza, observaciones…"
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => { setShowForm(false); setEditando(null) }}
                  style={{ flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'white', color: C.muted, fontSize: 14, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: C.primary, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {saving ? 'Guardando…' : editando ? 'Guardar cambios' : `Añadir ${tipoActual.ingreso ? 'ingreso' : 'gasto'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
