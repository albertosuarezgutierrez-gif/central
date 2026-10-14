import Link from 'next/link'

import { enlaceFamiliaViva } from '@/lib/invitar-familia-bd'
import { getIdentidad } from '@/lib/session'

import { EntrarConCodigo } from '../../[token]/Invitacion'
import { RegistrarEntradaFamilia } from './Familia'

export const dynamic = 'force-dynamic'

/**
 * Aterrizaje del enlace «Invita a tu familia». PÚBLICA. No abre sesión (el código al correo dice quién eres),
 * no muestra quién invita ni dato alguno de pólizas y el texto es neutro (sin argumento comercial ni incentivo).
 * Enlace inexistente, caducado, revocado o agotado salen por la MISMA página.
 */
export default async function FamiliaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!(await enlaceFamiliaViva(token))) {
    return (
      <main style={{ maxWidth: 420, margin: '0 auto', padding: '2rem 1rem' }}>
        <div className="seccion">
          <h1 style={{ fontSize: '1.5rem', marginTop: 0 }}>Este enlace ya no vale</h1>
          <p style={{ marginTop: 0 }}>No podemos abrir esta invitación. Quien te la mandó puede compartirte otra.</p>
          <p style={{ margin: '12px 0 0', fontSize: 14 }}>
            <Link href="/">Ir a la entrada del portal</Link>
          </p>
        </div>
      </main>
    )
  }
  const identidad = await getIdentidad()
  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '2rem 1rem' }}>
      <div className="seccion">
        <h1 style={{ fontSize: '1.5rem', marginTop: 0 }}>Te han presentado Mis Seguros</h1>
        <p className="suave" style={{ marginTop: 0 }}>
          Alguien de tu entorno usa el portal de Grupo ASegura y te lo ha presentado. No se comparte ningún
          seguro de nadie contigo.
        </p>
        {identidad === null ? (
          <>
            <p style={{ margin: '0 0 4px' }}>
              <strong>Entra con tu correo</strong>: te mandamos un código de un solo uso.
            </p>
            <EntrarConCodigo />
          </>
        ) : (
          <>
            <RegistrarEntradaFamilia token={token} />
            <p style={{ margin: '0 0 12px' }}>Ya has entrado.</p>
            <Link className="boton" href="/boveda" style={{ display: 'inline-block', minHeight: 44 }}>
              Ir a mis seguros
            </Link>
          </>
        )}
      </div>
    </main>
  )
}
