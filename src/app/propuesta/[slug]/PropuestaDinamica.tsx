'use client'
import React, { useState, useEffect } from 'react'

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

const MODULOS: Record<string, { emoji: string; titulo: string; golpe: string }> = {
  voz:          { emoji: '🎙', titulo: 'Comandas por voz',        golpe: 'El camarero habla. Cocina recibe. Sin papel, sin app, sin tocar nada. En menos de un segundo.' },
  kds:          { emoji: '📺', titulo: 'Pantalla de cocina',      golpe: 'Cada partida ve solo sus platos, en orden, con el tiempo que llevan esperando. Sin gritos ni tickets.' },
  almacen:      { emoji: '📦', titulo: 'Almacén y food cost',     golpe: 'Sabes cuánto te cuesta cada plato en tiempo real. Si sube el género, lo ves antes de que lo notes en caja.' },
  contabilidad: { emoji: '📊', titulo: 'Contabilidad integrada',  golpe: 'Cierre diario automático, IVA 303 listo para el gestor. Sin Excel, sin esperar fin de mes para saber qué pasó.' },
  qr:           { emoji: '📱', titulo: 'QR en mesa',              golpe: 'El cliente pide desde su móvil. La comanda llega a cocina directa. Más rotación, menos carga en sala.' },
  storefront:   { emoji: '🛵', titulo: 'Tienda online propia',    golpe: 'Delivery y recogida sin pagar comisión a nadie. Tu tienda, tus clientes, tu margen.' },
  analytics:    { emoji: '📈', titulo: 'Analytics',               golpe: 'Ventas por hora, por plato, por camarero. Sabes qué funciona y qué no — sin esperar el cierre del mes.' },
  multi_local:  { emoji: '🏢', titulo: 'Multi-local',             golpe: 'Todos tus locales desde un panel. Stock, ventas y personal en un solo sitio. Sin entrar y salir de sistemas.' },
  eventos:      { emoji: '🎉', titulo: 'Eventos y catering',      golpe: 'Presupuestos, reserva de espacios, check-in de personal y cierre de evento con un solo flujo.' },
  vinos:        { emoji: '🍷', titulo: 'Carta de vinos',          golpe: 'Sommelier IA que sugiere maridajes. Control de botellas y copas. El vino se vende solo.' },
  bridge:       { emoji: '🖨', titulo: 'Impresoras integradas',   golpe: 'Funciona con tu impresora actual. Sin cambiar hardware, sin instalaciones, sin técnico.' },
  rrhh:         { emoji: '👥', titulo: 'RRHH y fichaje',          golpe: 'Fichaje digital, control de horas, selección de personal con análisis de CVs por IA. Sin papel ni apps de pago.' },
}

interface Estudio {
  argumento_principal?: string
  pain_points?: string[]
  modulos_criticos?: string[]
  modulos_secundarios?: string[]
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
  const ciudad = lead.ciudad || 'tu ciudad'

  const argumento = estudio?.argumento_principal || ''
  const painPoints = (estudio?.pain_points || lead.pain_points || []).slice(0, 3)
  const modulosCriticos = (estudio?.modulos_criticos || (lead.modulos_recomendados || []).slice(0, 4)).filter((m: string) => MODULOS[m])
  const modulosExtra = (estudio?.modulos_secundarios || (lead.modulos_recomendados || []).slice(4)).filter((m: string) => MODULOS[m])

  useEffect(() => {
    fetch(`/api/propuesta/${slug}/booking`, { method: 'PATCH' }).catch(() => {})
  }, [slug])

  type TipoReunion = 'presencial' | 'telefonica'
  const [tipo, setTipo] = useState<TipoReunion>('presencial')
  const [form, setForm] = useState({ nombre: '', telefono: '', disponibilidad: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')

  const enviar = async () => {
    if (!form.nombre || !form.telefono) { setErr('Necesitamos tu nombre y teléfono.'); return }
    setSending(true); setErr('')
    try {
      const r = await fetch(`/api/propuesta/${slug}/booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre, telefono: form.telefono,
          tipo_reunion: tipo, disponibilidad: form.disponibilidad,
          fecha: new Date().toISOString().split('T')[0], hora: '11:00',
          lugar: tipo === 'presencial' ? `${empresa}, ${ciudad}` : 'Llamada telefónica',
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setSent(true)
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Error') }
    setSending(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter Tight', system-ui, sans-serif" }}>

      {/* HEADER */}
      <header style={{ background: C.ink, padding: '0 24px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 20, fontWeight: 600, color: C.bg, letterSpacing: '-.02em' }}>
            ia<span style={{ color: C.red }}>.</span>rest
          </span>
          <a href="https://www.iarest.es" target="_blank" rel="noreferrer"
            style={{ fontSize: 12, color: '#6B5F52', textDecoration: 'none', fontWeight: 500, letterSpacing: '.04em', border: '1px solid #2E2720', borderRadius: 6, padding: '5px 12px', transition: 'color .15s' }}>
            Ver web →
          </a>
        </div>
      </header>

      {/* HERO */}
      <section style={{ background: C.ink, padding: '56px 24px 72px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: C.red, textTransform: 'uppercase', marginBottom: 18 }}>
            Preparada para {empresa}
          </div>
          {argumento && (
            <h1 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 34, fontWeight: 400, color: C.bg, margin: '0 0 32px', lineHeight: 1.35, maxWidth: 580, letterSpacing: '-.01em' }}>
              {argumento}
            </h1>
          )}
          {painPoints.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {painPoints.map((pp, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <span style={{ color: C.red, fontWeight: 700, fontSize: 14, marginTop: 3, flexShrink: 0 }}>✕</span>
                  <span style={{ fontSize: 15, color: '#9C8E7E', lineHeight: 1.5 }}>{pp}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 24px' }}>

        {/* CÓMO FUNCIONA */}
        <section style={{ margin: '60px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: C.ink4, textTransform: 'uppercase', marginBottom: 8 }}>
            Cómo funciona
          </div>
          <h2 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 26, fontWeight: 400, color: C.ink, margin: '0 0 32px', lineHeight: 1.3 }}>
            Un servicio completo, sin tocar una pantalla
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 2 }}>
            {[
              { icon: '🎙', paso: '1', accion: 'El camarero dicta la comanda en voz alta' },
              { icon: '⚡', paso: '2', accion: 'ia.rest la interpreta en menos de 0,5 segundos' },
              { icon: '📺', paso: '3', accion: 'Cocina la recibe en su pantalla, ya ordenada' },
              { icon: '✓',  paso: '4', accion: 'Se cobra, se cierra y VeriFactu firma la factura solo' },
            ].map((s, i) => (
              <div key={i} style={{ background: i % 2 === 0 ? C.white : C.bg2, padding: '24px 20px', borderRadius: i === 0 ? '12px 0 0 12px' : i === 3 ? '0 12px 12px 0' : '0', border: `1px solid ${C.rule}`, borderLeft: i > 0 ? 'none' : undefined }}>
                <div style={{ fontSize: 24, marginBottom: 10 }}>{s.icon}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.red, letterSpacing: '.1em', marginBottom: 6 }}>PASO {s.paso}</div>
                <div style={{ fontSize: 13, color: C.ink2, lineHeight: 1.5 }}>{s.accion}</div>
              </div>
            ))}
          </div>
        </section>

        {/* MÓDULOS CLAVE */}
        {modulosCriticos.length > 0 && (
          <section style={{ margin: '60px 0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: C.ink4, textTransform: 'uppercase', marginBottom: 8 }}>
              Lo que activamos para vosotros
            </div>
            <h2 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 26, fontWeight: 400, color: C.ink, margin: '0 0 28px', lineHeight: 1.3 }}>
              Módulos seleccionados para {empresa}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {modulosCriticos.map((m: string, i: number) => {
                const mod = MODULOS[m]
                return (
                  <div key={m} style={{
                    display: 'flex', gap: 20, alignItems: 'flex-start',
                    padding: '22px 24px',
                    background: C.white,
                    borderRadius: i === 0 ? '12px 12px 0 0' : i === modulosCriticos.length - 1 ? '0 0 12px 12px' : '0',
                    border: `1px solid ${C.rule}`,
                    borderBottom: i === modulosCriticos.length - 1 ? undefined : 'none',
                  }}>
                    <div style={{ fontSize: 28, flexShrink: 0, width: 44, textAlign: 'center', paddingTop: 2 }}>{mod.emoji}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 5 }}>{mod.titulo}</div>
                      <div style={{ fontSize: 14, color: C.ink3, lineHeight: 1.6 }}>{mod.golpe}</div>
                    </div>
                    <div style={{ flexShrink: 0, width: 6, height: 6, borderRadius: '50%', background: C.green, marginTop: 8 }} />
                  </div>
                )
              })}
            </div>

            {/* Módulos extra — tags */}
            {modulosExtra.length > 0 && (
              <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: C.ink4, fontWeight: 500 }}>También incluye:</span>
                {modulosExtra.map((m: string) => (
                  <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 20, fontSize: 12, color: C.ink3 }}>
                    {MODULOS[m].emoji} {MODULOS[m].titulo}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {/* SEPARADOR WEB */}
        <div style={{ margin: '40px 0', padding: '24px 28px', background: C.ink, borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 14, color: C.bg, fontWeight: 600, marginBottom: 4 }}>¿Quieres ver más antes de quedar?</div>
            <div style={{ fontSize: 13, color: '#6B5F52' }}>En la web tienes demos, casos de uso y todo el detalle del producto.</div>
          </div>
          <a href="https://www.iarest.es" target="_blank" rel="noreferrer"
            style={{ background: 'transparent', color: C.bg, border: `1.5px solid #3D3530`, borderRadius: 9, padding: '10px 20px', fontSize: 14, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            www.iarest.es →
          </a>
        </div>

        {/* FORMULARIO */}
        <section style={{ margin: '60px 0 80px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: C.ink4, textTransform: 'uppercase', marginBottom: 8 }}>
            Siguiente paso
          </div>
          <h2 style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 26, fontWeight: 400, color: C.ink, margin: '0 0 28px', lineHeight: 1.3 }}>
            {sent ? '✓ Recibido' : 'Concertar una reunión'}
          </h2>

          {!sent ? (
            <div style={{ background: C.white, border: `1px solid ${C.rule}`, borderRadius: 14, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {(['presencial', 'telefonica'] as TipoReunion[]).map(t => (
                  <button key={t} onClick={() => setTipo(t)} style={{
                    padding: '16px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                    border: tipo === t ? `2px solid ${C.red}` : `1.5px solid ${C.rule}`,
                    background: tipo === t ? `${C.red}08` : C.bg,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, transition: 'all .15s',
                  }}>
                    <span style={{ fontSize: 24 }}>{t === 'presencial' ? '🤝' : '📞'}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: tipo === t ? C.red : C.ink2 }}>
                      {t === 'presencial' ? 'Presencial' : 'Por teléfono'}
                    </span>
                    <span style={{ fontSize: 11, color: C.ink4, textAlign: 'center' }}>
                      {t === 'presencial' ? `En tu local, ${ciudad}` : 'Te llamo yo cuando puedas'}
                    </span>
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.ink4, letterSpacing: '.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Nombre *</label>
                  <input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                    placeholder="Tu nombre"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 9, fontSize: 14, color: C.ink, outline: 'none', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: C.ink4, letterSpacing: '.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Teléfono *</label>
                  <input value={form.telefono} onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))}
                    placeholder="6XX XXX XXX" type="tel"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 9, fontSize: 14, color: C.ink, outline: 'none', fontFamily: 'inherit' }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.ink4, letterSpacing: '.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>¿Cuándo te va bien? (opcional)</label>
                <input value={form.disponibilidad} onChange={e => setForm(p => ({ ...p, disponibilidad: e.target.value }))}
                  placeholder="Ej: jueves tarde, esta semana, mañanas…"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 9, fontSize: 14, color: C.ink, outline: 'none', fontFamily: 'inherit' }} />
              </div>

              {err && <div style={{ fontSize: 13, color: C.red, padding: '8px 12px', background: `${C.red}10`, borderRadius: 7 }}>{err}</div>}

              <button onClick={enviar} disabled={sending} style={{
                background: sending ? C.rule : C.red, color: sending ? C.ink4 : '#fff',
                border: 'none', borderRadius: 10, padding: '15px', fontSize: 16, fontWeight: 600,
                cursor: sending ? 'default' : 'pointer', fontFamily: 'inherit',
              }}>
                {sending ? 'Enviando…' : tipo === 'presencial' ? 'Quedar en el local →' : 'Que me llamen →'}
              </button>
            </div>
          ) : (
            <div style={{ padding: '32px 28px', background: `${C.green}10`, border: `1.5px solid ${C.green}40`, borderRadius: 14 }}>
              <p style={{ fontSize: 16, color: C.ink2, margin: 0, lineHeight: 1.6 }}>
                {tipo === 'presencial'
                  ? `Perfecto. Me paso por ${ciudad} y lo vemos en persona. Te confirmo en menos de 24 horas.`
                  : 'Perfecto. Te llamo en menos de 24 horas para cuadrar un momento.'}
              </p>
            </div>
          )}
        </section>
      </div>

      {/* FOOTER */}
      <footer style={{ background: C.ink, padding: '28px 24px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
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
