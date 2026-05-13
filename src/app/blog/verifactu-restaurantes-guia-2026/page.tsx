import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'VeriFactu para restaurantes: guía completa 2026',
  description: 'Todo sobre VeriFactu en hostelería: plazos, qué es, a quién afecta y cómo cumplir desde tu TPV sin complicaciones. Actualizado mayo 2026.',
  alternates: { canonical: 'https://www.iarest.es/blog/verifactu-restaurantes-guia-2026' },
  openGraph: {
    title: 'VeriFactu para restaurantes: guía completa 2026',
    description: 'Plazos, requisitos y cómo cumplir VeriFactu en tu restaurante o bar. Sin tecnicismos.',
    url: 'https://www.iarest.es/blog/verifactu-restaurantes-guia-2026',
    type: 'article',
    publishedTime: '2026-05-13',
  },
  keywords: [
    'verifactu restaurantes', 'verifactu hosteleria', 'verifactu tpv',
    'verifactu obligatorio 2026', 'facturacion electronica restaurante',
    'tpv verifactu incluido', 'verifactu que es', 'verifactu plazo autonomos',
  ],
}

const SE = "'Newsreader',Georgia,serif"
const SN = "'Inter Tight',system-ui,sans-serif"
const SM = "'JetBrains Mono',monospace"

export default function ArticuloVerifactu() {
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
              fontWeight: 600, color: '#A8761A', background: '#E8A33B20',
              padding: '3px 10px', borderRadius: 100,
            }}>Fiscal</span>
            <span style={{ fontSize: 12, color: '#6B5F52', fontFamily: SM }}>Mayo 2026 · 7 min lectura</span>
          </div>
          <h1 style={{
            fontFamily: SE, fontStyle: 'italic', fontSize: 38, color: '#1A1714',
            margin: '0 0 20px', lineHeight: 1.15, letterSpacing: '-0.5px',
          }}>
            VeriFactu para restaurantes: guía completa 2026
          </h1>
          <p style={{ fontSize: 17, color: '#3A332C', lineHeight: 1.7, margin: 0 }}>
            VeriFactu ya es obligatorio para muchos restaurantes. Si tienes una sociedad, llevas varios meses en plazo. Si eres autónomo, el reloj corre desde julio de 2026. Esta guía explica qué es exactamente, a quién afecta, qué multas hay y cómo cumplir sin cambiar todo tu sistema.
          </p>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #D8CDB6', margin: '0 0 40px' }} />

        {/* Contenido */}
        <div style={{ fontSize: 16, lineHeight: 1.8, color: '#3A332C' }}>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '0 0 16px', letterSpacing: '-0.3px' }}>
            ¿Qué es VeriFactu?
          </h2>
          <p>
            VeriFactu es el nuevo sistema de registro de facturación que exige la Agencia Tributaria española (AEAT). El objetivo es que cada factura quede registrada con un <strong>sello digital (hash SHA-256)</strong> que impide modificarla o borrarla sin dejar huella.
          </p>
          <p>
            En términos prácticos: tu TPV o sistema de facturación debe generar un código único por cada ticket, encadenado con el anterior, y poder enviarlo a la AEAT si se le requiere. No es una contabilidad en tiempo real ni una declaración automática — es una garantía de integridad.
          </p>
          <p>
            Cada factura lleva además un <strong>código QR impreso</strong> que cualquier cliente puede escanear para verificar su validez en el portal de la AEAT.
          </p>

          <div style={{
            background: '#E8A33B15', border: '1px solid #E8A33B40',
            borderRadius: 6, padding: '16px 20px', margin: '24px 0',
          }}>
            <p style={{ margin: 0, fontSize: 14, color: '#A8761A', fontWeight: 500 }}>
              📋 Resumen rápido: VeriFactu = hash SHA-256 encadenado + QR AEAT en cada ticket + registro inmutable. Tu TPV tiene que generarlo automáticamente.
            </p>
          </div>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            ¿A quién afecta en hostelería?
          </h2>
          <p>
            La obligación alcanza a todos los negocios que emitan facturas o tickets y estén sujetos al IRPF por actividades económicas o al Impuesto de Sociedades en territorio común (excluye País Vasco y Navarra, que tienen su propio sistema TicketBAI).
          </p>
          <p>
            Para la hostelería, esto incluye prácticamente a todos:
          </p>
          <ul style={{ paddingLeft: 20, margin: '0 0 16px' }}>
            <li style={{ marginBottom: 8 }}>Restaurantes, bares y cafeterías organizados como SL o SA → obligatorio desde <strong>enero 2026</strong></li>
            <li style={{ marginBottom: 8 }}>Autónomos con actividad de restauración → obligatorio desde <strong>julio 2026</strong></li>
            <li style={{ marginBottom: 8 }}>Grupos hosteleros con varios locales → cada local emite sus propias facturas encadenadas</li>
          </ul>
          <p>
            Si tu restaurante está en el País Vasco o Navarra, consulta la normativa específica de TicketBAI, que tiene diferencias técnicas pero un objetivo similar.
          </p>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            ¿Qué pasa si no cumplo?
          </h2>
          <p>
            El Real Decreto que regula el RRSIF (Reglamento de Requisitos de los Sistemas y Programas informáticos de Facturación) establece sanciones específicas. Las más relevantes para hostelería:
          </p>
          <ul style={{ paddingLeft: 20, margin: '0 0 16px' }}>
            <li style={{ marginBottom: 8 }}>Usar software no homologado: <strong>hasta 50.000 €</strong> de multa por ejercicio</li>
            <li style={{ marginBottom: 8 }}>No conservar los registros correctamente: <strong>hasta 10.000 €</strong></li>
            <li style={{ marginBottom: 8 }}>Negar acceso a los registros en una inspección: agravante sobre la sanción base</li>
          </ul>
          <p>
            En la práctica, la mayoría de inspecciones empiezan por revisar que el sistema de facturación esté homologado. Si usas un TPV actualizado que incluya VeriFactu de serie, este riesgo desaparece.
          </p>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            Cómo funciona técnicamente (sin tecnicismos)
          </h2>
          <p>
            Cuando un camarero cierra una cuenta, el sistema:
          </p>
          <ol style={{ paddingLeft: 20, margin: '0 0 16px' }}>
            <li style={{ marginBottom: 8 }}>Genera un número de factura secuencial (ej: 2026-000347)</li>
            <li style={{ marginBottom: 8 }}>Calcula un hash SHA-256 que combina NIF del restaurante, número de factura, fecha, importe y el hash de la factura anterior</li>
            <li style={{ marginBottom: 8 }}>Imprime el ticket con ese hash y un QR que apunta al verificador de la AEAT</li>
            <li style={{ marginBottom: 8 }}>Guarda el registro en la base de datos de manera que no pueda modificarse retroactivamente</li>
          </ol>
          <p>
            El encadenamiento (que cada factura incluya el hash de la anterior) es la clave: si alguien borrase o modificase una factura anterior, todos los hashes posteriores quedarían inconsistentes, lo que haría evidente la manipulación en cualquier inspección.
          </p>

          <div style={{
            background: '#1A1714', borderRadius: 6, padding: '16px 20px', margin: '24px 0',
          }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#6B5F52', fontFamily: SM, letterSpacing: '0.05em' }}>EJEMPLO DE HASH</p>
            <p style={{ margin: 0, fontSize: 13, color: '#D8CDB6', fontFamily: SM, wordBreak: 'break-all', lineHeight: 1.6 }}>
              NIF|2026-000347|13052026|47.50|a3f8b2c1d4e5...
              <br />
              → SHA-256 → <span style={{ color: '#3F7D44' }}>9f4a2b1c8e3d...</span>
            </p>
          </div>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            Qué necesitas para cumplir
          </h2>
          <p>
            En resumen, necesitas un TPV o sistema de facturación que:
          </p>
          <ul style={{ paddingLeft: 20, margin: '0 0 16px' }}>
            <li style={{ marginBottom: 8 }}>Genere automáticamente el hash SHA-256 encadenado en cada factura</li>
            <li style={{ marginBottom: 8 }}>Imprima el QR de la AEAT en cada ticket</li>
            <li style={{ marginBottom: 8 }}>Conserve los registros de forma inmutable (no se pueden borrar ni editar)</li>
            <li style={{ marginBottom: 8 }}>Tenga configurado el NIF y razón social del restaurante</li>
          </ul>
          <p>
            No necesitas enviar nada proactivamente a la AEAT (en la modalidad VeriFactu estándar). Los registros quedan disponibles para cuando los soliciten en una inspección.
          </p>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            VeriFactu en ia.rest
          </h2>
          <p>
            ia.rest incluye VeriFactu de serie en todos los planes, sin coste adicional. Cuando el camarero cierra una cuenta — ya sea por voz, modo manual o desde el QR de mesa — el sistema genera automáticamente la factura con hash encadenado y QR de la AEAT.
          </p>
          <p>
            El propietario puede ver todas las facturas desde el panel <strong>/owner → Facturas</strong>, con el hash visible, el QR descargable y el historial completo. No hay ninguna acción manual adicional.
          </p>
          <p>
            Solo tienes que configurar tu NIF y razón social en <strong>/owner → Restaurante → Datos fiscales</strong> antes de empezar a cobrar en producción.
          </p>

          <div style={{
            background: '#3F7D4415', border: '1px solid #3F7D4440',
            borderRadius: 6, padding: '16px 20px', margin: '24px 0',
          }}>
            <p style={{ margin: 0, fontSize: 14, color: '#2d5c31', fontWeight: 500 }}>
              ✓ ia.rest genera los hashes automáticamente. Sin configuración adicional, sin módulos de pago aparte. VeriFactu está incluido desde el primer cobro.
            </p>
          </div>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            Preguntas frecuentes
          </h2>

          <p style={{ fontWeight: 600, color: '#1A1714', marginBottom: 6 }}>¿Tengo que enviar las facturas a la AEAT cada mes?</p>
          <p>No en la modalidad estándar de VeriFactu. Los registros quedan almacenados en tu sistema y disponibles si la AEAT los solicita en una inspección. Hay una modalidad voluntaria de envío en tiempo real, pero no es obligatoria.</p>

          <p style={{ fontWeight: 600, color: '#1A1714', marginBottom: 6 }}>¿Afecta a los tickets simplificados (no a nombre de empresa)?</p>
          <p>Sí. En hostelería, prácticamente todas las facturas son simplificadas (sin datos del cliente). VeriFactu aplica tanto a facturas completas como simplificadas.</p>

          <p style={{ fontWeight: 600, color: '#1A1714', marginBottom: 6 }}>¿Qué pasa si el camarero anuló un cobro?</p>
          <p>Las facturas no se borran — se anulan mediante una factura rectificativa con importe negativo que también lleva su propio hash. La cadena se mantiene íntegra.</p>

          <p style={{ fontWeight: 600, color: '#1A1714', marginBottom: 6 }}>Mi TPV actual no tiene VeriFactu. ¿Tengo que cambiar de sistema?</p>
          <p>Sí, si tu proveedor no ha actualizado el software antes del plazo que te corresponde. Muchos proveedores lo están actualizando, pero conviene confirmarlo por escrito. Si vas a cambiar de TPV de todas formas, es un buen momento para valorar opciones.</p>

        </div>

        {/* CTA */}
        <div style={{
          marginTop: 48, padding: '32px',
          background: '#1A1714', borderRadius: 8, textAlign: 'center',
        }}>
          <p style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: '#F6F1E7', margin: '0 0 8px' }}>
            ia.rest incluye VeriFactu en todos los planes
          </p>
          <p style={{ fontSize: 13, color: '#D8CDB6', margin: '0 0 20px' }}>
            Desde 59 €/mes. Sin comisiones. 14 días gratis sin tarjeta.
          </p>
          <a href="/registro" style={{
            display: 'inline-block', background: '#D9442B', color: '#F6F1E7',
            textDecoration: 'none', padding: '12px 28px', borderRadius: 6,
            fontSize: 14, fontWeight: 600,
          }}>
            Solicitar prueba gratuita →
          </a>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid #D8CDB6', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <a href="/blog" style={{ color: '#6B5F52', fontSize: 13, textDecoration: 'none' }}>← Volver al blog</a>
          <a href="/blog/reducir-errores-comanda-restaurante" style={{ color: '#D9442B', fontSize: 13, textDecoration: 'none' }}>
            Siguiente: Cómo reducir errores de comanda →
          </a>
        </div>

      </div>
    </div>
  )
}
