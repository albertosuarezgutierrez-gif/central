'use client'
// ia.rest · FeedbackTab — Valoraciones post-visita de clientes

import { C, SE, SN, SM } from '@/lib/colors'
import React, { useState, useEffect, useCallback } from 'react'

interface Feedback {
  id: string; nota: number; comentario: string | null
  cliente_nombre: string | null; cliente_email: string | null
  respondido_at: string | null; estado: string
  created_at: string
}

interface Config {
  feedback_activo: boolean
  google_review_url: string | null
}

interface Props {
  session: { id: string; nombre: string; rol: string; restaurante_id: string }
  sh: () => Record<string, string>
}

const NOTA_EMOJI = ['','😞','😐','🙂','😊','🤩']
const NOTA_COLOR = ['','#ef4444','#f97316','#eab308','#84cc16','#22c55e']
const NOTA_LABEL = ['','Malo','Regular','Bien','Muy bien','Excelente']

export default function FeedbackTab({ session, sh }: Props) {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [config, setConfig]       = useState<Config>({ feedback_activo: false, google_review_url: null })
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [filtro, setFiltro]       = useState<'todos'|'1'|'2'|'3'|'4'|'5'>('todos')
  const [googleInput, setGoogleInput] = useState('')
  const [msg, setMsg]             = useState('')

  const s = sh()
  const session_str = JSON.stringify(session)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/owner/feedback', { headers: { 'x-ia-session': session_str } })
      const d = await r.json()
      setFeedbacks(d.feedbacks ?? [])
      setConfig(d.config ?? { feedback_activo: false, google_review_url: null })
      setGoogleInput(d.config?.google_review_url ?? '')
    } catch { /* noop */ }
    setLoading(false)
  }, [session_str])

  useEffect(() => { cargar() }, [cargar])

  const guardarConfig = async () => {
    setSaving(true)
    await fetch('/api/owner/feedback/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': session_str },
      body: JSON.stringify({ feedback_activo: config.feedback_activo, google_review_url: googleInput }),
    })
    setMsg('Guardado ✓'); setTimeout(() => setMsg(''), 2000)
    setSaving(false)
  }

  const lista = filtro === 'todos' ? feedbacks : feedbacks.filter(f => f.nota === parseInt(filtro))

  const media = feedbacks.filter(f=>f.nota).length
    ? (feedbacks.reduce((a,f)=>a+(f.nota||0),0)/feedbacks.filter(f=>f.nota).length).toFixed(1)
    : '—'

  const dist = [1,2,3,4,5].map(n => ({
    nota: n, count: feedbacks.filter(f=>f.nota===n).length,
    pct: feedbacks.length ? Math.round(feedbacks.filter(f=>f.nota===n).length/feedbacks.length*100) : 0
  }))

  return (
    <div style={{ padding: '0 0 40px', fontFamily: SN, color: C.ink }}>

      {/* Config */}
      <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 17, color: C.ink }}>Valoraciones automáticas</div>
            <div style={{ fontSize: 12, color: C.ink4, marginTop: 2 }}>Email al cliente 30 min después del cobro</div>
          </div>
          <button onClick={() => setConfig(c => ({ ...c, feedback_activo: !c.feedback_activo }))}
            style={{
              width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
              background: config.feedback_activo ? C.green : C.rule,
              position: 'relative', transition: 'background .2s', flexShrink: 0,
            }}>
            <div style={{
              position: 'absolute', top: 3, left: config.feedback_activo ? 24 : 3,
              width: 20, height: 20, borderRadius: '50%', background: '#fff',
              transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
            }} />
          </button>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.ink4, marginBottom: 6, fontFamily: SM, letterSpacing: '.05em', textTransform: 'uppercase' as const }}>
            URL reseña Google (opcional)
          </div>
          <input value={googleInput} onChange={e => setGoogleInput(e.target.value)}
            placeholder="https://g.page/r/..."
            style={{ width: '100%', background: C.bg3 ?? C.dark, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '10px 14px', color: C.ink, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
          <div style={{ fontSize: 11, color: C.ink4, marginTop: 4 }}>Si nota ≥4, el cliente ve el botón de reseña Google tras valorar</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={guardarConfig} disabled={saving}
            style={{ padding: '8px 18px', background: C.red, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? .7 : 1 }}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          {msg && <span style={{ fontSize: 12, color: C.green }}>{msg}</span>}
        </div>
      </div>

      {/* KPIs */}
      {feedbacks.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 24 }}>
          <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 28, color: C.amb }}>{media}</div>
            <div style={{ fontSize: 11, color: C.ink4, marginTop: 4 }}>Media general</div>
          </div>
          <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 28, color: C.paper }}>{feedbacks.length}</div>
            <div style={{ fontSize: 11, color: C.ink4, marginTop: 4 }}>Total valoraciones</div>
          </div>
          <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 28, color: C.green }}>
              {feedbacks.filter(f => f.nota >= 4).length}
            </div>
            <div style={{ fontSize: 11, color: C.ink4, marginTop: 4 }}>Positivas (4-5★)</div>
          </div>
          <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 28, color: '#ef4444' }}>
              {feedbacks.filter(f => f.nota <= 2).length}
            </div>
            <div style={{ fontSize: 11, color: C.ink4, marginTop: 4 }}>Negativas (1-2★)</div>
          </div>
        </div>
      )}

      {/* Distribución */}
      {feedbacks.length > 0 && (
        <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 14, padding: 18, marginBottom: 20 }}>
          {dist.reverse().map(d => (
            <div key={d.nota} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 28, fontSize: 16 }}>{NOTA_EMOJI[d.nota]}</div>
              <div style={{ flex: 1, height: 8, background: C.rule, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${d.pct}%`, height: '100%', background: NOTA_COLOR[d.nota], borderRadius: 4, transition: 'width .3s' }} />
              </div>
              <div style={{ width: 28, fontSize: 12, color: C.ink3, textAlign: 'right' as const }}>{d.count}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filtro */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 16 }}>
        {(['todos','5','4','3','2','1'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            style={{
              padding: '6px 14px', border: 'none', borderRadius: 20, cursor: 'pointer', fontSize: 12,
              background: filtro === f ? C.red : C.bg2,
              color: filtro === f ? '#fff' : C.ink3,
              outline: filtro === f ? 'none' : `1px solid ${C.rule}`,
            }}>
            {f === 'todos' ? 'Todos' : `${f}★`}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading && <div style={{ color: C.ink4, fontSize: 13, padding: 24, textAlign: 'center' }}>Cargando…</div>}
      {!loading && lista.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⭐</div>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.ink3 }}>Sin valoraciones aún</div>
          <div style={{ fontSize: 13, color: C.ink4, marginTop: 6 }}>Activa las valoraciones para empezar a recibirlas</div>
        </div>
      )}
      {lista.map(fb => (
        <div key={fb.id} style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 14, padding: 18, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: fb.comentario ? 10 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>{NOTA_EMOJI[fb.nota]}</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: NOTA_COLOR[fb.nota] }}>{NOTA_LABEL[fb.nota]} · {fb.nota}/5</div>
                <div style={{ fontSize: 11, color: C.ink4, marginTop: 2 }}>
                  {fb.cliente_nombre ?? fb.cliente_email ?? 'Cliente anónimo'}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: C.ink4 }}>
              {fb.respondido_at ? new Date(fb.respondido_at).toLocaleDateString('es-ES') : '—'}
            </div>
          </div>
          {fb.comentario && (
            <div style={{ background: C.dark, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: C.ink3, fontStyle: 'italic', lineHeight: 1.5 }}>
              "{fb.comentario}"
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
