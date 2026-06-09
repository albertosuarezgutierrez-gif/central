'use client'
import { useState } from 'react'

const DIAS = [
  { id: 1, label: 'L' }, { id: 2, label: 'M' }, { id: 3, label: 'X' },
  { id: 4, label: 'J' }, { id: 5, label: 'V' }, { id: 6, label: 'S' },
  { id: 7, label: 'D' },
]
const DIAS_MES = Array.from({ length: 28 }, (_, i) => i + 1)

const FRECUENCIA = [
  { id: 'semanal',    label: 'Semanal',    icon: '📆', desc: 'Mismos días cada semana' },
  { id: 'quincenal',  label: 'Quincenal',  icon: '🗓️', desc: 'Semanas 1 y 3 del mes' },
  { id: 'mensual',    label: 'Mensual',    icon: '📅', desc: 'Días concretos del mes' },
]

const TIPOS = [
  { id: 'rotacion',      label: 'Rotación',     icon: '🔄' },
  { id: 'profunda',      label: 'Profunda',     icon: '🧽' },
  { id: 'comunidad',     label: 'Comunidad',    icon: '🏢' },
  { id: 'mantenimiento', label: 'Mantenim.',    icon: '🔧' },
]

interface Props {
  propiedadId: string
  propiedadNombre: string
  limpiadoras: any[]
  onCreada: (prog: any) => void
  onClose: () => void
  programacion?: any
  onActualizada?: (prog: any) => void
  onEliminada?: (id: string) => void
}

export default function ProgramacionModal({
  propiedadId, propiedadNombre, limpiadoras, onCreada, onClose,
  programacion, onActualizada, onEliminada
}: Props) {
  const editando = !!programacion

  const [form, setForm] = useState({
    frecuencia: programacion?.frecuencia || 'semanal',
    dias_semana: (programacion?.dias_semana as number[]) || [] as number[],
    dias_mes: (programacion?.dias_mes as number[]) || [] as number[],
    hora_inicio: programacion?.hora_inicio || '',
    tipo_servicio: programacion?.tipo_servicio || 'comunidad',
    limpiadora_id: programacion?.limpiadora_id || '',
    dias_antelacion: programacion?.dias_antelacion != null ? String(programacion.dias_antelacion) : '30',
    notas: programacion?.notas || '',
    fecha_inicio: programacion?.fecha_inicio || new Date().toISOString().split('T')[0],
    activa: programacion?.activa !== false,
    fecha_fin: programacion?.fecha_fin ? programacion.fecha_fin.split('T')[0] : '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [confirmElim, setConfirmElim] = useState(false)

  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  function toggleDiaSemana(d: number) {
    setForm(p => ({
      ...p,
      dias_semana: p.dias_semana.includes(d)
        ? p.dias_semana.filter(x => x !== d)
        : [...p.dias_semana, d].sort()
    }))
  }

  function toggleDiaMes(d: number) {
    setForm(p => ({
      ...p,
      dias_mes: p.dias_mes.includes(d)
        ? p.dias_mes.filter(x => x !== d)
        : [...p.dias_mes, d].sort()
    }))
  }

  // Preview de la programación en texto natural
  function preview(): string {
    const dias = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
    if (form.frecuencia === 'semanal' && form.dias_semana.length) {
      const nombres = form.dias_semana.map(d => dias[d-1]).join(', ')
      return 'Cada ' + nombres + (form.hora_inicio ? ' a las ' + form.hora_inicio : '')
    }
    if (form.frecuencia === 'quincenal' && form.dias_semana.length) {
      const nombres = form.dias_semana.map(d => dias[d-1]).join(', ')
      return nombres + ' de las semanas 1 y 3 del mes'
    }
    if (form.frecuencia === 'mensual' && form.dias_mes.length) {
      return 'Días ' + form.dias_mes.join(', ') + ' de cada mes'
    }
    return 'Configura los días para ver el resumen'
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      if (editando) {
        const res = await fetch(`/api/admin/programaciones/${programacion.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activa:       form.activa,
            limpiadora_id: form.limpiadora_id || null,
            notas:        form.notas || null,
            fecha_fin:    form.fecha_fin || null,
          })
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error || 'Error'); return }
        onActualizada?.(data.programacion)
        onClose()
      } else {
        const res = await fetch('/api/admin/programaciones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            propiedad_id:    propiedadId,
            frecuencia:      form.frecuencia,
            dias_semana:     form.dias_semana.length > 0 ? form.dias_semana : null,
            dias_mes:        form.dias_mes.length > 0    ? form.dias_mes    : null,
            hora_inicio:     form.hora_inicio || null,
            tipo_servicio:   form.tipo_servicio,
            limpiadora_id:   form.limpiadora_id || null,
            dias_antelacion: Number(form.dias_antelacion),
            notas:           form.notas || null,
            fecha_inicio:    form.fecha_inicio,
          })
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error || 'Error'); return }
        onCreada(data.programacion)
        onClose()
      }
    } catch { setError('Error de conexión') }
    finally   { setLoading(false) }
  }

  async function eliminar() {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/admin/programaciones/${programacion.id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Error'); return }
      onEliminada?.(programacion.id)
      onClose()
    } catch { setError('Error de conexión') }
    finally { setLoading(false); setConfirmElim(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800">{editando ? 'Editar programación' : 'Nueva programación'}</h2>
            <p className="text-xs text-gray-400">{propiedadNombre}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl">✕</button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-5">

          {/* En modo edición: resumen de la config fija y campos editables */}
          {editando && (
            <>
              <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-600 space-y-1">
                <div><span className="font-semibold">Frecuencia:</span> {programacion.frecuencia}</div>
                {programacion.tipo_servicio && <div><span className="font-semibold">Tipo:</span> {programacion.tipo_servicio}</div>}
                {programacion.hora_inicio   && <div><span className="font-semibold">Hora:</span> {programacion.hora_inicio}</div>}
              </div>
              <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
                <span className="text-sm font-semibold text-gray-700">Activa</span>
                <button type="button" onClick={() => f('activa', !form.activa)}
                  className="w-12 h-6 rounded-full transition-colors"
                  style={{ background: form.activa ? '#6366f1' : '#d1d5db' }}>
                  <span className="block w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5"
                    style={{ transform: form.activa ? 'translateX(24px)' : 'translateX(0)' }} />
                </button>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha fin (opcional)</label>
                <input type="date" value={form.fecha_fin}
                  onChange={e => f('fecha_fin', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </>
          )}

          {/* Campos solo para creación */}
          {!editando && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Frecuencia</label>
                <div className="grid grid-cols-3 gap-2">
                  {FRECUENCIA.map(f2 => (
                    <button key={f2.id} type="button" onClick={() => f('frecuencia', f2.id)}
                      className="p-3 rounded-xl border-2 text-center transition"
                      style={{
                        borderColor: form.frecuencia === f2.id ? '#6366f1' : '#e5e7eb',
                        background:  form.frecuencia === f2.id ? '#eef2ff' : 'white'
                      }}>
                      <div className="text-xl">{f2.icon}</div>
                      <div className="text-xs font-semibold mt-1" style={{ color: form.frecuencia === f2.id ? '#6366f1' : '#374151' }}>{f2.label}</div>
                      <div className="text-xs text-gray-400 leading-tight">{f2.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {(form.frecuencia === 'semanal' || form.frecuencia === 'quincenal') && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Días de la semana</label>
                  <div className="flex gap-2">
                    {DIAS.map(d => (
                      <button key={d.id} type="button" onClick={() => toggleDiaSemana(d.id)}
                        className="flex-1 h-10 rounded-xl border-2 font-bold text-sm transition"
                        style={{
                          borderColor: form.dias_semana.includes(d.id) ? '#6366f1' : '#e5e7eb',
                          background:  form.dias_semana.includes(d.id) ? '#6366f1' : 'white',
                          color:       form.dias_semana.includes(d.id) ? 'white'   : '#6b7280'
                        }}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {form.frecuencia === 'mensual' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Días del mes</label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {DIAS_MES.map(d => (
                      <button key={d} type="button" onClick={() => toggleDiaMes(d)}
                        className="h-9 rounded-lg border-2 text-xs font-bold transition"
                        style={{
                          borderColor: form.dias_mes.includes(d) ? '#6366f1' : '#e5e7eb',
                          background:  form.dias_mes.includes(d) ? '#6366f1' : 'white',
                          color:       form.dias_mes.includes(d) ? 'white'   : '#6b7280'
                        }}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(form.dias_semana.length > 0 || form.dias_mes.length > 0) && (
                <div className="bg-indigo-50 rounded-xl px-4 py-3 flex items-center gap-2">
                  <span className="text-lg">📋</span>
                  <p className="text-sm text-indigo-700 font-medium">{preview()}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Hora de inicio</label>
                  <input type="time" value={form.hora_inicio}
                    onChange={e => f('hora_inicio', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Tipo de limpieza</label>
                  <select value={form.tipo_servicio} onChange={e => f('tipo_servicio', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {TIPOS.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Generar con antelación</label>
                  <select value={form.dias_antelacion} onChange={e => f('dias_antelacion', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="14">14 días</option>
                    <option value="30">30 días</option>
                    <option value="60">60 días</option>
                    <option value="90">90 días</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha inicio</label>
                  <input type="date" value={form.fecha_inicio}
                    onChange={e => f('fecha_inicio', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
            </>
          )}

          {/* Limpiadora — visible en ambos modos */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Limpiadora habitual</label>
            <select value={form.limpiadora_id} onChange={e => f('limpiadora_id', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">— Sin asignar —</option>
              {limpiadoras.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </div>

          {/* Notas — visible en ambos modos */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Notas</label>
            <textarea value={form.notas} onChange={e => f('notas', e.target.value)}
              placeholder="Instrucciones especiales para esta programación…"
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          {/* Botón eliminar — solo en edición */}
          {editando && (
            confirmElim ? (
              <div className="flex gap-2 items-center bg-red-50 rounded-xl px-4 py-3">
                <span className="text-sm text-red-700 flex-1">¿Desactivar y eliminar sesiones futuras?</span>
                <button type="button" onClick={eliminar} disabled={loading}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold disabled:opacity-50">
                  {loading ? '…' : 'Confirmar'}
                </button>
                <button type="button" onClick={() => setConfirmElim(false)}
                  className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs">
                  No
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmElim(true)}
                className="w-full border border-red-200 text-red-600 py-2.5 rounded-xl text-sm font-semibold">
                🗑️ Eliminar programación
              </button>
            )
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-50">
              {loading ? (editando ? 'Guardando…' : 'Generando…') : editando ? '💾 Guardar cambios' : '📅 Activar programación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
