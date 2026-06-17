'use client'
import { useState, useEffect, useCallback, type ReactElement } from 'react'

// ─── Paleta (igual que el deck del grupo) ────────────────────
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

type Slide = {
  kicker?: string
  titulo: string
  sub?: string
  color: string
  render: () => ReactElement
}

// ─── Helpers ─────────────────────────────────────────────────
function Bullet({ icon, head, body, color }: { icon: string; head: string; body: string; color: string }) {
  return (
    <div style={{ display:'flex', gap:18, alignItems:'flex-start', padding:'14px 0', borderBottom:`1px solid ${C.bg3}` }}>
      <div style={{ fontSize:30, lineHeight:1, flexShrink:0, width:40, textAlign:'center' }}>{icon}</div>
      <div>
        <div style={{ fontFamily:SN, fontWeight:700, fontSize:21, color:C.cream, marginBottom:4 }}>{head}</div>
        <div style={{ fontFamily:SN, fontSize:17, color:C.ink3, lineHeight:1.45 }}>{body}</div>
      </div>
      <div style={{ width:6, alignSelf:'stretch', background:color, borderRadius:3, marginLeft:'auto', opacity:.5 }} />
    </div>
  )
}

function Card({ icon, titulo, body, color }: { icon: string; titulo: string; body: string; color: string }) {
  return (
    <div style={{ background:C.bg2, border:`1px solid ${C.bg3}`, borderTop:`3px solid ${color}`, borderRadius:14, padding:'22px 22px 24px' }}>
      <div style={{ fontSize:34, marginBottom:10 }}>{icon}</div>
      <div style={{ fontFamily:SN, fontWeight:700, fontSize:19, color:C.cream, marginBottom:8 }}>{titulo}</div>
      <div style={{ fontFamily:SN, fontSize:15.5, color:C.ink3, lineHeight:1.5 }}>{body}</div>
    </div>
  )
}

function Node({ color, title, sub }: { color: string; title: string; sub?: string }) {
  return (
    <div style={{ background:C.bg2, border:`1.5px solid ${color}`, borderRadius:12, padding:'13px 18px', minWidth:158, textAlign:'center' }}>
      <div style={{ fontFamily:SN, fontWeight:700, fontSize:16.5, color:C.cream }}>{title}</div>
      {sub && <div style={{ fontFamily:SN, fontSize:12.5, color:C.ink3, marginTop:3 }}>{sub}</div>}
    </div>
  )
}

function Arrow({ label, color, dashed }: { label: string; color: string; dashed?: boolean }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', minWidth:128, flex:'0 0 auto' }}>
      <div style={{ fontFamily:SN, fontSize:12, color, marginBottom:5, fontWeight:600, textAlign:'center' }}>{label}</div>
      <div style={{ width:'100%', borderTop:`2px ${dashed ? 'dashed' : 'solid'} ${color}`, position:'relative' }}>
        <span style={{ position:'absolute', right:-3, top:-9, color, fontSize:13, lineHeight:1 }}>▶</span>
      </div>
    </div>
  )
}

function Quote({ text }: { text: string }) {
  return (
    <div style={{ display:'flex', gap:14, alignItems:'flex-start', padding:'16px 0', borderBottom:`1px solid ${C.bg3}` }}>
      <div style={{ fontFamily:SE, fontSize:'clamp(30px,6vw,44px)', lineHeight:.9, color:C.gold, flexShrink:0 }}>“</div>
      <p style={{ fontFamily:SE, fontStyle:'italic', fontSize:'clamp(18px,3.8vw,24px)', lineHeight:1.42, color:C.cream, margin:0 }}>{text}</p>
    </div>
  )
}

// ─── Contenido: SOLO lo hablado con Carmen (cocina) ──────────
const SLIDES: Slide[] = [
  // 1 · Portada
  {
    color: C.gold,
    titulo: '',
    render: () => (
      <div style={{ textAlign:'center', maxWidth:900 }}>
        <div style={{ fontFamily:SN, letterSpacing:4, fontSize:14, color:C.gold, textTransform:'uppercase', marginBottom:28 }}>
          Catering Joaquín Jaén · Cocina central
        </div>
        <h1 style={{ fontFamily:SE, fontWeight:600, fontSize:'clamp(30px,7vw,60px)', lineHeight:1.08, color:C.paper, margin:'0 0 26px' }}>
          Que la cocina se <span style={{ color:C.gold }}>organice sola</span>.<br/>Sin depender de ti.
        </h1>
        <p style={{ fontFamily:SN, fontSize:'clamp(16px,3.6vw,21px)', color:C.ink3, lineHeight:1.5, margin:'0 auto', maxWidth:700 }}>
          Conectamos lo que ya tienes montado y dejamos que los agentes repartan el trabajo,
          midan el tiempo y te saquen del móvil.
        </p>
        <div style={{ marginTop:40, fontFamily:SN, fontSize:15, color:C.ink4 }}>ia.rest · para [ella]</div>
      </div>
    ),
  },

  // 2 · En tus palabras
  {
    kicker: 'En tus palabras',
    titulo: 'Lo que nos dijiste',
    sub: 'Tus frases, tal cual. De aquí sale todo lo que te proponemos.',
    color: C.gold,
    render: () => (
      <div style={{ width:'100%', maxWidth:880 }}>
        <Quote text="Todo lo que no está planificado depende de mí." />
        <Quote text="Reduje los papeles un 75 %." />
        <Quote text="El cliente no viene a comer cualquier cosa: quiere el arroz de categoría." />
        <Quote text="Que llegue por la mañana, me identifique por mi partida y ya esté todo." />
      </div>
    ),
  },

  // 3 · Tu cocina, de la recepción al carro
  {
    kicker: 'Os escuchamos · tal cual nos lo contasteis',
    titulo: 'Tu cocina, de la recepción al carro',
    sub: 'Este es el flujo que ya tienes en la cabeza. Lo dibujamos tal cual para que lo lleve el sistema — no tú.',
    color: C.teal,
    render: () => (
      <div style={{ width:'100%', maxWidth:1000 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, flexWrap:'wrap', marginBottom:26 }}>
          <Node color={C.teal} title="Recepción" sub="pesa · escanea etiqueta" />
          <Arrow label="entra valorado" color={C.gold} />
          <Node color={C.gold} title="Economato" sub="almacén con valor" />
          <Arrow label="parte de elaboración" color={C.red} />
          <Node color={C.red} title="Producción" sub="partidas frío / caliente" />
          <Arrow label="identificado por color" color={C.amber} />
          <Node color={C.amber} title="Salida" sub="carros por evento" />
          <Arrow label="transportista" color={C.green} />
          <Node color={C.green} title="Evento" sub="montado y servido" />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,210px),1fr))', gap:18 }}>
          <Card icon="🏷️" color={C.gold} titulo="La etiqueta de entrada, sin duplicar"
            body="La propia etiqueta del proveedor —con lote, alérgenos, caducidad y precio— se escanea y vale como referencia para todo el seguimiento, sin reimprimir un QR nuevo. Si el precio sube, salta el aviso y el coste se actualiza solo." />
          <Card icon="🌡️" color={C.teal} titulo="Control sanitario, justificado"
            body="Desinfección, enfriamiento y descongelación según ingredientes; vida útil justificada por pH y actividad de agua. La auditoría, siempre lista." />
          <Card icon="⏱️" color={C.red} titulo="Partidas cronometradas"
            body="Frío y caliente, corte, montaje y elaboración. Cada cocinero entra y encuentra su trabajo repartido y cronometrado, con avisos encadenados entre partidas." />
          <Card icon="🎨" color={C.amber} titulo="Salida por color, no por nombre"
            body="Cada evento, un color; los carros se identifican y el transportista los recoge. Cada fase entrega a la siguiente, como una cadena." />
        </div>
        <p style={{ fontFamily:SN, fontSize:16, color:C.ink4, marginTop:26, textAlign:'center' }}>
          Todo esto ya lo haces tú de cabeza. El objetivo es que deje de depender de ti.
        </p>
      </div>
    ),
  },

  // 4 · Los agentes que reparten el trabajo (el núcleo de hoy)
  {
    kicker: 'La idea central',
    titulo: 'Los agentes reparten el trabajo',
    sub: 'El cocinero entra a su perfil y encuentra su trabajo del día ya repartido y cronometrado. Tú dejas de repartir a mano.',
    color: C.red,
    render: () => (
      <div style={{ width:'100%', maxWidth:1000 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, flexWrap:'wrap', marginBottom:26 }}>
          <Node color={C.amber} title="Evento" sub="aforo y menú" />
          <Arrow label="explota la previsión" color={C.gold} />
          <Node color={C.gold} title="Producción" sub="qué y cuánto" />
          <Arrow label="tiempo por tarea" color={C.red} />
          <Node color={C.red} title="Reparto" sub="por partida y persona" />
          <Arrow label="cada uno entra" color={C.teal} />
          <Node color={C.teal} title="Cuadrante" sub="turnos y tareas" />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,210px),1fr))', gap:18 }}>
          <Card icon="🔑" color={C.teal} titulo="Cada uno con su acceso"
            body="El trabajador entra con su usuario y encuentra su trabajo del día ya organizado. Como un trabajador online que ya tiene todo preparado." />
          <Card icon="🧮" color={C.gold} titulo="De la previsión a la producción"
            body="100 croquetas son tantas horas; el agente lo calcula y lo reparte por partida. «Dame el cuadrante» y lo tienes hecho." />
          <Card icon="🛒" color={C.amber} titulo="Estimación de compra que aprende"
            body="Desde la previsión de eventos propone el pedido y se reajusta con lo que pasó (±10 %). Dejas de estimar de cabeza." />
          <Card icon="⏱️" color={C.red} titulo="Tiempo medido y auditado"
            body="Tiempo estimado contra tiempo real por persona y partida. Productividad con datos, no con sensaciones." />
        </div>
        <p style={{ fontFamily:SN, fontSize:16, color:C.ink4, marginTop:26, textAlign:'center' }}>
          Esta lógica ya está escrita y probada. Falta conectarla a tu cocina.
        </p>
      </div>
    ),
  },

  // 5 · El equipo, medido con objetividad
  {
    kicker: 'Gestión con datos, no con sensaciones',
    titulo: 'El equipo, medido con objetividad',
    sub: 'Para decidir con datos quién rinde — justo lo que nos pediste.',
    color: C.green,
    render: () => (
      <div style={{ width:'100%', maxWidth:940, display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap:20 }}>
        <Card icon="👨‍🍳" color={C.teal}
          titulo="Productividad por persona y partida"
          body="Cada cocinero entra y encuentra su trabajo del día ya organizado y cronometrado. Comparamos tiempo real contra estándar para saber, con datos, si cada partida es productiva." />
        <Card icon="📋" color={C.green}
          titulo="Cierre con foto y trazable"
          body="Cada tarea se cierra con su marca de tiempo y, donde haga falta, con foto. La información queda registrada y vale para la auditoría sanitaria." />
      </div>
    ),
  },

  // 6 · Fuera el WhatsApp
  {
    kicker: 'Menos móvil, más control',
    titulo: 'Fuera el WhatsApp: todo en la intranet',
    sub: 'Hoy los pedidos y la comunicación van por tu WhatsApp personal, y acabas todo el día con el móvil. Lo movemos dentro de la app.',
    color: C.green,
    render: () => (
      <div style={{ width:'100%', maxWidth:940 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,210px),1fr))', gap:18, marginBottom:24 }}>
          <Card icon="💬" color={C.green} titulo="Mensajería interna en la app"
            body="Equipo, comercial y dirección hablan dentro de la plataforma. Cada mensaje queda ligado a su evento o partida, no perdido en un chat del móvil personal." />
          <Card icon="📦" color={C.teal} titulo="Pedidos por la intranet"
            body="El apartado de proveedores ya está cerrado: pides, recibes el albarán y cuadras la entrada sin salir de la plataforma." />
          <Card icon="📥" color={C.amber} titulo="Una sola bandeja de entrada"
            body="Cambios de novios, altas y bajas y avisos entran a un único sitio y se convierten solos en tareas. Dejan de depender de que tú los vuelques cada noche." />
          <Card icon="🗂️" color={C.gold} titulo="Todo queda registrado"
            body="Cada conversación, pedido y cambio queda con histórico y trazable. Si alguien falta un día, la información no se va con él." />
        </div>
        <p style={{ fontFamily:SN, fontSize:17, color:C.ink3, textAlign:'center', lineHeight:1.5 }}>
          El móvil deja de ser tu oficina: la información vive en la plataforma, no en tu chat.
        </p>
      </div>
    ),
  },

  // 7 · Ya funciona hoy (lo de cocina)
  {
    kicker: 'No es una promesa',
    titulo: 'Ya funciona hoy',
    sub: 'Casi todo lo que tu cocina necesita ya está construido y en producción. Lo nuevo es conectarlo a tu forma de trabajar.',
    color: C.green,
    render: () => (
      <div style={{ width:'100%', maxWidth:960 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap:16, marginBottom:22 }}>
          <Card icon="📋" color={C.gold} titulo="Escandallos y coste por comensal"
            body="Coste por comensal con factor de rendimiento y margen mínimo, ya calculado por evento." />
          <Card icon="📦" color={C.teal} titulo="Almacén valorado"
            body="Stock por movimientos, kits, FEFO, alertas de mínimo y caducidad e inventario físico cíclico." />
          <Card icon="🛒" color={C.amber} titulo="Proveedores: pedido + albarán por foto"
            body="Pedido, albarán por foto y cotejo a 3 bandas (pedido ↔ albarán ↔ stock). Apartado ya cerrado." />
          <Card icon="💬" color={C.green} titulo="Mensajería interna"
            body="Chat privado y de grupo por turno, con audio y registro. El sustituto del WhatsApp ya existe." />
          <Card icon="🥗" color={C.red} titulo="Alérgenos y APPCC automático"
            body="Fichas con alérgenos, etiquetas para imprimir y el APPCC que se genera solo en cada evento." />
          <Card icon="🧾" color={C.teal} titulo="Comanda, cocina y facturación legal"
            body="Comanda por QR, pantalla de cocina (KDS) y facturación VeriFactu — en producción en iarest.es." />
        </div>
        <p style={{ fontFamily:SN, fontSize:16, color:C.ink4, textAlign:'center', lineHeight:1.5 }}>
          Lo que estamos terminando para ti: el reparto automático del trabajo a cocina. Su lógica ya está escrita y probada.
        </p>
      </div>
    ),
  },

  // 8 · Cómo arrancamos
  {
    kicker: 'Bajo riesgo, contigo',
    titulo: 'Cómo arrancamos',
    color: C.red,
    render: () => (
      <div style={{ width:'100%', maxWidth:900 }}>
        <Bullet icon="🤝" color={C.teal} head="Empezamos simple, con tu cocina"
          body="Co-diseñamos sobre lo que ya tienes montado. Tú como socia técnica: nadie conoce tu proceso mejor que tú." />
        <Bullet icon="🗺️" color={C.gold} head="Te traemos el esquema"
          body="Dibujamos tu flujo completo y vamos puliéndolo en reuniones cortas, semana a semana." />
        <Bullet icon="📅" color={C.green} head="Próxima cita: jueves 25, 12:00"
          body="Venimos con el esquema y, si lo ves factible, empezamos por lo que más te quita tiempo." />
      </div>
    ),
  },
]

// ─── Componente deck ─────────────────────────────────────────
export default function DeckCocinaJJ() {
  const [i, setI] = useState(0)
  const n = SLIDES.length
  const go = useCallback((d: number) => setI((p) => Math.max(0, Math.min(n - 1, p + d))), [n])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); go(1) }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1) }
      else if (e.key === 'Home') setI(0)
      else if (e.key === 'End') setI(n - 1)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [go, n])

  const s = SLIDES[i]

  return (
    <div style={{ position:'fixed', inset:0, background:C.bg, color:C.paper, overflow:'hidden', fontFamily:SN }}>
      <div style={{ position:'absolute', top:0, left:0, height:4, width:`${((i + 1) / n) * 100}%`, background:s.color, transition:'width .35s ease', zIndex:10 }} />

      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'safe center', overflowY:'auto', WebkitOverflowScrolling:'touch', padding:'clamp(54px,8vh,72px) clamp(18px,5vw,48px) clamp(80px,11vh,96px)' }}>
        {(s.kicker || s.titulo) && (
          <div style={{ width:'100%', maxWidth:1000, marginBottom:28, textAlign: i === 0 ? 'center' : 'left' }}>
            {s.kicker && (
              <div style={{ fontFamily:SN, fontWeight:700, fontSize:13, letterSpacing:2.5, color:s.color, textTransform:'uppercase', marginBottom:12 }}>{s.kicker}</div>
            )}
            {s.titulo && (
              <h2 style={{ fontFamily:SE, fontWeight:600, fontSize:'clamp(26px,6vw,44px)', lineHeight:1.12, color:C.paper, margin:0 }}>{s.titulo}</h2>
            )}
            {s.sub && (
              <p style={{ fontFamily:SN, fontSize:'clamp(15px,3.4vw,19px)', color:C.ink3, margin:'14px 0 0', lineHeight:1.45, maxWidth:820 }}>{s.sub}</p>
            )}
          </div>
        )}
        <div style={{ width:'100%', display:'flex', justifyContent:'center' }}>{s.render()}</div>
      </div>

      <div style={{ position:'absolute', bottom:0, left:0, right:0, height:64, display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, padding:'0 clamp(12px,4vw,28px)', borderTop:`1px solid ${C.bg3}`, background:C.bg2 }}>
        <div style={{ fontFamily:SN, fontSize:13, color:C.ink4, letterSpacing:1, minWidth:0, flexShrink:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>CATERING JOAQUÍN JAÉN · COCINA · ia.rest</div>
        <div style={{ display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
          <button onClick={() => go(-1)} disabled={i === 0}
            style={{ background:'transparent', border:`1px solid ${C.bg3}`, color: i === 0 ? C.ink4 : C.cream, borderRadius:8, padding:'8px 16px', fontSize:15, cursor: i === 0 ? 'default' : 'pointer' }}>← Atrás</button>
          <div style={{ fontFamily:SN, fontSize:14, color:C.ink3, minWidth:54, textAlign:'center' }}>{i + 1} / {n}</div>
          <button onClick={() => go(1)} disabled={i === n - 1}
            style={{ background: i === n - 1 ? 'transparent' : s.color, border:`1px solid ${i === n - 1 ? C.bg3 : s.color}`, color: i === n - 1 ? C.ink4 : '#fff', borderRadius:8, padding:'8px 16px', fontSize:15, fontWeight:600, cursor: i === n - 1 ? 'default' : 'pointer' }}>Siguiente →</button>
        </div>
      </div>

      <div style={{ position:'absolute', bottom:80, left:'50%', transform:'translateX(-50%)', display:'flex', gap:7 }}>
        {SLIDES.map((_, k) => (
          <button key={k} onClick={() => setI(k)} aria-label={`Slide ${k + 1}`}
            style={{ width: k === i ? 22 : 8, height:8, borderRadius:4, border:'none', background: k === i ? s.color : C.bg3, cursor:'pointer', transition:'all .25s' }} />
        ))}
      </div>
    </div>
  )
}
