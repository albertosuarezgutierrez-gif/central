import { LoginCliente } from './LoginCliente'
import { SELLO } from '@/lib/marca'

export const dynamic = 'force-dynamic'

export default function Login() {
  return (
    <main className="login-wrap">
      <section className="login-card">
        <h1 style={{ margin: 0 }}>Contabilidad</h1>
        <span className="sello">{SELLO}</span>
        <LoginCliente />
      </section>
    </main>
  )
}
