'use client'
import React, { useState, useEffect } from 'react'

// ── Módulos disponibles con descripción para la propuesta ─────────────────────
const MODULOS_INFO: Record<string, { emoji: string; titulo: string; descripcion: string; beneficio: string }> = {
  voz:           { emoji: '🎙', titulo: 'Comandas por voz', descripcion: 'El camarero habla, el sistema gestiona. Sin papel, sin errores, sin retrasos.', beneficio: 'Cero comandas mal apuntadas' },
  kds:           { emoji: '📺', titulo: 'Cocina digital', descripcion: 'El KDS muestra los platos en tiempo real. La cocina sabe exactamente qué preparar y en qué orden.', beneficio: 'Cocina sincronizada con sala' },
  almacen:       { emoji: '📦', titulo: 'Almacén y costes', descripcion: 'Stock real, escandallos automáticos, alertas de reposición. Sabe cuánto gastas en cada plato.', beneficio: 'Control total del food cost' },
  contabilidad:  { emoji: '📊', titulo: 'Contabilidad integrada', descripcion: 'Cierre diario automático, IVA 303, exportación A3/Sage. Sin depender del gestor para lo básico.', beneficio: 'Menos facturas del gestor' },
  qr:            { emoji: '📱', titulo: 'QR en mesa', descripcion: 'El cliente escanea, pide desde su móvil y la cocina lo recibe. Sin esperar camarero.', beneficio: 'Más rotación, menos personal' },
  storefront:    { emoji: '🛵', titulo: 'Tienda online', descripcion: 'Delivery y recogida propios, sin comisión de terceros. Tu tienda, tus clientes.', beneficio: 'Sin comisión a Glovo' },
  analytics:     { emoji: '📈', titulo: 'Analytics e IA', descripcion: 'Ventas por hora, plato y camarero. El forecaster predice lo que vas a necesitar la próxima semana.', beneficio: 'Decisiones con datos reales' },
  multi_local:   { emoji: '🏢', titulo: 'Multi-local', descripcion: 'Todos tus locales desde un panel. Stock central, analytics comparativos, gestión de compras grupales.', beneficio: 'Un panel para todo el grupo' },
  eventos:       { emoji: '🎉', titulo: 'Eventos y catering', descripcion: 'Presupuestos, reserva de espacios, check-in QR y coordinación de personal para eventos.', beneficio: 'Eventos sin caos logístico' },
  vinos:         { emoji: '🍷', titulo: 'Carta de vinos', descripcion: 'Sommelier IA que sugiere maridajes, control de botellas y copas, gestión de consignación.', beneficio: 'Vende más vino, desperdicia menos' },
  bridge:        { emoji: '🖨', titulo: 'Impresoras integradas', descripcion: 'Compatible con cualquier impresora ESC/POS. Sin cambiar hardware, sin instalaciones complejas.', beneficio: 'Tu impresora sigue funcionando' },
  rrhh:          { emoji: '👥', titulo: 'RRHH y fichaje', descripcion: 'Fichaje digital con GPS, nóminas básicas, selección de personal con análisis IA de CVs.', beneficio: 'Cumplimiento RD-ley 8/2019' },
}

// ── Colores (fondo crema — versión pública/marketing) ─────────────────────────
const C = {
  bg:    '#F6F1E7',
  bg2:   '#EDE8DC',
  bg3:   '#E4DDD0',
  ink:   '#1A1714',
  ink2:  '#3D3530',
  ink3:  '#6B5F52',
  ink4:  '#9C8E7E',
  red:   '#D9442B',
  green: '#3F7D44',
  amber: '#E8A33B',
  rule:  '#D0C8B8',
  white: '#FFFFFF',
}

interface Estudio {
  resumen_negocio?: string
  argumento_principal?: string
  pain_points?: string[]
  oportunidades?: string[]
  modulos_criticos?: string[]
  modulos_secundarios?: string[]
  mrr_estimado?: number
  ahorro_mensual_estimado?: number
  num_locales_estimado?: number
  tpv_actual?: string
  coste_tpv_actual_mes?: number
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

export default function PropuestaDinamica({ lead, slug }: { lead: LeadData; slug: string }) {
  const empresa = lead.empresa || lead.restaurante || lead.nombre || 'Tu restaurante'
  const estudio = lead.estudio_completo as Estudio | null
  const ciudad = lead.ciudad || (estudio as Record<string, unknown>)?.ciudad as string || 'tu ciudad'

  const modulosCriticos = estudio?.modulos_criticos || (lead.modulos_recomendados || []).slice(0, 3)
  const modulosSecundarios = estudio?.modulos_secundarios || (lead.modulos_recomendados || []).slice(3)
  const painPoints = estudio?.pain_points || lead.pain_points || []

  // Trackear visita
  useEffect(() => {
    fetch(`/api/propuesta/${slug}/booking`, { method: 'PATCH' }).catch(() => {})
  }, [slug])

  // ── Booking form ────────────────────────────────────────────────────────────
  const [showBooking, setShowBooking] = useState(false)
  const [form, setForm] = useState({ nombre: '', email: '', fecha: '', hora: '11:00', lugar: `${empresa}, ${ciudad}`, notas: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')

  const horas = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00']

  // Fecha mínima = mañana
  const fechaMin = new Date()
  fechaMin.setDate(fechaMin.getDate() + 1)
  const fechaMinStr = fechaMin.toISOString().split('T')[0]

  const enviarBooking = async () => {
    if (!form.nombre || !form.fecha || !form.hora || !form.lugar) {
      setErr('Por favor rellena nombre, fecha, hora y lugar.')
      return
    }
    setSending(true); setErr('')
    try {
      const r = await fetch(`/api/propuesta/${slug}/booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <header style={{ background: C.ink, padding: '0 24px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '18px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 22, fontWeight: 600, color: C.bg, letterSpacing: '-.02em' }}>
            ia.rest
          </span>
          <span style={{ fontSize: 12, color: '#9C8E7E', fontWeight: 500, letterSpacing: '.06em' }}>
            PROPUESTA PERSONALIZADA
          </span>
        </div>
      </header>

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section style={{ background: C.ink, padding: '52px 24px 64px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: C.red, textTransform: 'uppercase', marginBottom: 20 }}>
            PREPARADA ESPECÍFICAMENTE PARA
          </div>
          <h1 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 48, fontWeight: 500, color: C.bg, margin: '0 0 20px', lineHeight: 1.1, letterSpacing: '-.02em' }}>
            {empresa}
          </h1>
          {estudio?.argumento_principal && (
            <p style={{ fontSize: 18, color: '#D8CDB6', lineHeight: 1.6, margin: '0 0 32px', maxWidth: 560 }}>
              {estudio.argumento_principal}
            </p>
          )}
          {estudio?.resumen_negocio && (
            <p style={{ fontSize: 14, color: '#9C8E7E', lineHeight: 1.7, margin: '0', fontStyle: 'italic', maxWidth: 520 }}>
              {estudio.resumen_negocio}
            </p>
          )}
        </div>
      </section>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 24px' }}>

        {/* ── PAIN POINTS ───────────────────────────────────────────────── */}
        {painPoints.length > 0 && (
          <section style={{ margin: '52px 0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: C.ink4, textTransform: 'uppercase', marginBottom: 20 }}>
              LO QUE HEMOS DETECTADO
            </div>
            <h2 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 30, fontWeight: 500, color: C.ink, margin: '0 0 28px', lineHeight: 1.2 }}>
              Dónde se pierde dinero hoy
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {painPoints.map((pp, i) => (
                <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '16px 20px', background: C.white, border: `1px solid ${C.rule}`, borderRadius: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${C.red}15`, border: `1px solid ${C.red}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <span style={{ color: C.red, fontSize: 13, fontWeight: 700 }}>✕</span>
                  </div>
                  <span style={{ fontSize: 15, color: C.ink2, lineHeight: 1.5 }}>{pp}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── MÓDULOS CRÍTICOS ──────────────────────────────────────────── */}
        {modulosCriticos.length > 0 && (
          <section style={{ margin: '52px 0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: C.ink4, textTransform: 'uppercase', marginBottom: 20 }}>
              LA PROPUESTA
            </div>
            <h2 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 30, fontWeight: 500, color: C.ink, margin: '0 0 28px', lineHeight: 1.2 }}>
              Lo que activamos para vosotros
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {modulosCriticos.filter(m => MODULOS_INFO[m]).map((modulo) => {
                const info = MODULOS_INFO[modulo]
                return (
                  <div key={modulo} style={{ padding: '22px 24px', background: C.white, border: `1.5px solid ${C.red}25`, borderRadius: 12, display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: `${C.red}10`, border: `1px solid ${C.red}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                      {info.emoji}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: C.ink, marginBottom: 4 }}>{info.titulo}</div>
                      <div style={{ fontSize: 14, color: C.ink3, lineHeight: 1.5, marginBottom: 8 }}>{info.descripcion}</div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: `${C.green}12`, border: `1px solid ${C.green}30`, borderRadius: 6, padding: '3px 10px' }}>
                        <span style={{ color: C.green, fontSize: 12 }}>✓</span>
                        <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>{info.beneficio}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Módulos secundarios */}
            {modulosSecundarios.filter(m => MODULOS_INFO[m]).length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: C.ink4, marginBottom: 10, fontWeight: 500 }}>También incluye:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {modulosSecundarios.filter(m => MODULOS_INFO[m]).map(m => (
                    <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 20, fontSize: 13, color: C.ink3 }}>
                      <span>{MODULOS_INFO[m].emoji}</span>
                      <span>{MODULOS_INFO[m].titulo}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}



        {/* ── BOOKING ───────────────────────────────────────────────────── */}
        <section style={{ margin: '52px 0 80px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: C.ink4, textTransform: 'uppercase', marginBottom: 20 }}>
            SIGUIENTE PASO
          </div>
          <h2 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 30, fontWeight: 500, color: C.ink, margin: '0 0 12px', lineHeight: 1.2 }}>
            Te visito en tu local
          </h2>
          <p style={{ fontSize: 15, color: C.ink3, margin: '0 0 28px', lineHeight: 1.6 }}>
            Nada de demos de pantalla compartida. Voy a {ciudad}, te lo enseño en vivo y respondo todas las dudas en persona.
          </p>

          {!showBooking && !sent && (
            <button
              onClick={() => setShowBooking(true)}
              style={{ background: C.red, color: '#fff', border: 'none', borderRadius: 10, padding: '16px 32px', fontSize: 16, fontWeight: 600, cursor: 'pointer', letterSpacing: '.02em', transition: 'opacity .15s' }}
            >
              Concertar visita →
            </button>
          )}

          {sent && (
            <div style={{ padding: '28px 32px', background: `${C.green}12`, border: `1.5px solid ${C.green}40`, borderRadius: 12 }}>
              <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 22, color: C.green, marginBottom: 8 }}>
                ✓ Solicitud recibida
              </div>
              <p style={{ fontSize: 15, color: C.ink2, margin: 0, lineHeight: 1.6 }}>
                Perfecto. Te confirmo la visita en menos de 24 horas. Si necesitas cualquier cosa antes, escríbeme a{' '}
                <a href="mailto:hola@iarest.es" style={{ color: C.red, textDecoration: 'none', fontWeight: 600 }}>hola@iarest.es</a>.
              </p>
            </div>
          )}

          {showBooking && !sent && (
            <div style={{ background: C.white, border: `1px solid ${C.rule}`, borderRadius: 14, padding: '28px 28px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.ink4, letterSpacing: '.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Tu nombre *</label>
                  <input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                    placeholder="Nombre y apellido"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 8, fontSize: 14, color: C.ink, outline: 'none', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.ink4, letterSpacing: '.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Email</label>
                  <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    type="email" placeholder="tu@email.com"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 8, fontSize: 14, color: C.ink, outline: 'none', fontFamily: 'inherit' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.ink4, letterSpacing: '.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Fecha *</label>
                  <input value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))}
                    type="date" min={fechaMinStr}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 8, fontSize: 14, color: C.ink, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.ink4, letterSpacing: '.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Hora *</label>
                  <select value={form.hora} onChange={e => setForm(p => ({ ...p, hora: e.target.value }))}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 8, fontSize: 14, color: C.ink, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                    {horas.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.ink4, letterSpacing: '.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Lugar *</label>
                <input value={form.lugar} onChange={e => setForm(p => ({ ...p, lugar: e.target.value }))}
                  placeholder="Nombre y dirección del local"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 8, fontSize: 14, color: C.ink, outline: 'none', fontFamily: 'inherit' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.ink4, letterSpacing: '.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Notas (opcional)</label>
                <textarea value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
                  placeholder="¿Algo concreto que quieras que veamos?"
                  rows={2}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 8, fontSize: 14, color: C.ink, outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
              </div>
              {err && <div style={{ fontSize: 13, color: C.red, padding: '8px 12px', background: `${C.red}10`, borderRadius: 7 }}>{err}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={enviarBooking} disabled={sending}
                  style={{ flex: 1, background: sending ? C.rule : C.red, color: sending ? C.ink4 : '#fff', border: 'none', borderRadius: 9, padding: '13px', fontSize: 15, fontWeight: 600, cursor: sending ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                  {sending ? 'Enviando…' : 'Confirmar visita'}
                </button>
                <button onClick={() => setShowBooking(false)}
                  style={{ background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 9, padding: '13px 18px', fontSize: 14, color: C.ink3, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer style={{ background: C.ink, padding: '28px 24px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 18, fontWeight: 600, color: C.bg }}>ia.rest</span>
          <div style={{ display: 'flex', gap: 20 }}>
            <a href="https://www.iarest.es" style={{ fontSize: 13, color: '#6B5F52', textDecoration: 'none' }}>www.iarest.es</a>
            <a href="mailto:hola@iarest.es" style={{ fontSize: 13, color: '#6B5F52', textDecoration: 'none' }}>hola@iarest.es</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
