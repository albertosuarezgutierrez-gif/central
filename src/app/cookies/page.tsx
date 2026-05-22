export default function CookiesPage() {
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
        .cookie-table { width: 100%; border-collapse: collapse; margin: 16px 0 24px; font-size: 14px; }
        .cookie-table th { text-align: left; padding: 12px 16px; border-bottom: 1px solid rgba(246,241,231,.12); color: #6B6054; font-weight: 600; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
        .cookie-table td { padding: 14px 16px; border-bottom: 1px solid rgba(246,241,231,0.07); color: #D8CDB6; line-height: 1.5; vertical-align: top; }
        .cookie-table td:first-child { color: #F6F1E7; font-weight: 500; }
        .tag { display: inline-block; font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 4px; letter-spacing: .06em; text-transform: uppercase; }
        .tag-tec { background: rgba(110,189,115,.1); color: #6EBD73; border: 1px solid rgba(110,189,115,.2); }
        .tag-ext { background: rgba(232,163,59,.1); color: #E8A33B; border: 1px solid rgba(232,163,59,.2); }
        @media(max-width:600px) { .legal-nav { padding: 0 20px; } .doc { padding: 56px 20px 80px !important; } .cookie-table { font-size: 12px; } .cookie-table th, .cookie-table td { padding: 10px 8px; } }
      `}</style>
      <nav className="legal-nav">
        <a href="/" className="logo">ia<b>.</b>rest</a>
        <a href="/" className="back">← Volver</a>
      </nav>
      <div className="doc" style={s}>
        <h1>Política de cookies</h1>
        <div className="meta">Última actualización: mayo 2026 · ia.rest</div>

        <h2>¿Qué son las cookies?</h2>
        <p>Las cookies son pequeños archivos de texto que los sitios web almacenan en tu dispositivo. Permiten recordar preferencias y mejorar la experiencia de navegación.</p>

        <h2>Cookies que utilizamos</h2>
        <table className="cookie-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Finalidad</th>
              <th>Duración</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>cookies_ia</td>
              <td><span className="tag tag-tec">Técnica</span></td>
              <td>Recuerda tu preferencia sobre el banner de cookies</td>
              <td>1 año</td>
            </tr>
            <tr>
              <td>Google Fonts</td>
              <td><span className="tag tag-ext">Terceros</span></td>
              <td>Carga de fuentes tipográficas desde servidores de Google. Puede transmitir tu IP a Google LLC (EE.UU.) bajo Cláusulas Contractuales Estándar</td>
              <td>Sesión</td>
            </tr>
          </tbody>
        </table>

        <p>ia.rest <strong>no utiliza cookies de seguimiento, analíticas ni publicitarias</strong>. No hay Google Analytics, píxeles de Meta ni herramientas similares.</p>

        <h2>Cómo gestionar las cookies</h2>
        <p>Puedes aceptar o rechazar las cookies no esenciales desde el banner al acceder al sitio. También puedes configurar tu navegador:</p>
        <p>
          <a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener">Chrome</a>
          {' · '}
          <a href="https://support.mozilla.org/es/kb/habilitar-y-deshabilitar-cookies" target="_blank" rel="noopener">Firefox</a>
          {' · '}
          <a href="https://support.apple.com/es-es/guide/safari/sfri11471/mac" target="_blank" rel="noopener">Safari</a>
          {' · '}
          <a href="https://support.microsoft.com/es-es/windows/eliminar-y-administrar-cookies" target="_blank" rel="noopener">Edge</a>
        </p>

        <h2>Más información</h2>
        <p>Para cualquier consulta: <a href="mailto:hola@iarest.es">hola@iarest.es</a>. Consulta también nuestra <a href="/privacidad">Política de privacidad</a>.</p>
      </div>
    </>
  )
}
