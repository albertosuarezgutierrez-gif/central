export default function PrivacidadPage() {
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
        @media(max-width:600px) { .legal-nav { padding: 0 20px; } .doc { padding: 56px 20px 80px !important; } }
      `}</style>
      <nav className="legal-nav">
        <a href="/" className="logo">ia<b>.</b>rest</a>
        <a href="/" className="back">← Volver</a>
      </nav>
      <div className="doc" style={s}>
        <h1>Política de privacidad</h1>
        <div className="meta">Última actualización: mayo 2026 · ia.rest</div>

        <h2>1. Responsable del tratamiento</h2>
        <p>El responsable del tratamiento de los datos personales recogidos a través de este sitio web es el titular de <strong>ia.rest</strong>. Para cualquier consulta relacionada con el tratamiento de tus datos, puedes contactarnos en <a href="mailto:hola@iarest.es">hola@iarest.es</a>.</p>

        <h2>2. Datos que recogemos</h2>
        <p>A través del formulario de contacto recogemos los siguientes datos:</p>
        <ul>
          <li>Nombre y apellidos</li>
          <li>Nombre del establecimiento</li>
          <li>Dirección de correo electrónico</li>
          <li>Número de teléfono (opcional)</li>
          <li>Número aproximado de usuarios</li>
        </ul>

        <h2>3. Finalidad del tratamiento</h2>
        <p>Los datos recogidos se utilizan exclusivamente para:</p>
        <ul>
          <li>Responder a tu solicitud de información sobre ia.rest</li>
          <li>Contactarte para mostrarte la plataforma y explicarte cómo puede ayudar a tu negocio</li>
          <li>Enviarte información comercial relacionada con ia.rest, siempre que hayas prestado tu consentimiento</li>
        </ul>

        <h2>4. Base legal</h2>
        <p>El tratamiento se basa en el <strong>consentimiento expreso</strong> que otorgas al marcar la casilla de aceptación y enviar el formulario, de acuerdo con el artículo 6.1.a del RGPD.</p>

        <h2>5. Conservación de los datos</h2>
        <p>Conservamos tus datos mientras exista una relación comercial activa o potencial, y en cualquier caso durante un máximo de <strong>2 años</strong> desde el último contacto.</p>

        <h2>6. Destinatarios</h2>
        <p>No cedemos tus datos a terceros salvo obligación legal. Los datos se almacenan en infraestructura de <strong>Supabase</strong> (servidores en la Unión Europea, región eu-west-1).</p>

        <h2>7. Transferencias internacionales</h2>
        <p>Las fuentes tipográficas del sitio se cargan desde <strong>Google Fonts</strong> (Google LLC, EE.UU.), lo que puede implicar la transferencia de tu dirección IP a servidores de Google, al amparo de las Cláusulas Contractuales Estándar aprobadas por la Comisión Europea.</p>

        <h2>8. Tus derechos</h2>
        <p>Puedes ejercer en cualquier momento los derechos de acceso, rectificación, supresión, oposición, portabilidad y limitación del tratamiento escribiendo a <a href="mailto:hola@iarest.es">hola@iarest.es</a>. Responderemos en el plazo máximo de <strong>30 días</strong>.</p>
        <p>Si consideras que el tratamiento de tus datos no es conforme a la normativa, puedes presentar una reclamación ante la <strong>Agencia Española de Protección de Datos</strong> (aepd.es).</p>

        <h2>9. Seguridad</h2>
        <p>Aplicamos medidas técnicas y organizativas adecuadas para proteger tus datos frente a accesos no autorizados, pérdida o destrucción, de acuerdo con el artículo 32 del RGPD.</p>

        <h2>10. Modificaciones</h2>
        <p>Podemos actualizar esta política para adaptarla a cambios legislativos o de servicio. La fecha de última actualización aparece al inicio del documento.</p>
      </div>
    </>
  )
}
