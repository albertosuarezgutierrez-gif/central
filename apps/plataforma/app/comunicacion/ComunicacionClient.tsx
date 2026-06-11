'use client'
import { useEffect, useState, useCallback } from 'react'

type Negocio = { id: string; nombre: string; app: string; refExt: string; sector: string }
type Categoria = { id: string; nombre: string; color: string | null; orden: number }
type Conversacion = { id: string; categoriaId: string | null; titulo: string | null; estado: string; createdAt: string }
type Mensaje = { id: string; autorNodoId: string | null; cuerpo: string; createdAt: string }
type Persona = { refPersona: string; nombre: string; rol: string | null; email?: string | null }

const C = { bg: '#0b1020', card: '#151b2e', card2: '#1c2540', border: '#2a3457', text: '#e8ecf7', muted: '#8b97b8', accent: '#6366f1' }
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif"
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card2, color: C.text, fontSize: 14, fontFamily: FONT, boxSizing: 'border-box' }

export default function ComunicacionClient({ operador, negocios, categorias }: { operador: string; negocios: Negocio[]; categorias: Categoria[] }) {
  const [convs, setConvs] = useState<Conversacion[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [titulo, setTitulo] = useState<string | null>(null)
  const [nuevoMsg, setNuevoMsg] = useState('')
  const [showNuevo, setShowNuevo] = useState(false)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/comunicacion/conversaciones')
    if (r.ok) setConvs((await r.json()).conversaciones || [])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const abrir = useCallback(async (id: string) => {
    setSel(id)
    const r = await fetch(`/api/comunicacion/conversaciones/${id}`)
    if (r.ok) { const d = await r.json(); setMensajes(d.mensajes || []); setTitulo(d.conversacion?.titulo || null) }
  }, [])

  async function enviar() {
    if (!sel || !nuevoMsg.trim()) return
    const r = await fetch(`/api/comunicacion/conversaciones/${sel}/mensajes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cuerpo: nuevoMsg }),
    })
    if (r.ok) { setNuevoMsg(''); abrir(sel) }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: FONT, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>💬 Comunicación <span style={{ color: C.muted, fontWeight: 500, fontSize: 13 }}>· {operador}</span></div>
        <button onClick={() => setShowNuevo(true)} style={{ background: C.accent, border: 'none', color: '#fff', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontWeight: 700, fontFamily: FONT }}>✏️ Nuevo mensaje</button>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Bandeja */}
        <div style={{ width: 320, borderRight: `1px solid ${C.border}`, overflowY: 'auto', padding: 12 }}>
          {convs.length === 0 && <div style={{ color: C.muted, fontSize: 13, padding: 12 }}>Sin conversaciones todavía.</div>}
          {convs.map(c => (
            <div key={c.id} onClick={() => abrir(c.id)} style={{ padding: '10px 12px', borderRadius: 10, marginBottom: 6, cursor: 'pointer', background: sel === c.id ? C.card2 : 'transparent', border: `1px solid ${sel === c.id ? C.border : 'transparent'}` }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.titulo || '(sin título)'}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{new Date(c.createdAt).toLocaleString('es-ES')}</div>
            </div>
          ))}
        </div>

        {/* Hilo */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!sel && <div style={{ margin: 'auto', color: C.muted }}>Elige una conversación o crea una nueva.</div>}
          {sel && (
            <>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, fontWeight: 700 }}>{titulo || 'Conversación'}</div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {mensajes.map(m => (
                  <div key={m.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', maxWidth: 640 }}>
                    <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{m.cuerpo}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{new Date(m.createdAt).toLocaleString('es-ES')}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, padding: 16, borderTop: `1px solid ${C.border}` }}>
                <input value={nuevoMsg} onChange={e => setNuevoMsg(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enviar() }} placeholder="Escribe un mensaje…" style={inp} />
                <button onClick={enviar} style={{ background: C.accent, border: 'none', color: '#fff', borderRadius: 8, padding: '0 18px', cursor: 'pointer', fontWeight: 700, fontFamily: FONT }}>Enviar</button>
              </div>
            </>
          )}
        </div>
      </div>

      {showNuevo && <NuevoModal negocios={negocios} categorias={categorias} onClose={() => setShowNuevo(false)} onCreado={(id) => { setShowNuevo(false); cargar(); abrir(id) }} />}
    </div>
  )
}

function NuevoModal({ negocios, categorias, onClose, onCreado }: { negocios: Negocio[]; categorias: Categoria[]; onClose: () => void; onCreado: (id: string) => void }) {
  const [target, setTarget] = useState<'holding' | 'negocio' | 'persona'>('negocio')
  const [negocioId, setNegocioId] = useState(negocios[0]?.id || '')
  const [personas, setPersonas] = useState<Persona[]>([])
  const [refPersona, setRefPersona] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [titulo, setTitulo] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const negocio = negocios.find(n => n.id === negocioId)

  useEffect(() => {
    if (target !== 'persona' || !negocio) { setPersonas([]); return }
    fetch(`/api/comunicacion/directorio?app=${encodeURIComponent(negocio.app)}&refExt=${encodeURIComponent(negocio.refExt)}`)
      .then(r => r.ok ? r.json() : { personas: [] }).then(d => setPersonas(d.personas || [])).catch(() => setPersonas([]))
  }, [target, negocioId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function crear() {
    setErr(''); setBusy(true)
    let destinatarios: any[] = []
    if (target === 'holding') destinatarios = negocios.map(n => ({ tipo: 'negocio', negocioId: n.id, nombre: n.nombre }))
    else if (target === 'negocio' && negocio) destinatarios = [{ tipo: 'negocio', negocioId: negocio.id, nombre: negocio.nombre }]
    else if (target === 'persona' && negocio && refPersona) {
      const p = personas.find(x => x.refPersona === refPersona)
      destinatarios = [{ tipo: 'persona', negocioId: negocio.id, refPersona, rol: p?.rol || undefined, nombre: p?.nombre }]
    }
    if (!destinatarios.length) { setErr('Elige un destinatario'); setBusy(false); return }
    if (!cuerpo.trim()) { setErr('Escribe el mensaje'); setBusy(false); return }
    const r = await fetch('/api/comunicacion/conversaciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinatarios, categoriaId: categoriaId || null, titulo: titulo || null, cuerpo }),
    })
    setBusy(false)
    if (r.ok) onCreado((await r.json()).id)
    else setErr((await r.json().catch(() => ({}))).error || 'No se pudo crear')
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, width: '100%', maxWidth: 460 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>✏️ Nuevo mensaje</div>
        {err && <div style={{ background: '#2a0c0c', color: '#fca5a5', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>{err}</div>}

        <Lbl>Destinatario</Lbl>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {([['holding', '🏛️ Todos'], ['negocio', '🏢 Un negocio'], ['persona', '👤 Persona']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTarget(k)} style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: `1px solid ${target === k ? C.accent : C.border}`, background: target === k ? C.card2 : 'transparent', color: C.text, cursor: 'pointer', fontSize: 12, fontFamily: FONT }}>{label}</button>
          ))}
        </div>

        {target !== 'holding' && (
          <div style={{ marginBottom: 12 }}>
            <Lbl>Negocio</Lbl>
            <select value={negocioId} onChange={e => { setNegocioId(e.target.value); setRefPersona('') }} style={inp}>
              {negocios.map(n => <option key={n.id} value={n.id}>{n.nombre}</option>)}
            </select>
          </div>
        )}
        {target === 'persona' && (
          <div style={{ marginBottom: 12 }}>
            <Lbl>Persona</Lbl>
            <select value={refPersona} onChange={e => setRefPersona(e.target.value)} style={inp}>
              <option value="">— elige —</option>
              {personas.map(p => <option key={p.refPersona} value={p.refPersona}>{p.nombre}{p.rol ? ` · ${p.rol}` : ''}</option>)}
            </select>
            {personas.length === 0 && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Sin directorio para este negocio.</div>}
          </div>
        )}

        {categorias.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <Lbl>Categoría</Lbl>
            <select value={categoriaId} onChange={e => setCategoriaId(e.target.value)} style={inp}>
              <option value="">— sin categoría —</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        )}

        <div style={{ marginBottom: 12 }}><Lbl>Asunto (opcional)</Lbl><input value={titulo} onChange={e => setTitulo(e.target.value)} style={inp} /></div>
        <div style={{ marginBottom: 16 }}><Lbl>Mensaje</Lbl><textarea value={cuerpo} onChange={e => setCuerpo(e.target.value)} rows={4} style={{ ...inp, resize: 'vertical' }} /></div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={crear} disabled={busy} style={{ flex: 1, padding: 11, background: C.accent, border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: FONT }}>{busy ? 'Enviando…' : 'Enviar'}</button>
          <button onClick={onClose} style={{ padding: '11px 16px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 10, color: C.muted, cursor: 'pointer', fontFamily: FONT }}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 11, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 5 }}>{children}</label>
}
