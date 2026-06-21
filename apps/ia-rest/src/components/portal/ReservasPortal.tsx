'use client'
// src/components/portal/ReservasPortal.tsx
// Gestión de reservas para el portal — vista diaria con crear/editar/cancelar

import { useState, useEffect, useCallback } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

interface Mesa { id: string; codigo: string; nombre: string; zona: string; capacidad: number }
interface Reserva {
  id: string; nombre_cliente: string; telefono: string | null
  num_personas: number; fecha_reserva: string; hora_reserva: string
  duracion_min: number; notas: string | null; estado: string; canal: string
  mesa_id: string | null; mesas?: { id: string; codigo: string; nombre: string } | null
}
interface Props { sh: () => Record<string, string> }

const ESTADOS: Record<string, { label: string; bg: string; color: string }> = {
  pendiente:  { label: 'Pendiente',  bg: '#FEF9ED', color: C.amber },
  confirmada: { label: 'Confirmada', bg: '#EDFEF3', color: C.green },
  sentada:    { label: 'Sentada',    bg: '#EDF5FE', color: '#2B7DD6' },
  finalizada: { label: 'Finalizada', bg: C.paper2,  color: C.ink3 },
  cancelada:  { label: 'Cancelada',  bg: '#FEF0F0', color: C.red },
  no_show:    { label: 'No show',    bg: '#FEF0F0', color: C.red },
}

const CANALES: Record<string, string> = {
  manual: '📞', thefork: '🍴', web: '🌐', whatsapp: '💬', otro: '📋'
}

function hoy() { return new Date().toISOString().slice(0, 10) }
function sumarDias(fecha: string, dias: number) {
  const d = new Date(fecha); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10)
}
function fmtFecha(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const EMPTY_FORM = { nombre_cliente: '', telefono: '', num_personas: 2, fecha_reserva: hoy(), hora_reserva: '13:00', duracion_min: 90, notas: '', mesa_id: '', canal: 'manual' }

export default function ReservasPortal({ sh }: Props) {
  const [fecha, setFecha] = useState(hoy())
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<null | 'crear' | { edit: Reserva }>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [guardando, setGuardando] = useState(false)
  const [expandido, setExpandido] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/owner/reservas?fecha=${fecha}`, { headers: sh() })
    const d = await r.json()
    setReservas(d.reservas ?? [])
    setMesas(d.mesas ?? [])
    setLoading(false)
  }, [fecha, sh])

  useEffect(() => { cargar() }, [cargar])

  const abrirCrear = () => {
    setForm({ ...EMPTY_FORM, fecha_reserva: fecha })
    setModal('crear')
  }
  const abrirEditar = (r: Reserva) => {
    setForm({ nombre_cliente: r.nombre_cliente, telefono: r.telefono ?? '', num_personas: r.num_personas, fecha_reserva: r.fecha_reserva, hora_reserva: r.hora_reserva, duracion_min: r.duracion_min, notas: r.notas ?? '', mesa_id: r.mesa_id ?? '', canal: r.canal })
    setModal({ edit: r })
  }

  const guardar = async () => {
    setGuardando(true)
    const esEdicion = modal && typeof modal === 'object' && 'edit' in modal
    const url = '/api/owner/reservas'
    const body = esEdicion
      ? { id: modal.edit.id, ...form, mesa_id: form.mesa_id || null, telefono: form.telefono || null, notas: form.notas || null }
      : { ...form, mesa_id: form.mesa_id || null, telefono: form.telefono || null, notas: form.notas || null }
    await fetch(url, { method: esEdicion ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify(body) })
    setModal(null); setGuardando(false); cargar()
  }

  const cambiarEstado = async (id: string, estado: string) => {
    await fetch('/api/owner/reservas', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ id, estado }) })
    cargar()
  }
  const cancelar = async (id: string) => {
    if (!confirm('¿Cancelar esta reserva?')) return
    await fetch('/api/owner/reservas', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ id }) })
    cargar()
  }

  const f = form

  return (
    <div style={{ maxWidth: 760 }}>
      {/* Cabecera */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.1em', marginBottom: 4 }}>RESERVAS</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: C.ink }}>
            {fmtFecha(fecha)} — {reservas.length} reserva{reservas.length !== 1 ? 's' : ''}
          </div>
          <button onClick={abrirCrear} style={{ fontFamily: SN, fontSize: 12, fontWeight: 600, background: C.red, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>
            + Nueva reserva
          </button>
        </div>
      </div>

      {/* Navegación de fechas */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setFecha(d => sumarDias(d, -1))} style={{ fontFamily: SM, fontSize: 14, background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer', color: C.ink }}>‹</button>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
          style={{ fontFamily: SN, fontSize: 13, background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '6px 10px', color: C.ink, outline: 'none' }} />
        <button onClick={() => setFecha(d => sumarDias(d, 1))} style={{ fontFamily: SM, fontSize: 14, background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer', color: C.ink }}>›</button>
        {fecha !== hoy() && (
          <button onClick={() => setFecha(hoy())} style={{ fontFamily: SN, fontSize: 11, color: C.red, background: 'none', border: `1px solid ${C.red}44`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Hoy</button>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ padding: 24, fontFamily: SN, fontSize: 12, color: C.ink3 }}>Cargando reservas...</div>
      ) : reservas.length === 0 ? (
        <div style={{ background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 40, textAlign: 'center', color: C.ink3, fontFamily: SN, fontSize: 13 }}>
          Sin reservas para este día.<br />
          <span style={{ color: C.red, cursor: 'pointer', textDecoration: 'underline' }} onClick={abrirCrear}>Añadir una</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {reservas.map(r => {
            const est = ESTADOS[r.estado] ?? ESTADOS.pendiente
            const open = expandido === r.id
            return (
              <div key={r.id} style={{ background: est.bg, border: `1px solid ${open ? est.color : C.rule}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color .15s' }}>
                {/* Fila principal */}
                <div onClick={() => setExpandido(open ? null : r.id)} style={{ padding: '12px 14px', cursor: 'pointer', display: 'grid', gridTemplateColumns: '48px 1fr auto auto', alignItems: 'center', gap: 10 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: SM, fontSize: 15, fontWeight: 700, color: C.ink }}>{r.hora_reserva.slice(0,5)}</div>
                    <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3 }}>{r.duracion_min}min</div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, color: C.ink }}>{r.nombre_cliente}</span>
                      <span style={{ fontFamily: SM, fontSize: 10 }}>{CANALES[r.canal] ?? '📋'}</span>
                      {r.mesas && <span style={{ fontFamily: SM, fontSize: 10, color: C.ink3, background: C.paper2, padding: '1px 5px', borderRadius: 3 }}>{r.mesas.codigo}</span>}
                    </div>
                    <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>
                      {r.num_personas} pax{r.telefono ? ` · ${r.telefono}` : ''}{r.notas ? ` · ${r.notas}` : ''}
                    </div>
                  </div>
                  <span style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, color: est.color, background: est.bg, border: `1px solid ${est.color}44`, borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                    {est.label}
                  </span>
                  <span style={{ color: C.ink3, fontSize: 14 }}>{open ? '▲' : '▼'}</span>
                </div>

                {/* Expandido */}
                {open && (
                  <div style={{ padding: '10px 14px 14px', borderTop: `1px solid ${C.rule}`, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {r.estado === 'pendiente' && (
                      <button onClick={() => cambiarEstado(r.id, 'confirmada')} style={{ fontFamily: SN, fontSize: 11, fontWeight: 600, background: C.green, color: '#fff', border: 'none', borderRadius: 5, padding: '5px 12px', cursor: 'pointer' }}>✓ Confirmar</button>
                    )}
                    {r.estado === 'confirmada' && (
                      <button onClick={() => cambiarEstado(r.id, 'sentada')} style={{ fontFamily: SN, fontSize: 11, fontWeight: 600, background: '#2B7DD6', color: '#fff', border: 'none', borderRadius: 5, padding: '5px 12px', cursor: 'pointer' }}>→ Sentar</button>
                    )}
                    {r.estado === 'sentada' && (
                      <button onClick={() => cambiarEstado(r.id, 'finalizada')} style={{ fontFamily: SN, fontSize: 11, fontWeight: 600, background: C.ink3, color: '#fff', border: 'none', borderRadius: 5, padding: '5px 12px', cursor: 'pointer' }}>✓ Finalizar</button>
                    )}
                    {r.estado !== 'finalizada' && r.estado !== 'cancelada' && r.estado !== 'no_show' && (
                      <button onClick={() => cambiarEstado(r.id, 'no_show')} style={{ fontFamily: SN, fontSize: 11, color: C.red, background: 'transparent', border: `1px solid ${C.red}44`, borderRadius: 5, padding: '5px 12px', cursor: 'pointer' }}>No show</button>
                    )}
                    <button onClick={() => abrirEditar(r)} style={{ fontFamily: SN, fontSize: 11, color: C.ink2, background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '5px 12px', cursor: 'pointer' }}>✏ Editar</button>
                    {r.estado !== 'cancelada' && (
                      <button onClick={() => cancelar(r.id)} style={{ fontFamily: SN, fontSize: 11, color: C.red, background: 'transparent', border: `1px solid ${C.red}44`, borderRadius: 5, padding: '5px 12px', cursor: 'pointer' }}>✕ Cancelar</button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Resumen del día */}
      {reservas.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {(['pendiente', 'confirmada', 'sentada'] as const).map(est => {
            const n = reservas.filter(r => r.estado === est).length
            if (!n) return null
            const s = ESTADOS[est]
            return <span key={est} style={{ fontFamily: SM, fontSize: 10, color: s.color, background: s.bg, border: `1px solid ${s.color}44`, borderRadius: 4, padding: '3px 8px' }}>{s.label}: {n}</span>
          })}
          <span style={{ fontFamily: SM, fontSize: 10, color: C.ink3 }}>
            {reservas.reduce((s, r) => s + r.num_personas, 0)} pax total
          </span>
        </div>
      )}

      {/* Modal crear/editar */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,23,20,.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 14, padding: 24, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: C.ink, marginBottom: 20 }}>
              {modal === 'crear' ? 'Nueva reserva' : 'Editar reserva'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Nombre', key: 'nombre_cliente', type: 'text', required: true },
                { label: 'Teléfono', key: 'telefono', type: 'tel' },
              ].map(({ label, key, type, required }) => (
                <div key={key}>
                  <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4 }}>{label}{required ? ' *' : ''}</div>
                  <input value={(f as Record<string,string|number>)[key] as string} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} type={type}
                    style={{ width: '100%', fontFamily: SN, fontSize: 13, background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '7px 10px', color: C.ink, outline: 'none' }} />
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4 }}>Fecha *</div>
                  <input type="date" value={f.fecha_reserva} onChange={e => setForm(p => ({ ...p, fecha_reserva: e.target.value }))}
                    style={{ width: '100%', fontFamily: SN, fontSize: 13, background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '7px 10px', color: C.ink, outline: 'none' }} />
                </div>
                <div>
                  <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4 }}>Hora *</div>
                  <input type="time" value={f.hora_reserva} onChange={e => setForm(p => ({ ...p, hora_reserva: e.target.value }))}
                    style={{ width: '100%', fontFamily: SN, fontSize: 13, background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '7px 10px', color: C.ink, outline: 'none' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4 }}>Personas *</div>
                  <input type="number" min="1" max="50" value={f.num_personas} onChange={e => setForm(p => ({ ...p, num_personas: parseInt(e.target.value) || 1 }))}
                    style={{ width: '100%', fontFamily: SN, fontSize: 13, background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '7px 10px', color: C.ink, outline: 'none' }} />
                </div>
                <div>
                  <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4 }}>Duración (min)</div>
                  <select value={f.duracion_min} onChange={e => setForm(p => ({ ...p, duracion_min: parseInt(e.target.value) }))}
                    style={{ width: '100%', fontFamily: SN, fontSize: 13, background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '7px 10px', color: C.ink, outline: 'none' }}>
                    {[60, 90, 120, 150, 180].map(m => <option key={m} value={m}>{m} min</option>)}
                  </select>
                </div>
              </div>
              <div>
                <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4 }}>Mesa</div>
                <select value={f.mesa_id} onChange={e => setForm(p => ({ ...p, mesa_id: e.target.value }))}
                  style={{ width: '100%', fontFamily: SN, fontSize: 13, background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '7px 10px', color: C.ink, outline: 'none' }}>
                  <option value="">Sin asignar</option>
                  {mesas.map(m => <option key={m.id} value={m.id}>{m.codigo} — {m.nombre} ({m.capacidad}p)</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4 }}>Canal</div>
                <select value={f.canal} onChange={e => setForm(p => ({ ...p, canal: e.target.value }))}
                  style={{ width: '100%', fontFamily: SN, fontSize: 13, background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '7px 10px', color: C.ink, outline: 'none' }}>
                  {Object.entries(CANALES).map(([k, v]) => <option key={k} value={k}>{v} {k}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4 }}>Notas</div>
                <textarea value={f.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} rows={2}
                  style={{ width: '100%', fontFamily: SN, fontSize: 13, background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '7px 10px', color: C.ink, outline: 'none', resize: 'none' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setModal(null)} style={{ fontFamily: SN, fontSize: 12, background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 6, padding: '8px 16px', cursor: 'pointer', color: C.ink2 }}>Cancelar</button>
              <button onClick={guardar} disabled={!f.nombre_cliente || guardando}
                style={{ fontFamily: SN, fontSize: 12, fontWeight: 600, background: guardando ? C.ruleS : C.red, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>
                {guardando ? 'Guardando...' : modal === 'crear' ? 'Crear reserva' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
