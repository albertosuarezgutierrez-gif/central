import { MarcaGenerica, PieAsegura } from '@/components/MarcaAsegura'
import LoginForm from './LoginForm'
import { passwordHabilitada } from '@/lib/acceso-password'

// Se lee la env en cada petición (no en el build): quitar un correo de `RRHH_LOGIN_PASSWORD_EMAILS` vale al momento.
export const dynamic = 'force-dynamic'

// Aún no se sabe de qué empresa es quien entra: «Portal del Empleado» manda y Grupo ASegura queda pequeño.
export default function Login() {
  return (
    <main className="flex min-h-screen flex-col items-center p-4">
      <div className="my-auto w-full max-w-sm rounded-card border border-line bg-card p-6 text-center sm:p-7">
        <MarcaGenerica />
        <h1 className="mt-5 text-lg">Acceso para responsables</h1>
        <p className="mt-1 text-sm text-ink-2">Para RR.HH.: plantilla, documentos y firmas de tu empresa.</p>
        {/* Solo el BOOLEANO llega al cliente: la lista de correos nunca sale del servidor. */}
        <LoginForm conPassword={passwordHabilitada()} />
      </div>
      <div className="mt-auto w-full"><PieAsegura /></div>
    </main>
  )
}
