export default function TerminosPage() {
  const SE = "'Newsreader',Georgia,serif"
  const SN = "'Inter Tight',system-ui,sans-serif"
  return (
    <div style={{ minHeight:'100vh', background:'#F6F1E7', color:'#1A1714', padding:'48px 20px', fontFamily:SN }}>
      <div style={{ maxWidth:680, margin:'0 auto' }}>
        <a href="/" style={{ textDecoration:'none', display:'block', marginBottom:40 }}>
          <span style={{ fontFamily:SE, fontStyle:'italic', fontSize:26, color:'#1A1714' }}>
            ia<span style={{ color:'#D9442B' }}>.</span>rest
          </span>
        </a>
        <h1 style={{ fontFamily:SE, fontStyle:'italic', fontSize:36, color:'#1A1714', margin:'0 0 8px', letterSpacing:'-0.5px' }}>
          Términos de uso
        </h1>
        <p style={{ fontSize:13, color:'#6B5F52', margin:'0 0 40px' }}>Última actualización: mayo 2026</p>
        {[
          { titulo:'1. Objeto del servicio', texto:'ia.rest es un software de gestión de restaurantes con inteligencia artificial conversacional para la toma de pedidos por voz. El servicio se presta como SaaS (Software as a Service) a través de la URL www.iarest.es.' },
          { titulo:'2. Contratación y pago', texto:'El servicio se contrata mediante suscripción mensual con un período de prueba gratuito de 14 días. Al finalizar el trial, se realizará el cargo automático según el plan contratado. El precio depende del número de usuarios activos (camareros, jefes de sala y cocina). El propietario del restaurante no cuenta como usuario de pago.' },
          { titulo:'3. Cancelación', texto:'Puedes cancelar tu suscripción en cualquier momento desde el panel de propietario o contactando con nosotros por WhatsApp. La cancelación es efectiva al final del período de facturación en curso. No se realizan reembolsos por períodos parciales.' },
          { titulo:'4. Datos y privacidad', texto:'Los datos introducidos en el sistema (carta, comandas, clientes) son propiedad del restaurante. ia.rest actúa como encargado del tratamiento según el RGPD. Los datos de voz (transcripciones) se procesan para mejorar el sistema y se eliminan automáticamente a los 90 días.' },
          { titulo:'5. Facturación legal (VeriFactu)', texto:'ia.rest genera facturas con hash encadenado SHA-256 conforme al Reglamento VeriFactu (España, 2026). Para activar la facturación legal debes configurar tu NIF y razón social en el panel de propietario.' },
          { titulo:'6. Disponibilidad del servicio', texto:'ia.rest se presta con una disponibilidad objetivo del 99,5% mensual. En caso de incidencia, el equipo de soporte está disponible por WhatsApp en horario de lunes a viernes de 9:00 a 21:00.' },
          { titulo:'7. Limitación de responsabilidad', texto:'ia.rest no se hace responsable de errores en comandas derivados de mala calidad de audio, vocabulario no incluido en la carta o condiciones de red deficientes. El sistema proporciona confirmación de voz antes de enviar cada comanda para que el camarero pueda corregir posibles errores.' },
          { titulo:'8. Compatibilidad de hardware', texto:'ia.rest garantiza compatibilidad y soporte técnico exclusivamente con impresoras térmicas que utilicen protocolo ESC/POS sobre TCP/IP (conexión IP local mediante bridge) o Star CloudPRNT (modelos Star Micronics con interfaz LAN o WiFi, como TSP143IIILAN y TSP143IIIW). Otras marcas y modelos de impresoras pueden funcionar en algunos casos, pero ia.rest no ofrece garantía de funcionamiento ni soporte técnico para hardware no validado. El cliente es responsable de verificar la compatibilidad de su hardware antes de la contratación.' },
          { titulo:'9. Legislación aplicable', texto:'Estos términos se rigen por la legislación española. Para cualquier conflicto, las partes se someten a los juzgados y tribunales de Sevilla, España.' },
          { titulo:'10. Contacto', texto:'Para cualquier consulta sobre estos términos, escríbenos por WhatsApp al +34 637 349 990 o por email a alberto.suarez.gutierrez@gmail.com.' },
        ].map((s, i) => (
          <div key={i} style={{ marginBottom:32, paddingBottom:32, borderBottom: i < 9 ? '1px solid #D8CDB6' : 'none' }}>
            <h2 style={{ fontFamily:SE, fontStyle:'italic', fontSize:20, color:'#1A1714', margin:'0 0 10px' }}>{s.titulo}</h2>
            <p style={{ fontSize:14, color:'#6B5F52', lineHeight:1.8, margin:0 }}>{s.texto}</p>
          </div>
        ))}
        <div style={{ marginTop:40, paddingTop:24, borderTop:'1px solid #D8CDB6', display:'flex', gap:16, flexWrap:'wrap' }}>
          <a href="/registro" style={{ color:'#D9442B', fontSize:13, textDecoration:'underline' }}>Volver al registro</a>
          <a href="/" style={{ color:'#6B5F52', fontSize:13, textDecoration:'underline' }}>Ir al inicio</a>
        </div>
      </div>
    </div>
  )
}
