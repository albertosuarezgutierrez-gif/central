'use client'
import React, { useState, useEffect, useCallback } from 'react'

// ─── Design tokens (mismos que owner/page.tsx) ───────────────────────────────
const C = {
  paper:'#F6F1E7', paper2:'#EFE7D6', paper3:'#E5DAC2', bone:'#FBF8F1',
  ink:'#1A1714', ink2:'#3A332C', ink3:'#6B5F52', ink4:'#9A8D7C',
  rule:'#D8CDB6',
  red:'#D9442B', redD:'#A8311E', redS:'#F4D8CF',
  amber:'#E8A33B', amberD:'#A8761A', amberS:'#F7E3B6',
  green:'#3F7D44', greenS:'#D4E4D2',
  dark:'#14110E', dark1:'#1F1A15', dark2:'#2A241D',
  darkFg:'#F6F1E7', darkFg2:'#C9BFAA', darkFg3:'#8D8270',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"
const SC = "'Caveat',cursive"

// ─── Types ───────────────────────────────────────────────────────────────────
export interface AlertaRegla {
  id: string
  restaurante_id: string
  nombre: string
  objeto: string
  condicion: string
  umbral_minutos: number
  horario_desde: string | null
  horario_hasta: string | null
  dias_semana: number[] | null
  zona_ids: string[] | null
  destinatario: string
  partida_id: string | null
  accion: string
  mensaje: string | null
  escalar_a: string | null
  escalar_minutos: number | null
  prioridad: number
  activa: boolean
  created_at: string
}

// ─── Catálogos ───────────────────────────────────────────────────────────────
const CONDICIONES: { value: string; label: string; objeto: string; desc: string; color: string }[] = [
  { value: 'sin_comanda',        label: 'Mesa sin pedir',          objeto: 'mesa',         desc: 'Mesa activa sin ninguna comanda desde hace X min',                    color: C.amber },
  { value: 'plato_sin_llegar',   label: 'Plato sin llegar',        objeto: 'comanda',      desc: 'Comanda confirmada, plato no servido al cliente desde hace X min',     color: C.red },
  { value: 'ticket_sin_tocar',   label: 'Ticket cocina sin tocar', objeto: 'ticket_cocina',desc: 'Ticket en KDS sin marcar ningún ítem desde hace X min',                color: C.red },
  { value: 'cuenta_sin_cobrar',  label: 'Cuenta sin cobrar',       objeto: 'cuenta',       desc: 'Cuenta pedida, sin pago cerrado, desde hace X min',                   color: C.amber },
  { value: 'rotacion_larga',     label: 'Mesa tiempo total',       objeto: 'mesa',         desc: 'Mesa ocupada más de X min en total (rotación)',                       color: C.ink3 },
  { value: 'item_sin_marcar',    label: 'Ítem rezagado en cocina', objeto: 'ticket_cocina',desc: 'Ítem sin marcar mientras otros de la misma comanda ya están listos',   color: C.amber },
  { value: 'cuentas_simultaneas',label: 'Pico de cuentas',         objeto: 'cuenta',       desc: 'X o más mesas piden cuenta en menos de 5 minutos (umbral = mínimo)',  color: C.ink3 },
]

const DESTINATARIOS = [
  { value: 'camarero_asignado', label: 'Camarero asignado a la mesa' },
  { value: 'todos_sala',        label: 'Todos los camareros en turno' },
  { value: 'jefe_sala',         label: 'Jefe de sala' },
  { value: 'cocina',            label: 'Cocina (toda / partida)' },
  { value: 'owner',             label: 'Owner (aunque no esté en el local)' },
]

const ACCIONES = [
  { value: 'push_silencioso',  label: 'Push silencioso',          desc: 'Llega al móvil sin interrumpir' },
  { value: 'push_sonido',      label: 'Push con sonido',          desc: 'Para urgencias que no pueden esperar' },
  { value: 'tts',              label: 'Solo TTS en el device',    desc: 'El device lo lee en voz alta' },
  { value: 'badge',            label: 'Solo badge visual',        desc: 'Indicador en mapa de sala / KDS, sin ruido' },
  { value: 'push_sonido+tts',  label: 'Push + TTS',               desc: 'Máxima visibilidad' },
]

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const DIAS_FULL = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']

// ─── Helpers ─────────────────────────────────────────────────────────────────
function condInfo(value: string) {
  return CONDICIONES.find(c => c.value === value) ?? CONDICIONES[0]
}
function destLabel(value: string) {
  return DESTINATARIOS.find(d => d.value === value)?.label ?? value
}
function accionLabel(value: string) {
  return ACCIONES.find(a => a.value === value)?.label ?? value
}
function diasLabel(dias: number[] | null) {
  if (!dias || dias.length === 7) return 'Todos los días'
  return dias.map(d => DIAS[d - 1]).join(' · ')
}
function horarioLabel(desde: string | null, hasta: string | null) {
  if (!desde && !hasta) return 'Todo el día'
  return `${desde ?? '00:00'} – ${hasta ?? '23:59'}`
}

const REGLA_NUEVA: Omit<AlertaRegla, 'id'|'restaurante_id'|'created_at'> = {
  nombre: '',
  objeto: 'mesa',
  condicion: 'sin_comanda',
  umbral_minutos: 10,
  horario_desde: null,
  horario_hasta: null,
  dias_semana: null,
  zona_ids: null,
  destinatario: 'camarero_asignado',
  partida_id: null,
  accion: 'push_sonido',
  mensaje: null,
  escalar_a: null,
  escalar_minutos: null,
  prioridad: 0,
  activa: true,
}

// ─── Chip ─────────────────────────────────────────────────────────────────────
function Chip({ children, color = C.paper2, border = C.rule }: { children: React.ReactNode; color?: string; border?: string }) {
  return (
    <span style={{
      fontFamily: SM, fontSize: 10, fontWeight: 600, letterSpacing: '.07em',
      background: color, color: C.ink2, padding: '2px 7px', borderRadius: 999,
      border: `1px solid ${border}`, whiteSpace: 'nowrap', display: 'inline-block',
    }}>{children}</span>
  )
}

// ─── Toggle ──────────────────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: 38, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
        background: on ? C.green : C.rule, position: 'relative', transition: 'background .2s',
        flexShrink: 0,
      }}
      title={on ? 'Activa — clic para desactivar' : 'Inactiva — clic para activar'}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 19 : 3,
        width: 16, height: 16, borderRadius: '50%', background: 'white',
        transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
        display: 'block',
      }}/>
    </button>
  )
}

// ─── Campo de formulario ──────────────────────────────────────────────────────
function Campo({ label, children, nota }: { label: string; children: React.ReactNode; nota?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontFamily: SN, fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: C.ink3 }}>{label}</label>
      {children}
      {nota && <span style={{ fontFamily: SC, fontSize: 12, color: C.ink4 }}>{nota}</span>}
    </div>
  )
}

function Input({ value, onChange, type = 'text', min, max, placeholder, style }: {
  value: string | number; onChange: (v: string) => void;
  type?: string; min?: number; max?: number; placeholder?: string; style?: React.CSSProperties
}) {
  return (
    <input
      type={type} value={value} min={min} max={max} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{
        fontFamily: type === 'number' ? SM : SN, fontSize: 13,
        background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 4,
        padding: '7px 10px', color: C.ink, outline: 'none', width: '100%',
        ...style
      }}
    />
  )
}

function Select({ value, onChange, children, style }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; style?: React.CSSProperties
}) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      style={{
        fontFamily: SN, fontSize: 13, background: C.bone, border: `1px solid ${C.rule}`,
        borderRadius: 4, padding: '7px 10px', color: C.ink, outline: 'none', width: '100%',
        ...style
      }}
    >
      {children}
    </select>
  )
}

// ─── Editor de regla ──────────────────────────────────────────────────────────
function ReglaEditor({
  regla, onSave, onCancel, saving, error
}: {
  regla: Partial<AlertaRegla>
  onSave: (r: Partial<AlertaRegla>) => void
  onCancel: () => void
  saving: boolean
  error: string | null
}) {
  const [form, setForm] = useState<Partial<AlertaRegla>>(regla)
  const set = (k: keyof AlertaRegla, v: unknown) => setForm(p => ({ ...p, [k]: v }))

  // Cuando cambia condición, auto-rellenar objeto y mensaje si están vacíos
  const handleCondicion = (v: string) => {
    const info = CONDICIONES.find(c => c.value === v)
    set('condicion', v)
    if (info) set('objeto', info.objeto)
    if (!form.mensaje) {
      const defaults: Record<string, string> = {
        sin_comanda:        'Mesa {mesa} lleva {tiempo} min sin pedir',
        plato_sin_llegar:   'Mesa {mesa} lleva {tiempo} min esperando plato',
        ticket_sin_tocar:   'Ticket {mesa} lleva {tiempo} min en cocina sin tocar',
        cuenta_sin_cobrar:  'Mesa {mesa} lleva {tiempo} min esperando cobro',
        rotacion_larga:     'Mesa {mesa} lleva {tiempo} min ocupada',
        item_sin_marcar:    '{plato} ({mesa}) lleva {tiempo} min sin marcar',
        cuentas_simultaneas:'{n} mesas pidieron cuenta en los últimos 5 min',
      }
      set('mensaje', defaults[v] ?? '')
    }
  }

  const cInfo = condInfo(form.condicion ?? 'sin_comanda')

  return (
    <div style={{
      background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8,
      padding: 20, display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      {/* Nombre */}
      <Campo label="Nombre de la regla" nota="Usa un nombre descriptivo para el servicio, ej: 'Plato lento viernes noche'">
        <Input
          value={form.nombre ?? ''} onChange={v => set('nombre', v)}
          placeholder="ej: Mesa sin atender en terraza"
        />
      </Campo>

      {/* Condición */}
      <Campo label="¿Qué vigilar?" nota={cInfo.desc}>
        <Select value={form.condicion ?? 'sin_comanda'} onChange={handleCondicion}>
          {CONDICIONES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </Select>
      </Campo>

      {/* Umbral */}
      <Campo
        label={form.condicion === 'cuentas_simultaneas' ? 'Mínimo de cuentas simultáneas' : 'Umbral (minutos)'}
        nota={form.condicion === 'cuentas_simultaneas' ? 'Disparar si X o más mesas piden cuenta en <5 min' : 'Tiempo desde que se produce la condición hasta que se dispara la alerta'}
      >
        <Input
          type="number" min={1} max={999}
          value={form.umbral_minutos ?? 10}
          onChange={v => set('umbral_minutos', parseInt(v) || 1)}
          style={{ maxWidth: 100 }}
        />
      </Campo>

      {/* Filtros horario */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Campo label="Solo desde (hora)" nota="Vacío = sin límite">
          <Input type="time" value={form.horario_desde ?? ''} onChange={v => set('horario_desde', v || null)} />
        </Campo>
        <Campo label="Solo hasta (hora)" nota="Vacío = sin límite">
          <Input type="time" value={form.horario_hasta ?? ''} onChange={v => set('horario_hasta', v || null)} />
        </Campo>
      </div>

      {/* Días de semana */}
      <Campo label="Días de la semana" nota="Sin selección = todos los días">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {DIAS.map((d, i) => {
            const n = i + 1
            const active = (form.dias_semana ?? []).includes(n)
            return (
              <button
                key={n}
                title={DIAS_FULL[i]}
                onClick={() => {
                  const curr = form.dias_semana ?? []
                  const next = active ? curr.filter(x => x !== n) : [...curr, n].sort()
                  set('dias_semana', next.length === 0 ? null : next)
                }}
                style={{
                  width: 34, height: 34, borderRadius: '50%', border: `1px solid ${active ? C.red : C.rule}`,
                  background: active ? C.redS : C.bone, color: active ? C.red : C.ink3,
                  fontFamily: SN, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'all .15s',
                }}
              >
                {d}
              </button>
            )
          })}
        </div>
      </Campo>

      {/* Destinatario */}
      <Campo label="¿A quién avisar?">
        <Select value={form.destinatario ?? 'camarero_asignado'} onChange={v => set('destinatario', v)}>
          {DESTINATARIOS.map(d => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </Select>
      </Campo>

      {/* Acción */}
      <Campo label="¿Cómo avisar?">
        <Select value={form.accion ?? 'push_sonido'} onChange={v => set('accion', v)}>
          {ACCIONES.map(a => (
            <option key={a.value} value={a.value}>{a.label} — {a.desc}</option>
          ))}
        </Select>
      </Campo>

      {/* Mensaje */}
      <Campo label="Mensaje" nota="Variables: {mesa} {tiempo} {plato} {n}">
        <Input
          value={form.mensaje ?? ''}
          onChange={v => set('mensaje', v)}
          placeholder="ej: Mesa {mesa} lleva {tiempo} min sin atender"
        />
      </Campo>

      {/* Escalado */}
      <div style={{
        background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 6,
        padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <span style={{ fontFamily: SN, fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: C.ink3 }}>
          Escalado (opcional)
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'start' }}>
          <Campo label="Si no se atiende, escalar a:">
            <Select value={form.escalar_a ?? ''} onChange={v => set('escalar_a', v || null)}>
              <option value="">Sin escalado</option>
              {DESTINATARIOS.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </Select>
          </Campo>
          {form.escalar_a && (
            <Campo label="En (min)">
              <Input
                type="number" min={1} max={60}
                value={form.escalar_minutos ?? 5}
                onChange={v => set('escalar_minutos', parseInt(v) || 5)}
                style={{ maxWidth: 80 }}
              />
            </Campo>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: C.redS, border: `1px solid ${C.red}`, borderRadius: 4,
          padding: '8px 12px', fontFamily: SN, fontSize: 13, color: C.redD,
        }}>{error}</div>
      )}

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
        <button
          onClick={onCancel} disabled={saving}
          style={{
            fontFamily: SN, fontSize: 13, fontWeight: 600, padding: '8px 16px',
            background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 4,
            color: C.ink2, cursor: 'pointer',
          }}
        >
          Cancelar
        </button>
        <button
          onClick={() => onSave(form)} disabled={saving || !form.nombre?.trim()}
          style={{
            fontFamily: SN, fontSize: 13, fontWeight: 600, padding: '8px 16px',
            background: saving ? C.rule : C.dark, border: 'none', borderRadius: 4,
            color: C.darkFg, cursor: saving ? 'wait' : 'pointer',
            opacity: !form.nombre?.trim() ? .5 : 1,
          }}
        >
          {saving ? 'Guardando…' : 'Guardar regla'}
        </button>
      </div>
    </div>
  )
}

// ─── Tarjeta de regla ─────────────────────────────────────────────────────────
function ReglaCard({
  regla, onToggle, onEdit, onDelete, canDelete, toggling
}: {
  regla: AlertaRegla
  onToggle: (r: AlertaRegla) => void
  onEdit: (r: AlertaRegla) => void
  onDelete: (r: AlertaRegla) => void
  canDelete: boolean
  toggling: boolean
}) {
  const cInfo = condInfo(regla.condicion)
  const accentColor = regla.activa ? cInfo.color : C.ink4

  return (
    <div style={{
      border: `1px solid ${regla.activa ? C.rule : C.rule}`,
      borderLeft: `3px solid ${accentColor}`,
      borderRadius: 8, overflow: 'hidden', background: regla.activa ? C.bone : C.paper2,
      opacity: regla.activa ? 1 : .65, transition: 'all .2s',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
        borderBottom: `1px solid ${C.rule}`, background: C.paper2,
      }}>
        <Toggle on={regla.activa} onChange={() => onToggle(regla)} />
        <span style={{ fontFamily: SN, fontSize: 14, fontWeight: 600, color: C.ink, flex: 1 }}>
          {regla.nombre}
        </span>
        <Chip color={regla.activa ? C.amberS : C.paper3} border={C.rule}>
          {regla.condicion.replace(/_/g, ' ')}
        </Chip>
        {/* Botón editar */}
        <button
          onClick={() => onEdit(regla)}
          title="Editar regla"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: C.ink3, padding: 4, borderRadius: 4,
            display: 'flex', alignItems: 'center',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        {/* Botón borrar — solo owner */}
        {canDelete && (
          <button
            onClick={() => onDelete(regla)}
            title="Eliminar regla"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: C.ink4, padding: 4, borderRadius: 4,
              display: 'flex', alignItems: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
            </svg>
          </button>
        )}
      </div>

      {/* Body — resumen de la regla */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 16px', alignItems: 'center',
      }}>
        <span style={{ fontFamily: SM, fontSize: 11, color: C.ink3 }}>
          {regla.umbral_minutos} min
        </span>
        <span style={{ color: C.rule }}>·</span>
        <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>
          → {destLabel(regla.destinatario)}
        </span>
        <span style={{ color: C.rule }}>·</span>
        <Chip>{accionLabel(regla.accion)}</Chip>
        {(regla.horario_desde || regla.horario_hasta) && (
          <>
            <span style={{ color: C.rule }}>·</span>
            <span style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>
              {horarioLabel(regla.horario_desde, regla.horario_hasta)}
            </span>
          </>
        )}
        {regla.dias_semana && regla.dias_semana.length < 7 && (
          <>
            <span style={{ color: C.rule }}>·</span>
            <span style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>
              {diasLabel(regla.dias_semana)}
            </span>
          </>
        )}
        {regla.escalar_a && (
          <>
            <span style={{ color: C.rule }}>·</span>
            <span style={{ fontFamily: SN, fontSize: 11, color: C.ink4 }}>
              escala → {destLabel(regla.escalar_a)} en {regla.escalar_minutos} min
            </span>
          </>
        )}
      </div>

      {/* Mensaje si hay */}
      {regla.mensaje && (
        <div style={{
          padding: '6px 16px 10px', borderTop: `1px solid ${C.rule}`,
        }}>
          <span style={{ fontFamily: SC, fontSize: 13, color: C.ink3 }}>
            "{regla.mensaje}"
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function SupervisorTab({
  rol,
  restauranteId,
  sh,
}: {
  rol: string
  restauranteId: string
  sh?: () => Record<string, string>
}) {
  const [reglas, setReglas] = useState<AlertaRegla[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editando, setEditando] = useState<AlertaRegla | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const canDelete = ['owner', 'super_admin'].includes(rol)

  const headers = useCallback((): Record<string, string> => {
    if (sh) return sh()
    return { 'Content-Type': 'application/json' }
  }, [sh])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/owner/supervisor', { headers: headers() })
      const json = await res.json()
      if (res.ok) setReglas(json.reglas ?? [])
    } finally {
      setLoading(false)
    }
  }, [headers])

  useEffect(() => { load() }, [load])

  async function handleToggle(regla: AlertaRegla) {
    setToggling(regla.id)
    await fetch('/api/owner/supervisor', {
      method: 'PUT',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: regla.id, activa: !regla.activa }),
    })
    await load()
    setToggling(null)
  }

  async function handleSave(form: Partial<AlertaRegla>) {
    setSaving(true)
    setError(null)
    const isEdit = !!editando
    const res = await fetch('/api/owner/supervisor', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(isEdit ? { ...form, id: editando!.id } : form),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Error guardando')
      setSaving(false)
      return
    }
    setCreating(false)
    setEditando(null)
    setSaving(false)
    await load()
  }

  async function handleDelete(regla: AlertaRegla) {
    if (!confirm(`¿Eliminar la regla "${regla.nombre}"? Esta acción no se puede deshacer.`)) return
    await fetch(`/api/owner/supervisor?id=${regla.id}`, {
      method: 'DELETE',
      headers: headers(),
    })
    await load()
  }

  const activas = reglas.filter(r => r.activa).length
  const total = reglas.length

  return (
    <div style={{ fontFamily: SN }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: SE, fontSize: 22, fontStyle: 'italic', color: C.ink, margin: 0, marginBottom: 4 }}>
            Supervisor de tiempos
          </h2>
          <p style={{ fontFamily: SN, fontSize: 13, color: C.ink3, margin: 0 }}>
            {loading ? '…' : `${activas} regla${activas !== 1 ? 's' : ''} activa${activas !== 1 ? 's' : ''} de ${total}`}
            {' '}· Owner y jefe de sala comparten las mismas reglas en tiempo real
          </p>
        </div>
        <button
          onClick={() => { setCreating(true); setEditando(null) }}
          disabled={creating || !!editando}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: C.dark, border: 'none', borderRadius: 6,
            color: C.darkFg, fontFamily: SN, fontSize: 13, fontWeight: 600,
            padding: '9px 16px', cursor: 'pointer', transition: 'opacity .15s',
            opacity: creating || editando ? .4 : 1,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Nueva regla
        </button>
      </div>

      {/* ── Aviso de sincronización ── */}
      <div style={{
        background: C.greenS, border: `1px solid #B8D9BB`, borderRadius: 6,
        padding: '10px 14px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3"/>
        </svg>
        <span style={{ fontFamily: SN, fontSize: 12, color: C.green, fontWeight: 600 }}>
          Fuente única · Los cambios de owner y jefe de sala son visibles para ambos al instante
        </span>
      </div>

      {/* ── Formulario nueva regla ── */}
      {creating && !editando && (
        <div style={{ marginBottom: 16 }}>
          <ReglaEditor
            regla={REGLA_NUEVA}
            onSave={handleSave}
            onCancel={() => { setCreating(false); setError(null) }}
            saving={saving}
            error={error}
          />
        </div>
      )}

      {/* ── Lista de reglas ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.ink4, fontFamily: SC, fontSize: 16 }}>
          Cargando reglas…
        </div>
      ) : reglas.length === 0 && !creating ? (
        <div style={{
          border: `1px dashed ${C.rule}`, borderRadius: 8, padding: 32,
          textAlign: 'center',
        }}>
          <p style={{ fontFamily: SC, fontSize: 18, color: C.ink3, margin: 0, marginBottom: 8 }}>
            Sin reglas configuradas aún
          </p>
          <p style={{ fontFamily: SN, fontSize: 13, color: C.ink4, margin: 0 }}>
            Pulsa "Nueva regla" para crear la primera alerta del restaurante
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reglas.map(r => (
            editando?.id === r.id ? (
              <div key={r.id}>
                <ReglaEditor
                  regla={editando}
                  onSave={handleSave}
                  onCancel={() => { setEditando(null); setError(null) }}
                  saving={saving}
                  error={error}
                />
              </div>
            ) : (
              <ReglaCard
                key={r.id}
                regla={r}
                onToggle={handleToggle}
                onEdit={r => { setEditando(r); setCreating(false) }}
                onDelete={handleDelete}
                canDelete={canDelete}
                toggling={toggling === r.id}
              />
            )
          ))}
        </div>
      )}

      {/* ── Leyenda condiciones ── */}
      {reglas.length > 0 && (
        <div style={{ marginTop: 28, padding: '16px 18px', background: C.paper2, borderRadius: 8, border: `1px solid ${C.rule}` }}>
          <p style={{ fontFamily: SN, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: C.ink3, margin: '0 0 10px' }}>
            Variables disponibles en el mensaje
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['{mesa}', '{tiempo}', '{plato}', '{n}', '{camarero}'].map(v => (
              <Chip key={v}>{v}</Chip>
            ))}
          </div>
          <p style={{ fontFamily: SN, fontSize: 11, color: C.ink4, margin: '8px 0 0' }}>
            ej: "Mesa {'{mesa}'} lleva {'{tiempo}'} min sin pedir · ¿está atendida?"
          </p>
        </div>
      )}
    </div>
  )
}
