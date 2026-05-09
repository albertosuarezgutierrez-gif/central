export default function PrivacidadPage() {
  const SE = "'Newsreader',Georgia,serif"
  const SN = "'Inter Tight',system-ui,sans-serif"
  const secciones = [
    { titulo: '1. Responsable del tratamiento', bloques: [
      'Identidad: Alberto Suárez Gutiérrez · NIF: 28823484E',
      'Domicilio: Sevilla, España',
      'Email: alberto.suarez.gutierrez@gmail.com',
      'Actividad: Prestación de servicios SaaS para hostelería bajo la marca ia.rest',
    ]},
    { titulo: '2. Datos que recopilamos y por qué', bloques: [
      'Datos de registro: nombre, email, nombre del restaurante, número de usuarios. Base legal: ejecución del contrato (art. 6.1.b RGPD). Finalidad: crear y gestionar tu cuenta.',
      'Datos de facturación: NIF, razón social, dirección. Base legal: obligación legal (LSSI, VeriFactu). Finalidad: emisión de facturas legales.',
      'Datos operativos del restaurante: carta de productos, mesas, zonas, comandas, secciones de cocina. Base legal: ejecución del contrato. Finalidad: prestación del servicio. Estos datos son propiedad del restaurante; ia.rest actúa como encargado del tratamiento.',
      'Transcripciones de voz: procesadas en tiempo real por Groq Whisper para transcribir comandas. Se almacenan temporalmente y se eliminan automáticamente a los 90 días. Base legal: ejecución del contrato.',
      'Datos de empleados del restaurante: nombre, PIN, rol. El responsable de informar a estos empleados es el restaurante (en su calidad de responsable del tratamiento). ia.rest actúa como encargado.',
      'Datos de alérgenos declarados en mesa: datos de categoría especial (salud) según art. 9 RGPD. Base legal: consentimiento explícito del comensal. El restaurante es responsable de obtener y documentar dicho consentimiento.',
      'Datos de navegación: logs técnicos de acceso (IP, user-agent, timestamp) para seguridad del sistema. Base legal: interés legítimo (art. 6.1.f RGPD). Conservación: 90 días.',
    ]},
    { titulo: '3. Encargados del tratamiento (subprocesadores)', bloques: [
      'Para prestar el Servicio, ia.rest utiliza los siguientes proveedores que actúan como encargados del tratamiento, con las garantías adecuadas exigidas por el RGPD:',
      '· Supabase Inc. — base de datos y almacenamiento (EE.UU., SCCs)\n· Vercel Inc. — infraestructura y despliegue (EE.UU., SCCs)\n· Groq Inc. — transcripción de voz mediante Whisper (EE.UU., SCCs)\n· Anthropic PBC — interpretación de comandas mediante Claude AI (EE.UU., SCCs)\n· Stripe Payments Europe, Ltd. — procesamiento de pagos (Irlanda, UE)\n· MONEI PAYMENTS, S.L. — procesamiento de pagos Bizum (España, UE)\n· Resend Inc. — envío de correos transaccionales (EE.UU., SCCs)',
      'Las Cláusulas Contractuales Estándar (SCCs) aprobadas por la Comisión Europea garantizan el nivel adecuado de protección para las transferencias internacionales.',
    ]},
    { titulo: '4. Conservación de los datos', bloques: [
      'Datos de cuenta y contrato: durante la vigencia del contrato y 5 años adicionales por obligaciones fiscales/legales.',
      'Transcripciones de voz: 90 días (eliminación automática mediante proceso programado).',
      'Logs de seguridad: 90 días.',
      'Datos de aceptación del contrato (contract_acceptances): 10 años (obligación legal LSSI).',
      'Datos operativos del restaurante: mientras el cliente sea usuario activo. Tras la baja, disponibles para exportación 30 días; eliminados a los 31 días.',
    ]},
    { titulo: '5. Tus derechos', bloques: [
      'Como interesado, tienes derecho a: acceder a tus datos, rectificarlos, suprimirlos, oponerte al tratamiento, solicitar la limitación del tratamiento, y obtener la portabilidad de tus datos en formato estándar.',
      'Puedes ejercer estos derechos enviando un email a alberto.suarez.gutierrez@gmail.com indicando tu nombre, email de cuenta y el derecho que deseas ejercer. Responderemos en un plazo máximo de 30 días.',
      'También tienes derecho a presentar una reclamación ante la Agencia Española de Protección de Datos (AEPD) en www.aepd.es si consideras que el tratamiento de tus datos no es conforme al RGPD.',
    ]},
    { titulo: '6. Seguridad', bloques: [
      'Aplicamos medidas técnicas y organizativas adecuadas para proteger tus datos frente a accesos no autorizados, pérdida, alteración o destrucción no autorizada, conforme al art. 32 RGPD. Entre ellas: cifrado en tránsito (HTTPS/TLS), control de acceso por roles, Row Level Security en base de datos, rate limiting, y monitorización de seguridad.',
      'En caso de violación de seguridad que pueda suponer un riesgo para tus derechos, te lo notificaremos en un plazo máximo de 72 horas desde su detección.',
    ]},
    { titulo: '7. Datos de entrenamiento de IA', bloques: [
      'ia.rest puede utilizar datos operativos anonimizados (transcripciones de comandas, patrones de uso) para mejorar los modelos de inteligencia artificial únicamente si el responsable del restaurante ha activado expresamente esta opción en el panel de configuración (opt-in). Por defecto, esta opción está desactivada.',
    ]},
    { titulo: '8. Modificaciones', bloques: [
      'Esta Política de Privacidad puede actualizarse para adaptarse a cambios normativos o del Servicio. Te notificaremos cualquier cambio significativo por email con al menos 30 días de antelación.',
    ]},
    { titulo: '9. Contacto', bloques: [
      'Para cualquier consulta sobre esta Política de Privacidad o sobre el tratamiento de tus datos: alberto.suarez.gutierrez@gmail.com',
    ]},
  ]
  return (
    <div style={{ minHeight:'100vh', background:'#F6F1E7', color:'#1A1714', padding:'48px 20px', fontFamily:SN }}>
      <div style={{ maxWidth:680, margin:'0 auto' }}>
        <a href="/" style={{ textDecoration:'none', display:'block', marginBottom:40 }}>
          <span style={{ fontFamily:SE, fontStyle:'italic', fontSize:26, color:'#1A1714' }}>ia<span style={{ color:'#D9442B' }}>.</span>rest</span>
        </a>
        <h1 style={{ fontFamily:SE, fontStyle:'italic', fontSize:36, color:'#1A1714', margin:'0 0 8px', letterSpacing:'-0.5px' }}>Política de privacidad</h1>
        <p style={{ fontSize:13, color:'#6B5F52', margin:'0 0 40px' }}>Última actualización: mayo 2026 · Versión 1.0</p>
        {secciones.map((s, i) => (
          <div key={i} style={{ marginBottom:32, paddingBottom:32, borderBottom: i < secciones.length-1 ? '1px solid #D8CDB6' : 'none' }}>
            <h2 style={{ fontFamily:SE, fontStyle:'italic', fontSize:20, color:'#1A1714', margin:'0 0 12px' }}>{s.titulo}</h2>
            {s.bloques.map((b, j) => (
              <p key={j} style={{ fontSize:14, color:'#6B5F52', lineHeight:1.8, margin:'0 0 10px', whiteSpace:'pre-line' }}>{b}</p>
            ))}
          </div>
        ))}
        <div style={{ marginTop:40, paddingTop:24, borderTop:'1px solid #D8CDB6', display:'flex', gap:16, flexWrap:'wrap' }}>
          <a href="/aviso-legal" style={{ color:'#D9442B', fontSize:13, textDecoration:'underline' }}>Aviso legal</a>
          <a href="/cookies" style={{ color:'#D9442B', fontSize:13, textDecoration:'underline' }}>Política de cookies</a>
          <a href="/terminos" style={{ color:'#6B5F52', fontSize:13, textDecoration:'underline' }}>Términos de uso</a>
          <a href="/" style={{ color:'#6B5F52', fontSize:13, textDecoration:'underline' }}>Volver al inicio</a>
        </div>
      </div>
    </div>
  )
}
