'use client'
import { useState, useEffect, useCallback, type ReactElement } from 'react'

// ─── Paleta (igual que PropuestaBase) ────────────────────────
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

// ─── Tipos de slide ──────────────────────────────────────────
type Slide = {
  kicker?: string
  titulo: string
  sub?: string
  color: string
  render: () => ReactElement
}

// Helpers de presentación ─────────────────────────────────────
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

// ─── Contenido de la presentación ────────────────────────────
const SLIDES: Slide[] = [
  // 1 · Portada
  {
    color: C.gold,
    titulo: '',
    render: () => (
      <div style={{ textAlign:'center', maxWidth:900 }}>
        <div style={{ fontFamily:SN, letterSpacing:4, fontSize:14, color:C.gold, textTransform:'uppercase', marginBottom:28 }}>
          Catering Joaquín Jaén · Hacienda El Alba + Hacienda Trinidad
        </div>
        <h1 style={{ fontFamily:SE, fontWeight:600, fontSize:60, lineHeight:1.08, color:C.paper, margin:'0 0 26px' }}>
          Una plataforma para <span style={{ color:C.gold }}>todo tu grupo</span>,<br/>no seis programas sueltos.
        </h1>
        <p style={{ fontFamily:SN, fontSize:21, color:C.ink3, lineHeight:1.5, margin:'0 auto', maxWidth:680 }}>
          Conectamos lo que ya funciona —empezando por tu cocina— y unimos comercial, material,
          eventos y contabilidad en un solo sitio.
        </p>
        <div style={{ marginTop:40, fontFamily:SN, fontSize:15, color:C.ink4 }}>ia.rest · propuesta presencial</div>
      </div>
    ),
  },

  // 2 · Lo que vimos en la reunión
  {
    kicker: 'Os escuchamos',
    titulo: 'Lo que vimos en la reunión',
    sub: 'No venimos con un programa enlatado. Venimos con lo que nos contasteis.',
    color: C.teal,
    render: () => (
      <div style={{ width:'100%', maxWidth:900 }}>
        <Bullet icon="👩‍🍳" color={C.gold} head="Tu cocina ya es una joya"
          body="3 años montando producción, escandallo, trazabilidad, partes por partida y cronometraje. Eso no se toca: se conecta." />
        <Bullet icon="🎯" color={C.red} head="Comercial y logística quieren arrancar ya"
          body="CRM de eventos, comisiones y ranking del equipo; y el material de eventos, que es el departamento más atrasado." />
        <Bullet icon="💍" color={C.amber} head="Queréis un marketplace de catering"
          body="Que el cliente configure su evento y reserve solo, con vuestro margen ya incorporado." />
      </div>
    ),
  },

  // 3 · Principio
  {
    kicker: 'El principio que lo ordena todo',
    titulo: 'Conectamos, no reemplazamos',
    color: C.green,
    render: () => (
      <div style={{ width:'100%', maxWidth:920, textAlign:'center' }}>
        <p style={{ fontFamily:SE, fontSize:30, lineHeight:1.4, color:C.cream, margin:'0 0 38px' }}>
          El sistema de cocina que ya tenéis <span style={{ color:C.green }}>se queda</span>.
          ia.rest se enchufa a él y reparte sus datos al resto del grupo.
        </p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:18 }}>
          <Card icon="📋" color={C.gold} titulo="Escandallos → presupuesto" body="El coste por comensal que ya calculáis alimenta el presupuesto y la lista de compra." />
          <Card icon="🛒" color={C.teal} titulo="Cocina → compra" body="Lo que entra por un evento se convierte en pedido a proveedor, sin reteclear." />
          <Card icon="📊" color={C.red} titulo="Coste → contabilidad" body="Los costes reales suben solos al financiero consolidado del holding." />
        </div>
        <p style={{ fontFamily:SN, fontSize:16, color:C.ink4, marginTop:34 }}>
          El riesgo no es técnico, es humano. Por eso arrancamos por donde menos duele.
        </p>
      </div>
    ),
  },

  // 4 · Comercial & comisiones
  {
    kicker: 'Lo que pide el comprador',
    titulo: 'Comercial y comisiones',
    sub: 'El equipo se autogestiona y ves quién aporta de verdad.',
    color: C.red,
    render: () => (
      <div style={{ width:'100%', maxWidth:940, display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:18 }}>
        <Card icon="🏆" color={C.red} titulo="Ranking en tiempo real" body="Quién vende con más margen, no solo quién factura más. Cada comercial ve lo suyo." />
        <Card icon="💸" color={C.amber} titulo="Bonos automáticos" body="Por margen, por ticket más alto y por reseñas conseguidas. Se calculan solos." />
        <Card icon="📈" color={C.gold} titulo="Contrato con % escalable" body="La comisión sube sola al alcanzar objetivos; baja si no se cumplen. Sin discusiones." />
        <Card icon="📅" color={C.teal} titulo="Pipeline de bodas y eventos" body="Cada comercial con sus leads cualificados, su agenda y su día de oficina." />
      </div>
    ),
  },

  // 5 · Material de eventos (el piloto)
  {
    kicker: 'El piloto limpio',
    titulo: 'Material de eventos',
    sub: 'Saber qué tienes, qué se rompió y qué hará falta — sin recuentos por vídeo.',
    color: C.teal,
    render: () => (
      <div style={{ width:'100%', maxWidth:940, display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:18 }}>
        <Card icon="🍽️" color={C.teal} titulo="Catálogo con stock real" body="Mesas, sillas, vajilla y cristalería. Cada evento descuenta lo que sale." />
        <Card icon="📸" color={C.red} titulo="Roturas con foto" body="Al cerrar la boda registras las roturas con foto y se liquidan solas." />
        <Card icon="🌡️" color={C.amber} titulo="Previsión por evento" body="Material y bebida según aforo, temporada y temperatura (verano/invierno, día/noche)." />
      </div>
    ),
  },

  // 6 · Marketplace (el wow)
  {
    kicker: 'El "wow" para cerrar bodas',
    titulo: 'Presupuesto self-service del cliente',
    sub: 'Cualificas y cierras eventos fuera de horario. El comercial llega con el trabajo medio hecho.',
    color: C.amber,
    render: () => (
      <div style={{ width:'100%', maxWidth:900 }}>
        <Bullet icon="🧮" color={C.amber} head="El cliente configura su evento"
          body="50 adultos, 15 niños, 2 días → elige menú con tu margen ya incorporado. El precio se ajusta solo al aforo." />
        <Bullet icon="💳" color={C.green} head="Reserva con paga y señal"
          body="Cobro online. El evento entra directo en la agenda y el lead, ya cualificado, al CRM del comercial." />
        <Bullet icon="🤖" color={C.teal} head="Bot de bodas + maridaje por IA"
          body="Cualifica la primera visita y sugiere el vino para cada plato con su rango de precio." />
      </div>
    ),
  },

  // 7 · Operación con datos (H + I)
  {
    kicker: 'Gestión con datos, no con sensaciones',
    titulo: 'El equipo, medido con objetividad',
    sub: 'El trabajador entra a su perfil, ve su trabajo ya organizado y lo cierra con foto — en sala y en cocina.',
    color: C.green,
    render: () => (
      <div style={{ width:'100%', maxWidth:940, display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:20 }}>
        <Card icon="✅" color={C.green}
          titulo="Checklist de sala cruzado con la carga"
          body="Tareas por sección (barra, sala, terraza) marcadas con foto. ia.rest las cruza con las mesas y comandas reales: tarea sin hacer + sala vacía = «sin excusa»; sala llena = contexto. Reclamas el trabajo con datos." />
        <Card icon="👨‍🍳" color={C.teal}
          titulo="Perfil del cocinero + productividad"
          body="Cada cocinero entra y encuentra su trabajo del día ya organizado y cronometrado por la IA. Comparamos tiempo real vs estándar para saber, con datos, si cada partida es productiva." />
      </div>
    ),
  },

  // 8 · El gancho del grupo (consolidado real de JJ)
  {
    kicker: 'El gancho del grupo',
    titulo: 'Todo el grupo en un solo cuadro de mando',
    sub: 'La cocina central produce para los eventos; el restaurante va aparte y pide lo suyo. La plataforma lo consolida y descuenta lo interno para no inflar el grupo.',
    color: C.gold,
    render: () => (
      <div style={{ width:'100%', maxWidth:1000 }}>
        {/* Fila 1 — cocina central produce para eventos → cliente */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:12, flexWrap:'wrap', marginBottom:18 }}>
          <Node color={C.teal} title="Cocina central" sub="la hermana · produce" />
          <Arrow label="produce · interno" color={C.gold} dashed />
          <Node color={C.amber} title="Eventos · Catering" sub="Hda. El Alba / Trinidad" />
          <Arrow label="factura · externo" color={C.green} />
          <Node color={C.green} title="Cliente final" sub="boda / evento" />
        </div>
        {/* Fila 2 — restaurante independiente */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:12, flexWrap:'wrap', marginBottom:26 }}>
          <Node color={C.red} title="Restaurantes" sub="Doble J · Las Dos Jotas" />
          <Arrow label="piden lo suyo, por su cuenta" color={C.ink4} dashed />
          <Node color={C.ink4} title="Sus proveedores" sub="independiente" />
        </div>
        {/* Banda plataforma */}
        <div style={{ background:'#211C3A', border:`1px solid #3A3360`, borderRadius:14, padding:'18px 24px', textAlign:'center' }}>
          <div style={{ fontFamily:SN, fontWeight:700, fontSize:17, color:'#fff', marginBottom:6 }}>PLATAFORMA · consolida el grupo — Cuenta → Sociedad → Negocio</div>
          <div style={{ fontFamily:SN, fontSize:14.5, color:'#B9B2D6', lineHeight:1.45 }}>
            Descuenta lo interno (cocina ↔ eventos) y muestra el <strong style={{ color:'#fff' }}>neto real del grupo</strong>.
          </div>
        </div>
      </div>
    ),
  },

  // 9 · Ya funciona
  {
    kicker: 'No es una promesa',
    titulo: 'Ya funciona hoy',
    color: C.green,
    render: () => (
      <div style={{ width:'100%', maxWidth:900 }}>
        <Bullet icon="📊" color={C.green} head="Financiero consolidado real"
          body="La plataforma ya une el financiero de varios negocios reales de sectores distintos en un solo cuadro de mando — funcionando hoy, no en maqueta." />
        <Bullet icon="🧾" color={C.red} head="Facturación y VeriFactu"
          body="POS, comanda por QR y facturación legal ya en producción en iarest.es." />
        <Bullet icon="🏛️" color={C.teal} head="Agente de concursos públicos"
          body="Módulo terminado que rastrea licitaciones — cross-sell directo para la obra del cuñado." />
      </div>
    ),
  },

  // 10 · El piloto
  {
    kicker: 'Bajo riesgo, valor rápido',
    titulo: 'Cómo arrancamos',
    color: C.red,
    render: () => (
      <div style={{ width:'100%', maxWidth:960 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:18, marginBottom:24 }}>
          <Card icon="①" color={C.gold} titulo="Semana 1–2 · Material + comercial" body="Catálogo de material con stock real y alta del equipo comercial con sus comisiones. Primer evento descontando material solo." />
          <Card icon="②" color={C.teal} titulo="Semana 3–4 · Conectar cocina" body="Roturas por foto, ranking del equipo en vivo y puente con vuestros escandallos → presupuesto." />
          <Card icon="③" color={C.green} titulo="Mes 2 · Marketplace + holding" body="Previsión por evento, presupuesto self-service (piloto) y financiero del catering consolidado." />
        </div>
        <p style={{ fontFamily:SN, fontSize:17, color:C.ink3, textAlign:'center', lineHeight:1.5 }}>
          Empezamos por el departamento menos defendido (material) y lo demás lo vais añadiendo vosotros cuando queráis.
        </p>
      </div>
    ),
  },

  // 11 · Cierre
  {
    kicker: 'El siguiente paso',
    titulo: 'Joaquín, como design partner',
    color: C.gold,
    render: () => (
      <div style={{ width:'100%', maxWidth:880 }}>
        <p style={{ fontFamily:SE, fontSize:26, lineHeight:1.45, color:C.cream, margin:'0 0 30px', textAlign:'center' }}>
          No os vendemos un programa. Construimos la plataforma de vuestro grupo <span style={{ color:C.gold }}>con vosotros</span>.
        </p>
        <div style={{ background:C.bg2, border:`1px solid ${C.bg3}`, borderRadius:14, padding:'24px 28px' }}>
          <div style={{ fontFamily:SN, fontWeight:700, fontSize:15, letterSpacing:1, color:C.gold, textTransform:'uppercase', marginBottom:14 }}>Para cerrar el piloto necesitamos</div>
          <Bullet icon="🏢" color={C.teal} head="Vuestras sociedades y CIFs" body="Qué negocio cuelga de cada una y el volumen de operaciones entre ellas (intercompany)." />
          <Bullet icon="🍳" color={C.red} head="El stack de la cocina de [ella]" body="Para decidir si conectamos su sistema o lo co-diseñamos juntos. Con ella como socia técnica." />
          <Bullet icon="📦" color={C.amber} head="Tamaño del material y eventos/mes" body="Para dimensionar el piloto de logística y la estructura de comisiones del equipo." />
        </div>
      </div>
    ),
  },
]

// ─── Componente deck ─────────────────────────────────────────
export default function DeckCateringJJ() {
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
      {/* barra de progreso */}
      <div style={{ position:'absolute', top:0, left:0, height:4, width:`${((i + 1) / n) * 100}%`, background:s.color, transition:'width .35s ease', zIndex:10 }} />

      {/* slide */}
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'72px 48px 96px' }}>
        {(s.kicker || s.titulo) && (
          <div style={{ width:'100%', maxWidth:1000, marginBottom:28, textAlign: i === 0 ? 'center' : 'left' }}>
            {s.kicker && (
              <div style={{ fontFamily:SN, fontWeight:700, fontSize:13, letterSpacing:2.5, color:s.color, textTransform:'uppercase', marginBottom:12 }}>{s.kicker}</div>
            )}
            {s.titulo && (
              <h2 style={{ fontFamily:SE, fontWeight:600, fontSize:44, lineHeight:1.12, color:C.paper, margin:0 }}>{s.titulo}</h2>
            )}
            {s.sub && (
              <p style={{ fontFamily:SN, fontSize:19, color:C.ink3, margin:'14px 0 0', lineHeight:1.45, maxWidth:820 }}>{s.sub}</p>
            )}
          </div>
        )}
        <div style={{ width:'100%', display:'flex', justifyContent:'center' }}>{s.render()}</div>
      </div>

      {/* navegación */}
      <div style={{ position:'absolute', bottom:0, left:0, right:0, height:64, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 28px', borderTop:`1px solid ${C.bg3}`, background:C.bg2 }}>
        <div style={{ fontFamily:SN, fontSize:13, color:C.ink4, letterSpacing:1 }}>CATERING JOAQUÍN JAÉN · ia.rest</div>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <button onClick={() => go(-1)} disabled={i === 0}
            style={{ background:'transparent', border:`1px solid ${C.bg3}`, color: i === 0 ? C.ink4 : C.cream, borderRadius:8, padding:'8px 16px', fontSize:15, cursor: i === 0 ? 'default' : 'pointer' }}>← Atrás</button>
          <div style={{ fontFamily:SN, fontSize:14, color:C.ink3, minWidth:54, textAlign:'center' }}>{i + 1} / {n}</div>
          <button onClick={() => go(1)} disabled={i === n - 1}
            style={{ background: i === n - 1 ? 'transparent' : s.color, border:`1px solid ${i === n - 1 ? C.bg3 : s.color}`, color: i === n - 1 ? C.ink4 : '#fff', borderRadius:8, padding:'8px 16px', fontSize:15, fontWeight:600, cursor: i === n - 1 ? 'default' : 'pointer' }}>Siguiente →</button>
        </div>
      </div>

      {/* puntos */}
      <div style={{ position:'absolute', bottom:80, left:'50%', transform:'translateX(-50%)', display:'flex', gap:7 }}>
        {SLIDES.map((_, k) => (
          <button key={k} onClick={() => setI(k)} aria-label={`Slide ${k + 1}`}
            style={{ width: k === i ? 22 : 8, height:8, borderRadius:4, border:'none', background: k === i ? s.color : C.bg3, cursor:'pointer', transition:'all .25s' }} />
        ))}
      </div>
    </div>
  )
}
