import { RGPD_RESPONSABLE } from '@/lib/rgpd'

export const metadata = { title: 'Política de cookies — IALIMP' }

const h1 = { fontWeight: 800, fontSize: 'clamp(26px,5vw,36px)', letterSpacing: '-.02em', margin: '0 0 6px' } as const
const upd = { color: '#64748b', fontSize: 13.5, margin: '0 0 24px' } as const
const h2 = { fontWeight: 700, fontSize: 19, letterSpacing: '-.01em', margin: '26px 0 8px' } as const
const p = { fontSize: 15, lineHeight: 1.65, color: '#334155', margin: '0 0 10px' } as const
const li = { fontSize: 15, lineHeight: 1.6, color: '#334155', marginBottom: 6 } as const
const tdh = { border: '1px solid #e2e8f0', padding: '10px 12px', textAlign: 'left' as const, background: '#eef2ff', fontWeight: 700 }
const td = { border: '1px solid #e2e8f0', padding: '10px 12px', textAlign: 'left' as const, verticalAlign: 'top' as const, fontSize: 14 }

export default function CookiesPage() {
  const r = RGPD_RESPONSABLE
  return (
    <article>
      <h1 style={h1}>Política de cookies</h1>
      <p style={upd}>Última actualización: junio de 2026</p>

      <h2 style={h2}>1. ¿Qué son las cookies?</h2>
      <p style={p}>Las cookies son pequeños archivos que un sitio guarda en tu dispositivo. Conforme al
        artículo 22.2 de la LSSI-CE, solo las cookies que <strong>no</strong> son estrictamente necesarias
        requieren tu consentimiento.</p>

      <h2 style={h2}>2. Cookies que usa IALIMP</h2>
      <p style={p}>IALIMP utiliza <strong>únicamente cookies técnicas estrictamente necesarias</strong> para
        el inicio de sesión y el funcionamiento de la aplicación. <strong>No usamos cookies de analítica,
        publicidad ni seguimiento.</strong> Por eso el aviso de cookies es informativo y no incluye opciones
        de rechazo: sin estas cookies la aplicación no puede funcionar.</p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', margin: '10px 0', minWidth: 480 }}>
          <thead>
            <tr><th style={tdh}>Cookie</th><th style={tdh}>Finalidad</th><th style={tdh}>Tipo</th><th style={tdh}>Duración</th></tr>
          </thead>
          <tbody>
            <tr><td style={td}><code>ialimp_session</code></td><td style={td}>Mantener la sesión del panel de gestión.</td><td style={td}>Técnica necesaria</td><td style={td}>30 días</td></tr>
            <tr><td style={td}><code>ialimp_prop</code></td><td style={td}>Mantener la sesión del portal del propietario.</td><td style={td}>Técnica necesaria</td><td style={td}>30 días</td></tr>
            <tr><td style={td}><code>limpiadora_token</code></td><td style={td}>Mantener la sesión de la app de la limpiadora.</td><td style={td}>Técnica necesaria</td><td style={td}>30 días</td></tr>
          </tbody>
        </table>
      </div>

      <h2 style={h2}>3. Recursos de terceros</h2>
      <p style={p}>La tipografía de la aplicación se sirve <strong>auto-alojada</strong> desde nuestro propio
        dominio, por lo que <strong>no se realizan peticiones a servidores de terceros</strong> (como Google
        Fonts) ni se transfiere tu dirección IP a proveedores externos al cargar la página. Puedes ampliar la
        información en nuestra <a href="/legal/privacidad" style={{ color: '#4f46e5' }}> Política de privacidad</a>.</p>

      <h2 style={h2}>4. Cómo gestionar las cookies</h2>
      <ul style={{ margin: '8px 0 8px 20px' }}>
        <li style={li}>Puedes bloquear o eliminar cookies desde los ajustes de privacidad de tu navegador.</li>
        <li style={li}>Al ser todas técnicas necesarias, su bloqueo puede impedir iniciar sesión o usar la aplicación.</li>
      </ul>

      <h2 style={h2}>5. Contacto</h2>
      <p style={p}>Para cualquier duda sobre esta política, escríbenos a
        <a href={`mailto:${r.email}`} style={{ color: '#4f46e5' }}> {r.email}</a>.</p>
    </article>
  )
}
