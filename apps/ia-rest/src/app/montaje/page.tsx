'use client'
import { DARK_C as C, SE, SN, SM } from '@/lib/colors'
import { useEffect, useState, useCallback, useRef } from 'react'

interface MaterialRef { nombre: string; categoria: string; coste_reposicion?: number }
interface Asignacion {
  id: string
  material_id: string
  destino_tipo: string
  destino_nombre: string | null
  cantidad: number
  cantidad_devuelta: number
  estado: string
  fecha_salida: string | null
  notas: string | null
  material: MaterialRef | null
}

function sesHeader(): string {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem('ia_rest_session') ?? ''
}
const H = () => ({ 'Content-Type': 'application/json', 'x-ia-session': sesHeader() })

const ESTADO_COLOR: Record<string, string> = { reservado: C.amber, entregado: '#2B6A9E', devuelto: C.green }

export default function MontajePage() {
  const [items, setItems] = useState<Asignacion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [rotura, setRotura] = useState<Asignacion | null>(null)

  const salir = () => {
    try { localStorage.removeItem('ia_rest_session') } catch { /* noop */ }
    window.location.href = '/login'
  }

  const cargar = useCallback(async () => {
    const r = await fetch('/api/materiales/perfil', { headers: H() })
    if (r.ok) {
      setItems((await r.json()).asignaciones ?? [])
    } else {
      setError((await r.json()).error ?? 'No se pudo cargar')
    }
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const devolver = async (id: string) => {
    setBusy(id)
    await fetch('/api/materiales/asignacion', { method: 'PATCH', headers: H(), body: JSON.stringify({ id, estado: 'devuelto' }) })
    setBusy(null)
    cargar()
  }
  const entregar = async (id: string) => {
    setBusy(id)
    await fetch('/api/materiales/asignacion', { method: 'PATCH', headers: H(), body: JSON.stringify({ id, estado: 'entregado' }) })
    setBusy(null)
    cargar()
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SN, color: C.ink, padding: '16px 14px 60px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h1 style={{ fontFamily: SE, fontSize: 26, margin: '4px 0 2px' }}>Mi material</h1>
          <button onClick={salir} style={{
            fontFamily: SN, fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8,
            border: `1px solid ${C.rule}`, cursor: 'pointer', background: 'transparent', color: C.ink2,
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginTop: 4,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            Salir
          </button>
        </div>
        <p style={{ color: C.ink3, fontSize: 13, margin: '0 0 16px' }}>Material asignado. Confirma entrega/devolución y registra roturas con foto.</p>

        {loading ? <p style={{ color: C.ink3 }}>Cargando…</p>
          : error ? <p style={{ color: C.red }}>{error}</p>
          : items.length === 0 ? <p style={{ color: C.ink3 }}>No tienes material asignado ahora mismo.</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map(a => (
                <div key={a.id} style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 14, opacity: busy === a.id ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>
                      {a.material?.nombre ?? '—'}<span style={{ color: C.ink3, fontWeight: 400 }}> ×{a.cantidad}</span>
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: ESTADO_COLOR[a.estado] ?? C.ink3 }}>{a.estado}</span>
                  </div>
                  <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, marginTop: 4 }}>
                    {a.destino_tipo}{a.destino_nombre ? ` · ${a.destino_nombre}` : ''}{a.fecha_salida ? ` · ${a.fecha_salida}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    {a.estado === 'reservado' && <button onClick={() => entregar(a.id)} style={btn('#2B6A9E')}>Recogido</button>}
                    <button onClick={() => devolver(a.id)} style={btn(C.green)}>Devolver</button>
                    <button onClick={() => setRotura(a)} style={{ ...btn('transparent'), color: C.red, border: `1px solid ${C.red}66` }}>Registrar rotura</button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>

      {rotura && <RoturaModal asignacion={rotura} onClose={() => setRotura(null)} onSaved={() => { setRotura(null); cargar() }} />}
    </div>
  )
}

function btn(color: string): React.CSSProperties {
  return { fontFamily: SN, fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: color, color: C.paper }
}

function RoturaModal({ asignacion, onClose, onSaved }: { asignacion: Asignacion; onClose: () => void; onSaved: () => void }) {
  const [cantidad, setCantidad] = useState('1')
  const [motivo, setMotivo] = useState('rotura')
  const [foto, setFoto] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const elegirFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setFoto(reader.result as string)
    reader.readAsDataURL(f)
  }

  const guardar = async () => {
    const n = Number(cantidad)
    if (!(n > 0)) return
    setSaving(true)
    const r = await fetch('/api/materiales/dano', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ material_id: asignacion.material_id, asignacion_id: asignacion.id, cantidad: n, motivo, foto_base64: foto }),
    })
    setSaving(false)
    if (r.ok) onSaved()
    else alert((await r.json()).error ?? 'Error')
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg2, borderTop: `1px solid ${C.rule}`, borderRadius: '16px 16px 0 0', padding: 20, width: '100%', maxWidth: 560 }}>
        <div style={{ fontFamily: SE, fontSize: 19, marginBottom: 4 }}>Registrar rotura</div>
        <div style={{ fontFamily: SM, fontSize: 12, color: C.ink3, marginBottom: 14 }}>{asignacion.material?.nombre ?? '—'} · {asignacion.destino_nombre ?? asignacion.destino_tipo}</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input type="number" value={cantidad} onChange={e => setCantidad(e.target.value)} placeholder="Cantidad"
            style={{ flex: 1, fontFamily: SN, fontSize: 14, padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.rule}`, background: C.bg, color: C.ink, outline: 'none' }} />
          <select value={motivo} onChange={e => setMotivo(e.target.value)}
            style={{ flex: 1, fontFamily: SN, fontSize: 14, padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.rule}`, background: C.bg, color: C.ink, outline: 'none' }}>
            <option value="rotura">Rotura</option>
            <option value="falta">Falta</option>
            <option value="deterioro">Deterioro</option>
          </select>
        </div>

        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={elegirFoto} style={{ display: 'none' }} />
        <button onClick={() => fileRef.current?.click()} style={{ ...btn(C.bg3), color: C.ink2, border: `1px solid ${C.rule}`, width: '100%', marginBottom: 10 }}>
          {foto ? '📷 Cambiar foto' : '📷 Añadir foto'}
        </button>
        {foto && <img src={foto} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, marginBottom: 10 }} />}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ ...btn(C.bg3), color: C.ink2, border: `1px solid ${C.rule}`, flex: 1 }}>Cancelar</button>
          <button onClick={guardar} disabled={saving} style={{ ...btn(C.red), flex: 2, opacity: saving ? 0.6 : 1 }}>{saving ? 'Guardando…' : 'Registrar rotura'}</button>
        </div>
      </div>
    </div>
  )
}
