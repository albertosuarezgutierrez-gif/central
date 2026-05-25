'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { C, SE, SN } from '@/lib/colors'

type Prov = {
  id: string; nombre: string; tipo: string; contacto_nombre: string | null
  contacto_telefono: string | null; contacto_email: string | null; web: string | null
  comision_pct: number; iva_tipo: number; portal_activo: boolean; token_portal: string
  notas: string | null; activo: boolean
}

const TIPOS = ['floristeria', 'fotografia', 'musica_dj', 'audiovisual', 'finca', 'transporte', 'animacion', 'catering_externo', 'otro']
const TIPO_ICONO: Record<string, string> = { floristeria: '🌸', fotografia: '📸', musica_dj: '🎵', audiovisual: '🎬', finca: '🏛️', transporte: '🚐', animacion: '🎭', catering_externo: '🍽️', otro: '🤝' }
const fmtPct = (n: number) => n > 0 ? `${n}%` : '—'

const EMPTY = { nombre: '', tipo: 'otro', contacto_nombre: '', contacto_telefono: '', contacto_email: '', web: '', comision_pct: '10', iva_tipo: '21', notas: '', portal_activo: false }

export default function ProveedoresExternosTab({ sh }: { sh: () => Record<string, string> }) {
  const [proveedores, setProveedores] = useState<Prov[]>([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/owner/eventos/proveedores-externos', { headers: sh() })
    const d = await r.json()
    setProveedores(d.proveedores ?? [])
    setLoading(false)
  }, [sh])

  useEffect(() => { cargar() }, [cargar])

  const guardar = async () => {
    if (!form.nombre) return
    setSaving(true)
    if (editId) {
      await fetch('/api/owner/eventos/proveedores-externos', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({ id: editId, ...form, comision_pct: +form.comision_pct, iva_tipo: +form.iva_tipo }),
      })
    } else {
      await fetch('/api/owner/eventos/proveedores-externos', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({ ...form, comision_pct: +form.comision_pct, iva_tipo: +form.iva_tipo }),
      })
    }
    setSaving(false)
    setMostrarForm(false)
    setEditId(null)
    setForm({ ...EMPTY })
    cargar()
  }

  const editar = (p: Prov) => {
    setForm({ nombre: p.nombre, tipo: p.tipo, contacto_nombre: p.contacto_nombre ?? '', contacto_telefono: p.contacto_telefono ?? '', contacto_email: p.contacto_email ?? '', web: p.web ?? '', comision_pct: String(p.comision_pct), iva_tipo: String(p.iva_tipo), notas: p.notas ?? '', portal_activo: p.portal_activo })
    setEditId(p.id)
    setMostrarForm(true)
  }

  const eliminar = async (id: string) => {
    await fetch('/api/owner/eventos/proveedores-externos', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ id }) })
    cargar()
  }

  const copiarPortal = (token: string) => {
    const url = `${window.location.origin}/proveedor/${token}`
    navigator.clipboard.writeText(url).then(() => { setCopiado(token); setTimeout(() => setCopiado(null), 2000) })
  }

  const inp = (label: string, field: keyof typeof EMPTY, type = 'text') => (
    <div>
      <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 3 }}>{label}</div>
      <input type={type} value={form[field] as string} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
        style={{ width: '100%', background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '5px 8px', fontFamily: SN, fontSize: 12, color: C.ink, boxSizing: 'border-box' as const }} />
    </div>
  )

  if (loading) return <div style={{ padding: 24, color: C.ink3, fontFamily: SN }}>Cargando…</div>

  return (
    <div style={{ padding: '0 0 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontFamily: SE, fontSize: 18, fontWeight: 700, fontStyle: 'italic', color: C.ink }}>Proveedores externos</div>
        <button onClick={() => { setForm({ ...EMPTY }); setEditId(null); setMostrarForm(true) }}
          style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: C.red, color: '#fff', fontFamily: SN, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + Nuevo proveedor
        </button>
      </div>

      {mostrarForm && (
        <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '16px', marginBottom: 16 }}>
          <div style={{ fontFamily: SE, fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{editId ? 'Editar' : 'Nuevo'} proveedor</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            {inp('Nombre *', 'nombre')}
            <div>
              <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 3 }}>Tipo</div>
              <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                style={{ width: '100%', background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '5px 8px', fontFamily: SN, fontSize: 12 }}>
                {TIPOS.map(t => <option key={t} value={t}>{TIPO_ICONO[t]} {t.replace('_', ' ')}</option>)}
              </select>
            </div>
            {inp('Contacto', 'contacto_nombre')}
            {inp('Teléfono', 'contacto_telefono', 'tel')}
            {inp('Email', 'contacto_email', 'email')}
            {inp('Web', 'web')}
            {inp('Comisión (%)', 'comision_pct', 'number')}
            {inp('IVA tipo', 'iva_tipo', 'number')}
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 3 }}>Notas internas</div>
            <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={2}
              style={{ width: '100%', background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '5px 8px', fontFamily: SN, fontSize: 12, resize: 'none', boxSizing: 'border-box' as const }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <input type="checkbox" id="portal" checked={form.portal_activo} onChange={e => setForm(f => ({ ...f, portal_activo: e.target.checked }))} />
            <label htmlFor="portal" style={{ fontFamily: SN, fontSize: 12, color: C.ink2, cursor: 'pointer' }}>
              Activar portal de proveedor {form.portal_activo && form.contacto_email && '(recibirá email con enlace)'}
            </label>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={guardar} disabled={saving} style={{ padding: '6px 16px', borderRadius: 5, border: 'none', background: C.red, color: '#fff', fontFamily: SN, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {saving ? '...' : editId ? 'Guardar' : 'Crear'}
            </button>
            <button onClick={() => { setMostrarForm(false); setEditId(null) }} style={{ padding: '6px 12px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 13, color: C.ink3, cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}

      {proveedores.length === 0 && !mostrarForm && (
        <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '32px', textAlign: 'center', color: C.ink3, fontFamily: SN }}>
          Sin proveedores externos. Añade floristas, fotógrafos, DJs...
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {proveedores.map(p => (
          <div key={p.id} style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 16 }}>{TIPO_ICONO[p.tipo] ?? '🤝'}</span>
                  <span style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, color: C.ink }}>{p.nombre}</span>
                  <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>{p.tipo.replace('_', ' ')}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {p.contacto_nombre && <span style={{ fontFamily: SN, fontSize: 12, color: C.ink2 }}>{p.contacto_nombre}</span>}
                  {p.contacto_telefono && <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>📞 {p.contacto_telefono}</span>}
                  {p.contacto_email && <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>✉ {p.contacto_email}</span>}
                  <span style={{ fontFamily: SN, fontSize: 12, color: C.green }}>Comisión: {fmtPct(p.comision_pct)}</span>
                  <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>IVA {p.iva_tipo}%</span>
                  {p.portal_activo && <span style={{ fontFamily: SN, fontSize: 11, color: '#2B6A6E' }}>🔗 Portal activo</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                {p.portal_activo && (
                  <button onClick={() => copiarPortal(p.token_portal)}
                    style={{ padding: '4px 8px', borderRadius: 4, border: `1px solid #2B6A6E`, background: 'transparent', color: '#2B6A6E', fontFamily: SN, fontSize: 11, cursor: 'pointer' }}>
                    {copiado === p.token_portal ? '✓ Copiado' : '🔗 Copiar enlace'}
                  </button>
                )}
                <button onClick={() => editar(p)} style={{ padding: '4px 8px', borderRadius: 4, border: `1px solid ${C.rule}`, background: 'transparent', color: C.ink2, fontFamily: SN, fontSize: 11, cursor: 'pointer' }}>Editar</button>
                <button onClick={() => eliminar(p.id)} style={{ padding: '4px 6px', borderRadius: 4, border: 'none', background: '#fee2e2', color: '#b91c1c', fontFamily: SN, fontSize: 11, cursor: 'pointer' }}>✕</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
