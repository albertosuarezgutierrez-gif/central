'use client'
import { type ReactElement } from 'react'

// ─── Identidad de marca (logo verde) ─────────────────────────
const C = {
  verde: '#02473B', verdeClaro: '#0B6B57',
  oro: '#9E8152', oroClaro: '#C2A973',
  papel: '#FBFAF6', tinta: '#1E2622', ink3: '#5C6660', linea: '#E6E2D6',
  frio: '#2B6A6E', caliente: '#C0492B', corte: '#9E8152', montaje: '#3F7D44',
}
const SE = 'Newsreader, Georgia, serif'
const SN = 'Inter Tight, system-ui, sans-serif'

// Ubicaciones / eventos de la semana (identificados por color, como hace Carmen)
const EVENTOS = [
  { id: 'alba', nombre: 'Hacienda El Alba', pax: 115, fecha: '20-06-2026', color: '#3F7D44' },
  { id: 'fresnos', nombre: 'Finca Los Fresnos', pax: 131, fecha: '20-06-2026', color: '#9E8152' },
  { id: 'trinidad', nombre: 'Hacienda Trinidad', pax: 136, fecha: '20-06-2026', color: '#2B6A6E' },
  { id: 'decanato', nombre: 'Decanato And. Occidental', pax: 20, fecha: '18-06-2026', color: '#7A2E2E' },
]

type Ctrl = 'termico' | 'refrig' | 'congel' | 'desinf'
interface Elab {
  nombre: string
  eventos: string[]
  depende: string[]   // sub-elaboraciones (MAYÚSCULAS en el parte) = dependencias
  ctrl: Ctrl[]
}
interface Partida { clave: string; nombre: string; color: string; icono: string; elabs: Elab[] }

// Datos REALES del parte de elaboración (semana 20/6/2026)
const PARTIDAS: Partida[] = [
  {
    clave: 'frio', nombre: 'Frío', color: C.frio, icono: '❄️',
    elabs: [
      { nombre: 'Ensaladilla marisco y crujiente de camarón', eventos: ['trinidad'], depende: ['ENSALADILLA (base)', 'langostinos al ajillo', 'CAMARÓN COCIDO'], ctrl: ['refrig'] },
      { nombre: 'Salmorejo cordobés', eventos: ['trinidad'], depende: [], ctrl: ['refrig'] },
      { nombre: 'Ajo blanco de coco con dados de mojama', eventos: ['alba', 'trinidad'], depende: ['AJO BLANCO DE COCO', 'FONDO HUERTANO', 'TAQUITOS DE MOJAMA'], ctrl: ['refrig'] },
      { nombre: 'Dados de atún de almadraba con algas wakame', eventos: ['fresnos'], depende: ['MAHONESA DE SOJA'], ctrl: ['congel', 'desinf'] },
      { nombre: 'Atún rojo en tartar al provenzal', eventos: ['trinidad', 'fresnos'], depende: ['ATÚN LOMO ELABORADO'], ctrl: ['congel'] },
    ],
  },
  {
    clave: 'caliente', nombre: 'Caliente', color: C.caliente, icono: '🔥',
    elabs: [
      { nombre: 'Arroz meloso con pato confitado', eventos: ['trinidad', 'fresnos'], depende: ['FONDO DE ARROZ CON PATO', 'PATO CONFITADO DESMIGADO'], ctrl: ['termico'] },
      { nombre: 'Delicia de pollo con mostaza y miel', eventos: ['alba'], depende: ['SALSA DE MOSTAZA Y MIEL'], ctrl: ['termico'] },
      { nombre: 'Mini canelón de pularda con salsa de chalota trufada', eventos: ['fresnos', 'trinidad'], depende: ['salsa de canelón', 'salsa de chalota'], ctrl: ['termico'] },
      { nombre: 'Bao relleno de pollo al pimentón con alioli ahumado', eventos: ['fresnos'], depende: ['alioli pimiento ahumado'], ctrl: ['termico'] },
      { nombre: 'Brocheta criolla con chimichurri', eventos: ['fresnos'], depende: ['CHIMICHURRI'], ctrl: ['termico'] },
    ],
  },
  {
    clave: 'corte', nombre: 'Corte', color: C.corte, icono: '🔪',
    elabs: [
      { nombre: 'Caña de lomo ibérica', eventos: ['alba'], depende: ['CAÑA DE LOMO CORTADA'], ctrl: [] },
      { nombre: 'Rincón andaluz · 5 tipos de quesos', eventos: ['trinidad'], depende: ['5 TIPOS DE QUESOS CORTADOS'], ctrl: [] },
      { nombre: 'Anchoa sobre pimiento y hojaldre caramelizado', eventos: ['fresnos'], depende: ['HOJALDRE CORTADO RECTANGULAR', 'LINGOTE HOJALDRE CARAMELIZADO', 'PIMIENTOS ASADO'], ctrl: ['desinf'] },
    ],
  },
  {
    clave: 'montaje', nombre: 'Montaje', color: C.montaje, icono: '🧩',
    elabs: [
      { nombre: 'Antojito de queso de cabra', eventos: ['alba', 'decanato'], depende: ['MEDALLÓN caramelizado', 'QUESO DE CABRA', 'CEBOLLA CARAMELIZADA'], ctrl: [] },
      { nombre: 'Hamburguesa neoyorkina de ternera, cheddar y bacón', eventos: ['fresnos'], depende: ['HAMBURGUESA MONTADA'], ctrl: ['termico'] },
      { nombre: 'Bocado de coca con presa, queso curado y trufa', eventos: ['trinidad', 'fresnos'], depende: ['mogote confitado', 'palitos de coca'], ctrl: [] },
    ],
  },
]

const CTRL_INFO: Record<Ctrl, { txt: string; icono: string }> = {
  termico: { txt: 'Tratamiento térmico >70 °C / 2 min', icono: '🌡️' },
  refrig: { txt: 'Refrigeración 60→10 °C en <2 h', icono: '🧊' },
  congel: { txt: 'Congelación ≤ −18 °C', icono: '❄️' },
  desinf: { txt: 'Desinfección (dosif./perman./aclarado)', icono: '🧪' },
}

function eventoColor(id: string): string {
  return EVENTOS.find(e => e.id === id)?.color ?? C.ink3
}

function ElabCard({ e }: { e: Elab }): ReactElement {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: SN, fontWeight: 700, fontSize: 'clamp(14px,3vw,16px)', color: C.tinta, lineHeight: 1.25 }}>{e.nombre}</div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {e.eventos.map(ev => (
            <span key={ev} title={EVENTOS.find(x => x.id === ev)?.nombre} style={{ width: 12, height: 12, borderRadius: '50%', background: eventoColor(ev), display: 'inline-block' }} />
          ))}
        </div>
      </div>
      {e.depende.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <span style={{ fontFamily: SN, fontSize: 11, fontWeight: 700, letterSpacing: .5, color: C.oro, textTransform: 'uppercase' }}>Depende de</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
            {e.depende.map(d => (
              <span key={d} style={{ fontFamily: SN, fontSize: 12, color: C.verde, background: 'rgba(2,71,59,.07)', border: `1px solid rgba(2,71,59,.18)`, borderRadius: 6, padding: '2px 7px' }}>↳ {d}</span>
            ))}
          </div>
        </div>
      )}
      {e.ctrl.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {e.ctrl.map(c => (
            <span key={c} title={CTRL_INFO[c].txt} style={{ fontFamily: SN, fontSize: 11.5, color: C.ink3, background: C.papel, border: `1px solid ${C.linea}`, borderRadius: 20, padding: '2px 9px' }}>{CTRL_INFO[c].icono} {CTRL_INFO[c].txt}</span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PartePage(): ReactElement {
  const totalPax = EVENTOS.reduce((a, e) => a + e.pax, 0)
  const totalElab = PARTIDAS.reduce((a, p) => a + p.elabs.length, 0)
  return (
    <div style={{ minHeight: '100vh', background: C.papel, color: C.tinta, fontFamily: SN }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(20px,5vw,44px) clamp(16px,4vw,40px) 64px' }}>

        {/* Cabecera */}
        <div style={{ borderBottom: `3px solid ${C.verde}`, paddingBottom: 18, marginBottom: 24 }}>
          <div style={{ fontFamily: SN, letterSpacing: 3, fontSize: 13, color: C.oro, textTransform: 'uppercase', fontWeight: 700 }}>Catering Joaquín Jaén</div>
          <h1 style={{ fontFamily: SE, fontWeight: 600, fontSize: 'clamp(26px,5.5vw,44px)', color: C.verde, margin: '6px 0 4px', lineHeight: 1.1 }}>
            Tu parte de elaboración, <span style={{ color: C.oro }}>organizado solo</span>
          </h1>
          <div style={{ fontFamily: SN, fontSize: 'clamp(14px,3.2vw,17px)', color: C.ink3 }}>Semana de servicio · 20 de junio de 2026</div>
        </div>

        {/* Totales */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,150px),1fr))', gap: 12, marginBottom: 22 }}>
          {[
            { n: totalPax, l: 'Comensales (PAX)' },
            { n: totalElab, l: 'Elaboraciones' },
            { n: EVENTOS.length, l: 'Eventos / ubicaciones' },
            { n: PARTIDAS.length, l: 'Partidas' },
          ].map(s => (
            <div key={s.l} style={{ background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontFamily: SE, fontSize: 30, fontWeight: 600, color: C.verde }}>{s.n}</div>
              <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Eventos por color */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 28 }}>
          {EVENTOS.map(ev => (
            <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 10, padding: '8px 12px' }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: ev.color }} />
              <span style={{ fontFamily: SN, fontWeight: 700, fontSize: 13.5, color: C.tinta }}>{ev.nombre}</span>
              <span style={{ fontFamily: SN, fontSize: 12.5, color: C.ink3 }}>· {ev.pax} pax · {ev.fecha}</span>
            </div>
          ))}
        </div>

        {/* Partidas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 18 }}>
          {PARTIDAS.map(p => (
            <div key={p.clave}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: p.color, color: '#fff', marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>{p.icono}</span>
                <span style={{ fontFamily: SN, fontWeight: 800, fontSize: 16, letterSpacing: .5 }}>{p.nombre.toUpperCase()}</span>
                <span style={{ marginLeft: 'auto', fontFamily: SN, fontSize: 13, opacity: .9 }}>{p.elabs.length}</span>
              </div>
              {p.elabs.map(e => <ElabCard key={e.nombre} e={e} />)}
            </div>
          ))}
        </div>

        {/* Leyenda de control sanitario */}
        <div style={{ marginTop: 30, background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontFamily: SN, fontWeight: 700, fontSize: 13, letterSpacing: 1, color: C.oro, textTransform: 'uppercase', marginBottom: 10 }}>Puntos de control que el sistema vigila por ti</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {(Object.keys(CTRL_INFO) as Ctrl[]).map(c => (
              <span key={c} style={{ fontFamily: SN, fontSize: 13, color: C.tinta }}>{CTRL_INFO[c].icono} {CTRL_INFO[c].txt}</span>
            ))}
          </div>
        </div>

        {/* Pie */}
        <p style={{ fontFamily: SN, fontSize: 15, color: C.ink3, textAlign: 'center', lineHeight: 1.5, marginTop: 28 }}>
          Estos son tus datos reales del 20 de junio. El sistema los reparte por partidas, encadena las
          sub-elaboraciones (las salsas y fondos avisan al plato que dependen de ellos) y vigila los puntos de
          control. <strong style={{ color: C.verde }}>Tú dejas de hacerlo de cabeza.</strong>
        </p>
        <div style={{ textAlign: 'center', marginTop: 10, fontFamily: SN, fontSize: 12.5, color: C.oro, letterSpacing: 1 }}>CATERING JOAQUÍN JAÉN · COCINA · ia.rest</div>
      </div>
    </div>
  )
}
