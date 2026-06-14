'use client'
import { useEffect, useState, useCallback } from 'react'

type Negocio = { id: string; nombre: string; app: string | null; refExt: string | null }
type Categoria = { id: string; nombre: string; color: string | null; orden: number }
type Grupo = { id: string; negocioId: string | null; nombre: string; tipo: 'estatico' | 'dinamico'; origenRef: string | null }

const C = { bg: '#0b1020', card: '#151b2e', card2: '#1c2540', border: '#2a3457', text: '#e8ecf7', muted: '#8b97b8', accent: '#6366f1' }
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif"
const inp: React.CSSProperties = { padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card2, color: C.text, fontSize: 14, fontFamily: FONT, boxSizing: 'border-box' }

export default function ConfigClient({ negocios }: { negocios: Negocio[] }) {
  const [cats, setCats] = useState<Categoria[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])

  // Categoría nueva
  const [catNombre, setCatNombre] = useState('')
  const [catColor, setCatColor] = useState('#6366f1')
  // Grupo nuevo
  const [grNombre, setGrNombre] = useState('')
  const [grTipo, setGrTipo] = useState<'estatico' | 'dinamico'>('estatico')
  const [grNegocio, setGrNegocio] = useState('')
  const [grOrigen, setGrOrigen] = useState('')

  const cargar = useCallback(async () => {
    const [rc, rg] = await Promise.all([fetch('/api/comunicacion/categorias'), fetch('/api/comunicacion/grupos')])
    if (rc.ok) setCats((await rc.json()).categorias || [])
    if (rg.ok) setGrupos((await rg.json()).grupos || [])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function crearCat() {
    if (!catNombre.trim()) return
    const r = await fetch('/api/comunicacion/categorias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: catNombre, color: catColor, orden: cats.length }) })
    if (r.ok) { setCatNombre(''); cargar() }
  }
  async function crearGrupo() {
    if (!grNombre.trim()) return
    const body: any = { nombre: grNombre, tipo: grTipo, negocioId: grNegocio || null }
    if (grTipo === 'dinamico') body.origenRef = grOrigen || null
    const r = await fetch('/api/comunicacion/grupos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (r.ok) { setGrNombre(''); setGrOrigen(''); cargar() }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>⚙️ Configurar comunicación</div>
        <a href="/comunicacion" style={{ color: C.muted, fontSize: 13, textDecoration: 'none' }}>← Volver al hub</a>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: 24, display: 'grid', gap: 24 }}>
        {/* Categorías */}
        <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>🏷️ Categorías <span style={{ color: C.muted, fontWeight: 500 }}>· libres, las defines tú</span></h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {cats.length === 0 && <span style={{ color: C.muted, fontSize: 13 }}>Sin categorías.</span>}
            {cats.map(c => (
              <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.card2, borderRadius: 20, padding: '4px 12px', fontSize: 13 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.color || C.accent }} />{c.nombre}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={catNombre} onChange={e => setCatNombre(e.target.value)} placeholder="Nueva categoría (p.ej. Directiva)" style={{ ...inp, flex: 1 }} />
            <input type="color" value={catColor} onChange={e => setCatColor(e.target.value)} style={{ ...inp, width: 48, padding: 4, cursor: 'pointer' }} />
            <button onClick={crearCat} style={btn}>Añadir</button>
          </div>
        </section>

        {/* Grupos */}
        <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>👥 Grupos / secciones</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {grupos.length === 0 && <span style={{ color: C.muted, fontSize: 13 }}>Sin grupos.</span>}
            {grupos.map(g => (
              <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', background: C.card2, borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                <span>{g.nombre}</span>
                <span style={{ color: C.muted }}>{g.tipo === 'dinamico' ? `dinámico · ${g.origenRef || ''}` : 'estático'}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <input value={grNombre} onChange={e => setGrNombre(e.target.value)} placeholder="Nombre del grupo (p.ej. Participantes del catering)" style={inp} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={grTipo} onChange={e => setGrTipo(e.target.value as any)} style={{ ...inp, flex: 1 }}>
                <option value="estatico">Estático (eliges personas)</option>
                <option value="dinamico">Dinámico (de una vertical)</option>
              </select>
              <select value={grNegocio} onChange={e => setGrNegocio(e.target.value)} style={{ ...inp, flex: 1 }}>
                <option value="">— sin negocio —</option>
                {negocios.map(n => <option key={n.id} value={n.id}>{n.nombre}</option>)}
              </select>
            </div>
            {grTipo === 'dinamico' && (
              <input value={grOrigen} onChange={e => setGrOrigen(e.target.value)} placeholder="origen, p.ej. iarest:evento:<id-del-evento>" style={inp} />
            )}
            <button onClick={crearGrupo} style={{ ...btn, justifySelf: 'start' }}>Añadir grupo</button>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Los grupos dinámicos se resuelven en vivo (p.ej. "iarest:evento:&lt;id&gt;" → participantes del evento).</div>
        </section>

        <div style={{ fontSize: 12, color: C.muted }}>La matriz de reglas (quién puede hablar con quién) llegará en un paso posterior; por ahora, como dueño puedes comunicarte con todos.</div>
      </div>
    </div>
  )
}

const btn: React.CSSProperties = { background: C.accent, border: 'none', color: '#fff', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontWeight: 700, fontFamily: FONT }
