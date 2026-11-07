import { LoginCliente } from './LoginCliente'
import { SELLO } from '@/lib/marca'

export const dynamic = 'force-dynamic'

export default function Login() {
  return (
    <main className="login-wrap">
      <section className="login-card">
        <h1 style={{ margin: 0 }}>Mi empresa</h1>
        <span className="sello">{SELLO}</span>
        <p className="tenue">Entra con tu correo: te mandamos un código de 6 cifras.</p>
        <LoginCliente />
      </section>
    </main>
  )
}
