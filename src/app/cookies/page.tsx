export default function CookiesPage() {
  const SE = "'Newsreader',Georgia,serif"
  const SN = "'Inter Tight',system-ui,sans-serif"
  const secciones = [
    { titulo: '1. ¿Qué son las cookies?', texto: 'Las cookies son pequeños archivos de texto que un sitio web almacena en el dispositivo del usuario al visitarlo. Sirven para recordar preferencias, mantener sesiones activas o analizar el comportamiento de uso.' },
    { titulo: '2. ¿Usa ia.rest cookies?', texto: 'ia.rest utiliza un número muy reducido de cookies, estrictamente las necesarias para el funcionamiento del servicio. No utilizamos cookies de seguimiento, publicidad ni analítica de terceros.' },
    { titulo: '3. Cookies técnicas propias (necesarias)', texto: null, tabla: [
      ['Cookie / Almacenamiento', 'Tipo', 'Finalidad', 'Duración'],
      ['ia_rest_session (localStorage)', 'Técnica', 'Mantiene la sesión del usuario autenticado (rol, restaurante, token)', 'Sesión / hasta cierre manual'],
      ['ia_rest_vox (localStorage)', 'Técnica', 'Preferencia de activación de lectura TTS del camarero', 'Persistente'],
      ['ia_rest_font_size (localStorage)', 'Técnica', 'Preferencia de tamaño de fuente en KDS', 'Persistente'],
      ['ia_rest_zona (localStorage)', 'Técnica', 'Última zona de sala seleccionada', 'Persistente'],
      ['Cookies de sesión Stripe', 'Técnica', 'Necesarias para el proceso de pago en Stripe Checkout. Gestionadas por Stripe Payments Europe.', 'Sesión de pago'],
    ]},
    { titulo: '4. Almacenamiento local (localStorage / sessionStorage)', texto: 'ia.rest utiliza principalmente localStorage del navegador (no cookies HTTP) para almacenar preferencias de usuario y datos de sesión. Este almacenamiento es local al dispositivo y no se transmite a ningún servidor en cada petición, a diferencia de las cookies convencionales.\n\nCon arreglo a la Directiva ePrivacy y la interpretación de la AEPD, el uso de localStorage con finalidad técnica estrictamente necesaria no requiere consentimiento previo del usuario.' },
    { titulo: '5. Cookies de terceros', texto: 'Durante el proceso de pago, el usuario accede a la plataforma de Stripe Checkout, que puede establecer sus propias cookies con fines de seguridad y prevención del fraude. Puedes consultar la política de cookies de Stripe en: stripe.com/privacy.\n\nfuera del proceso de pago, ia.rest no carga ningún servicio de terceros que establezca cookies (sin Google Analytics, sin píxeles de publicidad, sin redes sociales).' },
    { titulo: '6. ¿Cómo gestionar o eliminar las cookies?', texto: 'Puedes eliminar el almacenamiento local de ia.rest en cualquier momento desde la configuración de tu navegador:\n\n· Chrome: Configuración → Privacidad → Borrar datos de navegación → Cookies y otros datos del sitio\n· Firefox: Configuración → Privacidad y seguridad → Historial → Limpiar historial reciente\n· Safari: Preferencias → Privacidad → Gestionar datos del sitio\n\nEliminar los datos de sesión cerrará tu sesión activa en ia.rest.' },
    { titulo: '7. Más información', texto: 'Para cualquier consulta sobre esta política, escríbenos a: alberto.suarez.gutierrez@gmail.com\n\nPuedes consultar también nuestra Política de Privacidad y el Aviso Legal en los enlaces del pie de página.' },
  ]
  const thS = { background:'#EFE7D6', fontSize:12, fontWeight:700 as const, color:'#3A332C', padding:'10px 14px', textAlign:'left' as const, borderBottom:'1px solid #D8CDB6' }
  const tdS = { fontSize:13, color:'#6B5F52', padding:'10px 14px', borderBottom:'1px solid #D8CDB6', verticalAlign:'top' as const }
  return (
    <div style={{ minHeight:'100vh', background:'#F6F1E7', color:'#1A1714', padding:'48px 20px', fontFamily:SN }}>
      <div style={{ maxWidth:720, margin:'0 auto' }}>
        <a href="/" style={{ textDecoration:'none', display:'block', marginBottom:40 }}>
          <span style={{ fontFamily:SE, fontStyle:'italic', fontSize:26, color:'#1A1714' }}>ia<span style={{ color:'#D9442B' }}>.</span>rest</span>
        </a>
        <h1 style={{ fontFamily:SE, fontStyle:'italic', fontSize:36, color:'#1A1714', margin:'0 0 8px', letterSpacing:'-0.5px' }}>Política de cookies</h1>
        <p style={{ fontSize:13, color:'#6B5F52', margin:'0 0 40px' }}>Última actualización: mayo 2026</p>
        {secciones.map((s, i) => (
          <div key={i} style={{ marginBottom:32, paddingBottom:32, borderBottom: i < secciones.length-1 ? '1px solid #D8CDB6' : 'none' }}>
            <h2 style={{ fontFamily:SE, fontStyle:'italic', fontSize:20, color:'#1A1714', margin:'0 0 12px' }}>{s.titulo}</h2>
            {s.texto && s.texto.split('\n\n').map((p, j) => (
              <p key={j} style={{ fontSize:14, color:'#6B5F52', lineHeight:1.8, margin:'0 0 10px', whiteSpace:'pre-line' }}>{p}</p>
            ))}
            {s.tabla && (
              <div style={{ overflowX:'auto', marginTop:8 }}>
                <table style={{ width:'100%', borderCollapse:'collapse', border:'1px solid #D8CDB6', borderRadius:8, overflow:'hidden', fontSize:13 }}>
                  <thead>
                    <tr>{s.tabla[0].map((h, j) => <th key={j} style={thS}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {s.tabla.slice(1).map((row, ri) => (
                      <tr key={ri} style={{ background: ri % 2 === 0 ? '#FFFDF9' : '#F6F1E7' }}>
                        {row.map((cell, ci) => <td key={ci} style={tdS}>{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
        <div style={{ marginTop:40, paddingTop:24, borderTop:'1px solid #D8CDB6', display:'flex', gap:16, flexWrap:'wrap' }}>
          <a href="/aviso-legal" style={{ color:'#D9442B', fontSize:13, textDecoration:'underline' }}>Aviso legal</a>
          <a href="/privacidad" style={{ color:'#D9442B', fontSize:13, textDecoration:'underline' }}>Política de privacidad</a>
          <a href="/terminos" style={{ color:'#6B5F52', fontSize:13, textDecoration:'underline' }}>Términos de uso</a>
          <a href="/" style={{ color:'#6B5F52', fontSize:13, textDecoration:'underline' }}>Volver al inicio</a>
        </div>
      </div>
    </div>
  )
}
