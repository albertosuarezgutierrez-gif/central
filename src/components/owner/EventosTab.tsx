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
function TarjetaEvento({ evento, onEdit, onEstado }: {
  evento: Evento
  onEdit: (e: Evento) => void
  onEstado: (id: string, estado: EventoEstado) => void
}) {
  const est = ESTADO_CONFIG[evento.estado]
  const dias = diasHasta(evento.fecha_evento)

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
      </div>
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
            onEdit={ev => { setEventoEditar(ev); setMostrarForm(false) }}
            onEstado={onEstado}
          />
        ))
      )}
    </div>
  )
}
