// Landing personalizada por lead — /kathmandu, /ovejas-negras, etc.
// NO indexable por Google (noindex) — para uso comercial personalizado
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'
import { Metadata } from 'next'

export const dynamic = 'force-dynamic'

// No indexar estas páginas — son para leads, no para Google
export const metadata: Metadata = {
  robots: "noindex, nofollow",
}

const R='#D9442B',D='#14110E',P='#F6F1E7',B2='#1E1A15',B3='#2A221A'
const I3='#9C8E7E',I4='#6B5F52',RD='#2A2520',RL='#D8CDB6'
const AM='#E8A33B',GR='#3F7D44'
const SE="'Newsreader',Georgia,serif",SN="'Inter Tight',system-ui,sans-serif"

// Módulos por tipo de negocio
const MODULOS_TIPO: Record<string, { sala: string[][], cocina: string[][], gestion: string[][] }> = {
  indio: {
    sala: [['🎙','Comandas por voz','Entiende variantes, alergias y cantidades al instante.'],['📺','KDS cocina','Cocina recibe cada plato con sus modificaciones exactas.'],['💳','Cobro automático','Factura generada al cerrar la mesa.'],['📊','Analytics','Qué plato vende más. En qué franja horaria.']],
    cocina: [['🧑‍🍳','Asistente IA','El jefe pregunta. La IA responde.'],['📋','Elaboraciones','Fichas técnicas y alérgenos controlados.'],['🏷','Etiquetado','Caducidades y trazabilidad automática.'],['✅','APPCC','Control sanitario sin burocracia.']],
    gestion: [['📷','Control albaranes','Foto y listo.'],['📦','Almacén y escandallos','Coste real por plato.'],['🤝','Proveedores','Pedidos automatizados.'],['🎉','Eventos','Presupuestos y coordinación.'],['🔮','Previsión demanda','La IA anticipa lo que necesitas.'],['🏢','Multi-local','Todos los locales desde un panel.']]
  },
  mediterraneo: {
    sala: [['🎙','Comandas por voz','Desde cualquier dispositivo.'],['📺','KDS por partida','Cada cocina con lo suyo.'],['💳','Cobro y factura','Automático. Sin papel.'],['📊','Analytics','Ventas y márgenes en tiempo real.']],
    cocina: [['🧑‍🍳','Asistente IA','Consultas en cocina sin pantallas.'],['📋','Elaboraciones','Fichas técnicas y caducidades.'],['🏷','Etiquetado','Trazabilidad completa.'],['✅','APPCC','Sin registros manuales.']],
    gestion: [['📷','Control albaranes','Foto y listo.'],['📦','Almacén','Coste real. Alertas automáticas.'],['🤝','Proveedores','Pedidos desde el sistema.'],['🎉','Eventos','Portal para el cliente.'],['🔮','Previsión','La IA anticipa la demanda.'],['🏢','Multi-local','Un panel para todos los locales.']]
  },
  catering: {
    sala: [['🎙','Voz en el servicio','Comandas durante el evento.'],['📺','KDS por pases','Cada pase en el momento exacto.'],['💳','Facturación','Generada automáticamente al cierre.'],['📊','Rentabilidad','Coste real vs presupuesto por evento.']],
    cocina: [['🧑‍🍳','Control de tiempos','Qué va en cada pase.'],['📋','Fichas y alérgenos','Trazabilidad por evento.'],['🏷','APPCC','Plato testigo y temperaturas.'],['✅','Sanitario','Cumplimiento automático.']],
    gestion: [['🎉','Portal cliente','Elige menú y confirma online.'],['🤝','Proveedores externos','Todo coordinado desde el sistema.'],['📦','Almacén','Coste por comensal.'],['📷','Albaranes','Foto y listo.'],['🔮','Previsión','Stock listo para cada evento.'],['📱','Captación leads','Formulario web para bodas y eventos.']]
  },
  bar: {
    sala: [['🎙','Comandas rápidas','Tan rápido como hablar.'],['📺','Barra y cocina','Coordinadas al instante.'],['💳','Cobro rápido','Mesa, barra o para llevar.'],['📊','Ranking de tapas','Qué vende más. En tiempo real.']],
    cocina: [['🧑‍🍳','Control salidas','Qué hay pendiente.'],['📋','Escandallos','Coste real de cada tapa.'],['🏷','Caducidades','Control automático.'],['✅','APPCC','Sin registros manuales.']],
    gestion: [['📦','Almacén','Sabes cuándo pedir antes de quedarte sin.'],['📷','Albaranes','Foto y listo.'],['🤝','Proveedores','Sin llamadas.'],['🔮','Previsión','La IA te avisa.'],['📊','Analytics','Horas pico y márgenes.'],['🏢','Multi-local','Un panel para todos los bares.']]
  },
  multilocal: {
    sala: [['🎙','Voz en todos los locales','Cada local con su sistema.'],['📺','KDS por partida','Cada cocina con su pantalla.'],['💳','Cobro multi-local','Ventas por local en tiempo real.'],['📊','Analytics comparativo','Qué local vende más y qué platos.']],
    cocina: [['🧑‍🍳','IA en cada cocina','El jefe de cada local tiene su asistente.'],['📋','Fichas centralizadas','Compartidas entre locales.'],['🏷','APPCC','Control en todos los locales.'],['✅','Alertas','Caducidades y stock crítico.']],
    gestion: [['📦','Stock central','Transferencias entre locales.'],['📷','Albaranes por local','Cada recepción registrada.'],['🤝','Proveedores grupales','Pedidos con mejores condiciones.'],['🎉','Eventos','Presupuestos en cualquier local.'],['🔮','Previsión por local','Demanda anticipada por sede.'],['👥','Personal','Fichajes para todo el grupo.']]
  },
}

function getModulos(tipo: string) {
  if (!tipo) return MODULOS_TIPO.mediterraneo
  const t = tipo.toLowerCase()
  if (t.includes('indi') || t.includes('nepal') || t.includes('asian') || t.includes('chino') || t.includes('japon')) return MODULOS_TIPO.indio
  if (t.includes('cater') || t.includes('event') || t.includes('bod')) return MODULOS_TIPO.catering
  if (t.includes('bar') || t.includes('tapa') || t.includes('tabern')) return MODULOS_TIPO.bar
  if (t.includes('multi') || t.includes('grupo') || t.includes('caden')) return MODULOS_TIPO.multilocal
  return MODULOS_TIPO.mediterraneo
}

export default async function LandingPersonalizada({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data: lead } = await supabase
    .from('leads')
    .select('id, empresa, restaurante, nombre, ciudad, tipo_negocio, landing_vista_at, landing_vistas, email, telefono, pain_points, estudio_completo')
    .eq('landing_slug', slug)
    .maybeSingle()

  if (!lead) notFound()

  // Registrar visita
  const esNueva = !lead.landing_vista_at
  await supabase.from('leads').update({
    landing_vista_at: lead.landing_vista_at || new Date().toISOString(),
    landing_vistas: (lead.landing_vistas || 0) + 1,
  }).eq('id', lead.id)

  if (esNueva) {
    tgAlert(`👁 <b>${lead.empresa || lead.restaurante}</b> ha abierto su landing personalizada\n📍 ${lead.ciudad || '—'}`, 'aviso')
  }

  const nombre = lead.empresa || lead.restaurante || 'Vuestro restaurante'
  const ciudad = lead.ciudad || ''
  const modulos = getModulos(lead.tipo_negocio || '')
  const MAIL = `mailto:hola@iarest.es?subject=Videollamada%20ia.rest%20–%20${encodeURIComponent(nombre)}&body=Hola%2C%20soy%20de%20${encodeURIComponent(nombre)}%20y%20me%20gustar%C3%ADa%20ver%20ia.rest.`

  return (
    <main style={{ background: P, minHeight: '100vh', color: D, fontFamily: SN }}>

      <nav style={{ padding: '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${RL}` }}>
        <span style={{ fontFamily: SE, fontSize: 22, color: D }}>ia<span style={{ color: R }}>.</span>rest</span>
        <a href={MAIL} style={{ background: R, color: '#fff', padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          Solicitar videollamada →
        </a>
      </nav>

      {/* HERO PERSONALIZADO */}
      <section style={{ maxWidth: 700, margin: '0 auto', padding: '80px 28px 72px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', background: `${R}15`, border: `1px solid ${R}35`, borderRadius: 20, padding: '4px 16px', fontSize: 11, color: R, letterSpacing: '.12em', textTransform: 'uppercase' as const, fontWeight: 700, marginBottom: 32 }}>
          {ciudad ? `${nombre} · ${ciudad}` : nombre}
        </div>
        <h1 style={{ fontFamily: SE, fontSize: 50, fontWeight: 300, lineHeight: 1.1, margin: '0 0 24px', color: D }}>
          Esto es lo que<br /><span style={{ color: R }}>ia.rest puede hacer por {nombre.split(' ')[0]}.</span>
        </h1>
        <p style={{ fontSize: 18, color: I4, lineHeight: 1.7, margin: '0 0 44px', maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
          Sala, cocina, almacén, proveedores y eventos. Todo conectado y automatizado desde un solo sistema.
        </p>
        <a href={MAIL} style={{ display: 'inline-block', background: R, color: '#fff', padding: '18px 44px', borderRadius: 10, fontSize: 16, fontWeight: 700, textDecoration: 'none' }}>
          Ver cómo funciona — 15 min
        </a>
        <p style={{ fontSize: 12, color: I3, marginTop: 14 }}>Videollamada gratuita · Sin compromiso</p>
      </section>

      {/* 3 BLOQUES */}
      <section style={{ background: D, padding: '72px 28px' }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          {[
            { l: 'En sala', c: R, items: modulos.sala },
            { l: 'En cocina', c: AM, items: modulos.cocina },
            { l: 'En gestión', c: GR, items: modulos.gestion },
          ].map(({ l, c, items }) => (
            <div key={l} style={{ marginBottom: 52 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 26 }}>
                <div style={{ width: 3, height: 30, background: c, borderRadius: 2 }} />
                <h2 style={{ fontFamily: SE, fontSize: 26, fontWeight: 300, color: P, margin: 0 }}>{l}</h2>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(185px,1fr))', gap: 2 }}>
                {items.map(([e, t, desc]: string[]) => (
                  <div key={t} style={{ background: B2, border: `1px solid ${RD}`, padding: '22px 18px' }}>
                    <div style={{ fontSize: 22, marginBottom: 10 }}>{e}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: c, marginBottom: 6 }}>{t}</div>
                    <div style={{ fontSize: 12, color: I3, lineHeight: 1.6 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PRECIO */}
      <section style={{ background: D, borderTop: `1px solid ${RD}`, padding: '52px 28px' }}>
        <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center' as const }}>
          <p style={{ fontFamily: SE, fontSize: 34, fontWeight: 300, color: P, margin: '0 0 10px' }}>Sin sorpresas</p>
          <p style={{ fontSize: 14, color: I3, margin: '0 0 26px', lineHeight: 1.65 }}>
            Precio fijo mensual. <strong style={{ color: P }}>Sin comisión por venta. Sin permanencia.</strong>
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' as const, marginBottom: 14 }}>
            {[['59€/mes', 'Plan base'], ['+20€', 'Por usuario (2-6)'], ['+15€', 'Por usuario (7+)']].map(([p, l]) => (
              <div key={l} style={{ background: B3, border: `1px solid ${RD}`, borderRadius: 10, padding: '12px 20px', textAlign: 'center' as const }}>
                <div style={{ fontFamily: SE, fontSize: 22, color: R }}>{p}</div>
                <div style={{ fontSize: 11, color: I3, marginTop: 3 }}>{l}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: I4 }}>14 días de prueba gratuita · Sin tarjeta</p>
        </div>
      </section>

      {/* CTA FINAL */}
      <section style={{ maxWidth: 500, margin: '0 auto', padding: '70px 28px 80px', textAlign: 'center' as const }}>
        <h2 style={{ fontFamily: SE, fontSize: 32, fontWeight: 300, color: D, marginBottom: 14 }}>
          ¿Lo vemos juntos, {nombre.split(' ')[0]}?
        </h2>
        <p style={{ fontSize: 15, color: I4, marginBottom: 36, lineHeight: 1.65 }}>
          15 minutos. Te mostramos el sistema funcionando. Sin instalación, sin compromiso.
        </p>
        <a href={MAIL} style={{ display: 'inline-block', background: R, color: '#fff', padding: '18px 48px', borderRadius: 10, fontSize: 16, fontWeight: 700, textDecoration: 'none' }}>
          Solicitar videollamada gratuita →
        </a>
        <p style={{ fontSize: 13, color: I3, marginTop: 16 }}>
          O escríbenos a <a href="mailto:hola@iarest.es" style={{ color: R, textDecoration: 'none', fontWeight: 600 }}>hola@iarest.es</a>
        </p>
      </section>

      <footer style={{ borderTop: `1px solid ${RL}`, padding: '22px', textAlign: 'center' as const }}>
        <span style={{ fontSize: 12, color: I3 }}>ia<span style={{ color: R }}>.</span>rest · <a href="https://www.iarest.es" style={{ color: I3, textDecoration: 'none' }}>www.iarest.es</a></span>
      </footer>

    </main>
  )
}
