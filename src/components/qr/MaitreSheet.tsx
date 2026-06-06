'use client'
// src/components/qr/MaitreSheet.tsx
// Bottom sheet del "Maître IA" para el comensal en el QR.
// Pide alérgenos (chips) + antojo (texto) y muestra 2-3 platos. Emite ids al añadir.

import { useState } from 'react'
import { SN } from '@/lib/colors'

const C = {
  bg: '#14110E', bg2: '#1E1A15', bg3: '#2A221A',
  vermilion: '#D9442B', cream: '#F6F1E7', creamMid: '#D8CDB6',
  creamDim: '#8C7B69', rule: '#2E2720', green: '#3F7D44',
}

const fmt = (n: number) => n.toFixed(2).replace('.', ',') + ' €'

// 14 alérgenos de declaración obligatoria (UE).
// `value` debe coincidir con lo guardado en productos.alergenos (minúsculas, sin tildes,
// guion bajo para compuestos — convención verificada en BD). `label` es solo display.
const ALERGENOS_UE: { value: string; label: string }[] = [
  { value: 'gluten', label: 'Gluten' },
  { value: 'crustaceos', label: 'Crustáceos' },
  { value: 'huevos', label: 'Huevos' },
  { value: 'pescado', label: 'Pescado' },
  { value: 'cacahuetes', label: 'Cacahuetes' },
  { value: 'soja', label: 'Soja' },
  { value: 'lacteos', label: 'Lácteos' },
  { value: 'frutos_secos', label: 'Frutos de cáscara' },
  { value: 'apio', label: 'Apio' },
  { value: 'mostaza', label: 'Mostaza' },
  { value: 'sesamo', label: 'Sésamo' },
  { value: 'sulfitos', label: 'Sulfitos' },
  { value: 'altramuces', label: 'Altramuces' },
  { value: 'moluscos', label: 'Moluscos' },
]

interface PlatoRec { id: string; nombre: string; precio: number; alergenos: string[]; motivo: string }

interface Props {
  token: string
  idioma: string
  comensales: number
  config: { nombre_asistente: string; permitir_antojo_texto: boolean; mostrar_precios: boolean }
  onAddIds: (ids: string[]) => void
  onClose: () => void
}

export default function MaitreSheet({ token, idioma, comensales, config, onAddIds, onClose }: Props) {
  const [fase, setFase] = useState<'form' | 'cargando' | 'resultado'>('form')
  const [alergenos, setAlergenos] = useState<string[]>([])
  const [antojo, setAntojo] = useState('')
  const [platos, setPlatos] = useState<PlatoRec[]>([])
  const [seleccion, setSeleccion] = useState<string[]>([])
  const [err, setErr] = useState('')

  const toggleAlergeno = (a: string) =>
    setAlergenos(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a])
  const toggleSel = (id: string) =>
    setSeleccion(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const pedir = async () => {
    setFase('cargando'); setErr('')
    try {
      const res = await fetch('/api/qr/recomendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, alergenos, antojo, idioma, comensales }),
      })
      const d = await res.json()
      const lista: PlatoRec[] = Array.isArray(d.platos) ? d.platos : []
      setPlatos(lista)
      setSeleccion([])
      setFase('resultado')
    } catch {
      setErr('No se pudo obtener recomendación. Inténtalo de nuevo.')
      setFase('form')
    }
  }

  const anadir = () => {
    if (seleccion.length) onAddIds(seleccion)
    onClose()
  }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 90, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxHeight: '88vh', overflowY: 'auto', background: C.bg2, borderRadius: '18px 18px 0 0', border: `1px solid ${C.rule}`, padding: 18, fontFamily: SN }}>
        {/* Cabecera */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.cream }}>{config.nombre_asistente}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.creamDim, fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        {fase === 'form' && (
          <>
            <div style={{ fontSize: 12, color: C.creamMid, marginBottom: 8 }}>¿Tienes alergias o intolerancias? Márcalas:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 16 }}>
              {ALERGENOS_UE.map(a => {
                const on = alergenos.includes(a.value)
                return (
                  <button key={a.value} onClick={() => toggleAlergeno(a.value)}
                    style={{ padding: '6px 11px', borderRadius: 16, border: `1px solid ${on ? C.vermilion : C.rule}`, background: on ? C.vermilion : C.bg3, color: on ? '#fff' : C.creamMid, fontSize: 12, cursor: 'pointer' }}>
                    {a.label}
                  </button>
                )
              })}
            </div>

            {config.permitir_antojo_texto && (
              <>
                <div style={{ fontSize: 12, color: C.creamMid, marginBottom: 6 }}>¿Qué te apetece? (opcional)</div>
                <textarea value={antojo} onChange={e => setAntojo(e.target.value)} maxLength={200}
                  placeholder="Algo ligero para compartir, sin mucha hambre…"
                  style={{ width: '100%', minHeight: 60, resize: 'none', background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 10, color: C.cream, fontSize: 13, fontFamily: SN, padding: 10, marginBottom: 16, boxSizing: 'border-box' }} />
              </>
            )}

            {err && <div style={{ color: C.vermilion, fontSize: 12, marginBottom: 10 }}>{err}</div>}

            <button onClick={pedir}
              style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: C.vermilion, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              Recomiéndame
            </button>
          </>
        )}

        {fase === 'cargando' && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: C.creamMid, fontSize: 14 }}>
            Pensando la mejor recomendación para ti…
          </div>
        )}

        {fase === 'resultado' && (
          <>
            {platos.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: C.creamMid, fontSize: 14 }}>
                No encontramos platos que encajen con tus alergias. Pregunta a nuestro personal y te ayudamos. 🙏
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {platos.map(p => {
                    const on = seleccion.includes(p.id)
                    return (
                      <button key={p.id} onClick={() => toggleSel(p.id)}
                        style={{ textAlign: 'left', display: 'flex', gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: 12, border: `2px solid ${on ? C.vermilion : C.rule}`, background: C.bg3, cursor: 'pointer' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: C.cream }}>{p.nombre}</span>
                            {config.mostrar_precios && <span style={{ fontSize: 13, color: C.creamMid }}>{fmt(p.precio)}</span>}
                          </div>
                          {p.motivo && <div style={{ fontSize: 12, color: C.creamMid, marginTop: 4, fontStyle: 'italic' }}>{p.motivo}</div>}
                          {p.alergenos.length > 0 && (
                            <div style={{ fontSize: 10, color: C.creamDim, marginTop: 4, textTransform: 'capitalize' }}>Contiene: {p.alergenos.join(', ').replace(/_/g, ' ')}</div>
                          )}
                        </div>
                        <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, background: on ? C.vermilion : 'transparent', border: `1px solid ${on ? C.vermilion : C.rule}`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{on ? '✓' : ''}</div>
                      </button>
                    )
                  })}
                </div>

                <div style={{ fontSize: 10, color: C.creamDim, margin: '12px 0', lineHeight: 1.4 }}>
                  Sugerencias orientativas. Confirma cualquier alergia o intolerancia con el personal de sala.
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setFase('form')}
                    style={{ flex: 1, padding: 13, borderRadius: 12, border: `1px solid ${C.rule}`, background: 'transparent', color: C.creamMid, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    Cambiar
                  </button>
                  <button onClick={anadir} disabled={seleccion.length === 0}
                    style={{ flex: 2, padding: 13, borderRadius: 12, border: 'none', background: seleccion.length ? C.vermilion : C.rule, color: seleccion.length ? '#fff' : C.creamDim, fontSize: 14, fontWeight: 700, cursor: seleccion.length ? 'pointer' : 'not-allowed' }}>
                    {seleccion.length ? `Añadir ${seleccion.length} al pedido` : 'Selecciona platos'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
