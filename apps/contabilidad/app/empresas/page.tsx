import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ElegirEmpresa } from './ElegirEmpresa'
import { COOKIE_NAME, leerCookie } from '@/lib/sesion-cookie'
import { empresasDeUsuarioBd, usuarioVigenteBd } from '@/lib/db'
import { SELLO } from '@/lib/marca'

export const dynamic = 'force-dynamic'

/** Selector de empresa (gestor con N empresas, o quien quiera cambiar). La lista sale de BD; la elección se revalida en BD. */
export default async function Empresas() {
  const s = await leerCookie((await cookies()).get(COOKIE_NAME)?.value, new Date())
  if (!s || !(await usuarioVigenteBd(s.u, s.sv))) redirect('/login')
  const empresas = await empresasDeUsuarioBd(s.u)
  return (
    <main className="login-wrap">
      <section className="login-card">
        <h1 style={{ margin: 0 }}>Elige empresa</h1>
        <span className="sello">{SELLO}</span>
        {empresas.length === 0
          ? <p className="tenue">Este usuario ya no tiene acceso a ninguna empresa.</p>
          : <ElegirEmpresa empresas={empresas.map((e) => ({ id: e.empresaId, nombre: e.razonSocial, rol: e.rol }))} actual={s.e} />}
      </section>
    </main>
  )
}
