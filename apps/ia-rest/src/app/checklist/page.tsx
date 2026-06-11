'use client'
import { DARK_C as C, SE, SN, SM } from '@/lib/colors'
import { useEffect, useState, useCallback } from 'react'

interface Tarea {
  plantilla_id: string
  nombre: string | null
  tarea_idx: number
  texto: string
  frecuencia: string
  requiere_foto: boolean
  hecha: boolean
  foto_url: string | null
}
interface Seccion { seccion: string; tareas: Tarea[] }
type Carga = 'baja' | 'media' | 'alta'

const CARGA_CFG: Record<Carga, { label: string; color: string }> = {
  baja:  { label: 'Carga baja',  color: C.green },
  media: { label: 'Carga media', color: C.amber },
  alta:  { label: 'Carga alta',  color: C.red },
}

function sesHeader(): string {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem('ia_rest_session') ?? ''
}

// Lee un File como data-url base64
function fileABase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function ChecklistPage() {
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [carga, setCarga] = useState<Carga>('media')
  const [numComandas, setNumComandas] = useState(0)
  const [loading, setLoading] = useState(true)
  const [marcando, setMarcando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const res = await fetch('/api/checklists/turno', { headers: { 'x-ia-session': sesHeader() } })
    if (res.ok) {
      const d = await res.json()
      setSecciones(d.secciones ?? [])
      setCarga(d.carga ?? 'media')
      setNumComandas(d.num_comandas ?? 0)
    }
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const marcar = async (t: Tarea, foto_base64?: string) => {
    const key = `${t.plantilla_id}|${t.tarea_idx}`
    setMarcando(key)
    const res = await fetch('/api/checklists/marcar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': sesHeader() },
      body: JSON.stringify({
        plantilla_id: t.plantilla_id,
        seccion: secciones.find(s => s.tareas.includes(t))?.seccion,
        tarea_idx: t.tarea_idx,
        tarea_texto: t.texto,
        foto_base64,
      }),
    })
    setMarcando(null)
    if (res.ok) cargar()
  }

  const onCheck = async (t: Tarea, ev: React.ChangeEvent<HTMLInputElement>) => {
    if (t.hecha) return
    const file = ev.target.files?.[0]
    if (file) {
      const b64 = await fileABase64(file)
      await marcar(t, b64)
    } else {
      await marcar(t)
    }
  }

  const cargaCfg = CARGA_CFG[carga]

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SN, color: C.ink, padding: '16px 14px 60px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ fontFamily: SE, fontSize: 26, color: C.ink, margin: '4px 0 2px' }}>Checklist del turno</h1>

        {/* Índice de carga del turno */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 18px',
          background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '10px 14px',
        }}>
          <span style={{ width: 10, height: 10, borderRadius: 99, background: cargaCfg.color }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: cargaCfg.color }}>{cargaCfg.label}</span>
          <span style={{ fontFamily: SM, fontSize: 12, color: C.ink3, marginLeft: 'auto' }}>{numComandas} comandas hoy</span>
        </div>

        {loading ? (
          <p style={{ color: C.ink3 }}>Cargando…</p>
        ) : secciones.length === 0 ? (
          <p style={{ color: C.ink3 }}>No hay tareas configuradas para este turno.</p>
        ) : secciones.map(sec => (
          <div key={sec.seccion} style={{ marginBottom: 22 }}>
            <h2 style={{ fontFamily: SN, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: C.ink3, margin: '0 0 8px' }}>{sec.seccion}</h2>
            <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, overflow: 'hidden' }}>
              {sec.tareas.map((t, i) => {
                const key = `${t.plantilla_id}|${t.tarea_idx}`
                const busy = marcando === key
                return (
                  <div key={key} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    borderTop: i > 0 ? `1px solid ${C.rule}` : 'none',
                    opacity: busy ? 0.6 : 1,
                  }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: t.hecha ? 'default' : 'pointer', flex: 1, gap: 12 }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                        border: `2px solid ${t.hecha ? C.green : C.ink4}`,
                        background: t.hecha ? C.green : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: C.bg, fontSize: 14, fontWeight: 700,
                      }}>{t.hecha ? '✓' : ''}</span>
                      <span style={{ flex: 1 }}>
                        <span style={{ fontSize: 14, color: t.hecha ? C.ink3 : C.ink, textDecoration: t.hecha ? 'line-through' : 'none' }}>{t.texto}</span>
                        <span style={{ display: 'block', fontSize: 11, color: C.ink4, marginTop: 2 }}>
                          {t.frecuencia}{t.requiere_foto ? ' · requiere foto' : ''}
                        </span>
                      </span>
                      {/* input file (cámara) si requiere foto; si no, checkbox simple */}
                      {!t.hecha && t.requiere_foto ? (
                        <input
                          type="file" accept="image/*" capture="environment"
                          disabled={busy}
                          onChange={(e) => onCheck(t, e)}
                          style={{ display: 'none' }}
                        />
                      ) : !t.hecha ? (
                        <input
                          type="checkbox" disabled={busy}
                          onChange={(e) => onCheck(t, e)}
                          style={{ display: 'none' }}
                        />
                      ) : null}
                      {!t.hecha && (
                        <span style={{
                          fontSize: 12, fontWeight: 600, color: C.amber,
                          border: `1px solid ${C.rule}`, borderRadius: 8, padding: '4px 10px',
                        }}>{t.requiere_foto ? '📷 Foto' : 'Marcar'}</span>
                      )}
                    </label>
                    {t.foto_url && (
                      <a href={t.foto_url} target="_blank" rel="noreferrer" style={{ color: C.green, fontSize: 12 }}>ver foto</a>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
