import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Alternativa a Numier TPV en 2026: qué opciones tienes',
  description: 'Estás valorando salir de Numier. Comparativa honesta de las mejores alternativas para restaurantes y bares en España: precios, funcionalidades y migración.',
  alternates: { canonical: 'https://www.iarest.es/blog/alternativa-numier-tpv' },
  openGraph: {
    title: 'Alternativa a Numier TPV en 2026',
    description: 'Las mejores alternativas a Numier para restaurantes y bares en España. Comparativa de precios y funcionalidades.',
    url: 'https://www.iarest.es/blog/alternativa-numier-tpv',
    type: 'article',
    publishedTime: '2026-05-13',
  },
  keywords: [
    'alternativa numier', 'migrar numier', 'numier tpv alternativa',
    'cambiar de tpv restaurante', 'tpv hosteleria sin permanencia',
    'mejor tpv restaurante españa 2026', 'tpv barato restaurante',
    'alternativa revo xef', 'tpv cloud hosteleria',
  ],
}

const SE = "'Newsreader',Georgia,serif"
const SN = "'Inter Tight',system-ui,sans-serif"
const SM = "'JetBrains Mono',monospace"

const comparativa = [
  {
    nombre: 'Numier',
    precio: '~80–150 €/mes',
    instalacion: 'Presencial',
    verifactu: '✓ Sí',
    voz: '✗ No',
    notas: 'Software local. Requiere hardware propietario. Contrato anual habitual.',
    destacado: false,
  },
  {
    nombre: 'Hiopos',
    precio: 'Desde ~50 €/mes',
    instalacion: 'Cloud / presencial',
    verifactu: '✓ Sí',
    voz: '✗ No',
    notas: 'Muy extendido en España. Buena estabilidad. Sin VoiceOrder.',
    destacado: false,
  },
  {
    nombre: 'Last.app',
    precio: 'Desde ~89 €/mes',
    instalacion: 'Cloud',
    verifactu: '✓ Sí',
    voz: 'Parcial',
    notas: 'Orientado a hostelería moderna. Precio más alto. IA en carta y reservas.',
    destacado: false,
  },
  {
    nombre: 'Camarero10',
    precio: '~30–50 €/mes',
    instalacion: 'Cloud',
    verifactu: 'En desarrollo',
    voz: '✗ No',
    notas: 'Opción económica. Funcionalidades más básicas.',
    destacado: false,
  },
  {
    nombre: 'ia.rest',
    precio: 'Desde 59 €/mes',
    instalacion: 'Cloud / 10 min',
    verifactu: '✓ Incluido',
    voz: '✓ Nativo',
    notas: 'Comandas por voz en <0,5s. Sin hardware. Sin comisiones. Incluye VeriFactu y KDS.',
    destacado: true,
  },
]

export default function ArticuloAlternativaNumier() {
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
            }}>Comparativas</span>
            <span style={{ fontSize: 12, color: '#6B5F52', fontFamily: SM }}>Mayo 2026 · 6 min lectura</span>
          </div>
          <h1 style={{
            fontFamily: SE, fontStyle: 'italic', fontSize: 38, color: '#1A1714',
            margin: '0 0 20px', lineHeight: 1.15, letterSpacing: '-0.5px',
          }}>
            Alternativa a Numier TPV en 2026: qué opciones tienes
          </h1>
          <p style={{ fontSize: 17, color: '#3A332C', lineHeight: 1.7, margin: 0 }}>
            Si estás valorando dejar Numier — por precio, por la obligación de VeriFactu, por renovar hardware o simplemente porque el sistema se ha quedado viejo — esta guía compara las alternativas reales disponibles en España.
          </p>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #D8CDB6', margin: '0 0 40px' }} />

        {/* Contenido */}
        <div style={{ fontSize: 16, lineHeight: 1.8, color: '#3A332C' }}>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '0 0 16px', letterSpacing: '-0.3px' }}>
            Por qué muchos restaurantes están saliendo de Numier
          </h2>
          <p>
            Numier fue durante años una solución sólida para hostelería española. Su problema es el modelo: software instalado en hardware propiedad del cliente, con actualizaciones que a veces requieren visita técnica y contratos anuales que complican el cambio.
          </p>
          <p>
            Los motivos más habituales que escuchamos para querer cambiar:
          </p>
          <ul style={{ paddingLeft: 20, margin: '0 0 16px' }}>
            <li style={{ marginBottom: 8 }}><strong>Adaptación a VeriFactu:</strong> algunos instaladores de Numier cobran la actualización a VeriFactu como servicio adicional, o tienen plazos largos para tenerla lista.</li>
            <li style={{ marginBottom: 8 }}><strong>Hardware antiguo:</strong> el terminal físico tiene 5+ años y el coste de renovarlo hace que tenga sentido valorar alternativas cloud.</li>
            <li style={{ marginBottom: 8 }}><strong>Sin acceso remoto:</strong> los sistemas instalados localmente no permiten ver ventas o gestionar carta desde casa fácilmente.</li>
            <li style={{ marginBottom: 8 }}><strong>Precio:</strong> con soporte, actualizaciones y licencias, el coste total anual puede ser más alto que las alternativas cloud actuales.</li>
          </ul>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            Qué buscar en una alternativa
          </h2>
          <p>
            Antes de comparar opciones, aclara qué necesitas que el nuevo sistema incluya obligatoriamente:
          </p>
          <ul style={{ paddingLeft: 20, margin: '0 0 16px' }}>
            <li style={{ marginBottom: 8 }}><strong>VeriFactu homologado</strong> — ya es obligatorio para sociedades y pronto para autónomos. Debe venir de serie, sin módulo adicional.</li>
            <li style={{ marginBottom: 8 }}><strong>KDS de cocina</strong> — si tienes cocina y sala separadas, necesitas que los tickets lleguen a cocina en tiempo real.</li>
            <li style={{ marginBottom: 8 }}><strong>Sin hardware obligatorio</strong> — las alternativas cloud funcionan en cualquier tablet o móvil. Si el proveedor te obliga a comprar su hardware, suma ese coste al precio mensual.</li>
            <li style={{ marginBottom: 8 }}><strong>Sin permanencia</strong> — el mercado ha cambiado. Los mejores sistemas actuales permiten cancelar mes a mes.</li>
          </ul>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            Comparativa de alternativas
          </h2>

          {/* Tabla comparativa */}
          <div style={{ overflowX: 'auto', margin: '0 0 24px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #D8CDB6' }}>
                  {['Sistema', 'Precio/mes', 'Alta', 'VeriFactu', 'Voz nativa'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '10px 12px', fontSize: 11,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: '#6B5F52', fontWeight: 600,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparativa.map((row, i) => (
                  <tr key={i} style={{
                    borderBottom: '1px solid #D8CDB6',
                    background: row.destacado ? '#D9442B08' : 'transparent',
                  }}>
                    <td style={{ padding: '12px', fontWeight: row.destacado ? 700 : 400, color: row.destacado ? '#D9442B' : '#1A1714' }}>
                      {row.nombre}
                      {row.destacado && <span style={{ fontSize: 10, marginLeft: 6, background: '#D9442B', color: '#fff', padding: '2px 6px', borderRadius: 100 }}>este artículo</span>}
                    </td>
                    <td style={{ padding: '12px', color: '#3A332C' }}>{row.precio}</td>
                    <td style={{ padding: '12px', color: '#3A332C' }}>{row.instalacion}</td>
                    <td style={{ padding: '12px', color: row.verifactu.startsWith('✓') ? '#2d5c31' : row.verifactu === 'Parcial' ? '#A8761A' : '#D9442B' }}>{row.verifactu}</td>
                    <td style={{ padding: '12px', color: row.voz.startsWith('✓') ? '#2d5c31' : '#D9442B' }}>{row.voz}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 12, color: '#6B5F52' }}>
            Precios orientativos a mayo 2026. Consulta con cada proveedor para tu caso específico.
          </p>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            Análisis de cada opción
          </h2>

          <h3 style={{ fontFamily: SE, fontSize: 19, color: '#1A1714', margin: '24px 0 8px' }}>
            Hiopos — la alternativa más similar a Numier
          </h3>
          <p>
            Si lo que buscas es algo parecido a Numier pero en cloud, Hiopos es la opción más directa. Tiene una base instalada enorme en España, soporte local en la mayoría de provincias y la interfaz tiene una curva de aprendizaje razonable para alguien que viene de software tradicional.
          </p>
          <p>
            La limitación principal: no tiene comandas por voz. El flujo de trabajo es táctil tradicional — útil si tu equipo ya está acostumbrado a ese modelo.
          </p>

          <h3 style={{ fontFamily: SE, fontSize: 19, color: '#1A1714', margin: '24px 0 8px' }}>
            Last.app — opción premium
          </h3>
          <p>
            Last.app está muy bien ejecutado y tiene funcionalidades avanzadas de IA en la gestión de carta, reservas y upselling. El precio es más alto (~89 €/mes base, más según módulos) y está más orientado a restaurantes con volumen y ticket medio alto.
          </p>
          <p>
            Tiene integración con delivery, reservas nativas y analítica más avanzada. Si eso es lo que necesitas, merece evaluación. Si lo que necesitas es agilidad de servicio en sala, la curva precio/beneficio no es la mejor.
          </p>

          <h3 style={{ fontFamily: SE, fontSize: 19, color: '#1A1714', margin: '24px 0 8px' }}>
            Camarero10 — si el precio es la prioridad
          </h3>
          <p>
            La opción más económica del mercado (~30-50 €/mes). Funcional para bares y restaurantes sencillos. La limitación es que VeriFactu aún está en desarrollo según la información disponible a mayo 2026 — confirma con ellos antes de contratarlo si eso es una prioridad.
          </p>

          <h3 style={{ fontFamily: SE, fontSize: 19, color: '#1A1714', margin: '24px 0 8px' }}>
            ia.rest — si el cuello de botella está en sala
          </h3>
          <p>
            ia.rest parte de una premisa diferente: el problema no es el software de gestión — es el tiempo que el camarero pierde entre mesa y terminal. Si en tu restaurante el cuello de botella está en sala (hora punta, terraza grande, pocos camareros para muchas mesas), ia.rest ataca ese problema directamente.
          </p>
          <p>
            El camarero dicta la comanda de pie junto al cliente. El ticket llega al KDS de cocina en menos de medio segundo. Sin viaje al terminal, sin teclear, sin anotar en libreta. VeriFactu está incluido en todos los planes.
          </p>
          <p>
            El precio desde 59 €/mes por usuario (camareros, cocina, jefe de sala; el dueño no cuenta) lo sitúa por debajo de Numier cuando se suman los costes de mantenimiento y hardware.
          </p>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            Cómo es la migración desde Numier
          </h2>
          <p>
            Migrar de un TPV a otro no debería ser un proyecto. Lo que necesitas trasladar es básicamente tu carta (productos, precios, categorías) y la configuración de mesas.
          </p>
          <p>
            En ia.rest, la carta se puede importar desde una foto — subes una imagen de tu carta en papel y el sistema la carga automáticamente. Las mesas se configuran en 10 minutos desde el panel del propietario. El tiempo total de alta suele estar entre 30 minutos y 1 hora para un restaurante de tamaño medio.
          </p>
          <p>
            No necesitas técnico. No necesitas visita presencial. No hay período de paralización del servicio — puedes configurar ia.rest en paralelo y hacer el cambio en el inicio de un turno.
          </p>

          <div style={{
            background: '#FBF8F1', border: '1px solid #D8CDB6',
            borderRadius: 6, padding: '20px 24px', margin: '24px 0',
          }}>
            <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#1A1714', fontSize: 15 }}>
              Checklist de migración
            </p>
            {[
              'Exporta o fotografía tu carta actual',
              'Crea cuenta → importa carta con IA (10 min)',
              'Configura mesas y zonas',
              'Configura NIF y razón social (para VeriFactu)',
              'Prueba con un turno en paralelo',
              'Cambio definitivo al inicio del siguiente turno',
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 8 }}>
                <span style={{ color: '#3F7D44', fontWeight: 700, flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 14, color: '#3A332C' }}>{item}</span>
              </div>
            ))}
          </div>

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
