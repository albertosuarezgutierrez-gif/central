import SetPasswordClient from './SetPasswordClient'

// Página a la que llega el propietario desde el enlace del correo.
// La validez del token se comprueba al enviar (en /api/propietario/auth/set-password).
export default async function SetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <SetPasswordClient token={token} />
}
