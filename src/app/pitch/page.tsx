'use client'
import { useState } from 'react'

const C = {
  bg:    '#14110E',
  bg2:   '#1C1814',
  bg3:   '#221E1A',
  red:   '#D9442B',
  redD:  '#A8311E',
  paper: '#F6F1E7',
  cream: '#EDE8DC',
  ink3:  '#9C8E7E',
  ink4:  '#6B5F52',
  gold:  '#C9A84C',
  green: '#3F7D44',
  teal:  '#2B6A6E',
  amber: '#E8A33B',
}
const SE = 'Newsreader, Georgia, serif'
const SN = 'Inter Tight, system-ui, sans-serif'
const SM = 'Inter Tight, system-ui, sans-serif'

type Slide = 'intro' | 'dolor' | 'su_cocina' | 'modulos' | 'stock' | 'integracion' | 'piloto'

const SLIDES: { id: Slide; label: string }[] = [
  { id: 'intro',      label: 'Inicio'       },
  { id: 'dolor',      label: 'El problema'  },
  { id: 'su_cocina',  label: 'Vuestra cocina' },
  { id: 'modulos',    label: 'Módulos'      },
  { id: 'stock',      label: 'Los 8M€'      },
  { id: 'integracion',label: 'Integración'  },
  { id: 'piloto',     label: 'Piloto'       },
]

const MODULOS = [
  {
    emoji: '✦',
    titulo: 'Asistente IA en cocina',
    sub: 'El jefe pregunta. La IA responde.',
    desc: 'El jefe de cocina habla o escribe en lenguaje natural y obtiene respuestas en tiempo real sobre las comandas activas.',
    ejemplos: ['¿Cuántos solomillos pendientes?', '¿La mesa 4 tiene alérgicos?', '¿Qué lleva más tiempo sin salir?'],
    ruta: '/kds',
    color: C.teal,
    roi: 'Elimina las carreras de sala a cocina para preguntar',
  },
  {
    emoji: '⭐',
    titulo: 'Análisis de carta',
    sub: 'Qué se vende, qué no, y por qué.',
    desc: 'Clasifica cada plato automáticamente: estrella, vaca, interrogante o perro. Alertas cuando un plato lleva semanas sin venderse.',
    ejemplos: ['Vodka: 0 ventas en 30 días', 'Secreto ibérico: 80% margen, pocas ventas — empújalo', 'Patatas bravas: estrella, 65% margen'],
    ruta: '/owner → Carta → Análisis',
    color: C.gold,
    roi: 'Toma decisiones de carta con datos reales, no intuición',
  },
  {
    emoji: '📦',
    titulo: 'Recepción de mercancía',
    sub: '700 albaranes al mes. €0 de coste.',
    desc: 'Lista pre-cargada desde el pedido enviado. El recepcionista toca ✅ por cada artículo. Stock actualizado en 30 segundos.',
    ejemplos: ['Pre-carga desde pedido enviado al proveedor', 'Detecta mermas y precios diferentes', 'Registra fecha de caducidad automáticamente'],
    ruta: '/owner → Almacén → 📦 Recibir',
    color: C.green,
    roi: '700 albaranes × €0,30 = €210/mes ahorrados por restaurante',
  },
  {
    emoji: '🍷',
    titulo: 'Bodega inteligente',
    sub: 'La bodega que nadie vende, vendida.',
    desc: 'Foto de botella → ficha completa. 3 preguntas al cliente → recomendación de maridaje personalizada. Stock descontado al vender.',
    ejemplos: ['¿Quiero algo fresco y blanco para mariscos?', 'Pazo Señorans Albariño · Rías Baixas · 8-10°C', 'Stock actualizado automáticamente'],
    ruta: '/owner → Carta → Almacén',
    color: '#8B4E9E',
    roi: 'Aumenta la venta de vinos sin formar al camarero',
  },
  {
    emoji: '📅',
    titulo: 'Eventos IA + Previsión',
    sub: 'La Feria se acerca. ¿Estás listo?',
    desc: 'Detecta eventos en la ciudad con 30 días de antelación y cruza con el historial del restaurante para recomendar personal y stock.',
    ejemplos: ['Feria de Abril en 4 días — semana pasada vendiste 40% más cerveza', 'Concierto en el Pabellón — refuerza terraza', 'Calor extremo mañana — prepara bebidas frías'],
    ruta: '/owner → IA → Eventos',
    color: C.amber,
    roi: 'Reduce el sobrestock y el infrastock antes de que ocurran',
  },
  {
    emoji: '👥',
    titulo: 'RRHH centralizado',
    sub: 'Selección de personal para el grupo.',
    desc: 'Candidato sube CV → IA lo analiza → score 0-100 + recomendación. Un panel para los 50 locales del grupo.',
    ejemplos: ['Silvia Moreno · Jefe de sala · Score 91/100 · Contratar', 'Carlos Vega · Cocina · Score 67 · Segunda entrevista', 'Iván Torres · Barra · Score 31 · Descartar'],
    ruta: '/owner → Sala → Candidatos',
    color: C.teal,
    roi: 'Criterios de selección homogéneos en todo el grupo',
  },
]

function NavDot({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} title={label} style={{
      width: active ? 24 : 8, height: 8, borderRadius: 4,
      background: active ? C.red : C.ink4,
      border: 'none', cursor: 'pointer', padding: 0,
      transition: 'all .25s', flexShrink: 0,
    }} />
  )
}

export default function PitchPage() {
  const [slide, setSlide] = useState<Slide>('intro')
  const [moduloIdx, setModuloIdx] = useState(0)

  const slideIdx = SLIDES.findIndex(s => s.id === slide)
  const prev = () => { if (slideIdx > 0) setSlide(SLIDES[slideIdx - 1].id) }
  const next = () => { if (slideIdx < SLIDES.length - 1) setSlide(SLIDES[slideIdx + 1].id) }

  return (
    <div style={{
      minHeight: '100dvh', background: C.bg, color: C.paper,
      fontFamily: SN, display: 'flex', flexDirection: 'column',
    }}>
      {/* Nav superior */}
      <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid #ffffff0d` }}>
        <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.paper, letterSpacing: '-.01em' }}>
          ia<span style={{ color: C.red }}>.</span>rest
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {SLIDES.map(s => (
            <NavDot key={s.id} active={s.id === slide} onClick={() => setSlide(s.id)} label={s.label} />
          ))}
        </div>
        <div style={{ fontSize: 12, color: C.ink4, fontFamily: SM }}>
          {slideIdx + 1} / {SLIDES.length}
        </div>
      </div>

      {/* Contenido */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* SLIDE 1: INTRO */}
        {slide === 'intro' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px', textAlign: 'center', gap: 24 }}>
            <div style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, letterSpacing: '.16em', color: C.red, textTransform: 'uppercase' }}>
              Propuesta para Ovejas Negras · Batuta · Serendipia · Eslava
            </div>
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 'clamp(36px, 8vw, 64px)', lineHeight: 1.1, color: C.paper, maxWidth: 700 }}>
              El sistema que necesita tu operación
            </div>
            <div style={{ fontFamily: SN, fontSize: 16, color: C.ink3, maxWidth: 520, lineHeight: 1.6 }}>
              Voz. Cocina. Stock. RRHH. Previsión. Todo integrado.<br />
              Sin 40 herramientas diferentes.
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
              {['50 restaurantes', '8M€ en mercadería', '1.000 albaranes/mes', 'Alta rotación de personal'].map(tag => (
                <span key={tag} style={{ padding: '6px 16px', borderRadius: 20, border: `1px solid ${C.ink4}44`, fontSize: 13, color: C.ink3 }}>{tag}</span>
              ))}
            </div>
            <button onClick={next} style={{ marginTop: 16, padding: '14px 40px', background: C.red, color: '#fff', border: 'none', borderRadius: 8, fontFamily: SN, fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: '.02em' }}>
              Ver propuesta →
            </button>
          </div>
        )}

        {/* SLIDE 2: DOLORES */}
        {slide === 'dolor' && (
          <div style={{ flex: 1, padding: '32px 24px', maxWidth: 720, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 28, color: C.paper, marginBottom: 4 }}>
              Lo que dijiste el 20 de mayo
            </div>
            <div style={{ fontSize: 12, color: C.ink4, marginBottom: 8 }}>Reunión en Espacio Eslava · Ricardo Fernández</div>
            {[
              { cita: '"No sabemos dónde va el solomillo de cerdo."', modulo: 'Asistente IA cocina', color: C.teal },
              { cita: '"Una desviación del 1% en 8 millones de euros. La dejancia pura."', modulo: 'Recepción mercancía', color: C.green },
              { cita: '"No nos da tiempo a estudiar la carta. Compramos y compramos sin saber qué sale."', modulo: 'Análisis de carta', color: C.gold },
              { cita: '"Eslava tiene una bodega que nadie vende."', modulo: 'Bodega inteligente', color: '#8B4E9E' },
              { cita: '"Tenemos 40 herramientas y me cuesta creer que un sistema lo haga todo bien."', modulo: 'La integración', color: C.red },
            ].map((item, i) => (
              <div key={i} style={{ padding: '16px 20px', background: C.bg3, borderRadius: 12, borderLeft: `3px solid ${item.color}` }}>
                <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 15, color: C.cream, lineHeight: 1.5, marginBottom: 8 }}>
                  {item.cita}
                </div>
                <div style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, color: item.color, textTransform: 'uppercase', letterSpacing: '.1em' }}>
                  → {item.modulo}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SLIDE 3: SU COCINA — Vuestra operativa exacta */}
        {slide === 'su_cocina' && (
          <div style={{ flex:1, padding:'32px 24px', maxWidth:720, margin:'0 auto', width:'100%', display:'flex', flexDirection:'column', gap:20, overflowY:'auto' }}>
            <div>
              <div style={{ fontFamily:SM, fontSize:11, fontWeight:700, letterSpacing:'.16em', color:C.teal, textTransform:'uppercase', marginBottom:10 }}>Adaptado a vuestra operativa</div>
              <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:'clamp(26px,5vw,38px)', lineHeight:1.2, color:C.paper }}>
                50 mesas · 5 zonas · 3 partidas · 14 camareros
              </div>
              <div style={{ fontSize:14, color:C.ink3, marginTop:8 }}>No es un producto genérico. Esto es para vosotros.</div>
            </div>

            {/* Partidas */}
            <div style={{ background:C.bg3, borderRadius:12, padding:'18px' }}>
              <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink4, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:14 }}>Vuestras partidas → cada una con su pantalla y su impresora</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                {[
                  { nombre:'Cocina caliente', items:['Principales','Entrantes calientes'], color:'#D9442B', icon:'🔥' },
                  { nombre:'Cocina fría',     items:['Ensaladas','Entrantes fríos','Postres'], color:C.teal, icon:'❄️' },
                  { nombre:'Barra',           items:['Bebidas','Cafés','Copas'], color:C.gold, icon:'🍺' },
                ].map(p => (
                  <div key={p.nombre} style={{ background:C.bg2, borderRadius:8, padding:'12px', borderTop:`3px solid ${p.color}` }}>
                    <div style={{ fontSize:20, marginBottom:6 }}>{p.icon}</div>
                    <div style={{ fontFamily:SN, fontSize:13, fontWeight:700, color:C.paper, marginBottom:8 }}>{p.nombre}</div>
                    {p.items.map(it => (
                      <div key={it} style={{ fontSize:11, color:C.ink3, marginBottom:3 }}>· {it}</div>
                    ))}
                    <div style={{ marginTop:10, padding:'4px 8px', background:`${p.color}22`, borderRadius:4, fontSize:10, color:p.color, fontWeight:700 }}>
                      1 pantalla KDS + 1 impresora
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cómo funciona el flujo */}
            <div style={{ background:C.bg3, borderRadius:12, padding:'18px' }}>
              <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink4, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:14 }}>El flujo de una comanda en vuestra cocina</div>
              {[
                { actor:'Camarero', accion:'Dice la comanda por voz en sala', icon:'🎙️', color:C.paper },
                { actor:'ia.rest', accion:'Detecta qué va a cada partida automáticamente', icon:'✦', color:C.red },
                { actor:'Cocina caliente', accion:'Ve solo sus platos en su pantalla (vista Producción)', icon:'🔥', color:'#D9442B' },
                { actor:'Barra', accion:'Ve solo sus bebidas en su pantalla simultáneamente', icon:'🍺', color:C.gold },
                { actor:'Jefe de cocina', accion:'Pregunta al asistente IA: "¿Cuántos solomillos pendientes?"', icon:'✦', color:C.teal },
                { actor:'Marcha', accion:'Cuando todo está listo → imprime ticket de pase automático', icon:'🖨️', color:C.green },
              ].map((paso, i) => (
                <div key={i} style={{ display:'flex', gap:12, marginBottom: i < 5 ? 10 : 0, alignItems:'flex-start' }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                    <div style={{ width:26, height:26, borderRadius:'50%', background:C.bg2, border:`1px solid ${paso.color}55`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>{paso.icon}</div>
                    {i < 5 && <div style={{ width:1, height:16, background:`${C.ink4}44`, marginTop:3 }} />}
                  </div>
                  <div style={{ paddingTop:2 }}>
                    <span style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:paso.color, textTransform:'uppercase', letterSpacing:'.06em' }}>{paso.actor}</span>
                    <div style={{ fontSize:13, color:C.cream, marginTop:2 }}>{paso.accion}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* 50% en papel → solución */}
            <div style={{ padding:'16px 18px', background:`${C.amber}15`, border:`1px solid ${C.amber}33`, borderRadius:10 }}>
              <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:C.amber, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8 }}>Para los locales que todavía van a papel</div>
              <div style={{ fontSize:14, color:C.cream, lineHeight:1.55 }}>
                No hace falta pantalla. Una impresora térmica en cada partida (desde 80€) recibe el ticket automáticamente cuando el camarero dicta la comanda. El papel desaparece solo.
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 4: MÓDULOS */}
        {slide === 'modulos' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Tabs módulos */}
            <div style={{ display: 'flex', overflowX: 'auto', padding: '12px 16px 0', gap: 4, scrollbarWidth: 'none', borderBottom: `1px solid #ffffff0d` }}>
              {MODULOS.map((m, i) => (
                <button key={i} onClick={() => setModuloIdx(i)} style={{
                  padding: '8px 14px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer',
                  background: moduloIdx === i ? C.bg3 : 'transparent',
                  color: moduloIdx === i ? C.paper : C.ink4,
                  fontFamily: SN, fontSize: 12, fontWeight: moduloIdx === i ? 700 : 400,
                  whiteSpace: 'nowrap', flexShrink: 0,
                  borderBottom: moduloIdx === i ? `2px solid ${MODULOS[i].color}` : '2px solid transparent',
                }}>{m.emoji} {m.titulo.split(' ')[0]}</button>
              ))}
            </div>
            {/* Contenido módulo */}
            <div style={{ flex: 1, padding: '28px 24px', maxWidth: 680, margin: '0 auto', width: '100%', overflowY: 'auto' }}>
              {(() => {
                const m = MODULOS[moduloIdx]
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>{m.emoji}</div>
                      <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 30, color: C.paper, lineHeight: 1.2, marginBottom: 6 }}>{m.titulo}</div>
                      <div style={{ fontSize: 16, color: m.color, fontWeight: 600 }}>{m.sub}</div>
                    </div>
                    <div style={{ fontSize: 15, color: C.ink3, lineHeight: 1.65 }}>{m.desc}</div>
                    <div style={{ background: C.bg3, borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, color: C.ink4, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Ejemplos reales</div>
                      {m.ejemplos.map((e, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <span style={{ color: m.color, flexShrink: 0, marginTop: 2 }}>›</span>
                          <span style={{ fontSize: 14, color: C.cream, lineHeight: 1.4 }}>{e}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ padding: '12px 16px', background: `${m.color}18`, borderRadius: 8, border: `1px solid ${m.color}33` }}>
                      <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, color: m.color, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>ROI</div>
                      <div style={{ fontSize: 14, color: C.cream }}>{m.roi}</div>
                    </div>
                    <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>Disponible en: {m.ruta}</div>
                    {/* Siguiente módulo */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                      {moduloIdx > 0 && (
                        <button onClick={() => setModuloIdx(i => i - 1)} style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${C.ink4}44`, borderRadius: 6, color: C.ink3, fontFamily: SN, fontSize: 13, cursor: 'pointer' }}>
                          ← {MODULOS[moduloIdx - 1].titulo.split(' ')[0]}
                        </button>
                      )}
                      {moduloIdx < MODULOS.length - 1 && (
                        <button onClick={() => setModuloIdx(i => i + 1)} style={{ marginLeft: 'auto', padding: '8px 16px', background: m.color, border: 'none', borderRadius: 6, color: '#fff', fontFamily: SN, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                          {MODULOS[moduloIdx + 1].titulo.split(' ')[0]} →
                        </button>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* SLIDE 4: LOS 8M€ */}
        {slide === 'stock' && (
          <div style={{ flex: 1, padding: '32px 24px', maxWidth: 720, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto' }}>
            <div>
              <div style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, letterSpacing: '.16em', color: C.green, textTransform: 'uppercase', marginBottom: 10 }}>El dato que lo cambia todo</div>
              <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 'clamp(28px, 6vw, 44px)', lineHeight: 1.2, color: C.paper }}>
                8.000.000 € en mercadería.<br />
                <span style={{ color: C.amber }}>1% de desviación = 80.000€ perdidos.</span>
              </div>
              <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 16, color: C.ink3, marginTop: 8 }}>"La dejancia pura." — Ricardo Fernández</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { titulo: 'Hoy', items: ['Recepción manual', 'Sin cruce pedido vs recibido', 'Caducidades a ojo', '€0,30 por albarán digitalizar', 'Sin historial de precios proveedor'] },
                { titulo: 'Con ia.rest', items: ['Lista pre-cargada desde pedido', 'Checklist ✅/⬇️/💰/❓ por artículo', 'Caducidad extraída automáticamente', '€0 por albarán — incluido', 'Detecta subidas de precio proveedor'] },
              ].map(col => (
                <div key={col.titulo} style={{ background: C.bg3, borderRadius: 12, padding: '16px' }}>
                  <div style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, color: col.titulo === 'Hoy' ? C.ink4 : C.green, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>{col.titulo}</div>
                  {col.items.map((it, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                      <span style={{ color: col.titulo === 'Hoy' ? '#FF6B6B' : C.green, flexShrink: 0 }}>{col.titulo === 'Hoy' ? '✗' : '✓'}</span>
                      <span style={{ fontSize: 13, color: col.titulo === 'Hoy' ? C.ink3 : C.cream, lineHeight: 1.4 }}>{it}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div style={{ background: `${C.green}18`, border: `1px solid ${C.green}44`, borderRadius: 12, padding: '20px' }}>
              <div style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>El dato estratégico a largo plazo</div>
              {[
                ['Central de compras', 'Con el volumen de 50 restaurantes, negociar descuentos con proveedores. 2% sobre 8M€ = 160.000€/año.'],
                ['Inteligencia de precios', 'Detección temprana de subidas. "Tus 10 restaurantes pagan 23% más de jamón que los otros 40 del grupo."'],
                ['Benchmarking sectorial', 'Datos agregados anónimos de todos tus locales. Nadie en el sector tiene esto.'],
              ].map(([t, d]) => (
                <div key={t as string} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.paper, marginBottom: 3 }}>{t}</div>
                  <div style={{ fontSize: 13, color: C.ink3, lineHeight: 1.5 }}>{d}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SLIDE 5: LA INTEGRACIÓN */}
        {slide === 'integracion' && (
          <div style={{ flex: 1, padding: '32px 24px', maxWidth: 720, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto' }}>
            <div>
              <div style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, letterSpacing: '.16em', color: C.red, textTransform: 'uppercase', marginBottom: 10 }}>La objeción de Ricardo, respondida</div>
              <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: C.ink3, lineHeight: 1.4, marginBottom: 16, padding: '16px 20px', background: C.bg3, borderRadius: 10, borderLeft: `3px solid ${C.ink4}` }}>
                "Me cuesta creer que un sistema aúne todo Y que todo esté bien hecho."
              </div>
              <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: C.paper, lineHeight: 1.4 }}>
                No somos mejor que cada especialista.<br />
                <span style={{ color: C.red }}>Somos lo que ninguno puede darte solo: la integración.</span>
              </div>
            </div>
            {/* Cadena de valor */}
            <div style={{ background: C.bg3, borderRadius: 12, padding: '20px', overflow: 'hidden' }}>
              <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, color: C.ink4, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 16 }}>Una cadena que ningún especialista puede hacer solo</div>
              {[
                { paso: 'El albarán llega', next: 'OCR lo lee → stock actualizado' },
                { paso: 'Stock a 0 de un producto', next: 'Desaparece de la carta automáticamente' },
                { paso: 'Cocina no recibe comanda', next: 'Jefe de cocina pregunta: "¿Qué hay disponible?"' },
                { paso: 'Asistente IA responde', next: 'Análisis detecta que ese plato no se vendía de todas formas' },
                { paso: 'Eventos IA avisa', next: '"Esta semana hay feria — tampoco hace falta reponer"' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: i < 4 ? 12 : 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.red, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SM, fontSize: 12, fontWeight: 700, color: '#fff' }}>{i + 1}</div>
                    {i < 4 && <div style={{ width: 2, height: 24, background: `${C.red}44`, marginTop: 4 }} />}
                  </div>
                  <div style={{ paddingTop: 4 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.paper }}>{item.paso}</div>
                    <div style={{ fontSize: 13, color: C.ink3, marginTop: 2 }}>→ {item.next}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '16px 20px', background: `${C.red}15`, border: `1px solid ${C.red}33`, borderRadius: 10 }}>
              <div style={{ fontSize: 15, color: C.paper, fontFamily: SE, fontStyle: 'italic', lineHeight: 1.5 }}>
                "Eso no lo puede hacer ningún programa especializado. Lo tienes con ia.rest."
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 6: PILOTO */}
        {slide === 'piloto' && (
          <div style={{ flex: 1, padding: '32px 24px', maxWidth: 720, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto' }}>
            <div>
              <div style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, letterSpacing: '.16em', color: C.red, textTransform: 'uppercase', marginBottom: 10 }}>Sin riesgo. Sin compromiso.</div>
              <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 'clamp(28px, 6vw, 42px)', lineHeight: 1.2, color: C.paper }}>
                Elegid el local más pequeño. En una semana lo configuramos.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { fase: 'Semana 1–2', color: C.red, items: ['Configuración del local piloto (10 pasos, sin técnico)', 'Comandas por voz + KDS activos', 'OCR albaranes funcionando', 'Recepción mercancía operativa'] },
                { fase: 'Semana 2–4', color: C.amber, items: ['Análisis de carta con datos reales', 'Asistente IA cocina en uso', 'Vinos con maridaje IA', 'Alertas de stock automáticas'] },
                { fase: 'Mes 2+', color: C.green, items: ['RRHH centralizado para el grupo', 'Previsión demanda por eventos', 'Datos para proponer expansión al grupo', 'Negociación volumen con proveedores'] },
              ].map(f => (
                <div key={f.fase} style={{ background: C.bg3, borderRadius: 10, padding: '16px 18px', borderLeft: `3px solid ${f.color}` }}>
                  <div style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, color: f.color, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10 }}>{f.fase}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                    {f.items.map(it => (
                      <div key={it} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{ color: f.color, flexShrink: 0 }}>✓</span>
                        <span style={{ fontSize: 13, color: C.cream, lineHeight: 1.4 }}>{it}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: C.bg3, borderRadius: 12, padding: '20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, color: C.ink4, textTransform: 'uppercase', letterSpacing: '.1em' }}>Precio — modelo por usuario</div>
              <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 28, color: C.paper }}>
                59€ base <span style={{ fontSize: 18, color: C.ink3 }}>+ 20€/usuario</span>
              </div>
              <div style={{ fontSize: 13, color: C.ink3, lineHeight: 1.5 }}>Cuentan: camareros, cocina, jefes de sala. El propietario no cuenta. Trial 14 días sin tarjeta. Sin permanencia.</div>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <a href="/login?t=62d3124f5185d326ba0e5632" style={{ flex: 1, padding: '14px', background: C.red, color: '#fff', border: 'none', borderRadius: 8, fontFamily: SN, fontSize: 14, fontWeight: 700, cursor: 'pointer', textAlign: 'center', textDecoration: 'none', minWidth: 160 }}>
                Ver demo en vivo →
              </a>
              <a href="mailto:alberto.suarez.gutierrez@gmail.com?subject=Piloto ia.rest — Ovejas Negras" style={{ flex: 1, padding: '14px', background: 'transparent', color: C.paper, border: `1px solid ${C.ink4}66`, borderRadius: 8, fontFamily: SN, fontSize: 14, cursor: 'pointer', textAlign: 'center', textDecoration: 'none', minWidth: 160 }}>
                Contactar
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Navegación inferior */}
      <div style={{ padding: '16px 24px', borderTop: `1px solid #ffffff0d`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={prev} disabled={slideIdx === 0} style={{
          padding: '10px 20px', background: 'transparent', border: `1px solid ${C.ink4}44`,
          borderRadius: 8, color: slideIdx === 0 ? C.ink4 : C.paper, fontFamily: SN, fontSize: 14,
          cursor: slideIdx === 0 ? 'default' : 'pointer', opacity: slideIdx === 0 ? .4 : 1,
        }}>← Anterior</button>

        <span style={{ fontFamily: SM, fontSize: 12, color: C.ink4 }}>{SLIDES[slideIdx].label}</span>

        <button onClick={next} disabled={slideIdx === SLIDES.length - 1} style={{
          padding: '10px 20px', background: slideIdx === SLIDES.length - 1 ? 'transparent' : C.red,
          border: slideIdx === SLIDES.length - 1 ? `1px solid ${C.ink4}44` : 'none',
          borderRadius: 8, color: slideIdx === SLIDES.length - 1 ? C.ink4 : '#fff',
          fontFamily: SN, fontSize: 14, fontWeight: 700,
          cursor: slideIdx === SLIDES.length - 1 ? 'default' : 'pointer',
          opacity: slideIdx === SLIDES.length - 1 ? .4 : 1,
        }}>Siguiente →</button>
      </div>
    </div>
  )
}
