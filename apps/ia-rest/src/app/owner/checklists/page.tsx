'use client'
import { C, SE, SN, SM } from '@/lib/colors'
import { useEffect, useState, useCallback } from 'react'

type Frecuencia = 'apertura' | 'turno' | 'cierre'
interface Tarea { texto: string; frecuencia: Frecuencia; requiere_foto: boolean }
interface Plantilla {
  id: string
  restaurante_id: string
  seccion: string
  nombre: string | null
  tareas: Tarea[]
  activa: boolean
  created_at: string
}
interface InformeSeccion {
  seccion: string
  total: number
  completadas: number
  pendientes: Array<{ texto: string; frecuencia: string; sin_excusa: boolean }>
}

const SECCIONES = ['barra', 'sala', 'terraza', 'cocina']
const FRECUENCIAS: Frecuencia[] = ['apertura', 'turno', 'cierre']

function sesHeader(): string {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem('ia_rest_session') ?? ''
}

export default function OwnerChecklistsPage() {
  const [tab, setTab] = useState<'plantillas' | 'informe'>('plantillas')

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SN, color: C.ink, padding: '16px 14px 60px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <h1 style={{ fontFamily: SE, fontSize: 26, margin: '4px 0 14px' }}>Checklists</h1>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {(['plantillas', 'informe'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              fontFamily: SN, fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8,
              border: `1px solid ${tab === t ? C.red : C.rule}`, cursor: 'pointer',
              background: tab === t ? C.red : 'transparent', color: tab === t ? C.paper : C.ink2,
            }}>{t === 'plantillas' ? 'Plantillas' : 'Informe'}</button>
          ))}
        </div>
        {tab === 'plantillas' ? <EditorPlantillas /> : <PanelInforme />}
      </div>
    </div>
  )
}

function EditorPlantillas() {
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [loading, setLoading] = useState(true)
  // Formulario de nueva/edición
  const [editId, setEditId] = useState<string | null>(null)
  const [seccion, setSeccion] = useState('barra')
  const [nombre, setNombre] = useState('')
  const [tareas, setTareas] = useState<Tarea[]>([])

  const cargar = useCallback(async () => {
    const res = await fetch('/api/checklists/plantillas', { headers: { 'x-ia-session': sesHeader() } })
    if (res.ok) setPlantillas((await res.json()).plantillas ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const reset = () => { setEditId(null); setSeccion('barra'); setNombre(''); setTareas([]) }

  const addTarea = () => setTareas(ts => [...ts, { texto: '', frecuencia: 'apertura', requiere_foto: false }])
  const updTarea = (i: number, patch: Partial<Tarea>) =>
    setTareas(ts => ts.map((t, j) => j === i ? { ...t, ...patch } : t))
  const delTarea = (i: number) => setTareas(ts => ts.filter((_, j) => j !== i))

  const editar = (p: Plantilla) => {
    setEditId(p.id); setSeccion(p.seccion); setNombre(p.nombre ?? '')
    setTareas(Array.isArray(p.tareas) ? p.tareas : [])
  }

  const guardar = async () => {
    const res = await fetch('/api/checklists/plantillas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': sesHeader() },
      body: JSON.stringify({ id: editId ?? undefined, seccion, nombre: nombre || null, tareas, activa: true }),
    })
    if (res.ok) { reset(); cargar() }
  }

  const borrar = async (id: string) => {
    const res = await fetch(`/api/checklists/plantillas?id=${id}`, {
      method: 'DELETE', headers: { 'x-ia-session': sesHeader() },
    })
    if (res.ok) cargar()
  }

  const inputStyle: React.CSSProperties = {
    fontFamily: SN, fontSize: 13, padding: '8px 10px', borderRadius: 8,
    border: `1px solid ${C.rule}`, background: C.bg1, color: C.ink, outline: 'none',
  }

  return (
    <div>
      {/* Formulario */}
      <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 16, marginBottom: 22 }}>
        <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: C.ink2, marginBottom: 12 }}>
          {editId ? 'Editar plantilla' : 'Nueva plantilla'}
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <select value={seccion} onChange={e => setSeccion(e.target.value)} style={inputStyle}>
            {SECCIONES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input placeholder="Nombre (opcional)" value={nombre} onChange={e => setNombre(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
        </div>

        {tareas.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input placeholder="Texto de la tarea" value={t.texto} onChange={e => updTarea(i, { texto: e.target.value })} style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
            <select value={t.frecuencia} onChange={e => updTarea(i, { frecuencia: e.target.value as Frecuencia })} style={inputStyle}>
              {FRECUENCIAS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.ink2 }}>
              <input type="checkbox" checked={t.requiere_foto} onChange={e => updTarea(i, { requiere_foto: e.target.checked })} />
              foto
            </label>
            <button onClick={() => delTarea(i)} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={addTarea} style={{ ...inputStyle, cursor: 'pointer', color: C.ink2 }}>+ Tarea</button>
          <button onClick={guardar} disabled={!seccion || tareas.length === 0} style={{
            fontFamily: SN, fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8,
            border: 'none', cursor: 'pointer', background: C.green, color: C.paper, marginLeft: 'auto',
          }}>{editId ? 'Guardar cambios' : 'Crear plantilla'}</button>
          {editId && <button onClick={reset} style={{ ...inputStyle, cursor: 'pointer' }}>Cancelar</button>}
        </div>
      </div>

      {/* Lista de plantillas */}
      {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : plantillas.map(p => (
        <div key={p.id} style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: C.amber }}>{p.seccion}</span>
            {p.nombre && <span style={{ fontSize: 13, color: C.ink2 }}>{p.nombre}</span>}
            <span style={{ fontFamily: SM, fontSize: 11, color: C.ink4, marginLeft: 'auto' }}>{(p.tareas ?? []).length} tareas</span>
            <button onClick={() => editar(p)} style={{ background: 'none', border: 'none', color: C.ink2, cursor: 'pointer', fontSize: 12 }}>editar</button>
            <button onClick={() => borrar(p.id)} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 12 }}>borrar</button>
          </div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: C.ink3, fontSize: 12 }}>
            {(p.tareas ?? []).map((t, i) => (
              <li key={i}>{t.texto} <span style={{ color: C.ink4 }}>({t.frecuencia}{t.requiere_foto ? ', foto' : ''})</span></li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function PanelInforme() {
  const [secciones, setSecciones] = useState<InformeSeccion[]>([])
  const [carga, setCarga] = useState<string>('media')
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const res = await fetch('/api/checklists/informe', { headers: { 'x-ia-session': sesHeader() } })
    if (res.ok) {
      const d = await res.json()
      setSecciones(d.secciones ?? [])
      setCarga(d.carga ?? 'media')
    }
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  if (loading) return <p style={{ color: C.ink3 }}>Cargando…</p>

  return (
    <div>
      <div style={{ fontSize: 13, color: C.ink3, marginBottom: 14 }}>
        Carga del tramo: <strong style={{ color: carga === 'baja' ? C.green : carga === 'alta' ? C.red : C.amber }}>{carga}</strong>
      </div>
      {secciones.length === 0 ? <p style={{ color: C.ink3 }}>Sin plantillas activas.</p> : secciones.map(s => (
        <div key={s.seccion} style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: C.amber }}>{s.seccion}</span>
            <span style={{ fontFamily: SM, fontSize: 12, color: C.ink3, marginLeft: 'auto' }}>{s.completadas}/{s.total} hechas</span>
          </div>
          {s.pendientes.length === 0 ? (
            <div style={{ fontSize: 12, color: C.green }}>Todo completado ✓</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
              {s.pendientes.map((t, i) => (
                <li key={i} style={{ color: t.sin_excusa ? C.red : C.ink3, fontWeight: t.sin_excusa ? 600 : 400 }}>
                  {t.texto} <span style={{ color: C.ink4 }}>({t.frecuencia})</span>
                  {t.sin_excusa && <span style={{ color: C.red }}> — sin excusa (carga baja)</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
