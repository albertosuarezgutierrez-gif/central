'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { C, SE, SN } from '@/lib/colors'

type TimelineItem = { id: string; hora: string; actividad: string; responsable: string }
type CheckItem = { id: string; item: string; area: string; completado: boolean }
type EquipItem = { id: string; nombre: string; cantidad: number; ubicacion: string; check_ok: boolean }

type BEO = {
  id?: string
  timeline: TimelineItem[]
  layout_tipo: string
  layout_notas: string | null
  personal_asignado: { nombre: string; rol_evento: string; hora_entrada: string; hora_salida: string }[]
  equipamiento: EquipItem[]
  checklist: CheckItem[]
  estado: string
}

const LAYOUTS = ['banquete_redondas', 'bufet', 'cocktail', 'teatro', 'herradura', 'clase']
const newId = () => Math.random().toString(36).slice(2, 8)

export default function PanelBEO({ eventoId, sh }: { eventoId: string; sh: () => Record<string, string> }) {
  const [beo, setBeo] = useState<BEO>({
    timeline: [], layout_tipo: 'banquete_redondas', layout_notas: null,
    personal_asignado: [], equipamiento: [], checklist: [], estado: 'borrador',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [seccion, setSeccion] = useState<'timeline' | 'layout' | 'checklist' | 'equipamiento'>('timeline')

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/owner/eventos/beo?evento_id=${eventoId}`, { headers: sh() })
    const d = await r.json()
    if (d.beo) setBeo(d.beo)
    setLoading(false)
  }, [eventoId, sh])

  useEffect(() => { cargar() }, [cargar])

  const guardar = async (estado?: string) => {
    setSaving(true)
    await fetch('/api/owner/eventos/beo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ ...beo, evento_id: eventoId, estado: estado ?? beo.estado }),
    })
    if (estado) setBeo(b => ({ ...b, estado }))
    setSaving(false)
  }

  const btn = (label: string, active: boolean, onClick: () => void) => (
    <button onClick={onClick} style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${active ? C.red : C.rule}`, background: active ? C.red + '15' : 'transparent', color: active ? C.red : C.ink3, fontFamily: SN, fontSize: 12, cursor: 'pointer', fontWeight: active ? 600 : 400 }}>
      {label}
    </button>
  )

  const inp = (v: string, fn: (s: string) => void, ph?: string) => (
    <input value={v} onChange={e => fn(e.target.value)} placeholder={ph}
      style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '5px 8px', fontFamily: SN, fontSize: 12, color: C.ink, width: '100%', boxSizing: 'border-box' as const }} />
  )

  if (loading) return <div style={{ padding: '12px', color: C.ink3, fontFamily: SN, fontSize: 13 }}>Cargando BEO…</div>

  return (
    <div style={{ marginTop: 10, background: '#fff', borderRadius: 8, border: `1px solid ${C.rule}`, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: SE, fontSize: 14, fontWeight: 700, color: C.ink }}>📋 BEO — Banquet Event Order</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontFamily: SN, fontSize: 11, padding: '2px 8px', borderRadius: 99, background: beo.estado === 'distribuido' ? C.green + '22' : C.amber + '22', color: beo.estado === 'distribuido' ? C.green : C.amber }}>
            {beo.estado}
          </span>
          <button onClick={() => guardar()} disabled={saving} style={{ padding: '4px 12px', borderRadius: 5, border: 'none', background: C.ink, color: '#fff', fontFamily: SN, fontSize: 12, cursor: 'pointer', opacity: saving ? .6 : 1 }}>
            {saving ? '...' : 'Guardar'}
          </button>
          <button onClick={() => guardar('distribuido')} disabled={saving} style={{ padding: '4px 12px', borderRadius: 5, border: 'none', background: C.green, color: '#fff', fontFamily: SN, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            📤 Distribuir
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 14px', borderBottom: `1px solid ${C.rule}` }}>
        {([['timeline', '⏱ Timeline'], ['layout', '🗺 Layout'], ['checklist', '✅ Checklist'], ['equipamiento', '📦 Equipamiento']] as const).map(([id, label]) =>
          btn(label, seccion === id, () => setSeccion(id))
        )}
      </div>

      <div style={{ padding: '12px 14px' }}>
        {/* Timeline */}
        {seccion === 'timeline' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button onClick={() => setBeo(b => ({ ...b, timeline: [...b.timeline, { id: newId(), hora: '', actividad: '', responsable: '' }] }))}
                style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.green}`, background: C.green + '15', color: C.green, fontFamily: SN, fontSize: 12, cursor: 'pointer' }}>
                + Añadir
              </button>
            </div>
            {beo.timeline.length === 0 && <div style={{ color: C.ink3, fontFamily: SN, fontSize: 12, textAlign: 'center', padding: '16px' }}>Sin entradas. Añade la primera.</div>}
            {beo.timeline.map((t, i) => (
              <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                {inp(t.hora, v => setBeo(b => { const tl = [...b.timeline]; tl[i] = { ...tl[i], hora: v }; return { ...b, timeline: tl } }), '18:00')}
                {inp(t.actividad, v => setBeo(b => { const tl = [...b.timeline]; tl[i] = { ...tl[i], actividad: v }; return { ...b, timeline: tl } }), 'Actividad')}
                {inp(t.responsable, v => setBeo(b => { const tl = [...b.timeline]; tl[i] = { ...tl[i], responsable: v }; return { ...b, timeline: tl } }), 'Responsable')}
                <button onClick={() => setBeo(b => ({ ...b, timeline: b.timeline.filter((_, j) => j !== i) }))}
                  style={{ padding: '4px', borderRadius: 4, border: 'none', background: '#fee2e2', color: '#b91c1c', cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Layout */}
        {seccion === 'layout' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginBottom: 4 }}>Tipo de montaje</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {LAYOUTS.map(l => (
                  <button key={l} onClick={() => setBeo(b => ({ ...b, layout_tipo: l }))}
                    style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${beo.layout_tipo === l ? C.red : C.rule}`, background: beo.layout_tipo === l ? C.red + '15' : 'transparent', color: beo.layout_tipo === l ? C.red : C.ink3, fontFamily: SN, fontSize: 12, cursor: 'pointer' }}>
                    {l.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginBottom: 4 }}>Notas de layout</div>
              <textarea value={beo.layout_notas ?? ''} onChange={e => setBeo(b => ({ ...b, layout_notas: e.target.value }))} rows={3}
                style={{ width: '100%', background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '6px 8px', fontFamily: SN, fontSize: 12, color: C.ink, resize: 'vertical', boxSizing: 'border-box' as const }} />
            </div>
          </div>
        )}

        {/* Checklist */}
        {seccion === 'checklist' && (
          <div>
            <button onClick={() => setBeo(b => ({ ...b, checklist: [...b.checklist, { id: newId(), item: '', area: '', completado: false }] }))}
              style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.green}`, background: C.green + '15', color: C.green, fontFamily: SN, fontSize: 12, cursor: 'pointer', marginBottom: 8 }}>
              + Añadir item
            </button>
            {beo.checklist.length === 0 && <div style={{ color: C.ink3, fontFamily: SN, fontSize: 12, textAlign: 'center', padding: '16px' }}>Sin items.</div>}
            {beo.checklist.map((c, i) => (
              <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 100px 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={c.completado} onChange={() => setBeo(b => { const cl = [...b.checklist]; cl[i] = { ...cl[i], completado: !cl[i].completado }; return { ...b, checklist: cl } })} style={{ cursor: 'pointer' }} />
                {inp(c.item, v => setBeo(b => { const cl = [...b.checklist]; cl[i] = { ...cl[i], item: v }; return { ...b, checklist: cl } }), 'Ítem')}
                {inp(c.area, v => setBeo(b => { const cl = [...b.checklist]; cl[i] = { ...cl[i], area: v }; return { ...b, checklist: cl } }), 'Área')}
                <button onClick={() => setBeo(b => ({ ...b, checklist: b.checklist.filter((_, j) => j !== i) }))}
                  style={{ padding: '4px', borderRadius: 4, border: 'none', background: '#fee2e2', color: '#b91c1c', cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Equipamiento */}
        {seccion === 'equipamiento' && (
          <div>
            <button onClick={() => setBeo(b => ({ ...b, equipamiento: [...b.equipamiento, { id: newId(), nombre: '', cantidad: 1, ubicacion: '', check_ok: false }] }))}
              style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.green}`, background: C.green + '15', color: C.green, fontFamily: SN, fontSize: 12, cursor: 'pointer', marginBottom: 8 }}>
              + Añadir equipo
            </button>
            {beo.equipamiento.length === 0 && <div style={{ color: C.ink3, fontFamily: SN, fontSize: 12, textAlign: 'center', padding: '16px' }}>Sin equipamiento.</div>}
            {beo.equipamiento.map((e, i) => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 1fr 24px 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                {inp(e.nombre, v => setBeo(b => { const eq = [...b.equipamiento]; eq[i] = { ...eq[i], nombre: v }; return { ...b, equipamiento: eq } }), 'Elemento')}
                <input type="number" value={e.cantidad} min={1} onChange={ev => setBeo(b => { const eq = [...b.equipamiento]; eq[i] = { ...eq[i], cantidad: +ev.target.value }; return { ...b, equipamiento: eq } })}
                  style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 5, padding: '5px 6px', fontFamily: SN, fontSize: 12, color: C.ink, width: '100%', boxSizing: 'border-box' as const }} />
                {inp(e.ubicacion, v => setBeo(b => { const eq = [...b.equipamiento]; eq[i] = { ...eq[i], ubicacion: v }; return { ...b, equipamiento: eq } }), 'Ubicación')}
                <input type="checkbox" checked={e.check_ok} onChange={() => setBeo(b => { const eq = [...b.equipamiento]; eq[i] = { ...eq[i], check_ok: !eq[i].check_ok }; return { ...b, equipamiento: eq } })} style={{ cursor: 'pointer' }} />
                <button onClick={() => setBeo(b => ({ ...b, equipamiento: b.equipamiento.filter((_, j) => j !== i) }))}
                  style={{ padding: '4px', borderRadius: 4, border: 'none', background: '#fee2e2', color: '#b91c1c', cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
