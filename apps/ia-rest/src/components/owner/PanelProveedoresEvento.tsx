'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { C, SE, SN } from '@/lib/colors'

type Prov = { id: string; nombre: string; tipo: string; contacto_telefono: string | null; contacto_email: string | null }
type Asig = {
  id: string; servicio_descripcion: string; importe: number; comision_pct: number
  comision_importe: number; iva_tipo: number; hora_llegada: string | null
  estado: string; confirmado_proveedor_at: string | null; comision_cobrada_at: string | null
  proveedor: Prov
}

const fmtEur = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })

const ESTADO_COLOR: Record<string, string> = {
  pendiente: '#6B5F52', confirmado: '#3F7D44', ejecutado: '#2B6A6E',
  facturado: '#6B7280', comision_cobrada: '#374151',
}

export default function PanelProveedoresEvento({ eventoId, sh }: { eventoId: string; sh: () => Record<string, string> }) {
  const [asignaciones, setAsignaciones] = useState<Asig[]>([])
  const [proveedores, setProveedores] = useState<Prov[]>([])
  const [totalComisiones, setTotalComisiones] = useState(0)
  const [cobradas, setCobradas] = useState(0)
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ proveedor_id: '', servicio_descripcion: '', importe: '', comision_pct: '', iva_tipo: '21', hora_llegada: '', briefing: '' })
  const [saving, setSaving] = useState(false)

  const cargar = useCallback(async () => {
    const [aRes, pRes] = await Promise.all([
      fetch(`/api/owner/eventos/proveedores-asignaciones?evento_id=${eventoId}`, { headers: sh() }),
      fetch('/api/owner/eventos/proveedores-externos', { headers: sh() }),
    ])
    const [aData, pData] = await Promise.all([aRes.json(), pRes.json()])
    setAsignaciones(aData.asignaciones ?? [])
    setTotalComisiones(aData.total_comisiones ?? 0)
    setCobradas(aData.cobradas ?? 0)
    setProveedores(pData.proveedores ?? [])
    setLoading(false)
  }, [eventoId, sh])

  useEffect(() => { cargar() }, [cargar])

  const añadir = async () => {
    if (!form.proveedor_id || !form.servicio_descripcion) return
    setSaving(true)
    await fetch('/api/owner/eventos/proveedores-asignaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ ...form, evento_id: eventoId, importe: +form.importe || 0, comision_pct: form.comision_pct !== '' ? +form.comision_pct : undefined, iva_tipo: +form.iva_tipo }),
    })
    setMostrarForm(false)
    setForm({ proveedor_id: '', servicio_descripcion: '', importe: '', comision_pct: '', iva_tipo: '21', hora_llegada: '', briefing: '' })
    setSaving(false)
    cargar()
  }

  const cobrarComision = async (id: string) => {
    await fetch('/api/owner/eventos/proveedores-asignaciones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ id, accion: 'cobrar_comision' }),
    })
    cargar()
  }

  const eliminar = async (id: string) => {
    await fetch('/api/owner/eventos/proveedores-asignaciones', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ id }),
    })
    cargar()
  }

  const inp = (label: string, value: string, fn: (v: string) => void, type = 'text', ph = '') => (
    <div>
      <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 3 }}>{label}</div>
      <input type={type} value={value} onChange={e => fn(e.target.value)} placeholder={ph}
        style={{ width: '100%', background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '5px 8px', fontFamily: SN, fontSize: 12, color: C.ink, boxSizing: 'border-box' as const }} />
    </div>
  )

  if (loading) return <div style={{ padding: 12, color: C.ink3, fontFamily: SN, fontSize: 13 }}>Cargando…</div>

  return (
    <div style={{ marginTop: 10, background: '#fff', borderRadius: 8, border: `1px solid ${C.rule}`, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: SE, fontSize: 14, fontWeight: 700 }}>🤝 Proveedores externos</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>Comisiones total / cobradas</div>
            <div style={{ fontFamily: SE, fontSize: 14, color: C.green }}>{fmtEur(totalComisiones)} / {fmtEur(cobradas)}</div>
          </div>
          <button onClick={() => setMostrarForm(v => !v)}
            style={{ padding: '4px 12px', borderRadius: 5, border: `1px solid ${C.green}`, background: C.green + '15', color: C.green, fontFamily: SN, fontSize: 12, cursor: 'pointer' }}>
            + Añadir
          </button>
        </div>
      </div>

      {mostrarForm && (
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.rule}`, background: C.paper }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 3 }}>Proveedor</div>
              <select value={form.proveedor_id} onChange={e => {
                const p = proveedores.find(p => p.id === e.target.value)
                setForm(f => ({ ...f, proveedor_id: e.target.value }))
              }} style={{ width: '100%', background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '5px 8px', fontFamily: SN, fontSize: 12, color: C.ink }}>
                <option value="">Seleccionar proveedor…</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.tipo})</option>)}
              </select>
            </div>
            {inp('Servicio', form.servicio_descripcion, v => setForm(f => ({ ...f, servicio_descripcion: v })), 'text', 'Fotografía, flores, DJ...')}
            {inp('Importe (€)', form.importe, v => setForm(f => ({ ...f, importe: v })), 'number', '2000')}
            {inp('Comisión (%)', form.comision_pct, v => setForm(f => ({ ...f, comision_pct: v })), 'number', 'default proveedor')}
            {inp('IVA tipo', form.iva_tipo, v => setForm(f => ({ ...f, iva_tipo: v })), 'number', '21')}
            {inp('Hora llegada', form.hora_llegada, v => setForm(f => ({ ...f, hora_llegada: v })), 'time')}
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 3 }}>Briefing</div>
            <textarea value={form.briefing} onChange={e => setForm(f => ({ ...f, briefing: e.target.value }))} rows={2} placeholder="Instrucciones específicas para este evento…"
              style={{ width: '100%', background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '5px 8px', fontFamily: SN, fontSize: 12, color: C.ink, resize: 'none', boxSizing: 'border-box' as const }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={añadir} disabled={saving} style={{ padding: '5px 14px', borderRadius: 5, border: 'none', background: C.red, color: '#fff', fontFamily: SN, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {saving ? '...' : 'Añadir'}
            </button>
            <button onClick={() => setMostrarForm(false)} style={{ padding: '5px 10px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 12, color: C.ink3, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={{ padding: '8px 14px' }}>
        {asignaciones.length === 0 && <div style={{ color: C.ink3, fontFamily: SN, fontSize: 12, textAlign: 'center', padding: '16px' }}>Sin proveedores asignados.</div>}
        {asignaciones.map(a => (
          <div key={a.id} style={{ padding: '10px 0', borderBottom: `1px solid ${C.rule}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>{a.proveedor.nombre}</div>
                <div style={{ fontFamily: SN, fontSize: 12, color: C.ink2 }}>{a.servicio_descripcion}</div>
                <div style={{ display: 'flex', gap: 10, marginTop: 3 }}>
                  <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>Importe: {fmtEur(a.importe)}</span>
                  <span style={{ fontFamily: SN, fontSize: 11, color: C.green }}>Comisión: {a.comision_pct}% = {fmtEur(a.comision_importe)}</span>
                  <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>IVA {a.iva_tipo}%</span>
                  {a.hora_llegada && <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>🕐 {a.hora_llegada}</span>}
                </div>
                {a.confirmado_proveedor_at && <div style={{ fontFamily: SN, fontSize: 11, color: C.green, marginTop: 2 }}>✅ Confirmado por proveedor</div>}
              </div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <span style={{ fontFamily: SN, fontSize: 11, padding: '2px 7px', borderRadius: 99, background: ESTADO_COLOR[a.estado] + '22', color: ESTADO_COLOR[a.estado] }}>
                  {a.estado.replace('_', ' ')}
                </span>
                {a.estado !== 'comision_cobrada' && a.comision_importe > 0 && (
                  <button onClick={() => cobrarComision(a.id)}
                    style={{ padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.green}`, background: 'transparent', color: C.green, fontFamily: SN, fontSize: 11, cursor: 'pointer' }}>
                    💰 Cobrar
                  </button>
                )}
                <button onClick={() => eliminar(a.id)}
                  style={{ padding: '3px 6px', borderRadius: 4, border: 'none', background: '#fee2e2', color: '#b91c1c', fontFamily: SN, fontSize: 11, cursor: 'pointer' }}>✕</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
