import { RGPD_RESPONSABLE } from '@/lib/rgpd'

export const metadata = { title: 'Política de privacidad — IALIMP' }

const h1 = { fontWeight: 800, fontSize: 'clamp(26px,5vw,36px)', letterSpacing: '-.02em', margin: '0 0 6px' } as const
const upd = { color: '#64748b', fontSize: 13.5, margin: '0 0 24px' } as const
const h2 = { fontWeight: 700, fontSize: 19, letterSpacing: '-.01em', margin: '26px 0 8px' } as const
const p = { fontSize: 15, lineHeight: 1.65, color: '#334155', margin: '0 0 10px' } as const
const box = { background: '#eef2ff', borderRadius: 14, padding: '16px 18px', margin: '8px 0' } as const
const li = { fontSize: 15, lineHeight: 1.6, color: '#334155', marginBottom: 6 } as const

export default function PrivacidadPage() {
  const r = RGPD_RESPONSABLE
  return (
    <article>
      <h1 style={h1}>Política de privacidad</h1>
      <p style={upd}>Última actualización: junio de 2026</p>

      <p style={p}>Esta política explica cómo se tratan los datos personales en la aplicación IALIMP,
        conforme al Reglamento (UE) 2016/679 (RGPD) y a la Ley Orgánica 3/2018 (LOPDGDD).</p>

      <h2 style={h2}>1. Responsable del tratamiento</h2>
      <div style={box}>
        <p style={{ ...p, margin: '2px 0', color: '#1e1b4b' }}><strong>Responsable:</strong> {r.nombre} ({r.marca})</p>
        <p style={{ ...p, margin: '2px 0', color: '#1e1b4b' }}><strong>NIF:</strong> {r.nif}</p>
        <p style={{ ...p, margin: '2px 0', color: '#1e1b4b' }}><strong>Domicilio:</strong> {r.direccion}</p>
        <p style={{ ...p, margin: '2px 0', color: '#1e1b4b' }}><strong>Contacto:</strong> <a href={`mailto:${r.email}`} style={{ color: '#4f46e5' }}>{r.email}</a></p>
      </div>

      <h2 style={h2}>2. ¿Qué datos tratamos y con qué finalidad?</h2>
      <ul style={{ margin: '8px 0 8px 20px' }}>
        <li style={li}><strong>Datos de cuenta y uso de la aplicación</strong> (empresa, usuarios, limpiadoras,
          propietarios, sesiones de limpieza, fotos, facturación): para prestar el servicio de gestión de
          limpiezas contratado. Base jurídica: ejecución del contrato (art. 6.1.b RGPD).</li>
        <li style={li}><strong>Datos de contacto que nos facilites</strong> (correo, mensajes): para atenderte
          y comunicarnos contigo. Base jurídica: consentimiento o interés legítimo (art. 6.1.a / 6.1.f).</li>
        <li style={li}><strong>Cookies técnicas de sesión:</strong> imprescindibles para mantener tu sesión
          iniciada de forma segura (ver <a href="/legal/cookies" style={{ color: '#4f46e5' }}>Política de cookies</a>).</li>
      </ul>

      <h2 style={h2}>3. Conservación</h2>
      <p style={p}>Conservamos los datos mientras dure la relación y, después, durante los plazos legales
        aplicables (mercantiles, fiscales y de protección de datos) para atender posibles responsabilidades.</p>

      <h2 style={h2}>4. Destinatarios y encargados</h2>
      <p style={p}>No cedemos tus datos a terceros salvo obligación legal. Para prestar el servicio utilizamos
        proveedores que actúan como <strong>encargados del tratamiento</strong> con las garantías del RGPD,
        entre otros: <strong>Vercel</strong> (alojamiento), <strong>Supabase</strong> (base de datos y
        almacenamiento) y proveedores de envío de correo electrónico.</p>

      <h2 style={h2}>5. Transferencias internacionales</h2>
      <p style={p}>Algunos proveedores pueden estar ubicados fuera del Espacio Económico Europeo. En tal caso,
        las transferencias se amparan en las garantías adecuadas previstas en el RGPD (por ejemplo, cláusulas
        contractuales tipo de la Comisión Europea). La tipografía de la aplicación se sirve auto-alojada desde
        nuestros propios servidores, sin recurrir a fuentes de terceros.</p>

      <h2 style={h2}>6. Tus derechos</h2>
      <p style={p}>Puedes ejercer los derechos de <strong>acceso, rectificación, supresión, oposición,
        limitación y portabilidad</strong>, así como retirar tu consentimiento, escribiendo a
        <a href={`mailto:${r.email}`} style={{ color: '#4f46e5' }}> {r.email}</a>. Si lo consideras necesario,
        puedes reclamar ante la Agencia Española de Protección de Datos
        (<a href="https://www.aepd.es" target="_blank" rel="noopener" style={{ color: '#4f46e5' }}>www.aepd.es</a>).</p>

      <h2 style={h2}>7. Seguridad</h2>
      <p style={p}>Aplicamos medidas técnicas y organizativas apropiadas para proteger los datos frente a su
        pérdida, uso indebido o acceso no autorizado.</p>
    </article>
  )
}
