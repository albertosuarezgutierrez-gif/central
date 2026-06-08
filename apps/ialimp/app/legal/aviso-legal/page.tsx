import { RGPD_RESPONSABLE } from '@/lib/rgpd'

export const metadata = { title: 'Aviso legal — IALIMP' }

const h1 = { fontWeight: 800, fontSize: 'clamp(26px,5vw,36px)', letterSpacing: '-.02em', margin: '0 0 6px' } as const
const upd = { color: '#64748b', fontSize: 13.5, margin: '0 0 24px' } as const
const h2 = { fontWeight: 700, fontSize: 19, letterSpacing: '-.01em', margin: '26px 0 8px' } as const
const p = { fontSize: 15, lineHeight: 1.65, color: '#334155', margin: '0 0 10px' } as const
const box = { background: '#eef2ff', borderRadius: 14, padding: '16px 18px', margin: '8px 0' } as const

export default function AvisoLegalPage() {
  const r = RGPD_RESPONSABLE
  return (
    <article>
      <h1 style={h1}>Aviso legal</h1>
      <p style={upd}>Última actualización: junio de 2026</p>

      <p style={p}>En cumplimiento del artículo 10 de la Ley 34/2002, de 11 de julio, de Servicios de la
        Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se facilitan los datos
        identificativos del titular de esta aplicación web.</p>

      <h2 style={h2}>1. Titular</h2>
      <div style={box}>
        <p style={{ ...p, margin: '2px 0', color: '#1e1b4b' }}><strong>Titular:</strong> {r.nombre} ({r.marca})</p>
        <p style={{ ...p, margin: '2px 0', color: '#1e1b4b' }}><strong>NIF:</strong> {r.nif}</p>
        <p style={{ ...p, margin: '2px 0', color: '#1e1b4b' }}><strong>Domicilio:</strong> {r.direccion}</p>
        <p style={{ ...p, margin: '2px 0', color: '#1e1b4b' }}><strong>Correo:</strong> <a href={`mailto:${r.email}`} style={{ color: '#4f46e5' }}>{r.email}</a></p>
      </div>

      <h2 style={h2}>2. Objeto</h2>
      <p style={p}>IALIMP es una aplicación de gestión y coordinación de limpiezas para empresas de
        apartamentos turísticos. Este aviso regula el acceso y uso de la aplicación.</p>

      <h2 style={h2}>3. Condiciones de uso</h2>
      <p style={p}>El acceso atribuye la condición de usuario e implica la aceptación de estas condiciones.
        El usuario se compromete a hacer un uso adecuado de la aplicación y a no emplearla para fines
        ilícitos o que puedan dañar los derechos o intereses de terceros.</p>

      <h2 style={h2}>4. Propiedad intelectual e industrial</h2>
      <p style={p}>El software, la marca, los logotipos, el diseño y los contenidos de la aplicación son
        titularidad de {r.nombre} o de terceros que han autorizado su uso, y están protegidos por la
        normativa de propiedad intelectual e industrial. Queda prohibida su reproducción o
        transformación sin autorización expresa.</p>

      <h2 style={h2}>5. Responsabilidad</h2>
      <p style={p}>El titular no se responsabiliza de los daños derivados del uso de la aplicación ni de
        la indisponibilidad temporal por causas técnicas o de mantenimiento.</p>

      <h2 style={h2}>6. Protección de datos y cookies</h2>
      <p style={p}>El tratamiento de datos personales se rige por la <a href="/legal/privacidad" style={{ color: '#4f46e5' }}>Política de privacidad</a> y
        el uso de cookies por la <a href="/legal/cookies" style={{ color: '#4f46e5' }}>Política de cookies</a>.</p>

      <h2 style={h2}>7. Legislación aplicable</h2>
      <p style={p}>Estas condiciones se rigen por la legislación española, sometiéndose las partes a los
        juzgados y tribunales del domicilio del titular, salvo que la normativa de consumidores
        establezca otro fuero.</p>
    </article>
  )
}
