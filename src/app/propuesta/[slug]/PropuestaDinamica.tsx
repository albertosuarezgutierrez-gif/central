'use client'
import React, { useState, useEffect } from 'react'

const C = {
  bg:    '#F6F1E7',
  bg2:   '#EDE8DC',
  ink:   '#1A1714',
  ink2:  '#3D3530',
  ink3:  '#6B5F52',
  ink4:  '#9C8E7E',
  red:   '#D9442B',
  green: '#3F7D44',
  rule:  '#D0C8B8',
  white: '#FFFFFF',
}

interface Estudio {
  argumento_principal?: string
  pain_points?: string[]
  modulos_criticos?: string[]
}

interface LeadData {
  empresa: string | null
  restaurante: string | null
  nombre: string | null
  ciudad: string | null
  estudio_completo: Estudio | null
  modulos_recomendados: string[] | null
  pain_points: string[] | null
  mrr_estimado: number | null
  propuesta_slug: string
}

const MODULOS_LABELS: Record<string, { emoji: string; label: string }> = {
  voz:          { emoji: '🎙', label: 'Comandas por voz' },
  kds:          { emoji: '📺', label: 'Pantalla de cocina' },
  almacen:      { emoji: '📦', label: 'Almacén y costes' },
  contabilidad: { emoji: '📊', label: 'Contabilidad integrada' },
  qr:           { emoji: '📱', label: 'QR en mesa' },
  storefront:   { emoji: '🛵', label: 'Tienda online' },
  analytics:    { emoji: '📈', label: 'Analytics' },
  multi_local:  { emoji: '🏢', label: 'Multi-local' },
  eventos:      { emoji: '🎉', label: 'Eventos y catering' },
  vinos:        { emoji: '🍷', label: 'Carta de vinos' },
  bridge:       { emoji: '🖨', label: 'Impresoras integradas' },
  rrhh:         { emoji: '👥', label: 'RRHH y fichaje' },
}

export default function PropuestaDinamica({ lead, slug }: { lead: LeadData; slug: string }) {
  const empresa = lead.empresa || lead.restaurante || lead.nombre || 'Tu restaurante'
  const estudio = lead.estudio_completo as Estudio | null
  const ciudad = lead.ciudad || 'tu ciudad'

  const argumento = estudio?.argumento_principal || ''
  const painPoints = (estudio?.pain_points || lead.pain_points || []).slice(0, 3)
  const modulos = (estudio?.modulos_criticos || (lead.modulos_recomendados || []).slice(0, 4))
    .filter((m: string) => MODULOS_LABELS[m])

  useEffect(() => {
    fetch(`/api/propuesta/${slug}/booking`, { method: 'PATCH' }).catch(() => {})
  }, [slug])

  type TipoReunion = 'telefonica' | 'presencial'
  const [tipo, setTipo] = useState<TipoReunion>('presencial')
  const [form, setForm] = useState({ nombre: '', telefono: '', disponibilidad: '', notas: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')

  const enviar = async () => {
    if (!form.nombre || !form.telefono) {
      setErr('Necesitamos tu nombre y teléfono.')
      return
    }
    setSending(true); setErr('')
    try {
      const r = await fetch(`/api/propuesta/${slug}/booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre,
          telefono: form.telefono,
          tipo_reunion: tipo,
          disponibilidad: form.disponibilidad,
          notas: form.notas,
          // campos legacy que espera la API
          fecha: new Date().toISOString().split('T')[0],
          hora: '11:00',
          lugar: tipo === 'presencial' ? `${empresa}, ${ciudad}` : 'Llamada telefónica',
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setSent(true)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Error enviando solicitud')
    }
    setSending(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter Tight', system-ui, sans-serif" }}>

      {/* HEADER */}
      <header style={{ background: C.ink, padding: '0 24px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 22, fontWeight: 600, color: C.bg, letterSpacing: '-.02em' }}>
            ia<span style={{ color: C.red }}>.</span>rest
          </span>
          <span style={{ fontSize: 11, color: '#6B5F52', fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase' }}>
            Para {empresa}
          </span>
        </div>
      </header>

      {/* HERO */}
      <section style={{ background: C.ink, padding: '48px 24px 64px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          {argumento && (
            <p style={{ fontSize: 22, color: C.bg, lineHeight: 1.5, margin: '0 0 24px', maxWidth: 520, fontFamily: "'Newsreader', Georgia, serif", fontWeight: 400 }}>
              {argumento}
            </p>
          )}
          {painPoints.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: argumento ? 0 : 0 }}>
              {painPoints.map((pp, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ color: C.red, fontWeight: 700, fontSize: 15, marginTop: 2, flexShrink: 0 }}>→</span>
                  <span style={{ fontSize: 15, color: '#9C8E7E', lineHeight: 1.5 }}>{pp}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 24px' }}>

        {/* MÓDULOS — solo tags, sin descripción */}
        {modulos.length > 0 && (
          <section style={{ margin: '40px 0 0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: C.ink4, textTransform: 'uppercase', marginBottom: 14 }}>
              Lo que veremos
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {modulos.map((m: string) => (
                <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: C.white, border: `1px solid ${C.rule}`, borderRadius: 20, fontSize: 13, color: C.ink2, fontWeight: 500 }}>
                  {MODULOS_LABELS[m].emoji} {MODULOS_LABELS[m].label}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* FORMULARIO */}
        <section style={{ margin: '48px 0 80px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: C.ink4, textTransform: 'uppercase', marginBottom: 14 }}>
            Concertar reunión
          </div>

          {!sent ? (
            <div style={{ background: C.white, border: `1px solid ${C.rule}`, borderRadius: 14, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Tipo reunión */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {(['presencial', 'telefonica'] as TipoReunion[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setTipo(t)}
                    style={{
                      padding: '14px',
                      borderRadius: 10,
                      border: tipo === t ? `2px solid ${C.red}` : `1.5px solid ${C.rule}`,
                      background: tipo === t ? `${C.red}08` : C.bg,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all .15s',
                    }}
                  >
                    <span style={{ fontSize: 22 }}>{t === 'presencial' ? '🤝' : '📞'}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: tipo === t ? C.red : C.ink2 }}>
                      {t === 'presencial' ? 'Presencial' : 'Por teléfono'}
                    </span>
                    <span style={{ fontSize: 11, color: C.ink4, textAlign: 'center' }}>
                      {t === 'presencial' ? `En tu local, ${ciudad}` : 'Te llamo yo'}
                    </span>
                  </button>
                ))}
              </div>

              {/* Nombre */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.ink4, letterSpacing: '.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Nombre *
                </label>
                <input
                  value={form.nombre}
                  onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                  placeholder="Tu nombre"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 9, fontSize: 14, color: C.ink, outline: 'none', fontFamily: 'inherit' }}
                />
              </div>

              {/* Teléfono */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.ink4, letterSpacing: '.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Teléfono *
                </label>
                <input
                  value={form.telefono}
                  onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))}
                  placeholder="6XX XXX XXX"
                  type="tel"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 9, fontSize: 14, color: C.ink, outline: 'none', fontFamily: 'inherit' }}
                />
              </div>

              {/* Disponibilidad */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.ink4, letterSpacing: '.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  ¿Cuándo te va bien? (opcional)
                </label>
                <input
                  value={form.disponibilidad}
                  onChange={e => setForm(p => ({ ...p, disponibilidad: e.target.value }))}
                  placeholder="Ej: mañanas, esta semana, jueves tarde…"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 9, fontSize: 14, color: C.ink, outline: 'none', fontFamily: 'inherit' }}
                />
              </div>

              {err && (
                <div style={{ fontSize: 13, color: C.red, padding: '8px 12px', background: `${C.red}10`, borderRadius: 7 }}>{err}</div>
              )}

              <button
                onClick={enviar}
                disabled={sending}
                style={{ background: sending ? C.rule : C.red, color: sending ? C.ink4 : '#fff', border: 'none', borderRadius: 10, padding: '15px', fontSize: 16, fontWeight: 600, cursor: sending ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'opacity .15s' }}
              >
                {sending ? 'Enviando…' : tipo === 'presencial' ? 'Quedar en el local →' : 'Que me llamen →'}
              </button>
            </div>
          ) : (
            <div style={{ padding: '32px 28px', background: `${C.green}10`, border: `1.5px solid ${C.green}40`, borderRadius: 14 }}>
              <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 24, color: C.green, marginBottom: 10 }}>
                ✓ Recibido
              </div>
              <p style={{ fontSize: 15, color: C.ink2, margin: 0, lineHeight: 1.6 }}>
                {tipo === 'presencial'
                  ? `Perfecto. Me paso por ${ciudad} y lo vemos en persona. Te confirmo en menos de 24 horas.`
                  : 'Perfecto. Te llamo en menos de 24 horas para cuadrar un momento.'}
              </p>
            </div>
          )}
        </section>
      </div>

      {/* FOOTER */}
      <footer style={{ background: C.ink, padding: '24px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 18, fontWeight: 600, color: C.bg }}>
            ia<span style={{ color: C.red }}>.</span>rest
          </span>
          <div style={{ display: 'flex', gap: 20 }}>
            <a href="https://www.iarest.es" style={{ fontSize: 13, color: '#6B5F52', textDecoration: 'none' }}>www.iarest.es</a>
            <a href="mailto:hola@iarest.es" style={{ fontSize: 13, color: '#6B5F52', textDecoration: 'none' }}>hola@iarest.es</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
