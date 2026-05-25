import { SE, SN, SM } from '@/lib/colors'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Cómo cambiar de TPV en hostelería en 2026: guía práctica',
  description: 'Si tu TPV se ha quedado obsoleto o no cumple con VeriFactu, esta guía explica qué buscar en un sistema moderno y cómo hacer la migración sin interrumpir el servicio.',
  alternates: { canonical: 'https://www.iarest.es/blog/alternativa-numier-tpv' },
  openGraph: {
    title: 'Cómo cambiar de TPV en hostelería en 2026',
    description: 'Guía práctica para restaurantes que quieren migrar a un TPV en la nube con VeriFactu incluido.',
    url: 'https://www.iarest.es/blog/alternativa-numier-tpv',
    type: 'article',
    publishedTime: '2026-05-13',
  },
  keywords: [
    'cambiar tpv restaurante', 'migrar tpv hosteleria', 'tpv cloud hosteleria',
    'mejor tpv restaurante españa 2026', 'tpv sin permanencia hosteleria',
    'tpv con verifactu incluido', 'tpv barato restaurante', 'tpv voz hosteleria',
  ],
}

export default function ArticuloCambiarTPV() {
  return (
    <div style={{ minHeight: '100vh', background: '#F6F1E7', color: '#1A1714', fontFamily: SN }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '48px 20px' }}>

        {/* Nav */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 48 }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: '#1A1714' }}>
              ia<span style={{ color: '#D9442B' }}>.</span>rest
            </span>
          </a>
          <span style={{ color: '#D8CDB6' }}>/</span>
          <a href="/blog" style={{ fontSize: 13, color: '#6B5F52', textDecoration: 'none' }}>Blog</a>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <span style={{
              fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
              fontWeight: 600, color: '#A8311E', background: '#D9442B20',
              padding: '3px 10px', borderRadius: 100,
            }}>Gestión</span>
            <span style={{ fontSize: 12, color: '#6B5F52', fontFamily: SM }}>Mayo 2026 · 5 min lectura</span>
          </div>
          <h1 style={{
            fontFamily: SE, fontStyle: 'italic', fontSize: 38, color: '#1A1714',
            margin: '0 0 20px', lineHeight: 1.15, letterSpacing: '-0.5px',
          }}>
            Cómo cambiar de TPV en hostelería en 2026: guía práctica
          </h1>
          <p style={{ fontSize: 17, color: '#3A332C', lineHeight: 1.7, margin: 0 }}>
            Si tu sistema de caja está dando señales de agotamiento — hardware viejo, actualizaciones lentas, VeriFactu sin confirmar — esta guía explica qué necesitas en un sistema moderno y cómo hacer la transición sin interrumpir el servicio.
          </p>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #D8CDB6', margin: '0 0 40px' }} />

        {/* Contenido */}
        <div style={{ fontSize: 16, lineHeight: 1.8, color: '#3A332C' }}>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '0 0 16px', letterSpacing: '-0.3px' }}>
            Por qué muchos restaurantes están cambiando de TPV ahora
          </h2>
          <p>
            El parque de TPV en España envejece. Muchos locales llevan 5 o 6 años con el mismo sistema, instalado en hardware propio, con actualizaciones que dependen del instalador y contratos anuales que dificultan el cambio.
          </p>
          <p>
            Los motivos más habituales para decidirse a migrar en 2026:
          </p>
          <ul style={{ paddingLeft: 20, margin: '0 0 16px' }}>
            <li style={{ marginBottom: 8 }}><strong>VeriFactu:</strong> ya es obligatorio para sociedades desde enero de 2026 y para autónomos desde julio. Los sistemas que no lo tienen de serie están generando un problema fiscal real para sus clientes.</li>
            <li style={{ marginBottom: 8 }}><strong>Hardware obsoleto:</strong> renovar el terminal físico tiene un coste que ya no se justifica cuando existen alternativas cloud que funcionan en cualquier tablet.</li>
            <li style={{ marginBottom: 8 }}><strong>Sin acceso remoto:</strong> los sistemas instalados localmente no permiten consultar ventas, gestionar la carta o revisar cierres desde fuera del local.</li>
            <li style={{ marginBottom: 8 }}><strong>Coste total elevado:</strong> al sumar licencia, soporte, hardware y actualizaciones, el coste anual de un sistema instalado suele superar el de las alternativas cloud actuales.</li>
          </ul>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            Qué debe incluir tu próximo TPV sí o sí
          </h2>
          <p>
            Antes de evaluar opciones, define qué es innegociable para tu negocio. Estos son los criterios que más importan en 2026:
          </p>
          <ul style={{ paddingLeft: 20, margin: '0 0 16px' }}>
            <li style={{ marginBottom: 8 }}><strong>VeriFactu homologado de serie</strong> — no como módulo adicional ni actualización pendiente. Debe estar incluido desde el primer día sin coste extra.</li>
            <li style={{ marginBottom: 8 }}><strong>KDS de cocina</strong> — si tienes sala y cocina separadas, los tickets tienen que llegar en tiempo real. Un KDS bien integrado elimina los viajes de papel y los errores de transcripción.</li>
            <li style={{ marginBottom: 8 }}><strong>Sin hardware obligatorio</strong> — los sistemas cloud funcionan en cualquier tablet Android o iPad. Si el proveedor te obliga a comprar su terminal, suma ese coste al precio mensual para comparar bien.</li>
            <li style={{ marginBottom: 8 }}><strong>Sin permanencia mínima</strong> — el mercado ha cambiado. Los proveedores que exigen contratos anuales lo hacen porque saben que el cliente no renovaría voluntariamente. Evítalos.</li>
            <li style={{ marginBottom: 8 }}><strong>Soporte real en español</strong> — cuando un sistema falla en pleno servicio, necesitas respuesta inmediata. Confirma cómo es el soporte antes de firmar.</li>
          </ul>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            Por qué ia.rest es diferente
          </h2>
          <p>
            La mayoría de los TPV cloud resuelven el problema de la gestión — carta, mesas, cierres, facturación. Eso está bien, pero no es el cuello de botella real en la mayoría de los restaurantes.
          </p>
          <p>
            El cuello de botella está en sala. El tiempo que el camarero pierde caminando del cliente al terminal, tecleando la comanda, volviendo a la mesa. En una terraza de 20 mesas, eso son minutos por comanda multiplicado por decenas de comandas al día.
          </p>
          <p>
            ia.rest ataca ese problema directamente: el camarero dicta la comanda de pie junto al cliente. El ticket llega al KDS de cocina en menos de medio segundo. Sin viaje al terminal, sin teclear, sin libreta. El servicio se acelera sin necesidad de contratar más personal.
          </p>

          {/* Bloque destacado */}
          <div style={{
            background: '#1A171408', border: '1px solid #D8CDB6',
            borderLeft: '3px solid #D9442B',
            borderRadius: 4, padding: '20px 24px', margin: '24px 0',
          }}>
            <p style={{ margin: 0, fontSize: 15, color: '#1A1714', lineHeight: 1.7 }}>
              <strong>VeriFactu incluido en todos los planes.</strong> Hash SHA-256 encadenado, QR AEAT, facturación electrónica homologada desde 59 €/mes por local. Sin módulos adicionales, sin costes ocultos.
            </p>
          </div>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            Cómo es el proceso de migración
          </h2>
          <p>
            Cambiar de TPV no tiene por qué ser un proyecto. Lo que necesitas trasladar es básicamente tu carta (productos, precios, categorías) y la configuración de mesas y zonas.
          </p>
          <p>
            En ia.rest, la carta se importa desde una foto — subes una imagen de tu carta actual en papel y el sistema la carga automáticamente con IA. Las mesas se configuran en 10 minutos desde el panel del propietario.
          </p>
          <p>
            No necesitas técnico. No necesitas visita presencial. No hay período de paralización: puedes configurar ia.rest en paralelo con tu sistema actual y hacer el cambio al inicio de cualquier turno.
          </p>

          <div style={{
            background: '#FBF8F1', border: '1px solid #D8CDB6',
            borderRadius: 6, padding: '20px 24px', margin: '24px 0',
          }}>
            <p style={{ margin: '0 0 12px', fontWeight: 600, color: '#1A1714', fontSize: 15 }}>
              Checklist de migración
            </p>
            {[
              'Exporta o fotografía tu carta actual',
              'Crea cuenta → importa carta con IA (10 min)',
              'Configura mesas y zonas',
              'Introduce NIF y razón social (para VeriFactu)',
              'Prueba con un turno en paralelo',
              'Cambio definitivo al inicio del siguiente turno',
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 8 }}>
                <span style={{ color: '#3F7D44', fontWeight: 700, flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 14, color: '#3A332C' }}>{item}</span>
              </div>
            ))}
          </div>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            Preguntas frecuentes antes de cambiar
          </h2>

          <h3 style={{ fontFamily: SE, fontSize: 19, color: '#1A1714', margin: '24px 0 8px' }}>
            ¿Puedo usar mi tablet o necesito comprar hardware nuevo?
          </h3>
          <p>
            ia.rest funciona en cualquier tablet Android o iPad con navegador. No hay hardware obligatorio. Muchos locales usan directamente el móvil del camarero para las comandas por voz.
          </p>

          <h3 style={{ fontFamily: SE, fontSize: 19, color: '#1A1714', margin: '24px 0 8px' }}>
            ¿Qué pasa con los datos del sistema anterior?
          </h3>
          <p>
            El historial de ventas de tu TPV anterior queda en tu sistema anterior — ia.rest empieza desde el día de activación. Lo que sí se importa es la carta, que es lo que necesitas operativo desde el primer turno.
          </p>

          <h3 style={{ fontFamily: SE, fontSize: 19, color: '#1A1714', margin: '24px 0 8px' }}>
            ¿Funciona sin conexión a internet?
          </h3>
          <p>
            ia.rest requiere conexión para procesar comandas por voz y sincronizar con cocina. La recomendación es tener una línea de datos de respaldo (un móvil como hotspot) para cubrir cortes puntuales. La mayoría de los locales ya lo hacen con su TPV cloud actual.
          </p>

        </div>

        {/* CTA */}
        <div style={{
          marginTop: 48, padding: '32px',
          background: '#1A1714', borderRadius: 8, textAlign: 'center',
        }}>
          <p style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: '#F6F1E7', margin: '0 0 8px' }}>
            Prueba ia.rest antes de decidir
          </p>
          <p style={{ fontSize: 13, color: '#D8CDB6', margin: '0 0 20px' }}>
            14 días gratis. Sin tarjeta. Sin hardware. Alta en 10 minutos.
          </p>
          <a href="/registro" style={{
            display: 'inline-block', background: '#D9442B', color: '#F6F1E7',
            textDecoration: 'none', padding: '12px 28px', borderRadius: 6,
            fontSize: 14, fontWeight: 600,
          }}>
            Empezar prueba gratuita →
          </a>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid #D8CDB6', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <a href="/blog" style={{ color: '#6B5F52', fontSize: 13, textDecoration: 'none' }}>← Volver al blog</a>
          <a href="/blog/verifactu-restaurantes-guia-2026" style={{ color: '#D9442B', fontSize: 13, textDecoration: 'none' }}>
            También: Guía VeriFactu 2026 →
          </a>
        </div>

      </div>
    </div>
  )
}
