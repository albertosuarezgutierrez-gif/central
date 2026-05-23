'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

// ─── Types ───────────────────────────────────────────────────────────────────
type EventoTipo = 'boda' | 'comunion' | 'bautizo' | 'cumpleanos' | 'empresa' | 'otro'
type EventoEstado = 'presupuesto' | 'confirmado' | 'en_curso' | 'completado' | 'facturado' | 'cancelado'
type EventoModoLocal = 'cerrado' | 'parcial' | 'terraza' | 'externo' | 'itinerante'

type Espacio = {
  id: string; nombre: string; tipo: string; aforo_maximo: number | null
}

type Evento = {
  id: string; numero_evento: string; tipo: EventoTipo; estado: EventoEstado
  fecha_evento: string; hora_inicio: string | null; hora_fin: string | null
  cliente_nombre: string; cliente_telefono: string | null; cliente_email: string | null
  aforo_previsto: number; aforo_confirmado: number | null
  precio_por_persona: number | null; precio_total: number | null; coste_total: number | null
  modo_local: EventoModoLocal; es_itinerante: boolean; acceso_qr_activo: boolean
  es_recurrente: boolean; senial_pagada: boolean; requiere_appcc: boolean
  notas_internas: string | null; notas_cocina: string | null; notas_sala: string | null
  espacio_id: string | null; restaurante_id: string
  espacios_evento: Espacio | null
}

// ─── Constantes visuales ─────────────────────────────────────────────────────
const TIPO_LABELS: Record<EventoTipo, string> = {
  boda: '💍 Boda', comunion: '⛪ Comunión', bautizo: '👶 Bautizo',
  cumpleanos: '🎂 Cumpleaños', empresa: '🏢 Empresa', otro: '📅 Otro'
}

const ESTADO_CONFIG: Record<EventoEstado, { label: string; color: string; bg: string }> = {
  presupuesto: { label: 'Presupuesto', color: '#E8A33B', bg: '#E8A33B22' },
  confirmado:  { label: 'Confirmado',  color: '#3F7D44', bg: '#3F7D4422' },
  en_curso:    { label: 'En curso',    color: C.red,     bg: C.red + '22'  },
  completado:  { label: 'Completado',  color: '#6B7280', bg: '#6B728022' },
  facturado:   { label: 'Facturado',   color: '#2B6A6E', bg: '#2B6A6E22' },
  cancelado:   { label: 'Cancelado',   color: '#9CA3AF', bg: '#9CA3AF22' },
}

const MODO_LABELS: Record<EventoModoLocal, string> = {
  cerrado: 'Local cerrado', parcial: 'Zona reservada',
  terraza: 'Terraza exclusiva', externo: 'Espacio externo', itinerante: 'Multi-local'
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtEur = (n: number | null) => n ? `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '—'
const diasHasta = (fecha: string) => {
  const diff = Math.ceil((new Date(fecha + 'T00:00:00').getTime() - Date.now()) / 86400000)
  if (diff < 0) return null
  if (diff === 0) return '¡HOY!'
  if (diff === 1) return 'mañana'
  return `en ${diff}d`
}

// ─── Formulario nuevo evento ──────────────────────────────────────────────────
interface FormEventoProps {
  restauranteId: string
  sh: () => Record<string, string>
  espacios: Espacio[]
  onCreado: (e: Evento) => void
  onCancel: () => void
  eventoEditar?: Evento | null
}

function FormEvento({ restauranteId, sh, espacios, onCreado, onCancel, eventoEditar }: FormEventoProps) {
  const isEdit = !!eventoEditar
  const [form, setForm] = useState({
    tipo: eventoEditar?.tipo ?? 'otro',
    cliente_nombre: eventoEditar?.cliente_nombre ?? '',
    cliente_telefono: eventoEditar?.cliente_telefono ?? '',
    cliente_email: eventoEditar?.cliente_email ?? '',
    fecha_evento: eventoEditar?.fecha_evento ?? '',
    hora_inicio: eventoEditar?.hora_inicio ?? '',
    hora_fin: eventoEditar?.hora_fin ?? '',
    modo_local: eventoEditar?.modo_local ?? 'externo',
    espacio_id: eventoEditar?.espacio_id ?? '',
    espacio_descripcion: '',
    aforo_previsto: eventoEditar?.aforo_previsto?.toString() ?? '',
    precio_por_persona: eventoEditar?.precio_por_persona?.toString() ?? '',
    menu_descripcion: '',
    notas_internas: eventoEditar?.notas_internas ?? '',
    notas_cocina: eventoEditar?.notas_cocina ?? '',
    notas_sala: eventoEditar?.notas_sala ?? '',
    senial_importe: '',
    requiere_appcc: eventoEditar?.requiere_appcc ?? false,
    acceso_qr_activo: eventoEditar?.acceso_qr_activo ?? false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const precioTotal = form.precio_por_persona && form.aforo_previsto
    ? parseFloat(form.precio_por_persona) * parseInt(form.aforo_previsto)
    : null

  const handleSubmit = async () => {
    if (!form.cliente_nombre || !form.fecha_evento || !form.aforo_previsto) {
      setError('Cliente, fecha y aforo son obligatorios'); return
    }
    setSaving(true); setError('')
    try {
      const url = '/api/owner/eventos'
      const method = isEdit ? 'PUT' : 'POST'
      const body = isEdit ? { id: eventoEditar!.id, ...form } : form
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Error'); return }
      onCreado(data.evento)
    } finally { setSaving(false) }
  }

  const inp = (field: string, type = 'text', placeholder = '') => (
    <input
      type={type}
      placeholder={placeholder}
      value={(form as Record<string, unknown>)[field] as string}
      onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
      style={{ width: '100%', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '8px 10px', fontFamily: SN, fontSize: 13, color: C.ink, boxSizing: 'border-box' }}
    />
  )

  const sel = (field: string, options: { value: string; label: string }[]) => (
    <select
      value={(form as Record<string, unknown>)[field] as string}
      onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
      style={{ width: '100%', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '8px 10px', fontFamily: SN, fontSize: 13, color: C.ink }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )

  return (
    <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 20 }}>
      <div style={{ fontFamily: SE, fontSize: 17, fontWeight: 700, color: C.ink, marginBottom: 16 }}>
        {isEdit ? `Editar ${eventoEditar!.numero_evento}` : 'Nuevo evento'}
      </div>

      {/* Tipo + Cliente */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>Tipo</div>
          {sel('tipo', Object.entries(TIPO_LABELS).map(([v, l]) => ({ value: v, label: l })))}
        </div>
        <div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>Cliente *</div>
          {inp('cliente_nombre', 'text', 'Nombre del cliente')}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>Teléfono</div>
          {inp('cliente_telefono', 'tel', '600 000 000')}
        </div>
        <div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>Email</div>
          {inp('cliente_email', 'email', 'cliente@email.com')}
        </div>
      </div>

      {/* Fecha y horas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>Fecha evento *</div>
          {inp('fecha_evento', 'date')}
        </div>
        <div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>Hora inicio</div>
          {inp('hora_inicio', 'time')}
        </div>
        <div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>Hora fin</div>
          {inp('hora_fin', 'time')}
        </div>
      </div>

      {/* Modo y espacio */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>Modo</div>
          {sel('modo_local', Object.entries(MODO_LABELS).map(([v, l]) => ({ value: v, label: l })))}
        </div>
        <div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>Espacio</div>
          {sel('espacio_id', [{ value: '', label: '— Sin espacio registrado —' }, ...espacios.map(e => ({ value: e.id, label: `${e.nombre} (max. ${e.aforo_maximo ?? '?'})` }))])}
        </div>
      </div>

      {/* Aforo y precio */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>Aforo previsto *</div>
          {inp('aforo_previsto', 'number', '100')}
        </div>
        <div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>€ / persona</div>
          {inp('precio_por_persona', 'number', '45')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.08em' }}>Total estimado</div>
          <div style={{ fontFamily: SE, fontSize: 22, fontWeight: 700, color: precioTotal ? C.green : C.ink3, fontStyle: 'italic' }}>
            {precioTotal ? fmtEur(precioTotal) : '—'}
          </div>
        </div>
      </div>

      {/* Notas */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>Notas cocina</div>
        <textarea
          placeholder="Alergias, especificaciones del menú..."
          value={form.notas_cocina}
          onChange={e => setForm(f => ({ ...f, notas_cocina: e.target.value }))}
          rows={2}
          style={{ width: '100%', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '8px 10px', fontFamily: SN, fontSize: 13, color: C.ink, resize: 'vertical', boxSizing: 'border-box' }}
        />
      </div>

      {/* Flags */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        {[
          { field: 'requiere_appcc', label: '📋 APPCC obligatorio' },
          { field: 'acceso_qr_activo', label: '🔒 Control acceso QR' },
        ].map(({ field, label }) => (
          <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: SN, fontSize: 13, color: C.ink }}>
            <input
              type="checkbox"
              checked={(form as Record<string, unknown>)[field] as boolean}
              onChange={e => setForm(f => ({ ...f, [field]: e.target.checked }))}
            />
            {label}
          </label>
        ))}
      </div>

      {error && <div style={{ color: C.red, fontFamily: SN, fontSize: 13, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 6, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 13, color: C.ink3, cursor: 'pointer' }}>
          Cancelar
        </button>
        <button onClick={handleSubmit} disabled={saving} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: C.red, color: '#fff', fontFamily: SN, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear evento'}
        </button>
      </div>
    </div>
  )
}

// ─── Tarjeta de evento ────────────────────────────────────────────────────────
function TarjetaEvento({ evento, sh, onEdit, onEstado, onClonar }: {
  evento: Evento
  sh: () => Record<string, string>
  onEdit: (e: Evento) => void
  onEstado: (id: string, estado: EventoEstado) => void
  onClonar: (e: Evento) => void
}) {
  const est = ESTADO_CONFIG[evento.estado]
  const dias = diasHasta(evento.fecha_evento)
  const [expandido, setExpandido] = useState(false)
  const [mostrarAPPCC, setMostrarAPPCC] = useState(false)
  const [mostrarRentabilidad, setMostrarRentabilidad] = useState(false)

  const abrirPresupuesto = () => {
    window.open(`/api/owner/eventos/presupuesto?evento_id=${evento.id}`, '_blank')
  }

  return (
    <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '14px 16px', marginBottom: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>{evento.numero_evento}</span>
            <span style={{ fontFamily: SN, fontSize: 11, padding: '2px 7px', borderRadius: 99, background: est.bg, color: est.color, fontWeight: 600 }}>
              {est.label}
            </span>
            {dias && (
              <span style={{ fontFamily: SN, fontSize: 11, padding: '2px 7px', borderRadius: 99, background: dias === '¡HOY!' ? C.red + '22' : C.amber + '22', color: dias === '¡HOY!' ? C.red : C.amber, fontWeight: 700 }}>
                {dias}
              </span>
            )}
          </div>
          <div style={{ fontFamily: SE, fontSize: 17, fontWeight: 700, color: C.ink }}>
            {TIPO_LABELS[evento.tipo]} — {evento.cliente_nombre}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: SE, fontSize: 20, fontWeight: 700, color: C.ink, fontStyle: 'italic' }}>
            {fmtEur(evento.precio_total)}
          </div>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>
            {evento.aforo_previsto} pers · {evento.precio_por_persona ? fmtEur(evento.precio_por_persona) + '/p' : '—'}
          </div>
        </div>
      </div>

      {/* Info */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2 }}>
          📅 {fmt(evento.fecha_evento)}{evento.hora_inicio ? ` · ${evento.hora_inicio}` : ''}
        </div>
        <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2 }}>
          📍 {MODO_LABELS[evento.modo_local]}{evento.espacios_evento ? ` — ${evento.espacios_evento.nombre}` : ''}
        </div>
        {evento.requiere_appcc && <span style={{ fontFamily: SN, fontSize: 11, color: C.amber }}>📋 APPCC</span>}
        {evento.acceso_qr_activo && <span style={{ fontFamily: SN, fontSize: 11, color: '#2B6A6E' }}>🔒 QR</span>}
        {evento.es_itinerante && <span style={{ fontFamily: SN, fontSize: 11, color: C.red }}>🗺 Multi-local</span>}
      </div>

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => onEdit(evento)} style={{ padding: '5px 12px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 12, color: C.ink2, cursor: 'pointer' }}>
          Editar
        </button>
        {/* Transiciones de estado */}
        {evento.estado === 'presupuesto' && (
          <button onClick={() => onEstado(evento.id, 'confirmado')} style={{ padding: '5px 12px', borderRadius: 5, border: 'none', background: '#3F7D4422', fontFamily: SN, fontSize: 12, color: '#3F7D44', fontWeight: 600, cursor: 'pointer' }}>
            ✓ Confirmar
          </button>
        )}
        {evento.estado === 'confirmado' && (
          <button onClick={() => onEstado(evento.id, 'en_curso')} style={{ padding: '5px 12px', borderRadius: 5, border: 'none', background: C.red + '22', fontFamily: SN, fontSize: 12, color: C.red, fontWeight: 600, cursor: 'pointer' }}>
            ▶ Iniciar
          </button>
        )}
        {evento.estado === 'en_curso' && (
          <button onClick={() => onEstado(evento.id, 'completado')} style={{ padding: '5px 12px', borderRadius: 5, border: 'none', background: '#6B728022', fontFamily: SN, fontSize: 12, color: '#4B5563', fontWeight: 600, cursor: 'pointer' }}>
            ✓ Completar
          </button>
        )}
        {(evento.estado === 'presupuesto' || evento.estado === 'confirmado') && (
          <button onClick={() => onEstado(evento.id, 'cancelado')} style={{ padding: '5px 12px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 12, color: C.ink3, cursor: 'pointer' }}>
            Cancelar
          </button>
        )}
        <button onClick={abrirPresupuesto} style={{ padding: '5px 12px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 12, color: '#2B6A6E', cursor: 'pointer' }}>
          📄 Presupuesto
        </button>
        {evento.es_recurrente && (
          <button onClick={() => onClonar(evento)} style={{ padding: '5px 12px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 12, color: C.amber, cursor: 'pointer' }}>
            🔁 Clonar
          </button>
        )}
        {evento.requiere_appcc && (
          <button onClick={() => setMostrarAPPCC(v => !v)} style={{ padding: '5px 12px', borderRadius: 5, border: `1px solid ${C.amber}44`, background: mostrarAPPCC ? C.amber + '22' : 'transparent', fontFamily: SN, fontSize: 12, color: C.amber, cursor: 'pointer' }}>
            📋 APPCC
          </button>
        )}
        <button onClick={() => setMostrarRentabilidad(v => !v)} style={{ padding: '5px 12px', borderRadius: 5, border: `1px solid ${C.green}44`, background: mostrarRentabilidad ? C.green + '22' : 'transparent', fontFamily: SN, fontSize: 12, color: C.green, cursor: 'pointer' }}>
          📊 Rentabilidad
        </button>
      </div>

      {mostrarAPPCC && <PanelAPPCC eventoId={evento.id} sh={sh} />}
      {mostrarRentabilidad && <PanelRentabilidad eventoId={evento.id} sh={sh} onCerrar={() => { setMostrarRentabilidad(false); onEstado(evento.id, 'completado') }} />}
    </div>
  )
}

// ─── Panel rentabilidad ───────────────────────────────────────────────────────
type Rentabilidad = {
  ingresos_totales: number; coste_ingredientes: number; coste_personal: number
  coste_espacio: number; coste_total: number; margen_bruto: number; margen_pct: number
}

function PanelRentabilidad({ eventoId, sh, onCerrar }: {
  eventoId: string; sh: () => Record<string, string>; onCerrar: () => void
}) {
  const [data, setData] = useState<{ rentabilidad: Rentabilidad | null; costes: { id: string; tipo: string; descripcion: string; importe: number; origen: string }[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [formCoste, setFormCoste] = useState({ tipo: 'ingredientes', descripcion: '', importe: '' })
  const [saving, setSaving] = useState(false)
  const [modalCerrar, setModalCerrar] = useState(false)
  const [afoRo, setAforo] = useState('')
  const [costeEspacio, setCosteEspacio] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/owner/eventos/rentabilidad?evento_id=${eventoId}`, { headers: sh() })
    const d = await res.json()
    setData(d); setLoading(false)
  }, [eventoId, sh])

  useEffect(() => { cargar() }, [cargar])

  const añadirCoste = async () => {
    if (!formCoste.descripcion || !formCoste.importe) return
    setSaving(true)
    await fetch('/api/owner/eventos/costes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ evento_id: eventoId, ...formCoste, importe: parseFloat(formCoste.importe) }),
    })
    setFormCoste({ tipo: 'ingredientes', descripcion: '', importe: '' })
    setSaving(false); cargar()
  }

  const cerrarEvento = async () => {
    setSaving(true)
    await fetch('/api/owner/eventos/cerrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ evento_id: eventoId, aforo_confirmado: afoRo ? parseInt(afoRo) : null, coste_espacio: costeEspacio ? parseFloat(costeEspacio) : null }),
    })
    setModalCerrar(false); setSaving(false); onCerrar()
  }

  const fmtEur2 = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
  const r = data?.rentabilidad

  return (
    <div style={{ marginTop: 12, background: '#F0FFF4', border: `1px solid ${C.green}44`, borderRadius: 8, padding: 14 }}>
      <div style={{ fontFamily: SN, fontSize: 12, fontWeight: 700, color: C.green, marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: '.08em' }}>
        📊 Rentabilidad
      </div>

      {loading ? (
        <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>Calculando...</div>
      ) : r ? (
        <>
          {/* Resumen */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
            {[
              { label: 'Ingresos', value: fmtEur2(r.ingresos_totales), color: C.green },
              { label: 'Costes', value: fmtEur2(r.coste_total), color: C.red },
              { label: 'Margen', value: `${r.margen_pct}%`, color: r.margen_pct > 50 ? C.green : r.margen_pct > 30 ? C.amber : C.red },
            ].map(s => (
              <div key={s.label} style={{ background: C.paper, borderRadius: 6, padding: '8px 10px', textAlign: 'center' as const }}>
                <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3, textTransform: 'uppercase' as const }}>{s.label}</div>
                <div style={{ fontFamily: SE, fontSize: 16, fontWeight: 700, color: s.color, fontStyle: 'italic' }}>{s.value}</div>
              </div>
            ))}
          </div>
          {/* Desglose costes */}
          <div style={{ marginBottom: 10 }}>
            {[
              { label: 'Ingredientes', value: r.coste_ingredientes },
              { label: 'Personal', value: r.coste_personal },
              { label: 'Espacio', value: r.coste_espacio },
            ].filter(d => d.value > 0).map(d => (
              <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: SN, fontSize: 12, color: C.ink2, padding: '2px 0' }}>
                <span>{d.label}</span><span>{fmtEur2(d.value)}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginBottom: 10 }}>Sin costes registrados aún.</div>
      )}

      {/* Añadir coste manual */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr auto', gap: 6, marginBottom: 8 }}>
        <select value={formCoste.tipo} onChange={e => setFormCoste(f => ({ ...f, tipo: e.target.value }))}
          style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '5px 6px', fontFamily: SN, fontSize: 11, color: C.ink }}>
          {['ingredientes','personal','espacio','transporte','otro'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input placeholder="Descripción" value={formCoste.descripcion}
          onChange={e => setFormCoste(f => ({ ...f, descripcion: e.target.value }))}
          style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '5px 6px', fontFamily: SN, fontSize: 12, color: C.ink }} />
        <input type="number" placeholder="€" value={formCoste.importe}
          onChange={e => setFormCoste(f => ({ ...f, importe: e.target.value }))}
          style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '5px 6px', fontFamily: SM, fontSize: 12, color: C.ink }} />
        <button onClick={añadirCoste} disabled={saving} style={{ padding: '5px 10px', borderRadius: 5, border: 'none', background: C.green, color: '#fff', fontFamily: SN, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          +
        </button>
      </div>

      <button onClick={() => setModalCerrar(true)} style={{ width: '100%', padding: '8px', borderRadius: 6, border: 'none', background: C.ink, color: C.paper, fontFamily: SN, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
        ✓ Cerrar evento y calcular margen final
      </button>

      {/* Modal cerrar */}
      {modalCerrar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
          <div style={{ background: C.paper, borderRadius: 12, padding: 20, width: '100%', maxWidth: 340 }}>
            <div style={{ fontFamily: SE, fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 12 }}>Cerrar evento</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4 }}>Aforo real (opcional)</div>
              <input type="number" placeholder="350" value={afoRo} onChange={e => setAforo(e.target.value)}
                style={{ width: '100%', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '7px 8px', fontFamily: SN, fontSize: 13, color: C.ink, boxSizing: 'border-box' as const }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4 }}>Coste espacio € (opcional)</div>
              <input type="number" placeholder="600" value={costeEspacio} onChange={e => setCosteEspacio(e.target.value)}
                style={{ width: '100%', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '7px 8px', fontFamily: SN, fontSize: 13, color: C.ink, boxSizing: 'border-box' as const }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalCerrar(false)} style={{ padding: '7px 14px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 12, color: C.ink3, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={cerrarEvento} disabled={saving} style={{ padding: '7px 14px', borderRadius: 5, border: 'none', background: C.green, color: '#fff', fontFamily: SN, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {saving ? '...' : '✓ Cerrar y calcular'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Panel APPCC ─────────────────────────────────────────────────────────────
const TIPOS_APPCC = [
  { value: 'temperatura_camara',             label: 'Temp. cámara',        unidad: '°C', limite: '≤4°C' },
  { value: 'temperatura_coccion',            label: 'Temp. cocción',        unidad: '°C', limite: '≥65°C' },
  { value: 'temperatura_transporte_salida',  label: 'Temp. transporte (salida)',  unidad: '°C', limite: '≤4°C' },
  { value: 'temperatura_transporte_llegada', label: 'Temp. transporte (llegada)', unidad: '°C', limite: '≤8°C' },
  { value: 'temperatura_servicio_caliente',  label: 'Temp. servicio caliente',    unidad: '°C', limite: '≥63°C' },
  { value: 'temperatura_servicio_frio',      label: 'Temp. servicio frío',        unidad: '°C', limite: '≤8°C' },
  { value: 'plato_testigo',                  label: 'Plato testigo',        unidad: '',   limite: 'Obligatorio (7d)' },
]

type AppccReg = {
  id: string; tipo_registro: string; valor: number | null; cumple: boolean | null
  hora_registro: string; plato_testigo_plato: string | null
  plato_testigo_ubicacion: string | null; plato_testigo_expira_at: string | null
  notas: string | null
}

function PanelAPPCC({ eventoId, sh }: { eventoId: string; sh: () => Record<string, string> }) {
  const [registros, setRegistros] = useState<AppccReg[]>([])
  const [resumen, setResumen] = useState<{ total: number; cumple: number; incidencias: number } | null>(null)
  const [form, setForm] = useState({ tipo_registro: 'temperatura_camara', valor: '', plato_testigo_plato: '', plato_testigo_ubicacion: '', notas: '' })
  const [saving, setSaving] = useState(false)

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/owner/eventos/appcc?evento_id=${eventoId}`, { headers: sh() })
    const data = await res.json()
    setRegistros(data.registros ?? [])
    setResumen(data.resumen ?? null)
  }, [eventoId, sh])

  useEffect(() => { cargar() }, [cargar])

  const handleGuardar = async () => {
    setSaving(true)
    try {
      await fetch('/api/owner/eventos/appcc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({ evento_id: eventoId, ...form, valor: form.valor ? parseFloat(form.valor) : null }),
      })
      setForm({ tipo_registro: 'temperatura_camara', valor: '', plato_testigo_plato: '', plato_testigo_ubicacion: '', notas: '' })
      cargar()
    } finally { setSaving(false) }
  }

  const tipoActual = TIPOS_APPCC.find(t => t.value === form.tipo_registro)
  const esPlato = form.tipo_registro === 'plato_testigo'

  return (
    <div style={{ marginTop: 12, background: '#FFFBF5', border: `1px solid ${C.amber}44`, borderRadius: 8, padding: 14 }}>
      <div style={{ fontFamily: SN, fontSize: 12, fontWeight: 700, color: C.amber, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}>
        📋 Registros APPCC
        {resumen && (
          <span style={{ marginLeft: 8, fontWeight: 400, color: resumen.incidencias > 0 ? C.red : C.green }}>
            {resumen.cumple}/{resumen.total} ok
            {resumen.incidencias > 0 ? ` · ${resumen.incidencias} incidencia(s)` : ''}
          </span>
        )}
      </div>

      {/* Formulario nuevo registro */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 6, marginBottom: 10, alignItems: 'end' }}>
        <select
          value={form.tipo_registro}
          onChange={e => setForm(f => ({ ...f, tipo_registro: e.target.value }))}
          style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '6px 8px', fontFamily: SN, fontSize: 12, color: C.ink }}
        >
          {TIPOS_APPCC.map(t => <option key={t.value} value={t.value}>{t.label} ({t.limite})</option>)}
        </select>
        {!esPlato && (
          <input
            type="number" step="0.1" placeholder={`°C`}
            value={form.valor}
            onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
            style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '6px 8px', fontFamily: SM, fontSize: 13, color: C.ink }}
          />
        )}
        {esPlato && (
          <input
            type="text" placeholder="Plato"
            value={form.plato_testigo_plato}
            onChange={e => setForm(f => ({ ...f, plato_testigo_plato: e.target.value }))}
            style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '6px 8px', fontFamily: SN, fontSize: 12, color: C.ink }}
          />
        )}
        <button onClick={handleGuardar} disabled={saving} style={{ padding: '6px 12px', borderRadius: 5, border: 'none', background: C.amber, color: '#fff', fontFamily: SN, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {saving ? '...' : '+ Registrar'}
        </button>
      </div>
      {esPlato && (
        <input
          type="text" placeholder="Ubicación (ej: congelador 2, estante A)"
          value={form.plato_testigo_ubicacion}
          onChange={e => setForm(f => ({ ...f, plato_testigo_ubicacion: e.target.value }))}
          style={{ width: '100%', background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '6px 8px', fontFamily: SN, fontSize: 12, color: C.ink, marginBottom: 6, boxSizing: 'border-box' }}
        />
      )}

      {/* Lista registros */}
      {registros.length > 0 && (
        <div style={{ maxHeight: 160, overflowY: 'auto' }}>
          {registros.slice(0, 8).map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: `1px solid ${C.rule}44`, fontFamily: SN, fontSize: 11 }}>
              <span style={{ color: r.cumple === false ? C.red : r.cumple === true ? C.green : C.amber, fontWeight: 700, width: 16 }}>
                {r.cumple === false ? '✗' : r.cumple === true ? '✓' : '•'}
              </span>
              <span style={{ color: C.ink2, flex: 1 }}>
                {TIPOS_APPCC.find(t => t.value === r.tipo_registro)?.label ?? r.tipo_registro}
                {r.valor !== null ? ` → ${r.valor}°C` : ''}
                {r.plato_testigo_plato ? ` — ${r.plato_testigo_plato}` : ''}
                {r.plato_testigo_ubicacion ? ` (${r.plato_testigo_ubicacion})` : ''}
              </span>
              <span style={{ color: C.ink3 }}>
                {new Date(r.hora_registro).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </span>
              {r.plato_testigo_expira_at && (
                <span style={{ color: C.amber, fontSize: 10 }}>exp. {new Date(r.plato_testigo_expira_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
interface EventosTabProps {
  restauranteId: string
  sh: () => Record<string, string>
}

export default function EventosTab({ restauranteId, sh }: EventosTabProps) {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [espacios, setEspacios] = useState<Espacio[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<EventoEstado | 'todos'>('todos')
  const [filtroModo, setFiltroModo] = useState<'local' | 'grupo'>('local')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [eventoEditar, setEventoEditar] = useState<Evento | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filtroEstado !== 'todos') params.set('estado', filtroEstado)
      if (filtroModo === 'grupo') params.set('modo', 'grupo')
      const [evRes, espRes] = await Promise.all([
        fetch(`/api/owner/eventos?${params}`, { headers: sh() }),
        fetch('/api/owner/eventos/espacios', { headers: sh() }),
      ])
      const [evData, espData] = await Promise.all([evRes.json(), espRes.json()])
      setEventos(evData.eventos ?? [])
      setEspacios(espData.espacios ?? [])
    } finally { setLoading(false) }
  }, [filtroEstado, filtroModo, sh])

  useEffect(() => { cargar() }, [cargar])

  const [modalClonar, setModalClonar] = useState<Evento | null>(null)
  const [fechaClonar, setFechaClonar] = useState('')
  const [clonando, setClonando] = useState(false)

  const handleClonar = async () => {
    if (!modalClonar || !fechaClonar) return
    setClonando(true)
    try {
      await fetch('/api/owner/eventos/clonar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({ evento_id: modalClonar.id, nueva_fecha: fechaClonar }),
      })
      setModalClonar(null); setFechaClonar(''); cargar()
    } finally { setClonando(false) }
  }

  const onEstado = async (id: string, estado: EventoEstado) => {
    await fetch('/api/owner/eventos', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ id, estado }) })
    cargar()
  }

  const onCreado = () => { setMostrarForm(false); setEventoEditar(null); cargar() }

  // ─── Stats rápidas ───
  const hoy = new Date().toISOString().slice(0, 10)
  const proximos = eventos.filter(e => e.fecha_evento >= hoy && e.estado !== 'cancelado')
  const confirmados = eventos.filter(e => e.estado === 'confirmado')
  const ingresosPrev = eventos.filter(e => ['confirmado', 'en_curso'].includes(e.estado)).reduce((s, e) => s + (e.precio_total ?? 0), 0)

  return (
    <div style={{ padding: '0 0 40px' }}>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Próximos', value: proximos.length.toString(), sub: 'eventos activos' },
          { label: 'Confirmados', value: confirmados.length.toString(), sub: 'con señal/contrato' },
          { label: 'Ingresos previstos', value: fmtEur(ingresosPrev), sub: 'confirmados + en curso' },
        ].map(s => (
          <div key={s.label} style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontFamily: SE, fontSize: 22, fontWeight: 700, color: C.ink, fontStyle: 'italic' }}>{s.value}</div>
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Controles */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Filtro estado */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['todos', 'presupuesto', 'confirmado', 'en_curso', 'completado'] as const).map(e => (
            <button key={e} onClick={() => setFiltroEstado(e)} style={{
              padding: '5px 10px', borderRadius: 5, border: `1px solid ${C.rule}`,
              background: filtroEstado === e ? C.ink : 'transparent',
              color: filtroEstado === e ? C.paper : C.ink3,
              fontFamily: SN, fontSize: 11, cursor: 'pointer', fontWeight: filtroEstado === e ? 600 : 400,
            }}>
              {e === 'todos' ? 'Todos' : ESTADO_CONFIG[e as EventoEstado].label}
            </button>
          ))}
        </div>

        {/* Toggle local/grupo */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {(['local', 'grupo'] as const).map(m => (
            <button key={m} onClick={() => setFiltroModo(m)} style={{
              padding: '5px 10px', borderRadius: 5, border: `1px solid ${C.rule}`,
              background: filtroModo === m ? C.red : 'transparent',
              color: filtroModo === m ? '#fff' : C.ink3,
              fontFamily: SN, fontSize: 11, cursor: 'pointer',
            }}>
              {m === 'local' ? 'Este local' : 'Grupo'}
            </button>
          ))}
        </div>

        <button onClick={() => { setEventoEditar(null); setMostrarForm(true) }} style={{
          padding: '7px 14px', borderRadius: 6, border: 'none',
          background: C.red, color: '#fff', fontFamily: SN, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>
          + Nuevo evento
        </button>
      </div>

      {/* Formulario */}
      {(mostrarForm || eventoEditar) && (
        <div style={{ marginBottom: 16 }}>
          <FormEvento
            restauranteId={restauranteId}
            sh={sh}
            espacios={espacios}
            onCreado={onCreado}
            onCancel={() => { setMostrarForm(false); setEventoEditar(null) }}
            eventoEditar={eventoEditar}
          />
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, fontFamily: SN, fontSize: 13, color: C.ink3 }}>Cargando eventos...</div>
      ) : eventos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, background: C.paper, borderRadius: 10, border: `1px solid ${C.rule}` }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
          <div style={{ fontFamily: SE, fontSize: 17, color: C.ink, marginBottom: 4 }}>Sin eventos todavía</div>
          <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>Crea tu primer evento para empezar a gestionar bodas, comuniones y celebraciones.</div>
        </div>
      ) : (
        eventos.map(e => (
          <TarjetaEvento
            key={e.id}
            evento={e}
            sh={sh}
            onEdit={ev => { setEventoEditar(ev); setMostrarForm(false) }}
            onEstado={onEstado}
            onClonar={ev => { setModalClonar(ev); setFechaClonar('') }}
          />
        ))
      )}

      {/* Modal clonar evento */}
      {modalClonar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: C.paper, borderRadius: 12, padding: 24, width: '100%', maxWidth: 360 }}>
            <div style={{ fontFamily: SE, fontSize: 17, fontWeight: 700, color: C.ink, marginBottom: 4 }}>Clonar evento</div>
            <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3, marginBottom: 16 }}>
              Copiando {modalClonar.numero_evento} — {modalClonar.cliente_nombre}
            </div>
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.08em' }}>Nueva fecha *</div>
            <input
              type="date"
              value={fechaClonar}
              onChange={e => setFechaClonar(e.target.value)}
              style={{ width: '100%', background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '8px 10px', fontFamily: SN, fontSize: 13, color: C.ink, marginBottom: 16, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalClonar(null)} style={{ padding: '8px 16px', borderRadius: 6, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 13, color: C.ink3, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleClonar} disabled={!fechaClonar || clonando} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: C.amber, color: '#fff', fontFamily: SN, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: !fechaClonar || clonando ? 0.7 : 1 }}>
                {clonando ? 'Clonando...' : '🔁 Clonar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
