'use client'
import { useState, useEffect } from 'react'
import { C, SN } from '@/lib/colors'

const TIPOS = [
  { value: 'extintor', label: '🧯 Extintores', dias: 365 },
  { value: 'plaga', label: '🐀 Control plagas', dias: 90 },
  { value: 'legionela', label: '💧 Legionela', dias: 365 },
  { value: 'gas', label: '🔥 Revisión gas', dias: 730 },
  { value: 'electrico', label: '⚡ Revisión eléctrica', dias: 1825 },
  { value: 'seguro', label: '📋 Seguro', dias: 365 },
  { value: 'limpieza', label: '🧹 Limpieza general', dias: 30 },
  { value: 'climatizacion', label: '❄️ Climatización', dias: 180 },
  { value: 'ascensor', label: '🛗 Ascensor', dias: 365 },
  { value: 'otro', label: '🔧 Otro', dias: 365 },
]

interface ItemMantenimiento {
  id: string
  tipo: string
  descripcion: string
  periodicidad_dias: number
  ultima_revision: string | null
  proxima_revision: string
  alerta_dias_antes: number
  proveedor_nombre: string | null
  coste_estimado: number | null
  estado: 'al_dia' | 'proximo' | 'vencido'
  notas: string | null
}

const estadoColor = (estado: string) => {
  if (estado === 'vencido') return C.red
  if (estado === 'proximo') return C.amber
  return C.green
}

const estadoLabel = (estado: string) => {
  if (estado === 'vencido') return 'VENCIDO'
  if (estado === 'proximo') return 'Próximo'
  return 'Al día'
}

const emptyForm = () => ({
  tipo: 'extintor', descripcion: 'Extintores', periodicidad_dias: 365,
  ultima_revision: '', proxima_revision: '', alerta_dias_antes: 30,
  proveedor_nombre: '', coste_estimado: '', notas: '',
})

export default function MantenimientoTab({ espacioId }: { espacioId: string }) {
  const [items, setItems] = useState<ItemMantenimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<ItemMantenimiento | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm())

  useEffect(() => { cargar() }, [espacioId])

  async function cargar() {
    setLoading(true)
    const r = await fetch(`/api/owner/espacios/${espacioId}/mantenimiento`)
    const d = await r.json()
    setItems(d.items ?? [])
    setLoading(false)
  }

  function tipoChange(tipo: string) {
    const t = TIPOS.find(t => t.value === tipo)
    const proxima = new Date()
    proxima.setDate(proxima.getDate() + (t?.dias ?? 365))
    setForm(f => ({
      ...f, tipo,
      periodicidad_dias: t?.dias ?? 365,
      descripcion: t?.label.replace(/^.{2} /, '') ?? '',
      proxima_revision: proxima.toISOString().split('T')[0],
    }))
  }

  async function guardar() {
    setSaving(true)
    const method = editItem ? 'PATCH' : 'POST'
    const body = editItem
      ? { itemId: editItem.id, ...form, coste_estimado: form.coste_estimado ? parseFloat(form.coste_estimado) : null }
      : { ...form, coste_estimado: form.coste_estimado ? parseFloat(form.coste_estimado) : null }
    await fetch(`/api/owner/espacios/${espacioId}/mantenimiento`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    setSaving(false)
    setShowForm(false)
    setEditItem(null)
    setForm(emptyForm())
    cargar()
  }

  async function marcarRevisado(item: ItemMantenimiento) {
    const hoy = new Date().toISOString().split('T')[0]
    await fetch(`/api/owner/espacios/${espacioId}/mantenimiento`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: item.id, ultima_revision: hoy }),
    })
    cargar()
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este recordatorio?')) return
    await fetch(`/api/owner/espacios/${espacioId}/mantenimiento?itemId=${id}`, { method: 'DELETE' })
    cargar()
  }

  function abrirEditar(item: ItemMantenimiento) {
    setEditItem(item)
    setForm({
      tipo: item.tipo, descripcion: item.descripcion,
      periodicidad_dias: item.periodicidad_dias,
      ultima_revision: item.ultima_revision ?? '',
      proxima_revision: item.proxima_revision,
      alerta_dias_antes: item.alerta_dias_antes,
      proveedor_nombre: item.proveedor_nombre ?? '',
      coste_estimado: item.coste_estimado?.toString() ?? '',
      notas: item.notas ?? '',
    })
    setShowForm(true)
  }

  const input: React.CSSProperties = {
    background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 8,
    color: C.paper, padding: '8px 12px', fontFamily: SN, fontSize: 14,
    width: '100%', outline: 'none', boxSizing: 'border-box',
  }

  const vencidos = items.filter(i => i.estado === 'vencido')
  const proximos = items.filter(i => i.estado === 'proximo')
  const alDia = items.filter(i => i.estado === 'al_dia')

  return (
    <div style={{ fontFamily: SN }}>
      {/* Badges resumen */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {vencidos.length > 0 && (
          <span style={{ background: `${C.red}22`, border: `1px solid ${C.red}`, borderRadius: 8, padding: '5px 12px', color: C.red, fontSize: 13, fontWeight: 600 }}>
            🔴 {vencidos.length} vencido{vencidos.length > 1 ? 's' : ''}
          </span>
        )}
        {proximos.length > 0 && (
          <span style={{ background: `${C.amber}22`, border: `1px solid ${C.amber}`, borderRadius: 8, padding: '5px 12px', color: C.amber, fontSize: 13, fontWeight: 600 }}>
            🟡 {proximos.length} próximo{proximos.length > 1 ? 's' : ''}
          </span>
        )}
        {alDia.length > 0 && (
          <span style={{ background: `${C.green}22`, border: `1px solid ${C.green}`, borderRadius: 8, padding: '5px 12px', color: C.green, fontSize: 13, fontWeight: 600 }}>
            ✅ {alDia.length} al día
          </span>
        )}
        <button
          onClick={() => { setShowForm(true); setEditItem(null); setForm(emptyForm()) }}
          style={{ marginLeft: 'auto', background: C.red, color: C.paper, border: 'none', borderRadius: 8, padding: '7px 16px', fontFamily: SN, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          + Añadir
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ color: C.paper, fontWeight: 700, fontSize: 15, marginBottom: 14 }}>
            {editItem ? 'Editar recordatorio' : 'Nuevo recordatorio'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div>
              <label style={{ color: C.ink3, fontSize: 12, display: 'block', marginBottom: 4 }}>Tipo</label>
              <select value={form.tipo} onChange={e => tipoChange(e.target.value)} style={input}>
                {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: C.ink3, fontSize: 12, display: 'block', marginBottom: 4 }}>Descripción</label>
              <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} style={input} />
            </div>
            <div>
              <label style={{ color: C.ink3, fontSize: 12, display: 'block', marginBottom: 4 }}>Periodicidad (días)</label>
              <input type="number" value={form.periodicidad_dias} onChange={e => setForm(f => ({ ...f, periodicidad_dias: parseInt(e.target.value) }))} style={input} />
            </div>
            <div>
              <label style={{ color: C.ink3, fontSize: 12, display: 'block', marginBottom: 4 }}>Última revisión</label>
              <input type="date" value={form.ultima_revision} onChange={e => setForm(f => ({ ...f, ultima_revision: e.target.value }))} style={input} />
            </div>
            <div>
              <label style={{ color: C.ink3, fontSize: 12, display: 'block', marginBottom: 4 }}>Próxima revisión</label>
              <input type="date" value={form.proxima_revision} onChange={e => setForm(f => ({ ...f, proxima_revision: e.target.value }))} style={input} />
            </div>
            <div>
              <label style={{ color: C.ink3, fontSize: 12, display: 'block', marginBottom: 4 }}>Alertar (días antes)</label>
              <input type="number" value={form.alerta_dias_antes} onChange={e => setForm(f => ({ ...f, alerta_dias_antes: parseInt(e.target.value) }))} style={input} />
            </div>
            <div>
              <label style={{ color: C.ink3, fontSize: 12, display: 'block', marginBottom: 4 }}>Proveedor</label>
              <input value={form.proveedor_nombre} onChange={e => setForm(f => ({ ...f, proveedor_nombre: e.target.value }))} style={input} placeholder="Nombre empresa" />
            </div>
            <div>
              <label style={{ color: C.ink3, fontSize: 12, display: 'block', marginBottom: 4 }}>Coste estimado (€)</label>
              <input type="number" step="0.01" value={form.coste_estimado} onChange={e => setForm(f => ({ ...f, coste_estimado: e.target.value }))} style={input} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ color: C.ink3, fontSize: 12, display: 'block', marginBottom: 4 }}>Notas</label>
            <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} style={{ ...input, height: 56, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button onClick={() => { setShowForm(false); setEditItem(null) }} style={{ background: C.bg3, color: C.ink2, border: 'none', borderRadius: 8, padding: '8px 16px', fontFamily: SN, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button onClick={guardar} disabled={saving} style={{ background: C.red, color: C.paper, border: 'none', borderRadius: 8, padding: '8px 20px', fontFamily: SN, fontWeight: 600, cursor: 'pointer' }}>
              {saving ? 'Guardando...' : editItem ? 'Actualizar' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div style={{ color: C.ink3, textAlign: 'center', padding: 32 }}>Cargando...</div>
      ) : items.length === 0 ? (
        <div style={{ color: C.ink3, textAlign: 'center', padding: 40, border: `1px dashed ${C.rule}`, borderRadius: 12 }}>
          Sin recordatorios. Añade el primero.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(item => {
            const diasRestantes = Math.ceil((new Date(item.proxima_revision).getTime() - Date.now()) / 86400000)
            const tipoInfo = TIPOS.find(t => t.value === item.tipo)
            return (
              <div key={item.id} style={{ background: C.bg2, border: `1px solid ${item.estado !== 'al_dia' ? estadoColor(item.estado) + '44' : C.rule}`, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 22, minWidth: 28 }}>{tipoInfo?.label.split(' ')[0] ?? '🔧'}</span>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ color: C.paper, fontWeight: 600, fontSize: 14 }}>{item.descripcion}</div>
                  <div style={{ color: C.ink3, fontSize: 12, marginTop: 2 }}>
                    {item.proveedor_nombre && <span>{item.proveedor_nombre} · </span>}
                    Cada {item.periodicidad_dias}d
                    {item.coste_estimado && <span> · ~{item.coste_estimado}€</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'center', minWidth: 90 }}>
                  <div style={{ color: estadoColor(item.estado), fontWeight: 700, fontSize: 12 }}>{estadoLabel(item.estado)}</div>
                  <div style={{ color: C.ink4, fontSize: 11, marginTop: 1 }}>
                    {item.estado === 'vencido' ? `Hace ${Math.abs(diasRestantes)}d` : `${diasRestantes}d restantes`}
                  </div>
                  <div style={{ color: C.ink4, fontSize: 10 }}>{item.proxima_revision}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => marcarRevisado(item)} style={{ background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}44`, borderRadius: 6, padding: '4px 10px', fontFamily: SN, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>✓ Revisado</button>
                  <button onClick={() => abrirEditar(item)} style={{ background: C.bg3, color: C.ink2, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '4px 10px', fontFamily: SN, fontSize: 12, cursor: 'pointer' }}>Editar</button>
                  <button onClick={() => eliminar(item.id)} style={{ background: `${C.red}11`, color: C.red, border: `1px solid ${C.red}33`, borderRadius: 6, padding: '4px 10px', fontFamily: SN, fontSize: 12, cursor: 'pointer' }}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
