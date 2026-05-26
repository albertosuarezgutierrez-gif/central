'use client'
import { useState } from 'react'

const C = {
  bg:'#14110E', bg2:'#1C1814', bg3:'#221E1A',
  red:'#D9442B', redD:'#A8311E',
  paper:'#F6F1E7', cream:'#EDE8DC',
  ink3:'#9C8E7E', ink4:'#6B5F52',
  gold:'#C9A84C', green:'#3F7D44',
  teal:'#2B6A6E', amber:'#E8A33B',
}
const SE = 'Newsreader, Georgia, serif'
const SN = 'Inter Tight, system-ui, sans-serif'
const SM = 'Inter Tight, system-ui, sans-serif'

// ─── Tipos ───────────────────────────────────────────────────
export type Partida = {
  nombre: string
  secciones: string[]
  color: string
  icon: string
}

export type PasoFlujo = {
  actor: string
  accion: string
  icon: string
  color: string
}

export type CitaDolor = {
  cita: string       // para leads con reunión: frase entre comillas
  modulo: string
  color: string
  pain?: string      // para leads sin reunión: título del pain point del sector
  detalle?: string   // para leads sin reunión: descripción del pain
}

export type ModuloCustom = {
  emoji: string
  titulo: string
  sub: string
  desc: string
  ejemplos: string[]
  ruta: string
  color: string
  roi: string
  activo?: boolean // false = ocultar de la demo de este cliente
}

export type DatoStock = {
  label: string
  valor: string
  descripcion: string
}

export type ClienteConfig = {
  // Identidad
  nombre: string                    // "Ovejas Negras"
  grupo: string                     // "Ovejas Negras · Batuta · Serendipia · Eslava"
  emailContacto: string
  contactoNombre: string            // "Ricardo Fernández"
  fechaReunion?: string             // "20 de mayo"
  lugarReunion?: string             // "Espacio Eslava"

  // Tags intro
  tagsIntro: string[]               // ["50 restaurantes", "8M€ en mercadería"...]

  // Dolor — citas reales
  citas: CitaDolor[]

  // Operativa real
  headline: string                  // "50 mesas · 5 zonas · 3 partidas · 14 camareros"
  partidas: Partida[]
  pasosFlujo: PasoFlujo[]
  sinKDSMensaje?: string            // mensaje para locales sin pantalla

  // Stock
  slideStockLabel: string           // "Los 8M€" | "El coste oculto" ...
  mercaderiaAnual: string           // "8.000.000 €"
  desviacion1pct: string            // "80.000 €"
  citaStock: string                 // "La dejancia pura."
  hoyVsIaRest: { hoy: string[]; iaRest: string[] }
  datosEstrategicos: { titulo: string; desc: string }[]

  // Módulos (personalizar cuáles mostrar y en qué orden)
  modulos: ModuloCustom[]

  // Objeción principal
  objecionPrincipal: string
  respuestaObjecion: string

  // Piloto
  fasePiloto: { fase: string; color: string; items: string[] }[]
  precioMensaje?: string            // texto adicional de precio si aplica
  slug?: string                     // slug del lead en BD para tracking y booking
  ciudad?: string                   // ciudad para el texto del booking
}

// ─── Módulos base reutilizables ──────────────────────────────
export const MODULO_ASISTENTE_COCINA = (custom?: Partial<ModuloCustom>): ModuloCustom => ({
  emoji: '✦',
  titulo: 'Asistente IA en cocina',
  sub: 'El jefe pregunta. La IA responde.',
  desc: 'El jefe de cocina habla o escribe en lenguaje natural y obtiene respuestas en tiempo real sobre las comandas activas.',
  ejemplos: ['¿Cuántos solomillos pendientes?', '¿La mesa 4 tiene alérgicos?', '¿Qué lleva más tiempo sin salir?'],
  ruta: '/kds → botón ✦',
  color: C.teal,
  roi: 'Elimina las carreras de sala a cocina para preguntar',
  ...custom,
})

export const MODULO_ANALISIS_CARTA = (custom?: Partial<ModuloCustom>): ModuloCustom => ({
  emoji: '⭐',
  titulo: 'Análisis de carta',
  sub: 'Qué se vende, qué no, y por qué.',
  desc: 'Clasifica cada plato en estrella, vaca, interrogante o perro. Alertas automáticas cuando un plato lleva semanas sin venderse.',
  ejemplos: ['Vodka: 0 ventas en 30 días', 'Croquetas: estrella, 65% margen', 'Secreto ibérico: buen margen, pocas ventas — empújalo'],
  ruta: '/owner → Carta → Análisis',
  color: C.gold,
  roi: 'Toma decisiones de carta con datos reales, no intuición',
  ...custom,
})

export const MODULO_RECEPCION = (custom?: Partial<ModuloCustom>): ModuloCustom => ({
  emoji: '📦',
  titulo: 'Recepción de mercancía',
  sub: 'Lista pre-cargada. €0 por albarán.',
  desc: 'Lista pre-cargada desde el pedido al proveedor. El recepcionista toca ✅ por cada artículo. Stock actualizado en 30 segundos.',
  ejemplos: ['Pre-carga desde pedido enviado', 'Detecta mermas y precios diferentes', 'Registra fecha de caducidad automáticamente'],
  ruta: '/owner → Almacén → 📦 Recibir',
  color: C.green,
  roi: 'Elimina el coste de digitalización de albaranes',
  ...custom,
})

export const MODULO_VINOS = (custom?: Partial<ModuloCustom>): ModuloCustom => ({
  emoji: '🍷',
  titulo: 'Bodega inteligente',
  sub: 'La bodega que nadie vende, vendida.',
  desc: 'Foto de botella → ficha completa. 3 preguntas al cliente → recomendación de maridaje. Stock descontado al vender.',
  ejemplos: ['¿Quiero algo fresco y blanco para mariscos?', 'Pazo Señorans Albariño · 8-10°C', 'Stock actualizado automáticamente'],
  ruta: '/owner → Carta → Almacén → Vinos',
  color: '#8B4E9E',
  roi: 'Aumenta la venta de vinos sin formar al camarero',
  ...custom,
})

export const MODULO_EVENTOS = (custom?: Partial<ModuloCustom>): ModuloCustom => ({
  emoji: '📅',
  titulo: 'Previsión de demanda',
  sub: 'Anticipa los picos. No los sufras.',
  desc: 'Detecta eventos en la ciudad con 30 días de antelación y cruza con el historial del restaurante. Recomienda personal y stock.',
  ejemplos: ['Feria en 4 días — la vez pasada vendiste 40% más cerveza', 'Concierto en el Pabellón — refuerza terraza', 'Calor extremo mañana — prepara bebidas frías'],
  ruta: '/owner → IA → Eventos',
  color: C.amber,
  roi: 'Reduce sobrestock e infrastock antes de que ocurran',
  ...custom,
})

export const MODULO_RRHH = (custom?: Partial<ModuloCustom>): ModuloCustom => ({
  emoji: '👥',
  titulo: 'RRHH centralizado',
  sub: 'Selección de personal para el grupo.',
  desc: 'Candidato sube CV → IA lo analiza → score 0-100 + recomendación. Un panel para todos los locales del grupo.',
  ejemplos: ['Silvia Moreno · Jefe de sala · Score 91 · Contratar', 'Carlos Vega · Cocina · Score 67 · Segunda entrevista', 'Iván Torres · Barra · Score 31 · Descartar'],
  ruta: '/owner → Sala → Candidatos',
  color: C.teal,
  roi: 'Criterios de selección homogéneos en todo el grupo',
  ...custom,
})

export const MODULO_DELIVERY = (custom?: Partial<ModuloCustom>): ModuloCustom => ({
  emoji: '🛵',
  titulo: 'Delivery integrado',
  sub: 'Glovo, UberEats y tu tienda propia.',
  desc: 'Todos los pedidos de delivery en un solo panel. La comanda llega al KDS igual que si la hubiera dictado el camarero.',
  ejemplos: ['Pedido Glovo → KDS cocina en < 1 segundo', 'Tu tienda online sin comisión de plataforma', 'Control de tiempos de entrega por canal'],
  ruta: '/owner → Pedidos Online',
  color: '#E84E0F',
  roi: 'Elimina la tablet de Deliverect y su coste mensual',
  ...custom,
})

export const MODULO_STOREFRONT = (custom?: Partial<ModuloCustom>): ModuloCustom => ({
  emoji: '🏪',
  titulo: 'Tienda propia online',
  sub: 'Sin comisiones de plataforma.',
  desc: 'Tu carta online con pedidos directos. Delivery y recogida. El cliente paga con Stripe. Sin intermediarios, sin comisiones.',
  ejemplos: ['Enlace directo desde tu Instagram o Google', 'Delivery y recogida en el mismo panel', 'Sin comisión — Glovo cobra el 30%'],
  ruta: 'www.iarest.es/tienda/[tu-restaurante]',
  color: C.green,
  roi: '30% de comisión que ya no le pagas a Glovo por cada pedido propio',
  ...custom,
})

// ─── Componente base ─────────────────────────────────────────
type Slide = 'intro' | 'dolor' | 'su_cocina' | 'modulos' | 'stock' | 'integracion' | 'piloto'

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

export default function PropuestaBase({ config }: { config: ClienteConfig }) {
  const [slide, setSlide] = useState<Slide>('intro')
  const [moduloIdx, setModuloIdx] = useState(0)

  // ── Booking form state ──────────────────────────────────────────────────────
  const ciudad = config.ciudad || config.lugarReunion || 'tu ciudad'
  const [showBooking, setShowBooking] = useState(false)
  const [form, setForm] = useState({ nombre: config.contactoNombre || '', email: '', fecha: config.fechaReunion ? '' : '', hora: '11:00', lugar: config.lugarReunion || `${config.nombre}, ${ciudad}`, notas: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [bookErr, setBookErr] = useState('')
  const horas = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00']
  const fechaMin = new Date(); fechaMin.setDate(fechaMin.getDate() + 1)
  const fechaMinStr = fechaMin.toISOString().split('T')[0]

  const enviarBooking = async () => {
    if (!form.nombre || !form.fecha || !form.hora || !form.lugar) { setBookErr('Por favor rellena nombre, fecha, hora y lugar.'); return }
    setSending(true); setBookErr('')
    try {
      const slug = config.slug || config.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-')
      const r = await fetch(`/api/propuesta/${slug}/booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setSent(true)
    } catch (e: unknown) { setBookErr(e instanceof Error ? e.message : 'Error enviando solicitud') }
    setSending(false)
  }

  const SLIDES: { id: Slide; label: string }[] = [
    { id: 'intro',       label: 'Inicio'         },
    { id: 'dolor',       label: 'El problema'    },
    { id: 'su_cocina',   label: 'Vuestra op.'    },
    { id: 'modulos',     label: 'Módulos'        },
    { id: 'stock',       label: config.slideStockLabel },
    { id: 'integracion', label: 'Integración'    },
    { id: 'piloto',      label: 'Piloto'         },
  ]

  const modulos = config.modulos.filter(m => m.activo !== false)
  const slideIdx = SLIDES.findIndex(s => s.id === slide)
  const prev = () => { if (slideIdx > 0) setSlide(SLIDES[slideIdx - 1].id) }
  const next = () => { if (slideIdx < SLIDES.length - 1) setSlide(SLIDES[slideIdx + 1].id) }

  return (
    <div style={{ minHeight:'100dvh', background:C.bg, color:C.paper, fontFamily:SN, display:'flex', flexDirection:'column' }}>
      {/* Nav */}
      <div style={{ padding:'16px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:`1px solid #ffffff0d` }}>
        <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:18, color:C.paper }}>
          ia<span style={{ color:C.red }}>.</span>rest
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {SLIDES.map(s => <NavDot key={s.id} active={s.id === slide} onClick={() => setSlide(s.id)} label={s.label} />)}
        </div>
        <div style={{ fontSize:12, color:C.ink4 }}>{slideIdx + 1} / {SLIDES.length}</div>
      </div>

      {/* Contenido */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* INTRO */}
        {slide === 'intro' && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px 32px', textAlign:'center', gap:24 }}>
            <div style={{ fontFamily:SM, fontSize:11, fontWeight:700, letterSpacing:'.16em', color:C.red, textTransform:'uppercase' }}>
              Propuesta para {config.grupo}
            </div>
            <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:'clamp(36px,8vw,64px)', lineHeight:1.1, color:C.paper, maxWidth:700 }}>
              El sistema que necesita tu operación
            </div>
            <div style={{ fontFamily:SN, fontSize:16, color:C.ink3, maxWidth:520, lineHeight:1.6 }}>
              Voz. Cocina. Stock. RRHH. Previsión.<br />Sin 40 herramientas diferentes.
            </div>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap', justifyContent:'center', marginTop:8 }}>
              {config.tagsIntro.map(tag => (
                <span key={tag} style={{ padding:'6px 16px', borderRadius:20, border:`1px solid ${C.ink4}44`, fontSize:13, color:C.ink3 }}>{tag}</span>
              ))}
            </div>
            <button onClick={next} style={{ marginTop:16, padding:'14px 40px', background:C.red, color:'#fff', border:'none', borderRadius:8, fontFamily:SN, fontSize:15, fontWeight:700, cursor:'pointer' }}>
              Ver propuesta →
            </button>
          </div>
        )}

        {/* DOLOR */}
        {slide === 'dolor' && (() => {
          const tieneReunion = !!config.fechaReunion
          const tituloDolor = tieneReunion ? 'Lo que nos dijisteis' : 'Los retos de vuestra operación'
          const subtituloDolor = tieneReunion
            ? `Reunión en ${config.lugarReunion} · ${config.contactoNombre} · ${config.fechaReunion}`
            : 'Lo que nos dicen operaciones como la vuestra'
          return (
            <div style={{ flex:1, padding:'32px 24px', maxWidth:720, margin:'0 auto', width:'100%', display:'flex', flexDirection:'column', gap:20, overflowY:'auto' }}>
              <div>
                <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:28, color:C.paper, marginBottom:4 }}>
                  {tituloDolor}
                </div>
                <div style={{ fontSize:12, color:C.ink4, marginBottom:8 }}>
                  {subtituloDolor}
                </div>
              </div>
              {config.citas.map((item, i) => (
                tieneReunion ? (
                  // Con reunión → comillas, formato cita
                  <div key={i} style={{ padding:'16px 20px', background:C.bg3, borderRadius:12, borderLeft:`3px solid ${item.color}` }}>
                    <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:15, color:C.cream, lineHeight:1.5, marginBottom:8 }}>{item.cita}</div>
                    <div style={{ fontFamily:SM, fontSize:11, fontWeight:700, color:item.color, textTransform:'uppercase', letterSpacing:'.1em' }}>→ {item.modulo}</div>
                  </div>
                ) : (
                  // Sin reunión → pain point del sector, sin comillas
                  <div key={i} style={{ padding:'16px 20px', background:C.bg3, borderRadius:12, borderLeft:`3px solid ${item.color}` }}>
                    {item.pain && (
                      <div style={{ fontFamily:SM, fontSize:11, fontWeight:700, color:item.color, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:6 }}>{item.pain}</div>
                    )}
                    <div style={{ fontSize:14, color:C.cream, lineHeight:1.5, marginBottom:8 }}>{item.detalle || item.cita}</div>
                    <div style={{ fontFamily:SM, fontSize:11, fontWeight:700, color:item.color, textTransform:'uppercase', letterSpacing:'.1em' }}>→ {item.modulo}</div>
                  </div>
                )
              ))}
            </div>
          )
        })()}

        {/* SU COCINA */}
        {slide === 'su_cocina' && (
          <div style={{ flex:1, padding:'32px 24px', maxWidth:720, margin:'0 auto', width:'100%', display:'flex', flexDirection:'column', gap:20, overflowY:'auto' }}>
            <div>
              <div style={{ fontFamily:SM, fontSize:11, fontWeight:700, letterSpacing:'.16em', color:C.teal, textTransform:'uppercase', marginBottom:10 }}>Adaptado a vuestra operativa</div>
              <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:'clamp(24px,5vw,36px)', lineHeight:1.2, color:C.paper }}>{config.headline}</div>
              <div style={{ fontSize:14, color:C.ink3, marginTop:8 }}>No es un producto genérico. Esto es para vosotros.</div>
            </div>
            {/* Partidas */}
            <div style={{ background:C.bg3, borderRadius:12, padding:'18px' }}>
              <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink4, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:14 }}>
                Vuestras partidas → cada una con su pantalla y su impresora
              </div>
              <div style={{ display:'grid', gridTemplateColumns:`repeat(${Math.min(config.partidas.length,3)},1fr)`, gap:10 }}>
                {config.partidas.map(p => (
                  <div key={p.nombre} style={{ background:C.bg2, borderRadius:8, padding:'12px', borderTop:`3px solid ${p.color}` }}>
                    <div style={{ fontSize:20, marginBottom:6 }}>{p.icon}</div>
                    <div style={{ fontFamily:SN, fontSize:13, fontWeight:700, color:C.paper, marginBottom:8 }}>{p.nombre}</div>
                    {p.secciones.map(s => <div key={s} style={{ fontSize:11, color:C.ink3, marginBottom:3 }}>· {s}</div>)}
                    <div style={{ marginTop:10, padding:'4px 8px', background:`${p.color}22`, borderRadius:4, fontSize:10, color:p.color, fontWeight:700 }}>
                      1 pantalla KDS + 1 impresora
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Flujo */}
            <div style={{ background:C.bg3, borderRadius:12, padding:'18px' }}>
              <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink4, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:14 }}>
                El flujo de una comanda en vuestra operativa
              </div>
              {config.pasosFlujo.map((paso, i) => (
                <div key={i} style={{ display:'flex', gap:12, marginBottom: i < config.pasosFlujo.length-1 ? 10 : 0, alignItems:'flex-start' }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                    <div style={{ width:26, height:26, borderRadius:'50%', background:C.bg2, border:`1px solid ${paso.color}55`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>{paso.icon}</div>
                    {i < config.pasosFlujo.length-1 && <div style={{ width:1, height:16, background:`${C.ink4}44`, marginTop:3 }} />}
                  </div>
                  <div style={{ paddingTop:2 }}>
                    <span style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:paso.color, textTransform:'uppercase', letterSpacing:'.06em' }}>{paso.actor}</span>
                    <div style={{ fontSize:13, color:C.cream, marginTop:2 }}>{paso.accion}</div>
                  </div>
                </div>
              ))}
            </div>
            {config.sinKDSMensaje && (
              <div style={{ padding:'16px 18px', background:`${C.amber}15`, border:`1px solid ${C.amber}33`, borderRadius:10 }}>
                <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:C.amber, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8 }}>Sin pantalla KDS</div>
                <div style={{ fontSize:14, color:C.cream, lineHeight:1.55 }}>{config.sinKDSMensaje}</div>
              </div>
            )}

            {/* 4 vistas del KDS */}
            <div style={{ background:C.bg3, borderRadius:12, padding:'18px' }}>
              <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink4, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:12 }}>4 vistas del KDS — cada rol ve lo que necesita</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {[
                  { vista:'Producción', desc:'Cada cocinero ve solo su partida. Sin ruido.', color:C.teal, star:true },
                  { vista:'Línea', desc:'El jefe de cocina ve todas las mesas y tiempos.', color:C.green, star:false },
                  { vista:'Pase', desc:'Por plato, no por mesa. Para organizar la salida.', color:C.amber, star:false },
                  { vista:'Compacto', desc:'Máxima densidad. Para volumen alto.', color:C.ink3, star:false },
                ].map(v => (
                  <div key={v.vista} style={{ background:C.bg2, borderRadius:8, padding:'10px 12px', borderLeft:`3px solid ${v.color}` }}>
                    <div style={{ fontSize:12, fontWeight:700, color:v.color, marginBottom:3 }}>
                      {v.star ? '⭐ ' : ''}{v.vista}
                    </div>
                    <div style={{ fontSize:11, color:C.ink3, lineHeight:1.4 }}>{v.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* MÓDULOS */}
        {slide === 'modulos' && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ display:'flex', overflowX:'auto', padding:'12px 16px 0', gap:4, scrollbarWidth:'none', borderBottom:`1px solid #ffffff0d` }}>
              {modulos.map((m, i) => (
                <button key={i} onClick={() => setModuloIdx(i)} style={{
                  padding:'8px 14px', borderRadius:'8px 8px 0 0', border:'none', cursor:'pointer',
                  background: moduloIdx===i ? C.bg3 : 'transparent',
                  color: moduloIdx===i ? C.paper : C.ink4,
                  fontFamily:SN, fontSize:12, fontWeight: moduloIdx===i ? 700 : 400,
                  whiteSpace:'nowrap', flexShrink:0,
                  borderBottom: moduloIdx===i ? `2px solid ${modulos[i].color}` : '2px solid transparent',
                }}>{m.emoji} {m.titulo.split(' ')[0]}</button>
              ))}
            </div>
            <div style={{ flex:1, padding:'28px 24px', maxWidth:680, margin:'0 auto', width:'100%', overflowY:'auto' }}>
              {(() => {
                const m = modulos[moduloIdx]
                return (
                  <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
                    <div>
                      <div style={{ fontSize:40, marginBottom:12 }}>{m.emoji}</div>
                      <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:30, color:C.paper, lineHeight:1.2, marginBottom:6 }}>{m.titulo}</div>
                      <div style={{ fontSize:16, color:m.color, fontWeight:600 }}>{m.sub}</div>
                    </div>
                    <div style={{ fontSize:15, color:C.ink3, lineHeight:1.65 }}>{m.desc}</div>
                    <div style={{ background:C.bg3, borderRadius:12, padding:'16px 18px', display:'flex', flexDirection:'column', gap:10 }}>
                      <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink4, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:4 }}>Ejemplos reales</div>
                      {m.ejemplos.map((e, i) => (
                        <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                          <span style={{ color:m.color, flexShrink:0, marginTop:2 }}>›</span>
                          <span style={{ fontSize:14, color:C.cream, lineHeight:1.4 }}>{e}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ padding:'12px 16px', background:`${m.color}18`, borderRadius:8, border:`1px solid ${m.color}33` }}>
                      <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:m.color, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:4 }}>ROI</div>
                      <div style={{ fontSize:14, color:C.cream }}>{m.roi}</div>
                    </div>
                    <div style={{ fontFamily:SM, fontSize:11, color:C.ink4 }}>Disponible en: {m.ruta}</div>
                    <div style={{ display:'flex', justifyContent:'space-between', marginTop:8 }}>
                      {moduloIdx > 0 && (
                        <button onClick={() => setModuloIdx(i => i-1)} style={{ padding:'8px 16px', background:'transparent', border:`1px solid ${C.ink4}44`, borderRadius:6, color:C.ink3, fontFamily:SN, fontSize:13, cursor:'pointer' }}>
                          ← {modulos[moduloIdx-1].titulo.split(' ')[0]}
                        </button>
                      )}
                      {moduloIdx < modulos.length-1 && (
                        <button onClick={() => setModuloIdx(i => i+1)} style={{ marginLeft:'auto', padding:'8px 16px', background:m.color, border:'none', borderRadius:6, color:'#fff', fontFamily:SN, fontSize:13, fontWeight:700, cursor:'pointer' }}>
                          {modulos[moduloIdx+1].titulo.split(' ')[0]} →
                        </button>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* STOCK */}
        {slide === 'stock' && (
          <div style={{ flex:1, padding:'32px 24px', maxWidth:720, margin:'0 auto', width:'100%', display:'flex', flexDirection:'column', gap:24, overflowY:'auto' }}>
            <div>
              <div style={{ fontFamily:SM, fontSize:11, fontWeight:700, letterSpacing:'.16em', color:C.green, textTransform:'uppercase', marginBottom:10 }}>El dato que lo cambia todo</div>
              <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:'clamp(24px,5vw,40px)', lineHeight:1.2, color:C.paper }}>
                {config.mercaderiaAnual} en mercadería.<br />
                <span style={{ color:C.amber }}>1% de desviación = {config.desviacion1pct} perdidos.</span>
              </div>
              <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:15, color:C.ink3, marginTop:8 }}>"{config.citaStock}" — {config.contactoNombre}</div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {[
                { titulo:'Hoy', items: config.hoyVsIaRest.hoy },
                { titulo:'Con ia.rest', items: config.hoyVsIaRest.iaRest },
              ].map(col => (
                <div key={col.titulo} style={{ background:C.bg3, borderRadius:12, padding:'16px' }}>
                  <div style={{ fontFamily:SM, fontSize:11, fontWeight:700, color: col.titulo==='Hoy' ? C.ink4 : C.green, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:12 }}>{col.titulo}</div>
                  {col.items.map((it, i) => (
                    <div key={i} style={{ display:'flex', gap:8, marginBottom:8, alignItems:'flex-start' }}>
                      <span style={{ color: col.titulo==='Hoy' ? '#FF6B6B' : C.green, flexShrink:0 }}>{col.titulo==='Hoy' ? '✗' : '✓'}</span>
                      <span style={{ fontSize:13, color: col.titulo==='Hoy' ? C.ink3 : C.cream, lineHeight:1.4 }}>{it}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ background:`${C.green}18`, border:`1px solid ${C.green}44`, borderRadius:12, padding:'20px' }}>
              <div style={{ fontFamily:SM, fontSize:11, fontWeight:700, color:C.green, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:12 }}>El dato estratégico a largo plazo</div>
              {config.datosEstrategicos.map(d => (
                <div key={d.titulo} style={{ marginBottom:12 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:C.paper, marginBottom:3 }}>{d.titulo}</div>
                  <div style={{ fontSize:13, color:C.ink3, lineHeight:1.5 }}>{d.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* INTEGRACIÓN */}
        {slide === 'integracion' && (
          <div style={{ flex:1, padding:'32px 24px', maxWidth:720, margin:'0 auto', width:'100%', display:'flex', flexDirection:'column', gap:24, overflowY:'auto' }}>
            <div>
              <div style={{ fontFamily:SM, fontSize:11, fontWeight:700, letterSpacing:'.16em', color:C.red, textTransform:'uppercase', marginBottom:10 }}>La objeción respondida</div>
              <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:20, color:C.ink3, lineHeight:1.4, marginBottom:16, padding:'16px 20px', background:C.bg3, borderRadius:10, borderLeft:`3px solid ${C.ink4}` }}>
                {config.objecionPrincipal}
              </div>
              <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:20, color:C.paper, lineHeight:1.4 }}>
                {config.respuestaObjecion}
              </div>
            </div>
            <div style={{ background:C.bg3, borderRadius:12, padding:'20px' }}>
              <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:C.ink4, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:16 }}>
                Una cadena que ningún especialista puede hacer solo
              </div>
              {[
                { paso:'El albarán llega', next:'OCR lo lee → stock actualizado automáticamente' },
                { paso:'Stock a 0 de un producto', next:'Desaparece de la carta — el camarero no puede comandarlo (86 automático)' },
                { paso:'Elaboración propia registrada', next:'Etiqueta APPCC impresa → camareros avisados cuando caduca' },
                { paso:'Asistente IA responde', next:'Jefe cocina: "¿Qué lleva más tiempo sin salir?" — sin moverse' },
                { paso:'Análisis detecta', next:'Ese plato no se vendía de todas formas — retirar de la carta' },
                { paso:'Eventos IA avisa', next:'Esta semana hay Feria — prepara stock y personal con 30 días de antelación' },
              ].map((item, i) => (
                <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom: i < 5 ? 12 : 0 }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:C.red, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:SM, fontSize:12, fontWeight:700, color:'#fff' }}>{i+1}</div>
                    {i < 5 && <div style={{ width:2, height:24, background:`${C.red}44`, marginTop:4 }} />}
                  </div>
                  <div style={{ paddingTop:4 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:C.paper }}>{item.paso}</div>
                    <div style={{ fontSize:13, color:C.ink3, marginTop:2 }}>→ {item.next}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding:'16px 20px', background:`${C.red}15`, border:`1px solid ${C.red}33`, borderRadius:10 }}>
              <div style={{ fontSize:15, color:C.paper, fontFamily:SE, fontStyle:'italic', lineHeight:1.5 }}>
                "Eso no lo puede hacer ningún programa especializado. Lo tienes con ia.rest."
              </div>
            </div>
          </div>
        )}

        {/* PILOTO */}
        {slide === 'piloto' && (
          <div style={{ flex:1, padding:'32px 24px', maxWidth:720, margin:'0 auto', width:'100%', display:'flex', flexDirection:'column', gap:24, overflowY:'auto' }}>
            <div>
              <div style={{ fontFamily:SM, fontSize:11, fontWeight:700, letterSpacing:'.16em', color:C.red, textTransform:'uppercase', marginBottom:10 }}>Sin riesgo. Sin compromiso.</div>
              <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:'clamp(26px,5vw,38px)', lineHeight:1.2, color:C.paper }}>
                Elegid el local más pequeño.<br />En una semana lo configuramos.
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {config.fasePiloto.map(f => (
                <div key={f.fase} style={{ background:C.bg3, borderRadius:10, padding:'16px 18px', borderLeft:`3px solid ${f.color}` }}>
                  <div style={{ fontFamily:SM, fontSize:11, fontWeight:700, color:f.color, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:10 }}>{f.fase}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 16px' }}>
                    {f.items.map(it => (
                      <div key={it} style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                        <span style={{ color:f.color, flexShrink:0 }}>✓</span>
                        <span style={{ fontSize:13, color:C.cream, lineHeight:1.4 }}>{it}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ background:C.bg3, borderRadius:12, padding:'20px', display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ fontFamily:SM, fontSize:11, fontWeight:700, color:C.ink4, textTransform:'uppercase', letterSpacing:'.1em' }}>Precio — modelo por usuario</div>
              <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:28, color:C.paper }}>
                59€ base <span style={{ fontSize:18, color:C.ink3 }}>+ 20€/usuario</span>
              </div>
              <div style={{ fontSize:13, color:C.ink3, lineHeight:1.5 }}>
                Cuentan: camareros, cocina, jefes de sala. El propietario no cuenta. Trial 14 días sin tarjeta.
                {config.precioMensaje && ` ${config.precioMensaje}`}
              </div>
            </div>

            {/* Para el contable */}
            <div style={{ background:`${C.green}15`, border:`1px solid ${C.green}33`, borderRadius:12, padding:'18px' }}>
              <div style={{ fontFamily:SM, fontSize:10, fontWeight:700, color:C.green, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:12 }}>📊 Para el contable — ROI del piloto</div>
              {[
                { concepto:'Albaranes (700/mes × €0,30)', ahorro:'210 €/mes por local' },
                { concepto:'Reducción mermas recepción (~1% stock)', ahorro:'Variable sobre compras' },
                { concepto:'Vinos sin vender → recomendados activamente', ahorro:'Aumento venta directa' },
                { concepto:'APPCC automático (multa inspección evitada)', ahorro:'Hasta 3.000€/inspección' },
                { concepto:'Elaboraciones caducadas → vendidas a tiempo', ahorro:'Reducción merma cocina' },
              ].map(row => (
                <div key={row.concepto} style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'6px 0', borderBottom:`0.5px solid ${C.green}22` }}>
                  <span style={{ fontSize:13, color:C.cream }}>{row.concepto}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:C.green, textAlign:'right', marginLeft:16, flexShrink:0 }}>{row.ahorro}</span>
                </div>
              ))}
              <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:14, color:C.green, marginTop:12 }}>
                El sistema se paga solo en el primer mes.
              </div>
            </div>
            {/* ── BOOKING ───────────────────────────────────────────────── */}
            <div style={{ marginTop:8 }}>
              <div style={{ fontFamily:SE, fontSize:18, fontWeight:500, color:C.paper, marginBottom:6 }}>
                ¿Te interesa? Concertamos una visita
              </div>
              <p style={{ fontFamily:SN, fontSize:13, color:C.ink3, margin:'0 0 16px', lineHeight:1.5 }}>
                Te lo enseño en vivo en tu local. Sin demos de pantalla compartida.
              </p>
              {sent ? (
                <div style={{ padding:'20px 24px', background:`${C.green}18`, border:`1px solid ${C.green}44`, borderRadius:10 }}>
                  <div style={{ fontFamily:SE, fontSize:18, color:C.green, marginBottom:6 }}>✓ Solicitud recibida</div>
                  <p style={{ fontFamily:SN, fontSize:13, color:C.cream, margin:0, lineHeight:1.5 }}>
                    Perfecto. Te confirmo la visita en menos de 24h. Cualquier duda: <a href="mailto:hola@iarest.es" style={{ color:C.red, textDecoration:'none' }}>hola@iarest.es</a>
                  </p>
                </div>
              ) : !showBooking ? (
                <button onClick={() => setShowBooking(true)}
                  style={{ padding:'14px 32px', background:C.red, color:'#fff', border:'none', borderRadius:8, fontFamily:SN, fontSize:14, fontWeight:700, cursor:'pointer' }}>
                  Concertar visita →
                </button>
              ) : (
                <div style={{ background:`${C.bg3}`, border:`1px solid ${C.ink4}33`, borderRadius:12, padding:'20px' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                    <div>
                      <label style={{ fontSize:10, fontWeight:700, color:C.ink3, letterSpacing:'.08em', textTransform:'uppercase', display:'block', marginBottom:4 }}>Nombre *</label>
                      <input value={form.nombre} onChange={e => setForm(p=>({...p,nombre:e.target.value}))} placeholder="Nombre y apellido"
                        style={{ width:'100%', boxSizing:'border-box', padding:'9px 11px', background:C.bg2, border:`1px solid ${C.ink4}44`, borderRadius:7, fontSize:13, color:C.paper, outline:'none', fontFamily:SN }} />
                    </div>
                    <div>
                      <label style={{ fontSize:10, fontWeight:700, color:C.ink3, letterSpacing:'.08em', textTransform:'uppercase', display:'block', marginBottom:4 }}>Email</label>
                      <input value={form.email} onChange={e => setForm(p=>({...p,email:e.target.value}))} type="email" placeholder="tu@email.com"
                        style={{ width:'100%', boxSizing:'border-box', padding:'9px 11px', background:C.bg2, border:`1px solid ${C.ink4}44`, borderRadius:7, fontSize:13, color:C.paper, outline:'none', fontFamily:SN }} />
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                    <div>
                      <label style={{ fontSize:10, fontWeight:700, color:C.ink3, letterSpacing:'.08em', textTransform:'uppercase', display:'block', marginBottom:4 }}>Fecha *</label>
                      <input value={form.fecha} onChange={e => setForm(p=>({...p,fecha:e.target.value}))} type="date" min={fechaMinStr}
                        style={{ width:'100%', boxSizing:'border-box', padding:'9px 11px', background:C.bg2, border:`1px solid ${C.ink4}44`, borderRadius:7, fontSize:13, color:C.paper, outline:'none', fontFamily:SN, cursor:'pointer' }} />
                    </div>
                    <div>
                      <label style={{ fontSize:10, fontWeight:700, color:C.ink3, letterSpacing:'.08em', textTransform:'uppercase', display:'block', marginBottom:4 }}>Hora *</label>
                      <select value={form.hora} onChange={e => setForm(p=>({...p,hora:e.target.value}))}
                        style={{ width:'100%', boxSizing:'border-box', padding:'9px 11px', background:C.bg2, border:`1px solid ${C.ink4}44`, borderRadius:7, fontSize:13, color:C.paper, outline:'none', fontFamily:SN, cursor:'pointer' }}>
                        {horas.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom:10 }}>
                    <label style={{ fontSize:10, fontWeight:700, color:C.ink3, letterSpacing:'.08em', textTransform:'uppercase', display:'block', marginBottom:4 }}>Lugar *</label>
                    <input value={form.lugar} onChange={e => setForm(p=>({...p,lugar:e.target.value}))} placeholder="Nombre y dirección del local"
                      style={{ width:'100%', boxSizing:'border-box', padding:'9px 11px', background:C.bg2, border:`1px solid ${C.ink4}44`, borderRadius:7, fontSize:13, color:C.paper, outline:'none', fontFamily:SN }} />
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <label style={{ fontSize:10, fontWeight:700, color:C.ink3, letterSpacing:'.08em', textTransform:'uppercase', display:'block', marginBottom:4 }}>Notas</label>
                    <textarea value={form.notas} onChange={e => setForm(p=>({...p,notas:e.target.value}))} rows={2} placeholder="¿Algo concreto que quieras ver?"
                      style={{ width:'100%', boxSizing:'border-box', padding:'9px 11px', background:C.bg2, border:`1px solid ${C.ink4}44`, borderRadius:7, fontSize:13, color:C.paper, outline:'none', fontFamily:SN, resize:'vertical' }} />
                  </div>
                  {bookErr && <div style={{ fontSize:12, color:C.red, marginBottom:10, padding:'7px 10px', background:`${C.red}15`, borderRadius:6 }}>{bookErr}</div>}
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={enviarBooking} disabled={sending}
                      style={{ flex:1, padding:'12px', background:sending?C.ink4:C.red, color:'#fff', border:'none', borderRadius:8, fontFamily:SN, fontSize:14, fontWeight:600, cursor:sending?'default':'pointer' }}>
                      {sending ? 'Enviando…' : 'Confirmar visita'}
                    </button>
                    <button onClick={() => setShowBooking(false)}
                      style={{ background:'transparent', border:`1px solid ${C.ink4}44`, borderRadius:8, padding:'12px 16px', fontSize:13, color:C.ink3, cursor:'pointer', fontFamily:SN }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Nav inferior */}
      <div style={{ padding:'16px 24px', borderTop:`1px solid #ffffff0d`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <button onClick={prev} disabled={slideIdx===0} style={{ padding:'10px 20px', background:'transparent', border:`1px solid ${C.ink4}44`, borderRadius:8, color: slideIdx===0 ? C.ink4 : C.paper, fontFamily:SN, fontSize:14, cursor: slideIdx===0 ? 'default' : 'pointer', opacity: slideIdx===0 ? .4 : 1 }}>
          ← Anterior
        </button>
        <span style={{ fontFamily:SM, fontSize:12, color:C.ink4 }}>{SLIDES[slideIdx].label}</span>
        <button onClick={next} disabled={slideIdx===SLIDES.length-1} style={{ padding:'10px 20px', background: slideIdx===SLIDES.length-1 ? 'transparent' : C.red, border: slideIdx===SLIDES.length-1 ? `1px solid ${C.ink4}44` : 'none', borderRadius:8, color: slideIdx===SLIDES.length-1 ? C.ink4 : '#fff', fontFamily:SN, fontSize:14, fontWeight:700, cursor: slideIdx===SLIDES.length-1 ? 'default' : 'pointer', opacity: slideIdx===SLIDES.length-1 ? .4 : 1 }}>
          Siguiente →
        </button>
      </div>
    </div>
  )
}
