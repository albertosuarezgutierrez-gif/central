export default function AvisoLegalPage() {
  const SE = "'Newsreader',Georgia,serif"
  const SN = "'Inter Tight',system-ui,sans-serif"

  const s: React.CSSProperties = {
    maxWidth: 720, margin: '0 auto', padding: '72px 48px 120px',
    fontFamily: SN, background: '#14110E', minHeight: '100vh', color: '#F6F1E7'
  }

  return (
    <>
      <style>{`
        body { background: #14110E; }
        .legal-nav { position: sticky; top: 0; z-index: 10; padding: 0 48px; height: 60px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(246,241,231,0.08); background: rgba(20,17,14,.95); backdrop-filter: blur(16px); }
        .legal-nav a { text-decoration: none; }
        .logo { font-family: ${SE}; font-size: 20px; font-weight: 300; color: #F6F1E7; }
        .logo b { color: #D9442B; font-weight: 300; }
        .back { font-size: 13px; color: #6B6054; transition: color .2s; }
        .back:hover { color: #F6F1E7; }
        .doc h1 { font-family: ${SE}; font-size: clamp(32px,4vw,48px); font-weight: 300; letter-spacing: -1.5px; color: #F6F1E7; margin-bottom: 12px; }
        .doc .meta { font-size: 12px; color: #6B6054; margin-bottom: 52px; padding-bottom: 32px; border-bottom: 1px solid rgba(246,241,231,0.08); }
        .doc h2 { font-family: ${SE}; font-size: 22px; font-weight: 300; color: #F6F1E7; letter-spacing: -.5px; margin: 40px 0 14px; }
        .doc p { font-size: 15px; color: #D8CDB6; line-height: 1.8; margin-bottom: 14px; font-weight: 300; }
        .doc a { color: #D8CDB6; transition: color .2s; }
        .doc a:hover { color: #F6F1E7; }
        .doc strong { color: #F6F1E7; font-weight: 500; }
        @media(max-width:600px) { .legal-nav { padding: 0 20px; } .doc { padding: 56px 20px 80px !important; } }
      `}</style>
      <nav className="legal-nav">
        <a href="/" className="logo">ia<b>.</b>rest</a>
        <a href="/" className="back">← Volver</a>
      </nav>
      <div className="doc" style={s}>
        <h1>Aviso legal</h1>
        <div className="meta">Última actualización: mayo 2026 · ia.rest</div>

        <h2>1. Titular del sitio web</h2>
        <p>El presente sitio web <strong>www.iarest.es</strong> es titularidad del responsable de <strong>ia.rest</strong>. Para cualquier comunicación legal: <a href="mailto:hola@iarest.es">hola@iarest.es</a>.</p>

        <h2>2. Objeto y ámbito de aplicación</h2>
        <p>Este aviso legal regula el acceso y uso del sitio web www.iarest.es y de los servicios SaaS ofrecidos bajo la marca <strong>ia.rest</strong>. El acceso al sitio implica la aceptación plena de las presentes condiciones.</p>

        <h2>3. Propiedad intelectual e industrial</h2>
        <p>Todos los contenidos del sitio web — incluyendo, sin limitación, textos, imágenes, diseño, logotipos, código fuente, arquitectura del software y denominaciones comerciales — son propiedad exclusiva de ia.rest o de sus licenciantes, y están protegidos por la legislación española e internacional sobre propiedad intelectual e industrial.</p>
        <p>Queda expresamente prohibida la reproducción, distribución, transformación o comunicación pública de cualquier elemento del sitio sin autorización escrita previa del titular.</p>

        <h2>4. Condiciones de uso del servicio SaaS</h2>
        <p>El acceso y uso de la plataforma ia.rest como servicio está regulado por el <strong>Contrato SaaS</strong> disponible en <a href="/public/contrato-iarest-v1.pdf">/public/contrato-iarest-v1.pdf</a>, que debe ser aceptado expresamente durante el proceso de alta.</p>

        <h2>5. Exclusión de garantías y responsabilidad</h2>
        <p>ia.rest no garantiza la disponibilidad ininterrumpida del sitio web ni la ausencia de errores en sus contenidos. El titular no será responsable de los daños o perjuicios derivados del uso del sitio por causas ajenas a su control.</p>

        <h2>6. Legislación aplicable y fuero</h2>
        <p>Las presentes condiciones se rigen por la legislación española. Para la resolución de cualquier controversia, las partes se someten a los Juzgados y Tribunales competentes conforme a la normativa aplicable.</p>

        <h2>7. Modificaciones</h2>
        <p>ia.rest se reserva el derecho de modificar este aviso legal en cualquier momento. Las modificaciones serán efectivas desde su publicación en el sitio web.</p>
      </div>
    </>
  )
}
