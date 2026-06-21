import { SE, SN, SM } from '@/lib/colors'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'TPV por Voz para Bares: Guía Completa 2026 | ia.rest',
  description: 'Descubre cómo un TPV por voz simplifica comandas en tu bar. Comparativa con SmartBar, Agora y otras soluciones. Prueba gratis ia.rest, único TPV en español sin comisión.',
  alternates: { canonical: 'https://www.iarest.es/blog/tpv-voz-para-bares' },
  openGraph: {
    title: 'TPV por Voz para Bares: Guía Completa 2026',
    description: 'Cómo funciona, cuánto cuesta y por qué ia.rest es el único TPV por voz en español sin comisión.',
    url: 'https://www.iarest.es/blog/tpv-voz-para-bares',
    type: 'article',
    publishedTime: '2026-05-23',
    modifiedTime: '2026-05-23',
  },
  keywords: [
    'tpv por voz para bares', 'sistema comandas por voz', 'tpv hosteleria barato',
    'alternativa smartbar', 'tpv voz restaurante', 'comandas por voz hosteleria',
    'tpv sin comision', 'software tpv bares espana', 'tpv voz barato',
  ],
}

const C = {
  bg: '#F6F1E7', ink: '#1A1714', ink2: '#3A332C', ink3: '#6B5F52', ink4: '#9A8D7C',
  red: '#D9442B', redS: '#F4D8CF', amber: '#E8A33B', amberS: '#E8A33B15',
  rule: '#D8CDB6', paper2: '#EFE7D6', green: '#3F7D44', greenS: '#3F7D4415',
}

export default function ArticuloTpvVoz() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, fontFamily: SN }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '48px 20px' }}>

        {/* Nav */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 48 }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: C.ink }}>
              ia<span style={{ color: C.red }}>.</span>rest
            </span>
          </a>
          <span style={{ color: C.rule }}>/</span>
          <a href="/blog" style={{ fontSize: 13, color: C.ink3, textDecoration: 'none' }}>Blog</a>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <span style={{
              fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
              fontWeight: 600, color: C.red, background: C.redS,
              padding: '3px 10px', borderRadius: 100,
            }}>Hostelería</span>
            <span style={{ fontSize: 12, color: C.ink3, fontFamily: SM }}>Mayo 2026 · 9 min lectura</span>
          </div>
          <h1 style={{
            fontFamily: SE, fontStyle: 'italic', fontSize: 38, color: C.ink,
            margin: '0 0 20px', lineHeight: 1.15, letterSpacing: '-0.5px',
          }}>
            TPV por Voz para Bares: Guía Completa 2026
          </h1>
          <p style={{ fontSize: 18, color: C.ink2, lineHeight: 1.7, margin: 0 }}>
            Si diriges un bar o restaurante, sabes lo que es el caos de la hora punta: camareros
            con pedidos en la cabeza, errores de comanda, dinero perdido. Un TPV por voz lo resuelve.
            En esta guía te explicamos cómo funciona, cuánto cuesta y cuál es la mejor opción en España.
          </p>
        </div>

        {/* Índice */}
        <div style={{
          background: C.paper2, border: `1px solid ${C.rule}`,
          borderRadius: 8, padding: '20px 24px', marginBottom: 40,
        }}>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', fontWeight: 700, color: C.ink3, marginBottom: 12, fontFamily: SM }}>
            CONTENIDO
          </div>
          {[
            '¿Qué es un TPV por voz y para qué sirve?',
            'Cómo funciona el reconocimiento de voz en hostelería',
            'Beneficios reales: tiempo, errores y dinero',
            'Comparativa: TPV por voz vs soluciones tradicionales',
            'Cuánto cuesta un TPV por voz en España',
            'ia.rest: el único TPV por voz en español sin comisión',
            'Preguntas frecuentes',
          ].map((item, i) => (
            <div key={i} style={{ fontSize: 13, color: C.red, padding: '4px 0', display: 'flex', gap: 8 }}>
              <span style={{ color: C.ink4, fontFamily: SM, minWidth: 20 }}>{i + 1}.</span>
              <span>{item}</span>
            </div>
          ))}
        </div>

        {/* Sección 1 */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontFamily: SE, fontSize: 26, color: C.ink, margin: '0 0 16px', lineHeight: 1.2 }}>
            ¿Qué es un TPV por voz y para qué sirve?
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.75, color: C.ink2, marginBottom: 16 }}>
            Un <strong>TPV por voz</strong> (Terminal Punto de Venta por voz) es un sistema que permite
            al camarero dictar los pedidos en lugar de escribirlos. La inteligencia artificial
            transcribe el audio, identifica los productos y envía la comanda a cocina en menos de
            medio segundo.
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.75, color: C.ink2, marginBottom: 16 }}>
            Con un TPV tradicional, registrar un pedido de 4 personas lleva entre 90 segundos y
            2 minutos. Con voz, el mismo pedido tarda 20-30 segundos. En un servicio de
            200 comandas al día, eso son <strong>más de 3 horas ahorradas</strong>.
          </p>

          {/* Comparación rápida */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 24,
          }}>
            {[
              { label: 'TPV tradicional', color: C.ink3, items: ['Anotar en papel', 'Ir a la caja', 'Buscar en el menú', 'Confirmar cantidades', '90-120 segundos'] },
              { label: 'TPV por voz', color: C.green, items: ['Hablar al micro', 'Sistema registra solo', 'Envío automático a cocina', 'Confirmación visual', '20-30 segundos'] },
            ].map((col) => (
              <div key={col.label} style={{
                background: col.color === C.green ? C.greenS : C.paper2,
                border: `1px solid ${col.color === C.green ? C.green + '40' : C.rule}`,
                borderRadius: 8, padding: '16px 18px',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: col.color, marginBottom: 10, fontFamily: SM, letterSpacing: '0.06em' }}>
                  {col.label.toUpperCase()}
                </div>
                {col.items.map((item, i) => (
                  <div key={i} style={{ fontSize: 13, color: C.ink2, padding: '3px 0', display: 'flex', gap: 6 }}>
                    <span style={{ color: col.color }}>▸</span> {item}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <div style={{ borderTop: `1px solid ${C.rule}`, margin: '0 0 48px' }} />

        {/* Sección 2 */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontFamily: SE, fontSize: 26, color: C.ink, margin: '0 0 16px', lineHeight: 1.2 }}>
            Cómo funciona el reconocimiento de voz en hostelería
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.75, color: C.ink2, marginBottom: 16 }}>
            Los sistemas modernos de voz para hostelería usan modelos de IA entrenados
            específicamente en vocabulario de restauración: nombres de platos, modificadores
            ("sin gluten", "poco hecho"), cantidades y zonas de la sala.
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.75, color: C.ink2, marginBottom: 24 }}>
            El proceso completo de una comanda por voz es así:
          </p>
          {[
            { n: '01', title: 'El camarero habla', desc: 'Pulsa el botón PTT (push-to-talk) en su móvil o wearable y dicta el pedido en español natural.' },
            { n: '02', title: 'IA transcribe y clasifica', desc: 'El modelo de lenguaje identifica productos, cantidades y modificadores con una precisión superior al 97%.' },
            { n: '03', title: 'Confirmación visual', desc: 'En 0,5 segundos el camarero ve en pantalla lo que se registró. Puede corregir antes de enviar.' },
            { n: '04', title: 'Ticket en cocina', desc: 'La comanda llega al KDS (pantalla de cocina) al instante. Los cocineros ven la orden sin papel.' },
          ].map((step) => (
            <div key={step.n} style={{
              display: 'flex', gap: 16, marginBottom: 20,
              padding: '16px 18px', background: C.paper2,
              border: `1px solid ${C.rule}`, borderRadius: 8,
            }}>
              <div style={{
                fontFamily: SM, fontSize: 20, color: C.red, minWidth: 36,
                fontWeight: 700, lineHeight: 1,
              }}>{step.n}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>{step.title}</div>
                <div style={{ fontSize: 13, color: C.ink3, lineHeight: 1.6 }}>{step.desc}</div>
              </div>
            </div>
          ))}
        </section>

        <div style={{ borderTop: `1px solid ${C.rule}`, margin: '0 0 48px' }} />

        {/* Sección 3 */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontFamily: SE, fontSize: 26, color: C.ink, margin: '0 0 16px', lineHeight: 1.2 }}>
            Beneficios reales: tiempo, errores y dinero
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.75, color: C.ink2, marginBottom: 24 }}>
            Más allá de la tecnología, lo que importa es el impacto en tu negocio.
            Estos son los beneficios que reportan los bares que han adoptado TPV por voz:
          </p>
          <div style={{ display: 'grid', gap: 12 }}>
            {[
              { icon: '⏱', title: '+3 horas/semana por camarero', desc: 'Menos tiempo dictando pedidos = más tiempo atendiendo clientes y aumentando el ticket medio.' },
              { icon: '❌', title: 'Errores de comanda casi inexistentes', desc: 'La IA no olvida, no malinterpreta letra de camarero ni confunde mesas. La tasa de error baja del 10% al 2%.' },
              { icon: '📊', title: 'Datos en tiempo real', desc: 'Sabes qué platos venden más, a qué hora, en qué zona. Información que con papel nunca tendrías.' },
              { icon: '💶', title: 'Sin comisión por transacción', desc: 'Los TPV clásicos cobran 0,5-2% por pago con tarjeta. ia.rest no cobra comisión. En un bar con 10.000€/mes de ventas, son hasta 200€ ahorrados.' },
            ].map((b) => (
              <div key={b.title} style={{
                display: 'flex', gap: 14, padding: '16px 18px',
                background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 8,
              }}>
                <span style={{ fontSize: 22, minWidth: 30 }}>{b.icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>{b.title}</div>
                  <div style={{ fontSize: 13, color: C.ink3, lineHeight: 1.6 }}>{b.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div style={{ borderTop: `1px solid ${C.rule}`, margin: '0 0 48px' }} />

        {/* Sección 4: Comparativa */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontFamily: SE, fontSize: 26, color: C.ink, margin: '0 0 16px', lineHeight: 1.2 }}>
            Comparativa: TPV por voz vs soluciones tradicionales
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.75, color: C.ink2, marginBottom: 24 }}>
            En España, las opciones más habituales para gestionar comandas en hostelería son
            Agora TPV, ICG, Revo XEF y SmartBar. Ninguno ofrece comandas por voz nativas.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.paper2 }}>
                  {['', 'ia.rest', 'SmartBar', 'Agora TPV', 'Revo XEF'].map((h) => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: 'left', fontFamily: SM,
                      fontSize: 11, letterSpacing: '0.08em', color: C.ink3,
                      borderBottom: `2px solid ${C.rule}`,
                      ...(h === 'ia.rest' ? { color: C.red } : {}),
                    }}>{h.toUpperCase()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['Voz nativa', '✅ Sí', '❌ No', '❌ No', '❌ No'],
                  ['Precio base/mes', '59€', '99,99€', 'Consultar', '~80€'],
                  ['Comisión transacción', '0%', 'Consultar', 'Consultar', 'Consultar'],
                  ['KDS cocina incluido', '✅ Sí', '✅ Sí', '✅ Sí', '✅ Sí'],
                  ['VeriFactu incluido', '✅ Sí', 'Extra', 'Extra', 'Extra'],
                  ['Multi-local nativo', '✅ Sí', '❌ No', '❌ No', 'Limitado'],
                  ['Trial gratuito', '14 días', 'No', 'No', 'Demo'],
                ].map((row, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.rule}`, background: i % 2 === 0 ? C.bg : C.paper2 }}>
                    {row.map((cell, j) => (
                      <td key={j} style={{
                        padding: '10px 14px',
                        color: j === 1 ? C.ink : cell.startsWith('✅') ? C.green : cell.startsWith('❌') ? C.red : C.ink2,
                        fontWeight: j === 1 ? 600 : 400,
                      }}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 12, color: C.ink4, marginTop: 10 }}>
            * Precios consultados en mayo 2026. Verifica en las webs oficiales de cada proveedor.
          </p>
        </section>

        <div style={{ borderTop: `1px solid ${C.rule}`, margin: '0 0 48px' }} />

        {/* Sección 5: Precios */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontFamily: SE, fontSize: 26, color: C.ink, margin: '0 0 16px', lineHeight: 1.2 }}>
            Cuánto cuesta un TPV por voz en España
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.75, color: C.ink2, marginBottom: 16 }}>
            El precio de un TPV por voz varía según el número de usuarios y funcionalidades.
            En ia.rest el modelo es simple y sin sorpresas:
          </p>
          <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Base', price: '59€/mes', desc: '1 local, usuarios ilimitados en modo básico, KDS y VeriFactu incluidos' },
              { label: '+Usuario (2-6)', price: '+20€/usuario', desc: 'Camareros, cocina y jefe de sala adicionales' },
              { label: '+Usuario (7+)', price: '+15€/usuario', desc: 'Descuento por volumen a partir del séptimo usuario' },
              { label: 'QR en mesa', price: '+12€/mesa/mes', desc: 'Pedido y cobro desde el móvil del cliente' },
            ].map((item) => (
              <div key={item.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', background: C.paper2,
                border: `1px solid ${C.rule}`, borderRadius: 8,
              }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{item.label}</span>
                  <span style={{ fontSize: 12, color: C.ink3, marginLeft: 8 }}>{item.desc}</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.red, whiteSpace: 'nowrap', marginLeft: 12 }}>{item.price}</span>
              </div>
            ))}
          </div>
          <div style={{
            background: C.greenS, border: `1px solid ${C.green}40`,
            borderRadius: 8, padding: '14px 18px', fontSize: 13, color: C.ink2,
          }}>
            <strong style={{ color: C.green }}>Sin comisión por transacción.</strong>{' '}
            A diferencia de muchos TPV, ia.rest no cobra un porcentaje de cada venta.
            Un bar con 15.000€/mes en ventas ahorra hasta 300€/mes frente a soluciones con comisión.
          </div>
        </section>

        <div style={{ borderTop: `1px solid ${C.rule}`, margin: '0 0 48px' }} />

        {/* Sección 6: ia.rest */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontFamily: SE, fontSize: 26, color: C.ink, margin: '0 0 16px', lineHeight: 1.2 }}>
            ia.rest: el único TPV por voz en español sin comisión
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.75, color: C.ink2, marginBottom: 16 }}>
            ia.rest nació para resolver exactamente este problema: dar a la hostelería española
            un sistema de voz que entienda el español real, se integre con impresoras y KDS
            existentes, y no cobre comisión por cada transacción.
          </p>
          <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
            {[
              'Voz en español nativo — entiende acentos regionales y vocabulario hostelero',
              'KDS incluido — la cocina ve las comandas en tiempo real en pantalla',
              'VeriFactu homologado — cumplimiento fiscal 2026 sin coste adicional',
              'Multi-local nativo — gestiona varios bares desde un solo panel',
              'Bridge local — funciona aunque se caiga internet mediante hardware en local',
              'Trial 14 días — sin tarjeta de crédito, cancelas cuando quieras',
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, fontSize: 14, color: C.ink2, alignItems: 'flex-start' }}>
                <span style={{ color: C.green, marginTop: 2, fontSize: 16 }}>✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <div style={{ borderTop: `1px solid ${C.rule}`, margin: '0 0 48px' }} />

        {/* FAQ */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontFamily: SE, fontSize: 26, color: C.ink, margin: '0 0 24px', lineHeight: 1.2 }}>
            Preguntas frecuentes
          </h2>
          {[
            {
              q: '¿Funciona el TPV por voz en un bar con mucho ruido?',
              a: 'Sí. ia.rest tiene detección de ruido ambiente de 4 capas y auto-retry. En pruebas en bares de alta concurrencia la precisión se mantiene por encima del 95%.',
            },
            {
              q: '¿Necesito cambiar mis impresoras de cocina?',
              a: 'No. ia.rest se conecta con las impresoras ESC/POS que ya tienes mediante el bridge local. Compatible con Epson, XPrinter, Star y la mayoría de modelos del mercado.',
            },
            {
              q: '¿Qué pasa si se cae internet?',
              a: 'El bridge local almacena los pedidos y los envía cuando se recupera la conexión. Para mayor seguridad recomendamos un router 4G como backup (Teltonika RUT951, ~120€).',
            },
            {
              q: '¿Es difícil de configurar?',
              a: 'La configuración básica lleva menos de una hora: crear las mesas, subir la carta y conectar las impresoras. Incluye soporte de onboarding sin coste adicional.',
            },
            {
              q: '¿Tiene VeriFactu incluido?',
              a: 'Sí. ia.rest genera facturas con hash SHA-256 encadenado cumpliendo la normativa VeriFactu. No necesitas un módulo externo ni pagar extra.',
            },
          ].map((faq, i) => (
            <div key={i} style={{
              marginBottom: 16, padding: '18px 20px',
              background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 8,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 8 }}>{faq.q}</div>
              <div style={{ fontSize: 13, color: C.ink3, lineHeight: 1.65 }}>{faq.a}</div>
            </div>
          ))}
        </section>

        {/* CTA final */}
        <div style={{
          background: C.ink, borderRadius: 12, padding: '36px 32px',
          textAlign: 'center', marginBottom: 48,
        }}>
          <div style={{ fontFamily: SM, fontSize: 11, color: C.red, letterSpacing: '0.12em', marginBottom: 12 }}>
            PRUEBA SIN COMPROMISO
          </div>
          <h3 style={{
            fontFamily: SE, fontStyle: 'italic', fontSize: 28, color: '#F6F1E7',
            margin: '0 0 12px',
          }}>
            14 días gratis, sin tarjeta
          </h3>
          <p style={{ fontSize: 14, color: '#D8CDB6', margin: '0 0 24px', lineHeight: 1.6 }}>
            Configura tu bar en menos de una hora. Si en 14 días no ves la diferencia, cancelas sin coste.
          </p>
          <a href="https://www.iarest.es/registro" style={{
            display: 'inline-block', background: C.red, color: '#fff',
            padding: '14px 28px', borderRadius: 8, textDecoration: 'none',
            fontSize: 14, fontWeight: 600, fontFamily: SN,
          }}>
            Empezar prueba gratis →
          </a>
        </div>

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${C.rule}`, paddingTop: 24, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <a href="/blog" style={{ fontSize: 13, color: C.ink3, textDecoration: 'none' }}>← Volver al blog</a>
          <div style={{ display: 'flex', gap: 16 }}>
            <a href="/blog/comanda-por-voz-como-funciona" style={{ fontSize: 13, color: C.red, textDecoration: 'none' }}>
              Cómo funciona la voz →
            </a>
          </div>
        </div>

      </div>
    </div>
  )
}
