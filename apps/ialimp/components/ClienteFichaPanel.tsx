'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { validarNifCif, validarIban } from '@/lib/fiscal'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)',
  text: '#1e293b', muted: '#64748b', border: '#e2e8f0', bg: '#f8fafc',
  danger: '#dc2626',
}

const TIPOS = [
  { v: 'particular', label: 'Particular' },
  { v: 'autonomo',   label: 'Autónomo' },
  { v: 'empresa',    label: 'Empresa' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
  fontSize: 13, fontFamily: 'inherit', color: C.text, boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4, display: 'block' }
const cardStyle: React.CSSProperties = { background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, padding: '14px 16px' }
const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: C.primary, marginBottom: 12 }

interface Contacto { id: string; nombre: string|null; cargo: string|null; telefono: string|null; email: string|null; principal: boolean; es_pagador: boolean; notas: string|null }

export default function ClienteFichaPanel({ clienteId, cliente, contactosInicial }: {
  clienteId: string; cliente: any; contactosInicial: Contacto[]
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    nombre: cliente.nombre || '',
    tipo_persona: cliente.tipo_persona || 'particular',
    notas: cliente.notas || '',
    facturacion_igual_contacto: cliente.facturacion_igual_contacto ?? true,
    razon_social: cliente.razon_social || '',
    nif: cliente.nif || '',
    via_fiscal: cliente.via_fiscal || '',
    numero_fiscal: cliente.numero_fiscal || '',
    cp_fiscal: cliente.cp_fiscal || '',
    municipio_fiscal: cliente.municipio_fiscal || '',
    provincia_fiscal: cliente.provincia_fiscal || '',
    email_facturacion: cliente.email_facturacion || '',
    iban: cliente.iban || '',
  })
  const [contactos, setContactos] = useState<Contacto[]>(contactosInicial || [])
  const [savingCliente, setSavingCliente] = useState(false)
  const [modal, setModal] = useState<Contacto | 'nuevo' | null>(null)

  const esEmpresa = form.tipo_persona === 'empresa'
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  // Contacto del que se copian los datos fiscales (autónomo/particular que es a la vez contacto):
  // primero el marcado como pagador, luego el principal, luego el primero.
  const contactoFiscal = contactos.find(c => c.es_pagador) || contactos.find(c => c.principal) || contactos[0]

  function copiarDeContacto() {
    if (!contactoFiscal) return
    setForm(f => ({
      ...f,
      razon_social: contactoFiscal.nombre || f.razon_social,
      email_facturacion: contactoFiscal.email || f.email_facturacion,
    }))
  }

  // Validaciones "blandas" (avisan, no bloquean el guardado)
  const nifVal = validarNifCif(form.nif)
  const ibanVal = validarIban(form.iban)
  const avisoStyle: React.CSSProperties = { fontSize: 11, color: '#dc2626', marginTop: 4 }

  async function guardarCliente() {
    setSavingCliente(true)
    await fetch(`/api/admin/clientes/${clienteId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    setSavingCliente(false)
    router.refresh()
  }

  async function recargarContactos() {
    const r = await fetch(`/api/admin/clientes/${clienteId}/contactos`)
    const d = await r.json()
    setContactos(d.contactos || [])
    router.refresh()
  }

  async function eliminarContacto(id: string) {
    if (!confirm('¿Eliminar este contacto?')) return
    await fetch(`/api/admin/clientes/${clienteId}/contactos/${id}`, { method: 'DELETE' })
    recargarContactos()
  }

  return (
    <>
      {/* ── Datos generales ── */}
      <div style={cardStyle}>
        <div style={sectionTitle}>👤 Datos generales</div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {TIPOS.map(t => (
            <button key={t.v} onClick={() => set('tipo_persona', t.v)}
              style={{
                flex: 1, padding: '7px 4px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: form.tipo_persona === t.v ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
                background: form.tipo_persona === t.v ? C.light : 'white',
                color: form.tipo_persona === t.v ? C.primary : C.muted,
              }}>
              {t.label}
            </button>
          ))}
        </div>

        <label style={labelStyle}>{esEmpresa ? 'Razón social / Nombre comercial' : 'Nombre'}</label>
        <input style={{ ...inputStyle, marginBottom: 10 }} value={form.nombre} onChange={e => set('nombre', e.target.value)} />

        <label style={labelStyle}>Notas</label>
        <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={form.notas}
          onChange={e => set('notas', e.target.value)} placeholder="Comentarios sobre el cliente…" />
      </div>

      {/* ── Contactos ── */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={sectionTitle as any}>📇 Contactos</div>
          <button onClick={() => setModal('nuevo')}
            style={{ background: C.primary, color: 'white', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            + Añadir
          </button>
        </div>

        {contactos.length === 0 && <div style={{ fontSize: 12, color: C.muted }}>Sin contactos. Añade el primero con “+”.</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {contactos.map(ct => (
            <div key={ct.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', background: C.bg }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                  {ct.nombre || '(sin nombre)'}
                  {ct.principal && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.primary, background: C.light, padding: '2px 6px', borderRadius: 6 }}>Principal</span>}
                  {ct.es_pagador && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#047857', background: '#d1fae5', padding: '2px 6px', borderRadius: 6 }}>Pagador</span>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setModal(ct)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>✏️</button>
                  <button onClick={() => eliminarContacto(ct.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>🗑️</button>
                </div>
              </div>
              {ct.cargo && <div style={{ fontSize: 12, color: C.brand, marginTop: 2 }}>{ct.cargo}</div>}
              {ct.telefono && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>📞 {ct.telefono}</div>}
              {ct.email && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>✉️ {ct.email}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Facturación ── */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={sectionTitle as any}>🧾 Facturación</div>
          {!esEmpresa && contactoFiscal && (
            <button type="button" onClick={copiarDeContacto}
              style={{ background: C.light, color: C.primary, border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              ⤵ Copiar del contacto
            </button>
          )}
        </div>

        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
          {esEmpresa
            ? 'Se factura a la empresa. Sus datos fiscales son los de abajo; los contactos son las personas con las que tratas.'
            : 'La persona es quien factura: aquí van su nombre fiscal y NIF/DNI. Puedes rellenarlos desde el contacto con «Copiar del contacto».'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={labelStyle}>{esEmpresa ? 'Razón social' : 'Nombre fiscal'}</label>
            <input style={inputStyle} value={form.razon_social} onChange={e => set('razon_social', e.target.value)}
              placeholder={esEmpresa ? 'Inversiones García S.L.' : form.nombre || 'Nombre y apellidos'} />
          </div>
          <div>
            <label style={labelStyle}>{esEmpresa ? 'CIF' : 'NIF / DNI'}</label>
            <input style={inputStyle} value={form.nif} onChange={e => set('nif', e.target.value)}
              placeholder={esEmpresa ? 'B12345678' : '12345678Z'} />
            {form.nif && !nifVal.ok && <div style={avisoStyle}>⚠ {nifVal.motivo}</div>}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text, cursor: 'pointer', marginTop: 2 }}>
            <input type="checkbox" checked={form.facturacion_igual_contacto}
              onChange={e => set('facturacion_igual_contacto', e.target.checked)} />
            El domicilio fiscal es el mismo que la dirección del cliente
          </label>

          {!form.facturacion_igual_contacto && (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 2 }}>
                  <label style={labelStyle}>Vía</label>
                  <input style={inputStyle} value={form.via_fiscal} onChange={e => set('via_fiscal', e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Número</label>
                  <input style={inputStyle} value={form.numero_fiscal} onChange={e => set('numero_fiscal', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>C.P.</label>
                  <input style={inputStyle} value={form.cp_fiscal} onChange={e => set('cp_fiscal', e.target.value)} />
                </div>
                <div style={{ flex: 2 }}>
                  <label style={labelStyle}>Municipio</label>
                  <input style={inputStyle} value={form.municipio_fiscal} onChange={e => set('municipio_fiscal', e.target.value)} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Provincia</label>
                <input style={inputStyle} value={form.provincia_fiscal} onChange={e => set('provincia_fiscal', e.target.value)} />
              </div>
            </>
          )}

          <div>
            <label style={labelStyle}>Email de facturación</label>
            <input style={inputStyle} value={form.email_facturacion} onChange={e => set('email_facturacion', e.target.value)}
              placeholder="Donde llegan las facturas" />
          </div>
          <div>
            <label style={labelStyle}>IBAN</label>
            <input style={inputStyle} value={form.iban} onChange={e => set('iban', e.target.value)}
              placeholder="ES00 0000 0000 0000 0000 0000" />
            {form.iban && !ibanVal.ok && <div style={avisoStyle}>⚠ {ibanVal.motivo}</div>}
          </div>
        </div>
      </div>

      <button onClick={guardarCliente} disabled={savingCliente}
        style={{ background: C.primary, color: 'white', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: savingCliente ? 0.6 : 1 }}>
        {savingCliente ? 'Guardando…' : 'Guardar datos del cliente'}
      </button>

      {modal && (
        <ContactoModal clienteId={clienteId} contacto={modal === 'nuevo' ? null : modal}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); recargarContactos() }} />
      )}
    </>
  )
}

function ContactoModal({ clienteId, contacto, onClose, onSaved }: {
  clienteId: string; contacto: Contacto | null; onClose: () => void; onSaved: () => void
}) {
  const [f, setF] = useState({
    nombre: contacto?.nombre || '', cargo: contacto?.cargo || '',
    telefono: contacto?.telefono || '', email: contacto?.email || '',
    notas: contacto?.notas || '', principal: contacto?.principal || false,
    es_pagador: contacto?.es_pagador || false,
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }))

  async function guardar() {
    setSaving(true)
    const url = contacto
      ? `/api/admin/clientes/${clienteId}/contactos/${contacto.id}`
      : `/api/admin/clientes/${clienteId}/contactos`
    await fetch(url, { method: contacto ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
    setSaving(false)
    onSaved()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, padding: 20, width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.primary, marginBottom: 14 }}>
          {contacto ? 'Editar contacto' : 'Nuevo contacto'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div><label style={labelStyle}>Nombre</label><input style={inputStyle} value={f.nombre} onChange={e => set('nombre', e.target.value)} /></div>
          <div><label style={labelStyle}>Cargo</label><input style={inputStyle} value={f.cargo} onChange={e => set('cargo', e.target.value)} placeholder="Administración, gestión…" /></div>
          <div><label style={labelStyle}>Teléfono</label><input style={inputStyle} value={f.telefono} onChange={e => set('telefono', e.target.value)} /></div>
          <div><label style={labelStyle}>Email</label><input style={inputStyle} value={f.email} onChange={e => set('email', e.target.value)} /></div>
          <div><label style={labelStyle}>Notas</label><textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={f.notas} onChange={e => set('notas', e.target.value)} /></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={f.principal} onChange={e => set('principal', e.target.checked)} />
            Contacto principal
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={f.es_pagador} onChange={e => set('es_pagador', e.target.checked)} />
            Es el pagador / persona fiscal
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'white', color: C.muted, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={guardar} disabled={saving} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: C.primary, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
