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
        .doc ul { margin: 0 0 14px 20px; }
        .doc li { font-size: 15px; color: #D8CDB6; line-height: 1.8; margin-bottom: 6px; font-weight: 300; }
        .doc a { color: #D8CDB6; transition: color .2s; }
        .doc a:hover { color: #F6F1E7; }
        .doc strong { color: #F6F1E7; font-weight: 500; }
        .datos-box { background: rgba(246,241,231,.03); border: 1px solid rgba(246,241,231,.1); border-radius: 12px; padding: 20px 22px; margin: 20px 0; }
        .datos-box p { margin-bottom: 8px; font-size: 14px; }
        .datos-box p:last-child { margin-bottom: 0; }
        @media(max-width:600px) { .legal-nav { padding: 0 20px; } .doc { padding: 56px 20px 80px !important; } }
      `}</style>
      <nav className="legal-nav">
        <a href="/" className="logo">ia<b>.</b>rest</a>
        <a href="/" className="back">← Volver</a>
      </nav>
      <div className="doc" style={s}>
        <h1>Aviso legal</h1>
        <div className="meta">Última actualización: mayo 2026 · ia.rest</div>

        {/* Datos identificativos obligatorios — LSSICE art. 10 */}
        <h2>1. Datos identificativos del titular</h2>
        <p>En cumplimiento del artículo 10 de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSICE), se informa:</p>
        <div className="datos-box">
          <p><strong>Titular:</strong> Alberto Suárez Gutiérrez</p>
          <p><strong>NIF:</strong> 28823484E</p>
          <p><strong>Domicilio:</strong> Sevilla, España</p>
          <p><strong>Correo electrónico:</strong> <a href="mailto:hola@iarest.es">hola@iarest.es</a></p>
          <p><strong>Sitio web:</strong> www.iarest.es</p>
          <p><strong>Actividad:</strong> Desarrollo y comercialización de software SaaS para gestión de restaurantes con inteligencia artificial</p>
        </div>

        <h2>2. Objeto y ámbito de aplicación</h2>
        <p>Este aviso legal regula el acceso y uso del sitio web <strong>www.iarest.es</strong> y de los servicios SaaS ofrecidos bajo la marca <strong>ia.rest</strong>. El acceso al sitio implica la aceptación de las presentes condiciones.</p>

        <h2>3. Condiciones de contratación del servicio SaaS</h2>
        <p>La contratación del servicio ia.rest se realiza exclusivamente a través de los canales habilitados en este sitio web. El proceso de contratación incluye los siguientes pasos:</p>
        <ul>
          <li>Cumplimentación del formulario de alta o solicitud de demo</li>
          <li>Lectura y aceptación expresa del <a href="/public/contrato-iarest-v1.pdf">Contrato de Servicio SaaS</a> y de la presente Política de privacidad</li>
          <li>Confirmación de alta y acceso al servicio</li>
        </ul>
        <p>El contrato formalizado queda archivado y puede ser consultado por el cliente en su panel de administración. El idioma de formalización es el <strong>español</strong>. Ante cualquier error en el proceso de contratación, el cliente puede contactar con <a href="mailto:hola@iarest.es">hola@iarest.es</a> para su corrección.</p>

        <h2>4. Destinatarios del servicio</h2>
        <p>El servicio ia.rest está dirigido exclusivamente a <strong>empresas y profesionales del sector de la hostelería</strong> (autónomos, sociedades, grupos). No se ofrecen servicios directamente a consumidores finales. En consecuencia, no aplica el régimen de derecho de desistimiento establecido en el Real Decreto Legislativo 1/2007 (TR-LGDCU).</p>

        <h2>5. Propiedad intelectual e industrial</h2>
        <p>Todos los contenidos del sitio web —incluyendo, sin limitación, textos, imágenes, diseño, logotipos, código fuente, arquitectura del software y denominaciones comerciales— son propiedad exclusiva del titular o de sus licenciantes, y están protegidos por la legislación española e internacional sobre propiedad intelectual e industrial.</p>
        <p>Queda expresamente prohibida la reproducción, distribución, transformación o comunicación pública de cualquier elemento del sitio sin autorización escrita previa del titular.</p>

        <h2>6. Uso de inteligencia artificial</h2>
        <p>El servicio ia.rest incorpora sistemas de inteligencia artificial para la transcripción de voz y la estructuración de comandas, clasificados como de <strong>riesgo limitado</strong> bajo el Reglamento (UE) 2024/1689 (Reglamento de IA). Se garantiza la supervisión humana de todas las acciones del sistema. Para más información, consulta nuestra <a href="/privacidad">Política de privacidad</a>, sección "Uso de Inteligencia Artificial".</p>

        <h2>7. Exclusión de garantías y responsabilidad</h2>
        <p>ia.rest no garantiza la disponibilidad ininterrumpida del sitio web ni la ausencia de errores en sus contenidos. El titular no será responsable de los daños o perjuicios derivados del uso del sitio por causas ajenas a su control. La responsabilidad máxima de ia.rest ante el cliente queda limitada a lo establecido en el Contrato de Servicio SaaS.</p>

        <h2>8. Legislación aplicable y fuero</h2>
        <p>Las presentes condiciones se rigen por la legislación española. Para la resolución de cualquier controversia derivada del uso del sitio web o de la prestación del servicio, las partes se someten expresamente a los Juzgados y Tribunales de <strong>Sevilla</strong>, con renuncia a cualquier otro fuero que pudiera corresponderles.</p>

        <h2>9. Modificaciones</h2>
        <p>ia.rest se reserva el derecho de modificar este aviso legal en cualquier momento. Las modificaciones serán efectivas desde su publicación en el sitio web.</p>
      </div>
    </>
  )
}
