'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'
import BebidasEventoTab from '@/components/owner/BebidasEventoTab'

// ─── Types ────────────────────────────────────────────────────────────────────
type MenuItem = {
  id?: string; nombre: string; descripcion?: string
  cantidad_por_persona: number; es_opcional: boolean
  grupo_opcion?: string; alergenos: string[]; producto_id?: string
  aplica_infantil: boolean
}
type MenuPase = {
  id?: string; numero_pase: number; nombre: string
  hora_offset_min: number; descripcion?: string; items: MenuItem[]
}
type MenuEvento = {
  id: string; nombre: string; descripcion?: string
  precio_por_persona: number | null; activo: boolean
  temporada?: string; tipo_evento?: string[]
  min_comensales?: number; max_comensales?: number
  tiene_menu_infantil: boolean; precio_infantil?: number
}
type MenuDetalle = MenuEvento & { pases: (MenuPase & { items: MenuItem[] })[] }

// ─── Constantes ───────────────────────────────────────────────────────────────
const ALERGENOS_14 = ['gluten','crustaceos','huevos','pescado','cacahuetes','soja','lacteos','frutos_secos','apio','mostaza','sesamo','sulfitos','altramuces','moluscos']
const TEMPORADAS = ['todo_año','primavera','verano','otono','invierno']
const TIPOS_EVENTO = ['boda','comunion','bautizo','cumpleanos','empresa','otro']
const fmtEur = (n: number | null) => n ? `${n.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €` : '—'

// ─── Form menú ────────────────────────────────────────────────────────────────
function FormMenu({ restauranteId, sh, menu, onGuardado, onCancel }: {
  restauranteId: string
  sh: () => Record<string, string>
  menu?: MenuDetalle | null
  onGuardado: () => void
  onCancel: () => void
}) {
  const isEdit = !!menu
  const [tabActiva, setTabActiva] = useState<'info' | 'bebidas'>('info')
  const [form, setForm] = useState({
    nombre: menu?.nombre ?? '',
    descripcion: menu?.descripcion ?? '',
    precio_por_persona: menu?.precio_por_persona?.toString() ?? '',
    temporada: menu?.temporada ?? 'todo_año',
    tipo_evento: menu?.tipo_evento ?? ['boda','comunion'],
    min_comensales: menu?.min_comensales?.toString() ?? '',
    max_comensales: menu?.max_comensales?.toString() ?? '',
    tiene_menu_infantil: menu?.tiene_menu_infantil ?? false,
    precio_infantil: menu?.precio_infantil?.toString() ?? '',
  })
  const [pases, setPases] = useState<MenuPase[]>(menu?.pases ?? [
    { numero_pase: 1, nombre: 'Entrantes', hora_offset_min: 0, descripcion: '', items: [] },
    { numero_pase: 2, nombre: 'Principal', hora_offset_min: 45, descripcion: '', items: [] },
    { numero_pase: 3, nombre: 'Postre', hora_offset_min: 90, descripcion: '', items: [] },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [paseActivo, setPaseActivo] = useState(0)

  const addPase = () => setPases(p => [...p, { numero_pase: p.length + 1, nombre: `Pase ${p.length + 1}`, hora_offset_min: p.length * 45, items: [] }])

  const addItem = (paseIdx: number) => setPases(p => {
    const n = [...p]; n[paseIdx] = { ...n[paseIdx], items: [...n[paseIdx].items, { nombre: '', cantidad_por_persona: 1, es_opcional: false, alergenos: [], aplica_infantil: true }] }; return n
  })

  const updateItem = (paseIdx: number, itemIdx: number, field: string, value: unknown) => setPases(p => {
    const n = [...p]; const items = [...n[paseIdx].items]; items[itemIdx] = { ...items[itemIdx], [field]: value }; n[paseIdx] = { ...n[paseIdx], items }; return n
  })

  const removeItem = (paseIdx: number, itemIdx: number) => setPases(p => {
    const n = [...p]; n[paseIdx] = { ...n[paseIdx], items: n[paseIdx].items.filter((_, i) => i !== itemIdx) }; return n
  })

  const toggleTipoEvento = (tipo: string) => setForm(f => ({
    ...f, tipo_evento: f.tipo_evento.includes(tipo) ? f.tipo_evento.filter(t => t !== tipo) : [...f.tipo_evento, tipo]
  }))

  const handleGuardar = async () => {
    if (!form.nombre) { setError('Falta el nombre del menú'); return }
    setSaving(true); setError('')
    try {
      const body = {
        ...(isEdit ? { id: menu!.id } : {}),
        nombre: form.nombre,
        descripcion: form.descripcion,
        precio_por_persona: form.precio_por_persona ? parseFloat(form.precio_por_persona) : null,
        temporada: form.temporada,
        tipo_evento: form.tipo_evento,
        min_comensales: form.min_comensales ? parseInt(form.min_comensales) : null,
        max_comensales: form.max_comensales ? parseInt(form.max_comensales) : null,
        tiene_menu_infantil: form.tiene_menu_infantil,
        precio_infantil: form.precio_infantil ? parseFloat(form.precio_infantil) : null,
        pases: isEdit ? undefined : pases,
      }
      const res = await fetch('/api/owner/eventos/menus', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Error'); return }
      onGuardado()
    } finally { setSaving(false) }
  }

  const inp = (field: string, type = 'text', placeholder = '') => (
    <input type={type} placeholder={placeholder}
      value={(form as Record<string, unknown>)[field] as string}
      onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
      style={{ width: '100%', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '7px 9px', fontFamily: SN, fontSize: 13, color: C.ink, boxSizing: 'border-box' as const }}
    />
  )

  return (
    <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
      <div style={{ fontFamily: SE, fontSize: 17, fontWeight: 700, color: C.ink, marginBottom: 16 }}>
        {isEdit ? `Editar: ${menu!.nombre}` : 'Nuevo menú de evento'}
      </div>

      {/* Tabs: solo en edición */}
      {isEdit && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${C.rule}`, paddingBottom: 8 }}>
          {(['info', 'bebidas'] as const).map(tab => (
            <button key={tab} onClick={() => setTabActiva(tab)} style={{
              padding: '6px 14px', borderRadius: '6px 6px 0 0', border: 'none', cursor: 'pointer',
              fontFamily: SN, fontSize: 13, fontWeight: tabActiva === tab ? 600 : 400,
              background: tabActiva === tab ? C.ink : 'transparent',
              color: tabActiva === tab ? C.paper : C.ink3,
            }}>
              {tab === 'info' ? '📋 Info y pases' : '🍾 Bebidas'}
            </button>
          ))}
        </div>
      )}

      {/* Tab Bebidas */}
      {isEdit && tabActiva === 'bebidas' && (
        <BebidasEventoTab
          menuId={menu!.id}
          restauranteId={restauranteId}
          sh={sh}
          precioInfantil={menu!.precio_infantil ?? 0}
          menuNinoDescripcion={(menu as MenuDetalle & { menu_nino_descripcion?: string }).menu_nino_descripcion ?? ''}
          edadMaximaNino={(menu as MenuDetalle & { edad_maxima_nino?: number }).edad_maxima_nino ?? 12}
          onNinosChange={(data) => {
            setForm(f => ({
              ...f,
              precio_infantil: data.precio_infantil.toString(),
            }))
          }}
        />
      )}

      {/* Tab Info (siempre visible en creación, condicional en edición) */}
      {(!isEdit || tabActiva === 'info') && (<>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '.08em' }}>Nombre *</div>
          {inp('nombre', 'text', 'Menú Clásico Primavera')}
        </div>
        <div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '.08em' }}>€ / persona</div>
          {inp('precio_por_persona', 'number', '45')}
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '.08em' }}>Descripción</div>
        <textarea placeholder="Descripción del menú para el presupuesto..." value={form.descripcion}
          onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} rows={2}
          style={{ width: '100%', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '7px 9px', fontFamily: SN, fontSize: 13, color: C.ink, resize: 'vertical' as const, boxSizing: 'border-box' as const }} />
      </div>

      {/* Tipos de evento */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '.08em' }}>Aplica para</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
          {TIPOS_EVENTO.map(t => (
            <button key={t} onClick={() => toggleTipoEvento(t)} style={{
              padding: '4px 10px', borderRadius: 99, border: `1px solid ${C.rule}`,
              background: form.tipo_evento.includes(t) ? C.ink : 'transparent',
              color: form.tipo_evento.includes(t) ? C.paper : C.ink3,
              fontFamily: SN, fontSize: 11, cursor: 'pointer',
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Aforo y menú infantil */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '.08em' }}>Mín. comensales</div>
          {inp('min_comensales', 'number', '50')}
        </div>
        <div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '.08em' }}>Máx. comensales</div>
          {inp('max_comensales', 'number', '550')}
        </div>
        <div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '.08em' }}>Temporada</div>
          <select value={form.temporada} onChange={e => setForm(f => ({ ...f, temporada: e.target.value }))}
            style={{ width: '100%', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '7px 9px', fontFamily: SN, fontSize: 13, color: C.ink }}>
            {TEMPORADAS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontFamily: SN, fontSize: 13, color: C.ink, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.tiene_menu_infantil} onChange={e => setForm(f => ({ ...f, tiene_menu_infantil: e.target.checked }))} />
          Menú infantil disponible
        </label>
        {form.tiene_menu_infantil && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>Precio:</span>
            <input type="number" placeholder="22" value={form.precio_infantil}
              onChange={e => setForm(f => ({ ...f, precio_infantil: e.target.value }))}
              style={{ width: 70, background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '5px 7px', fontFamily: SN, fontSize: 13, color: C.ink }} />
            <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>€</span>
          </div>
        )}
      </div>

      {/* PASES — solo en creación */}
      {!isEdit && (
        <div style={{ borderTop: `1px solid ${C.rule}`, paddingTop: 16, marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontFamily: SE, fontSize: 15, fontWeight: 700, color: C.ink }}>Pases del menú</div>
            <button onClick={addPase} style={{ padding: '5px 12px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 12, color: C.ink3, cursor: 'pointer' }}>
              + Añadir pase
            </button>
          </div>

          {/* Tabs de pases */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' as const }}>
            {pases.map((p, i) => (
              <button key={i} onClick={() => setPaseActivo(i)} style={{
                padding: '5px 12px', borderRadius: 5,
                background: paseActivo === i ? C.ink : 'transparent',
                border: `1px solid ${C.rule}`,
                color: paseActivo === i ? C.paper : C.ink3,
                fontFamily: SN, fontSize: 12, cursor: 'pointer',
              }}>{p.nombre}</button>
            ))}
          </div>

          {pases[paseActivo] && (
            <div style={{ background: C.bone, borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 3 }}>Nombre del pase</div>
                  <input value={pases[paseActivo].nombre}
                    onChange={e => setPases(p => { const n=[...p]; n[paseActivo]={...n[paseActivo],nombre:e.target.value}; return n })}
                    style={{ width: '100%', background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '6px 8px', fontFamily: SN, fontSize: 13, color: C.ink, boxSizing: 'border-box' as const }} />
                </div>
                <div>
                  <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 3 }}>Offset (min)</div>
                  <input type="number" value={pases[paseActivo].hora_offset_min}
                    onChange={e => setPases(p => { const n=[...p]; n[paseActivo]={...n[paseActivo],hora_offset_min:parseInt(e.target.value)||0}; return n })}
                    style={{ width: '100%', background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '6px 8px', fontFamily: SN, fontSize: 13, color: C.ink, boxSizing: 'border-box' as const }} />
                </div>
              </div>

              {/* Items del pase */}
              <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '.08em' }}>
                Platos ({pases[paseActivo].items.length})
              </div>
              {pases[paseActivo].items.map((item, ii) => (
                <div key={ii} style={{ background: C.paper, borderRadius: 6, padding: '8px 10px', marginBottom: 6, border: `1px solid ${C.rule}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr auto', gap: 6, alignItems: 'center' }}>
                    <input placeholder="Nombre del plato" value={item.nombre}
                      onChange={e => updateItem(paseActivo, ii, 'nombre', e.target.value)}
                      style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '5px 7px', fontFamily: SN, fontSize: 12, color: C.ink }} />
                    <input type="number" step="0.1" placeholder="1 rac/p" value={item.cantidad_por_persona}
                      onChange={e => updateItem(paseActivo, ii, 'cantidad_por_persona', parseFloat(e.target.value)||1)}
                      style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '5px 7px', fontFamily: SM, fontSize: 12, color: C.ink }} />
                    <button onClick={() => removeItem(paseActivo, ii)} style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: C.red + '22', color: C.red, cursor: 'pointer', fontFamily: SN, fontSize: 12 }}>✕</button>
                  </div>
                  {/* Alérgenos */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginTop: 6 }}>
                    {ALERGENOS_14.map(al => (
                      <button key={al} onClick={() => updateItem(paseActivo, ii, 'alergenos',
                        item.alergenos.includes(al) ? item.alergenos.filter(a => a !== al) : [...item.alergenos, al]
                      )} style={{
                        padding: '2px 7px', borderRadius: 99, border: `1px solid ${C.rule}`,
                        background: item.alergenos.includes(al) ? C.amber + '33' : 'transparent',
                        color: item.alergenos.includes(al) ? C.amber : C.ink3,
                        fontFamily: SN, fontSize: 9, cursor: 'pointer',
                      }}>{al}</button>
                    ))}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontFamily: SN, fontSize: 11, color: C.ink3, cursor: 'pointer' }}>
                      <input type="checkbox" checked={item.es_opcional} onChange={e => updateItem(paseActivo, ii, 'es_opcional', e.target.checked)} />
                      Plato alternativo (opcional)
                    </label>
                  </div>
                </div>
              ))}
              <button onClick={() => addItem(paseActivo)} style={{ padding: '5px 12px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 12, color: C.ink3, cursor: 'pointer', marginTop: 4 }}>
                + Añadir plato
              </button>
            </div>
          )}
        </div>
      )}

      </>)}

      {error && <div style={{ color: C.red, fontFamily: SN, fontSize: 13, margin: '10px 0' }}>{error}</div>}

      {(!isEdit || tabActiva === 'info') && (
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 6, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 13, color: C.ink3, cursor: 'pointer' }}>Cancelar</button>
        <button onClick={handleGuardar} disabled={saving} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: C.red, color: '#fff', fontFamily: SN, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear menú'}
        </button>
      </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
interface MenusEventoTabProps {
  restauranteId: string
  sh: () => Record<string, string>
  modoSelector?: boolean                           // para seleccionar menú al crear evento
  onSeleccionar?: (menu: MenuEvento) => void
}

export default function MenusEventoTab({ restauranteId, sh, modoSelector, onSeleccionar }: MenusEventoTabProps) {
  const [menus, setMenus] = useState<MenuEvento[]>([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [menuEditar, setMenuEditar] = useState<MenuDetalle | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/owner/eventos/menus', { headers: sh() })
    const data = await res.json()
    setMenus(data.menus ?? [])
    setLoading(false)
  }, [sh])

  useEffect(() => { cargar() }, [cargar])

  const handleEditar = async (id: string) => {
    setCargandoDetalle(true)
    const res = await fetch(`/api/owner/eventos/menus?id=${id}`, { headers: sh() })
    const data = await res.json()
    setMenuEditar(data.menu)
    setCargandoDetalle(false)
  }

  const handleEliminar = async (id: string) => {
    await fetch('/api/owner/eventos/menus', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ id }) })
    cargar()
  }

  const onGuardado = () => { setMostrarForm(false); setMenuEditar(null); cargar() }

  return (
    <div style={{ padding: modoSelector ? 0 : '0 0 40px' }}>

      {!modoSelector && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: SE, fontSize: 17, fontWeight: 700, color: C.ink, fontStyle: 'italic' }}>
            Plantillas de menú
          </div>
          <button onClick={() => { setMostrarForm(true); setMenuEditar(null) }} style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: C.red, color: '#fff', fontFamily: SN, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            + Nuevo menú
          </button>
        </div>
      )}

      {(mostrarForm || menuEditar) && (
        <FormMenu restauranteId={restauranteId} sh={sh} menu={menuEditar}
          onGuardado={onGuardado} onCancel={() => { setMostrarForm(false); setMenuEditar(null) }} />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, fontFamily: SN, fontSize: 13, color: C.ink3 }}>Cargando menús...</div>
      ) : menus.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, background: C.paper, borderRadius: 10, border: `1px solid ${C.rule}` }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🍽️</div>
          <div style={{ fontFamily: SE, fontSize: 16, color: C.ink, marginBottom: 4 }}>Sin menús todavía</div>
          <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>Crea tu primera plantilla de menú para asignarla a eventos y calcular automáticamente presupuestos y listas de compra.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {menus.map(m => (
            <div key={m.id} style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: SE, fontSize: 17, fontWeight: 700, color: C.ink, fontStyle: 'italic', marginBottom: 4 }}>{m.nombre}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                    {m.precio_por_persona && (
                      <span style={{ fontFamily: SE, fontSize: 20, fontWeight: 700, color: C.green, fontStyle: 'italic' }}>{fmtEur(m.precio_por_persona)}/p</span>
                    )}
                    {m.min_comensales && m.max_comensales && (
                      <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{m.min_comensales}–{m.max_comensales} personas</span>
                    )}
                    {m.temporada && m.temporada !== 'todo_año' && (
                      <span style={{ fontFamily: SN, fontSize: 11, padding: '2px 8px', borderRadius: 99, background: C.amber + '22', color: C.amber }}>{m.temporada}</span>
                    )}
                    {m.tiene_menu_infantil && (
                      <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>👶 Infantil {m.precio_infantil ? fmtEur(m.precio_infantil) + '/p' : ''}</span>
                    )}
                  </div>
                  {m.tipo_evento?.length && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' as const }}>
                      {m.tipo_evento.map(t => (
                        <span key={t} style={{ fontFamily: SN, fontSize: 10, padding: '2px 7px', borderRadius: 99, background: C.ink + '11', color: C.ink3 }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {modoSelector ? (
                    <button onClick={() => onSeleccionar?.(m)} style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: C.green, color: '#fff', fontFamily: SN, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      Seleccionar
                    </button>
                  ) : (
                    <>
                      <button onClick={() => handleEditar(m.id)} disabled={cargandoDetalle} style={{ padding: '5px 12px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 12, color: C.ink3, cursor: 'pointer' }}>Editar</button>
                      <button onClick={() => handleEliminar(m.id)} style={{ padding: '5px 12px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 12, color: C.red, cursor: 'pointer' }}>Archivar</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
