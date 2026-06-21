'use client'
import { useState, useEffect } from 'react'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)',
  bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4', red: '#dc2626', redBg: '#fef2f2',
  warn: '#d97706', warnBg: '#fffbeb',
}

const MODULOS = [
  { id: 'sesiones',      label: 'Sesiones',      icon: '📋', desc: 'Ver y gestionar sesiones' },
  { id: 'clientes',      label: 'Clientes',       icon: '🏠', desc: 'Clientes y propiedades' },
  { id: 'rrhh',          label: 'RRHH',           icon: '👥', desc: 'Equipo y calidad' },
  { id: 'lenceria',      label: 'Lencería',       icon: '🛏️', desc: 'Control de lencería' },
  { id: 'stock',         label: 'Stock',          icon: '🧴', desc: 'Productos y consumo' },
  { id: 'facturacion',   label: 'Facturación',    icon: '💶', desc: 'Facturas y cobros' },
  { id: 'informes',      label: 'Informes',       icon: '📊', desc: 'Estadísticas' },
  { id: 'agenda',        label: 'Agenda',         icon: '📅', desc: 'Planificación' },
  { id: 'configuracion', label: 'Configuración',  icon: '⚙️', desc: 'Ajustes empresa' },
]

// Tipos de persona
const TIPOS = [
  {
    id: 'solo_app',
    icon: '🧹',
    label: 'Solo limpiadora',
    desc: 'Accede únicamente a la app móvil /l con PIN. No puede entrar al panel.',
    color: '#059669',
    bg: '#f0fdf4',
    border: '#6ee7b7',
  },
  {
    id: 'admin_solo',
    icon: '👤',
    label: 'Solo panel admin',
    desc: 'Accede al panel web con email y contraseña. No usa la app de limpieza.',
    color: '#4f46e5',
    bg: '#eef2ff',
    border: '#a5b4fc',
  },
  {
    id: 'admin_y_app',
    icon: '🔑',
    label: 'Panel + App limpieza',
    desc: 'Acceso completo: panel web con email/contraseña Y app móvil con PIN.',
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#c4b5fd',
  },
]

const EMPTY_FORM = {
  nombre: '', email: '', password: '', pin: '',
  tipo: '' as string,
  modulos: [] as string[],
  activo: true,
}

export default function EquipoPage() {
  const [personas,     setPersonas]     = useState<any[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showModal,    setShowModal]    = useState(false)
  const [editando,     setEditando]     = useState<any>(null)
  const [form,         setForm]         = useState({ ...EMPTY_FORM })
  const [paso,         setPaso]         = useState(1) // 1=Datos, 2=Tipo, 3=Permisos
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const [confirmarDel, setConfirmarDel] = useState<any>(null)
  const [tab,          setTab]          = useState<'todos'|'panel'|'app'>('todos')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    // Cargar usuarios panel + limpiadoras sueltas en paralelo
    const [rU, rL] = await Promise.all([
      fetch('/api/admin/usuarios-empresa').then(r => r.json()),
      fetch('/api/admin/limpiadoras').then(r => r.json()),
    ])

    const usuarios: any[] = (rU.usuarios || []).map((u: any) => ({
      ...u,
      _origen: 'usuario',
      _tipo: u.modulos?.includes('limpiadora') ? 'admin_y_app' : 'admin_solo',
    }))

    // Limpiadoras que NO tienen usuario_empresa vinculado
    const idsVinculados = new Set(usuarios.map((u: any) => u.limpiadora_id).filter(Boolean))
    const limpSueltas: any[] = (rL.limpiadoras || [])
      .filter((l: any) => !idsVinculados.has(l.id))
      .map((l: any) => ({
        id: l.id, nombre: l.nombre, email: null,
        modulos: ['limpiadora'], activo: l.activa,
        _origen: 'limpiadora', _tipo: 'solo_app',
        limpiadora_id: l.id, limpiadora_color: l.color,
      }))

    setPersonas([...usuarios, ...limpSueltas])
    setLoading(false)
  }

  function abrirNuevo() {
    setEditando(null)
    setForm({ ...EMPTY_FORM })
    setError('')
    setPaso(1)
    setShowModal(true)
  }

  function abrirEditar(p: any) {
    setEditando(p)
    setForm({
      nombre: p.nombre, email: p.email || '', password: '', pin: '',
      tipo: p._tipo,
      modulos: (p.modulos || []).filter((m: string) => m !== 'limpiadora'),
      activo: p.activo,
    })
    setError('')
    setPaso(1)
    setShowModal(true)
  }

  function toggleModulo(id: string) {
    setForm(f => ({
      ...f,
      modulos: f.modulos.includes(id)
        ? f.modulos.filter(m => m !== id)
        : [...f.modulos, id],
    }))
  }

  const needsEmail = form.tipo === 'admin_solo' || form.tipo === 'admin_y_app'
  const needsPin   = form.tipo === 'solo_app'   || form.tipo === 'admin_y_app'
  const needsMods  = form.tipo === 'admin_solo' || form.tipo === 'admin_y_app'

  function validarPaso(): string {
    if (paso === 1) {
      if (!form.nombre.trim()) return 'El nombre es obligatorio'
      if (!editando && needsEmail && !form.email.trim()) return 'El email es obligatorio'
      if (!editando && needsEmail && !form.password.trim()) return 'La contraseña es obligatoria'
      if (!editando && needsPin && (!form.pin || form.pin.length < 4)) return 'El PIN es obligatorio (mín. 4 dígitos)'
    }
    if (paso === 2 && !form.tipo) return 'Elige el tipo de acceso'
    return ''
  }

  function siguientePaso() {
    const err = validarPaso()
    if (err) { setError(err); return }
    setError('')
    // Si es solo_app o admin_solo sin módulos, saltar paso 3
    if (paso === 2 && form.tipo === 'solo_app') { guardar(); return }
    setPaso(p => p + 1)
  }

  async function guardar() {
    setError('')
    setSaving(true)
    try {
      const modulosFinales = needsMods
        ? [...form.modulos, ...(needsPin ? ['limpiadora'] : [])]
        : (needsPin ? ['limpiadora'] : [])

      if (editando) {
        // Editar: distinguir si es limpiadora suelta o usuario panel
        if (editando._origen === 'limpiadora') {
          // Editar directamente en /api/admin/limpiadoras
          const r = await fetch('/api/admin/limpiadoras', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: editando.id,
              nombre: form.nombre,
              activa: form.activo,
              ...(form.pin ? { pin: form.pin } : {}),
            }),
          })
          const d = await r.json()
          if (!d.ok) { setError(d.error || 'Error al guardar'); setSaving(false); return }
        } else {
          const r = await fetch('/api/admin/usuarios-empresa', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: editando.id,
              nombre: form.nombre,
              modulos: modulosFinales,
              activo: form.activo,
              ...(form.password ? { password: form.password } : {}),
              ...(form.pin ? { pin: form.pin } : {}),
            }),
          })
          const d = await r.json()
          if (!d.ok) { setError(d.error || 'Error al guardar'); setSaving(false); return }
        }
      } else {
        if (form.tipo === 'solo_app') {
          // Crear solo en limpiadoras
          const r = await fetch('/api/admin/limpiadoras', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: form.nombre, pin: form.pin, color: '#6366f1' }),
          })
          const d = await r.json()
          if (!d.ok) { setError(d.error || 'Error al crear'); setSaving(false); return }
        } else {
          // Crear usuario panel (con o sin limpiadora)
          const r = await fetch('/api/admin/usuarios-empresa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nombre: form.nombre,
              email: form.email,
              password: form.password,
              modulos: modulosFinales,
              ...(form.pin ? { pin: form.pin } : {}),
            }),
          })
          const d = await r.json()
          if (!d.ok) { setError(d.error || 'Error al crear'); setSaving(false); return }
        }
      }

      await cargar()
      setShowModal(false)
    } catch { setError('Error de conexión') }
    setSaving(false)
  }

  async function eliminar(p: any) {
    if (p._origen === 'limpiadora') {
      await fetch('/api/admin/limpiadoras', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id }),
      })
    } else {
      await fetch('/api/admin/usuarios-empresa', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id }),
      })
    }
    await cargar()
    setConfirmarDel(null)
  }

  const personasFiltradas = personas.filter(p => {
    if (tab === 'panel') return p._tipo !== 'solo_app'
    if (tab === 'app')   return p._tipo === 'solo_app' || p._tipo === 'admin_y_app'
    return true
  })

  const tipoInfo = (t: string) => TIPOS.find(x => x.id === t)

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Nunito', sans-serif" }}>

      {/* Header */}
      <header style={{ background: `linear-gradient(135deg, ${C.primary} 0%, ${C.brand} 100%)`, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <a href="/dashboard" style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, textDecoration: 'none' }}>← Dashboard</a>
          <div style={{ flex: 1 }}>
            <h1 style={{ color: 'white', fontWeight: 800, fontSize: 20, margin: 0 }}>Equipo</h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: 0 }}>
              {personas.length} persona{personas.length !== 1 ? 's' : ''} · Panel y App unificados
            </p>
          </div>
          <button onClick={abrirNuevo}
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            + Añadir
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'todos', label: `Todos (${personas.length})` },
            { id: 'panel', label: `Panel (${personas.filter(p => p._tipo !== 'solo_app').length})` },
            { id: 'app',   label: `App /l (${personas.filter(p => p._tipo !== 'admin_solo').length})` },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              style={{
                padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 700,
                background: tab === t.id ? 'white' : 'rgba(255,255,255,0.15)',
                color: tab === t.id ? C.primary : 'rgba(255,255,255,0.8)',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div style={{ padding: '16px', maxWidth: 600, margin: '0 auto' }}>

        {loading && <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Cargando...</div>}

        {!loading && personasFiltradas.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, marginTop: 8 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 6 }}>Sin personas en este grupo</div>
            <button onClick={abrirNuevo}
              style={{ background: C.primary, color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}>
              + Añadir persona
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {personasFiltradas.map((p: any) => {
            const tipo = tipoInfo(p._tipo)
            return (
              <div key={p.id} style={{
                background: 'white', borderRadius: 14,
                border: `1px solid ${C.border}`,
                padding: '14px 16px',
                display: 'flex', alignItems: 'flex-start', gap: 12,
                opacity: p.activo ? 1 : 0.5,
              }}>
                {/* Avatar */}
                <div style={{
                  width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                  background: tipo?.bg || C.light,
                  border: `2px solid ${tipo?.border || C.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20,
                }}>
                  {tipo?.icon}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{p.nombre}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 7px',
                      background: tipo?.bg, color: tipo?.color,
                    }}>
                      {tipo?.label}
                    </span>
                    {!p.activo && (
                      <span style={{ fontSize: 10, color: C.muted, background: C.bg, borderRadius: 6, padding: '2px 7px' }}>Inactivo</span>
                    )}
                  </div>

                  {p.email && (
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{p.email}</div>
                  )}

                  {/* Badges de acceso */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(p._tipo === 'admin_y_app' || p._tipo === 'solo_app') && (
                      <span style={{ fontSize: 10, background: '#f0fdf4', color: '#059669', borderRadius: 6, padding: '2px 7px', fontWeight: 600 }}>
                        🧹 App /l con PIN
                      </span>
                    )}
                    {(p._tipo === 'admin_solo' || p._tipo === 'admin_y_app') && (
                      <span style={{ fontSize: 10, background: C.light, color: C.primary, borderRadius: 6, padding: '2px 7px', fontWeight: 600 }}>
                        💻 Panel admin
                      </span>
                    )}
                    {(p.modulos || []).filter((m: string) => m !== 'limpiadora').map((m: string) => {
                      const mod = MODULOS.find(x => x.id === m)
                      return mod ? (
                        <span key={m} style={{ fontSize: 10, background: C.bg, borderRadius: 6, padding: '2px 7px', color: C.text }}>
                          {mod.icon} {mod.label}
                        </span>
                      ) : null
                    })}
                  </div>

                  {p.ultimo_acceso && (
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 5 }}>
                      Último acceso: {new Date(p.ultimo_acceso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>

                {/* Acciones */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => abrirEditar(p)}
                    style={{ background: C.light, color: C.primary, border: 'none', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    ✏️
                  </button>
                  <button onClick={() => setConfirmarDel(p)}
                    style={{ background: C.redBg, color: C.red, border: 'none', borderRadius: 8, padding: '6px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    🗑
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          MODAL — Stepper 3 pasos
      ══════════════════════════════════════════════════════════ */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '22px 22px 0 0', width: '100%', maxWidth: 520, maxHeight: '95vh', overflow: 'auto' }}>

            {/* Header modal */}
            <div style={{ background: `linear-gradient(135deg, ${C.primary} 0%, ${C.brand} 100%)`, borderRadius: '22px 22px 0 0', padding: '16px 20px', position: 'sticky', top: 0, zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: editando ? 0 : 12 }}>
                <div style={{ flex: 1, color: 'white', fontWeight: 800, fontSize: 16 }}>
                  {editando ? `Editar — ${editando.nombre}` : 'Nueva persona'}
                </div>
                <button onClick={() => setShowModal(false)}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 32, height: 32, borderRadius: 8, fontSize: 16, cursor: 'pointer' }}>✕</button>
              </div>

              {/* Stepper — solo en creación */}
              {!editando && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {[
                    { n: 1, label: 'Datos' },
                    { n: 2, label: 'Tipo' },
                    { n: 3, label: 'Permisos', skip: form.tipo === 'solo_app' },
                  ].map((s, i) => (
                    <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {i > 0 && <div style={{ width: 20, height: 1, background: 'rgba(255,255,255,0.3)' }} />}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        opacity: s.skip ? 0.35 : 1,
                      }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: '50%',
                          background: paso >= s.n ? 'white' : 'rgba(255,255,255,0.2)',
                          color: paso >= s.n ? C.primary : 'rgba(255,255,255,0.7)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 800,
                        }}>
                          {paso > s.n ? '✓' : s.n}
                        </div>
                        <span style={{ fontSize: 11, color: paso >= s.n ? 'white' : 'rgba(255,255,255,0.55)', fontWeight: 600 }}>{s.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ padding: '20px' }}>
              {error && (
                <div style={{ background: C.redBg, border: `1px solid #fca5a5`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: C.red }}>
                  ⚠️ {error}
                </div>
              )}

              {/* ── PASO 1 o EDICIÓN: Datos ── */}
              {(paso === 1 || editando) && (
                <div>
                  {/* Nombre */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nombre *</label>
                    <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                      placeholder="Ej. Carmen García"
                      style={{ width: '100%', padding: '11px 13px', borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  </div>

                  {/* Email */}
                  {(needsEmail || (editando && editando._tipo !== 'solo_app')) && (
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email {!editando && '*'}</label>
                      <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        type="email" placeholder="carmen@empresa.com"
                        disabled={!!editando}
                        style={{ width: '100%', padding: '11px 13px', borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', opacity: editando ? 0.5 : 1 }} />
                    </div>
                  )}

                  {/* Contraseña */}
                  {(needsEmail || (editando && editando._tipo !== 'solo_app')) && (
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {editando ? 'Nueva contraseña (vacío = no cambiar)' : 'Contraseña *'}
                      </label>
                      <input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        type="password" placeholder={editando ? '••••••••' : 'Mínimo 8 caracteres'}
                        style={{ width: '100%', padding: '11px 13px', borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    </div>
                  )}

                  {/* PIN */}
                  {(needsPin || (editando && (editando._tipo === 'solo_app' || editando._tipo === 'admin_y_app'))) && (
                    <div style={{ background: '#f0fdf4', border: `2px solid #6ee7b7`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#059669', marginBottom: 4 }}>🔢 PIN app de limpieza</div>
                      <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>
                        {editando ? 'Vacío = mantener PIN actual.' : 'PIN numérico para entrar a /l. Único en la empresa.'}
                      </div>
                      <input
                        value={form.pin}
                        onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))}
                        placeholder={editando ? 'Nuevo PIN (vacío = no cambiar)' : 'Ej. 5678'}
                        inputMode="numeric" maxLength={8}
                        style={{
                          width: '100%', padding: '12px', borderRadius: 10,
                          border: `1.5px solid #6ee7b7`, fontSize: 24,
                          letterSpacing: '0.4em', textAlign: 'center',
                          fontFamily: 'monospace', fontWeight: 800,
                          color: '#059669', background: 'white', boxSizing: 'border-box',
                        }} />
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 6, textAlign: 'center' }}>Mínimo 4 dígitos · Solo números</div>
                    </div>
                  )}

                  {/* Toggle activo — solo edición */}
                  {editando && (
                    <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.bg, borderRadius: 10, padding: '12px 14px' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Activo</div>
                        <div style={{ fontSize: 11, color: C.muted }}>Si lo desactivas, pierde todos los accesos</div>
                      </div>
                      <button type="button" onClick={() => setForm(f => ({ ...f, activo: !f.activo }))}
                        style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: form.activo ? C.ok : C.border, position: 'relative', flexShrink: 0 }}>
                        <span style={{ position: 'absolute', top: 2, left: form.activo ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                      </button>
                    </div>
                  )}

                  {/* Módulos — solo edición admin */}
                  {editando && needsMods && (
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Módulos con acceso</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {MODULOS.map(m => {
                          const activo = form.modulos.includes(m.id)
                          return (
                            <button key={m.id} type="button" onClick={() => toggleModulo(m.id)}
                              style={{ padding: '10px 12px', borderRadius: 10, border: `2px solid ${activo ? C.primary : C.border}`, background: activo ? C.light : 'white', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 16 }}>{m.icon}</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: activo ? C.primary : C.text }}>{m.label}</div>
                              </div>
                              {activo && <span style={{ color: C.primary, fontSize: 14 }}>✓</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── PASO 2: Tipo de acceso (solo creación) ── */}
              {!editando && paso === 2 && (
                <div>
                  <p style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
                    ¿Cómo va a usar <strong>{form.nombre}</strong> la aplicación?
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {TIPOS.map(t => {
                      const sel = form.tipo === t.id
                      return (
                        <button key={t.id} type="button"
                          onClick={() => {
                            setForm(f => ({
                              ...f, tipo: t.id,
                              // Resetear campos irrelevantes
                              email: t.id === 'solo_app' ? '' : f.email,
                              password: t.id === 'solo_app' ? '' : f.password,
                              pin: t.id === 'admin_solo' ? '' : f.pin,
                            }))
                          }}
                          style={{
                            padding: '14px 16px', borderRadius: 14, textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer',
                            border: `2px solid ${sel ? t.color : C.border}`,
                            background: sel ? t.bg : 'white',
                            display: 'flex', alignItems: 'flex-start', gap: 12,
                          }}>
                          <span style={{ fontSize: 26, lineHeight: 1 }}>{t.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: sel ? t.color : C.text, marginBottom: 3 }}>{t.label}</div>
                            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{t.desc}</div>
                          </div>
                          {sel && (
                            <div style={{ width: 22, height: 22, borderRadius: '50%', background: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13, flexShrink: 0 }}>✓</div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── PASO 3: Permisos panel (solo creación admin) ── */}
              {!editando && paso === 3 && (
                <div>
                  <p style={{ fontSize: 13, color: C.muted, marginBottom: 14, lineHeight: 1.6 }}>
                    ¿Qué módulos puede ver <strong>{form.nombre}</strong> en el panel?
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                    {MODULOS.map(m => {
                      const activo = form.modulos.includes(m.id)
                      return (
                        <button key={m.id} type="button" onClick={() => toggleModulo(m.id)}
                          style={{ padding: '11px 12px', borderRadius: 10, border: `2px solid ${activo ? C.primary : C.border}`, background: activo ? C.light : 'white', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 18 }}>{m.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: activo ? C.primary : C.text }}>{m.label}</div>
                            <div style={{ fontSize: 10, color: C.muted }}>{m.desc}</div>
                          </div>
                          {activo && <span style={{ color: C.primary, fontSize: 13 }}>✓</span>}
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 4 }}>
                    Puedes cambiar los permisos después en cualquier momento
                  </div>
                </div>
              )}

              {/* ── Botones de navegación ── */}
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                {!editando && paso > 1 && (
                  <button type="button" onClick={() => { setError(''); setPaso(p => p - 1) }}
                    style={{ flex: 1, padding: '12px', background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, color: C.muted, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                    ← Atrás
                  </button>
                )}
                {(editando || paso === 1) && (
                  <button type="button" onClick={() => setShowModal(false)}
                    style={{ flex: 1, padding: '12px', background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, color: C.muted, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                    Cancelar
                  </button>
                )}

                {editando ? (
                  <button type="button" onClick={guardar} disabled={saving}
                    style={{ flex: 2, padding: '12px', background: saving ? C.muted : C.primary, border: 'none', borderRadius: 10, fontSize: 14, color: 'white', cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
                    {saving ? 'Guardando...' : '💾 Guardar cambios'}
                  </button>
                ) : paso < 3 && form.tipo !== 'solo_app' ? (
                  <button type="button" onClick={siguientePaso}
                    style={{ flex: 2, padding: '12px', background: C.primary, border: 'none', borderRadius: 10, fontSize: 14, color: 'white', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
                    Siguiente →
                  </button>
                ) : (
                  <button type="button" onClick={() => { const e = validarPaso(); if (e) { setError(e); return } guardar() }} disabled={saving}
                    style={{ flex: 2, padding: '12px', background: saving ? C.muted : C.ok, border: 'none', borderRadius: 10, fontSize: 14, color: 'white', cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
                    {saving ? 'Creando...' : '✅ Crear persona'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar eliminar */}
      {confirmarDel && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, maxWidth: 320, width: '100%' }}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>🗑️</div>
            <div style={{ fontWeight: 700, fontSize: 16, textAlign: 'center', marginBottom: 8 }}>¿Eliminar a {confirmarDel.nombre}?</div>
            <div style={{ fontSize: 13, color: C.muted, textAlign: 'center', marginBottom: 20, lineHeight: 1.5 }}>
              Perderá todos sus accesos al panel y a la app. Esta acción no se puede deshacer.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmarDel(null)}
                style={{ flex: 1, padding: '10px', background: C.bg, border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                Cancelar
              </button>
              <button onClick={() => eliminar(confirmarDel)}
                style={{ flex: 1, padding: '10px', background: C.red, color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
