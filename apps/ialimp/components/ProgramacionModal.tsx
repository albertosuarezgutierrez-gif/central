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
}

export default function ProgramacionModal({
  propiedadId, propiedadNombre, limpiadoras, onCreada, onClose
}: Props) {
  const [form, setForm] = useState({
    frecuencia: 'semanal',
    dias_semana: [] as number[],
    dias_mes: [] as number[],
    hora_inicio: '',
    tipo_servicio: 'comunidad',
    limpiadora_id: '',
    dias_antelacion: '30',
    notas: '',
    fecha_inicio: new Date().toISOString().split('T')[0],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

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
    } catch { setError('Error de conexión') }
    finally   { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800">Nueva programación</h2>
            <p className="text-xs text-gray-400">{propiedadNombre}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl">✕</button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-5">

          {/* Frecuencia */}
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

          {/* Días semana */}
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

          {/* Días del mes */}
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

          {/* Preview */}
          {(form.dias_semana.length > 0 || form.dias_mes.length > 0) && (
            <div className="bg-indigo-50 rounded-xl px-4 py-3 flex items-center gap-2">
              <span className="text-lg">📋</span>
              <p className="text-sm text-indigo-700 font-medium">{preview()}</p>
            </div>
          )}

          {/* Hora + Tipo */}
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

          {/* Limpiadora */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Limpiadora habitual</label>
            <select value={form.limpiadora_id} onChange={e => f('limpiadora_id', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">— Sin asignar —</option>
              {limpiadoras.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </div>

          {/* Antelación + Fecha inicio */}
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

          {/* Notas */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Notas</label>
            <textarea value={form.notas} onChange={e => f('notas', e.target.value)}
              placeholder="Instrucciones especiales para esta programación…"
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-50">
              {loading ? 'Generando…' : '📅 Activar programación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
