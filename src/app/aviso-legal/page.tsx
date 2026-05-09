export default function AvisoLegalPage() {
  const SE = "'Newsreader',Georgia,serif"
  const SN = "'Inter Tight',system-ui,sans-serif"
  const secciones = [
    { titulo: '1. Datos identificativos del titular', texto: 'En cumplimiento del artículo 10 de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se informa de los datos identificativos del titular de este sitio web:\n\nTitular: Alberto Suárez Gutiérrez\nNIF: 28823484E\nDomicilio: Sevilla, España\nEmail: alberto.suarez.gutierrez@gmail.com\nActividad: Desarrollo y prestación de servicios SaaS para hostelería bajo la marca comercial ia.rest' },
    { titulo: '2. Objeto y ámbito de aplicación', texto: 'El presente Aviso Legal regula el acceso y uso del sitio web ia-rest.vercel.app y sus subdominios (en adelante, "el Sitio"), así como de la aplicación web ia.rest (en adelante, "el Servicio"). El acceso al Sitio implica la aceptación de las presentes condiciones.' },
    { titulo: '3. Propiedad intelectual e industrial', texto: 'El software, código fuente, diseño, marca "ia.rest", logotipos, nombres comerciales, algoritmos, agentes de inteligencia artificial (EAR, BRAIN, COURIER, VOX, ANALYST), textos, imágenes y demás contenidos del Sitio y del Servicio son propiedad exclusiva de Alberto Suárez Gutiérrez o cuentan con las licencias correspondientes, y están protegidos por la legislación española e internacional de propiedad intelectual e industrial.\n\nQueda expresamente prohibida su reproducción, distribución, transformación o comunicación pública sin autorización escrita previa del titular.' },
    { titulo: '4. Condiciones de uso', texto: 'El usuario se compromete a hacer un uso adecuado del Sitio y del Servicio, conforme a la ley, a las buenas costumbres y al orden público, y a no utilizarlos con fines ilícitos o que puedan causar daños o perjuicios a terceros o al propio titular.\n\nQueda prohibido el uso del Servicio para actividades ilegales, la introducción de virus o código malicioso, el acceso no autorizado a sistemas, y cualquier acción que pudiera dañar, inutilizar o sobrecargar el Servicio.' },
    { titulo: '5. Exclusión de garantías y responsabilidad', texto: 'El titular no garantiza la disponibilidad ininterrumpida del Sitio ni del Servicio, ni la ausencia de errores en los contenidos. El Servicio se presta en régimen de mejor esfuerzo, dependiendo de infraestructura de terceros (Vercel, Supabase, Groq, Anthropic).\n\nEl titular queda exonerado de cualquier responsabilidad por daños y perjuicios de cualquier naturaleza que pudieran derivarse del acceso, uso o imposibilidad de uso del Sitio, así como de la actuación de terceros.\n\nEn ningún caso el titular será responsable de lucro cesante, daños indirectos, consecuentes o punitivos.' },
    { titulo: '6. Enlaces a terceros', texto: 'El Sitio puede contener enlaces a sitios web de terceros. El titular no asume ninguna responsabilidad derivada del acceso a dichos sitios, ni sobre sus contenidos, productos o servicios.' },
    { titulo: '7. Legislación aplicable y jurisdicción', texto: 'El presente Aviso Legal se rige por la legislación española. Para la resolución de cualquier controversia derivada de su interpretación o aplicación, las partes se someten a la jurisdicción de los Juzgados y Tribunales de la ciudad de Sevilla, con renuncia expresa a cualquier otro fuero que pudiera corresponderles.' },
    { titulo: '8. Modificaciones', texto: 'El titular se reserva el derecho a modificar el presente Aviso Legal en cualquier momento, publicando la versión actualizada en el Sitio. La fecha de última actualización figura al inicio de este documento.' },
    { titulo: '9. Contacto', texto: 'Para cualquier consulta relacionada con este Aviso Legal, puedes contactar con nosotros en: alberto.suarez.gutierrez@gmail.com' },
  ]
  return (
    <div style={{ minHeight:'100vh', background:'#F6F1E7', color:'#1A1714', padding:'48px 20px', fontFamily:SN }}>
      <div style={{ maxWidth:680, margin:'0 auto' }}>
        <a href="/" style={{ textDecoration:'none', display:'block', marginBottom:40 }}>
          <span style={{ fontFamily:SE, fontStyle:'italic', fontSize:26, color:'#1A1714' }}>ia<span style={{ color:'#D9442B' }}>.</span>rest</span>
        </a>
        <h1 style={{ fontFamily:SE, fontStyle:'italic', fontSize:36, color:'#1A1714', margin:'0 0 8px', letterSpacing:'-0.5px' }}>Aviso legal</h1>
        <p style={{ fontSize:13, color:'#6B5F52', margin:'0 0 40px' }}>Última actualización: mayo 2026</p>
        {secciones.map((s, i) => (
          <div key={i} style={{ marginBottom:32, paddingBottom:32, borderBottom: i < secciones.length-1 ? '1px solid #D8CDB6' : 'none' }}>
            <h2 style={{ fontFamily:SE, fontStyle:'italic', fontSize:20, color:'#1A1714', margin:'0 0 10px' }}>{s.titulo}</h2>
            {s.texto.split('\n\n').map((p, j) => (
              <p key={j} style={{ fontSize:14, color:'#6B5F52', lineHeight:1.8, margin:'0 0 10px' }}>{p}</p>
            ))}
          </div>
        ))}
        <div style={{ marginTop:40, paddingTop:24, borderTop:'1px solid #D8CDB6', display:'flex', gap:16, flexWrap:'wrap' }}>
          <a href="/privacidad" style={{ color:'#D9442B', fontSize:13, textDecoration:'underline' }}>Política de privacidad</a>
          <a href="/cookies" style={{ color:'#D9442B', fontSize:13, textDecoration:'underline' }}>Política de cookies</a>
          <a href="/terminos" style={{ color:'#6B5F52', fontSize:13, textDecoration:'underline' }}>Términos de uso</a>
          <a href="/" style={{ color:'#6B5F52', fontSize:13, textDecoration:'underline' }}>Volver al inicio</a>
        </div>
      </div>
    </div>
  )
}
