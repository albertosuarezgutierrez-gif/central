import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import LoginForm from './LoginForm'

// Con sesión válida, /login no pinta el formulario: reenvía a /banca. El acceso directo del
// móvil de Alberto apunta a /login, y hasta hoy pedía usuario aunque la cookie de 30 días siguiera
// viva (19/09/2026).
export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  if (await getSession()) redirect('/banca')
  return <LoginForm />
}
