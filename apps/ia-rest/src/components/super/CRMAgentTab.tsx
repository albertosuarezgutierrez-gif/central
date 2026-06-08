'use client'
import { C, SN, SM } from '@/lib/colors'
import { useState, useEffect } from 'react'

interface Lead {
  id: string
  nombre: string
  restaurante: string
  empresa?: string
  estado: string
  puntuacion: number
  eventos?: { tipo: string; texto: string; fecha: string }[]
  siguiente_contacto_texto?: string
  siguiente_contacto_at?: string
}

interface Analysis {
  resumen: string
  estado_nuevo: string
  estado_cambio: boolean
  siguiente_accion: string
  fecha_siguiente: string | null
  puntuacion_delta: number
  tono: 'positivo' | 'neutral' | 'negativo'
  emoji_evento: string
  notas_internas?: string
}

const CANALES = [
  { v: 'whatsapp',  label: '💬 WhatsApp' },
  { v: 'instagram', label: '📸 Instagram' },
  { v: 'email',     label: '✉️ Email' },
  { v: 'llamada',   label: '📞 Llamada' },
  { v: 'reunion',   label: '🤝 Reunión' },
  { v: 'nota',      label: '📝 Nota' },
]

const ESTADO_COLOR: Record<string, string> = {
  nuevo: C.amber, contactado: '#3B8BE8', demo: '#7B5EA7', cliente: C.green, descartado: C.ink4
}

const TONO_COLOR: Record<string, string> = {
  positivo: C.green, neutral: C.amber, negativo: C.red
}

export default function CRMAgentTab() {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '', 'Content-Type': 'application/json' })

  const [leads, setLeads] = useState<Lead[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [canal, setCanal] = useState('whatsapp')
  const [texto, setTexto] = useState('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'saving' | 'applied' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [historial, setHistorial] = useState<{ tipo: string; texto: string; fecha: string }[]>([])

  const lead = leads.find(l => l.id === selectedId)

  useEffect(() => {
    fetch('/api/super/leads', { headers: sh() })
      .then(r => r.json())
      .then(d => {
        const ls: Lead[] = d.leads || []
        setLeads(ls)
        if (ls.length > 0) setSelectedId(ls[0].id)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (lead?.eventos) {
      setHistorial([...lead.eventos].reverse().slice(0, 4))
    } else {
      setHistorial([])
    }
  }, [lead])

  const analizar = async () => {
    if (!texto.trim() || !selectedId) return
    setStatus('loading'); setAnalysis(null); setErrorMsg('')
    try {
      const r = await fetch('/api/super/leads/agente', {
        method: 'POST', headers: sh(),
        body: JSON.stringify({ lead_id: selectedId, texto, canal })
      })
      const d = await r.json()
      if (!d.ok) throw new Error(d.error || 'Error análisis')
      setAnalysis(d.analysis)
      setStatus('done')
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Error')
      setStatus('error')
    }
  }

  const aplicar = async () => {
    if (!analysis || !selectedId) return
    setStatus('saving')
    try {
      const r = await fetch('/api/super/leads/agente', {
        method: 'PUT', headers: sh(),
        body: JSON.stringify({ lead_id: selectedId, texto, canal, analysis })
      })
      const d = await r.json()
      if (!d.ok) throw new Error(d.error || 'Error guardando')
      // Actualizar lead en lista
      setLeads(prev => prev.map(l => l.id === selectedId ? d.lead : l))
      setStatus('applied')
      setTimeout(() => { setStatus('idle'); setAnalysis(null); setTexto('') }, 3000)
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Error guardando')
      setStatus('error')
    }
  }

  const busy = status === 'loading' || status === 'saving'

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: SM, fontSize: 11, color: C.red, letterSpacing: '.12em', marginBottom: 6 }}>AGENTE CRM · IA</div>
        <h2 style={{ fontFamily: SN, fontSize: 26, fontWeight: 600, margin: 0, color: C.ink }}>Actualizar CRM</h2>
        <p style={{ fontFamily: SN, fontSize: 13, color: C.ink3, margin: '6px 0 0' }}>
          Pega mensajes de WhatsApp, Instagram, notas de llamada — la IA analiza y actualiza el lead.
        </p>
      </div>

      {/* Lead selector */}
      <div style={{ background: C.bg2, borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.1em', marginBottom: 10 }}>LEAD</div>
        {leads.length === 0 ? (
          <div style={{ color: C.ink3, fontFamily: SN, fontSize: 13 }}>Cargando leads...</div>
        ) : (
          <select
            value={selectedId}
            onChange={e => { setSelectedId(e.target.value); setAnalysis(null) }}
            style={{ width: '100%', background: C.bg3, border: `1px solid ${C.rule}`, color: C.ink,
              padding: '9px 12px', borderRadius: 8, fontFamily: SN, fontSize: 14, cursor: 'pointer' }}
          >
            {leads.map(l => (
              <option key={l.id} value={l.id}>{l.nombre} — {l.empresa || l.restaurante}</option>
            ))}
          </select>
        )}

        {lead && (
          <>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <span style={{ background: C.bg3, color: ESTADO_COLOR[lead.estado] || C.ink3,
                padding: '3px 9px', borderRadius: 5, fontFamily: SM, fontSize: 11, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '.06em' }}>
                {lead.estado}
              </span>
              <span style={{ background: C.bg3, color: C.ink3, padding: '3px 9px', borderRadius: 5, fontFamily: SM, fontSize: 11 }}>
                ⭐ {lead.puntuacion || 0} pts
              </span>
              {lead.siguiente_contacto_texto && (
                <span style={{ background: C.bg3, color: C.amber, padding: '3px 9px', borderRadius: 5, fontFamily: SN, fontSize: 11, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  → {lead.siguiente_contacto_texto}
                </span>
              )}
            </div>

            {/* Historial reciente */}
            {historial.length > 0 && (
              <div style={{ marginTop: 14, borderTop: `1px solid ${C.rule}`, paddingTop: 12 }}>
                <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.08em', marginBottom: 8 }}>HISTORIAL RECIENTE</div>
                {historial.map((ev, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 12, flexShrink: 0 }}>{ev.tipo}</span>
                    <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3, lineHeight: 1.4 }}>{ev.texto}</span>
                    <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4, flexShrink: 0, marginLeft: 'auto' }}>{ev.fecha}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Canal + Textarea */}
      <div style={{ background: C.bg2, borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.1em', marginBottom: 10 }}>FUENTE DEL MENSAJE</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {CANALES.map(({ v, label }) => (
            <button key={v} onClick={() => setCanal(v)}
              style={{ padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontFamily: SN, fontSize: 12,
                background: canal === v ? C.red : C.bg3,
                color: canal === v ? '#fff' : C.ink2 }}>
              {label}
            </button>
          ))}
        </div>

        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder={`Pega aquí el mensaje de ${CANALES.find(c => c.v === canal)?.label.split(' ')[1] || canal}...`}
          style={{ width: '100%', minHeight: 140, background: C.bg3, border: `1px solid ${C.rule}`,
            color: C.ink, padding: '12px 14px', borderRadius: 9, fontFamily: SN, fontSize: 13,
            resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.55 }}
        />

        <button
          onClick={analizar}
          disabled={!texto.trim() || busy || !selectedId}
          style={{ marginTop: 12, width: '100%', background: busy ? C.bg3 : C.red,
            border: 'none', color: busy ? C.ink4 : '#fff', padding: '12px 0',
            borderRadius: 9, cursor: busy ? 'wait' : 'pointer',
            fontFamily: SN, fontSize: 14, fontWeight: 700, letterSpacing: '.01em' }}>
          {status === 'loading' ? '⏳ Analizando con IA...' : '🔍 Analizar'}
        </button>
      </div>

      {/* Error */}
      {status === 'error' && (
        <div style={{ background: '#2E1410', border: `1px solid ${C.red}50`,
          color: '#F08070', padding: 14, borderRadius: 10, fontFamily: SN, fontSize: 13,
          marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ {errorMsg}</span>
          <button onClick={() => setStatus('idle')} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 15 }}>✕</button>
        </div>
      )}

      {/* Analysis card */}
      {analysis && status !== 'applied' && (
        <div style={{ background: C.bg2, borderRadius: 12, padding: 20, border: `1px solid ${C.rule}` }}>
          <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.1em', marginBottom: 14 }}>ANÁLISIS IA</div>

          {/* Resumen */}
          <div style={{ background: C.bg3, borderRadius: 9, padding: 14, marginBottom: 14 }}>
            <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, marginBottom: 5 }}>RESUMEN</div>
            <p style={{ fontFamily: SN, fontSize: 14, color: C.ink, margin: 0, lineHeight: 1.55 }}>{analysis.resumen}</p>
            {analysis.notas_internas && (
              <p style={{ fontFamily: SN, fontSize: 12, color: C.ink3, margin: '8px 0 0', fontStyle: 'italic' }}>
                {analysis.notas_internas}
              </p>
            )}
          </div>

          {/* Badges fila */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ background: C.bg3, borderRadius: 8, padding: '8px 12px', textAlign: 'center', flex: 1, minWidth: 90 }}>
              <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, textTransform: 'uppercase', marginBottom: 4 }}>Tono</div>
              <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: TONO_COLOR[analysis.tono] }}>
                {analysis.tono === 'positivo' ? '😊' : analysis.tono === 'negativo' ? '😟' : '😐'} {analysis.tono}
              </div>
            </div>
            <div style={{ background: C.bg3, borderRadius: 8, padding: '8px 12px', textAlign: 'center', flex: 1, minWidth: 90 }}>
              <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, textTransform: 'uppercase', marginBottom: 4 }}>Puntuación</div>
              <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: analysis.puntuacion_delta >= 0 ? C.green : C.red }}>
                {analysis.puntuacion_delta >= 0 ? '+' : ''}{analysis.puntuacion_delta} → {Math.max(0, Math.min(100, (lead?.puntuacion || 0) + analysis.puntuacion_delta))}
              </div>
            </div>
            {analysis.estado_cambio && (
              <div style={{ background: C.bg3, borderRadius: 8, padding: '8px 12px', textAlign: 'center', flex: 1, minWidth: 90 }}>
                <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, textTransform: 'uppercase', marginBottom: 4 }}>Estado →</div>
                <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: ESTADO_COLOR[analysis.estado_nuevo] || C.amber }}>
                  {analysis.estado_nuevo}
                </div>
              </div>
            )}
          </div>

          {/* Próxima acción */}
          <div style={{ background: C.bg3, borderRadius: 9, padding: 14, marginBottom: 16 }}>
            <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, textTransform: 'uppercase', marginBottom: 5 }}>Próxima acción</div>
            <div style={{ fontFamily: SN, fontSize: 14, color: C.ink }}>{analysis.siguiente_accion}</div>
            {analysis.fecha_siguiente && (
              <div style={{ fontFamily: SN, fontSize: 12, color: C.amber, marginTop: 6 }}>
                📅 {analysis.fecha_siguiente}
              </div>
            )}
          </div>

          {/* Botones */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setAnalysis(null)}
              style={{ flex: 1, background: C.bg3, border: 'none', color: C.ink2,
                padding: '11px 0', borderRadius: 9, cursor: 'pointer', fontFamily: SN, fontSize: 13 }}>
              Cancelar
            </button>
            <button onClick={aplicar} disabled={busy}
              style={{ flex: 2, background: C.green, border: 'none', color: '#fff',
                padding: '11px 0', borderRadius: 9, cursor: busy ? 'wait' : 'pointer',
                fontFamily: SN, fontSize: 14, fontWeight: 700 }}>
              {status === 'saving' ? '⏳ Guardando...' : '✅ Aplicar al CRM'}
            </button>
          </div>
        </div>
      )}

      {/* Applied */}
      {status === 'applied' && (
        <div style={{ background: '#182E1E', border: `1px solid ${C.green}40`,
          padding: 20, borderRadius: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
          <div style={{ fontFamily: SN, fontWeight: 700, fontSize: 16, color: C.green }}>CRM actualizado</div>
          <div style={{ fontFamily: SN, fontSize: 13, color: '#7DB88A', marginTop: 4 }}>
            Interacción guardada · Lead actualizado
          </div>
        </div>
      )}
    </div>
  )
}
