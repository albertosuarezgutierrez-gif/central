import { redirect } from 'next/navigation'
import Link from 'next/link'
import { exigirAccesoCartera } from '@/lib/session'
import LogoutButton from './logout-button'

export default async function UsuarioLayout({ children }: { children: React.ReactNode }) {
  // 🛡️ Sesión **Y ÁMBITO DE CORREDURÍA**, en ese orden y las dos cosas.
  //
  // Hasta el 20/09/2026 aquí solo se comprobaba `if (!session)`. Como
  // `public.cuentas` es la tabla COMPARTIDA de toda la casa de marcas, eso
  // quería decir que cualquier titular de cuenta del monorepo —el tenant demo
  // de almacén, una clienta de la propia correduría— abría `/cartera` y
  // `/cartera/[clienteId]` y veía las 32.600 fichas. Con `prisma_seguros` en
  // BYPASSRLS la base no protesta: responde 200. Ver `lib/session.ts`.
  const acceso = await exigirAccesoCartera()
  if (!acceso.ok && acceso.motivo === 'sin-sesion') redirect('/login')

  if (!acceso.ok) {
    // Fail-closed: NO se pinta la cartera. Y no se dice «no hay datos» —que
    // sería mentira sobre una cartera viva—: se dice lo que `explicarAmbito()`
    // ya sabe decir, que distingue «todavía no se sabe» de «tu cuenta no está
    // vinculada».
    return (
      <>
        <nav className="nav">
          <span className="brand">Grupo ASegura · trastienda</span>
          <span style={{ marginLeft: 'auto' }} />
          <LogoutButton />
        </nav>
        <div className="container">
          <h1>Sin acceso a la cartera</h1>
          <p>{acceso.cuerpo.error}</p>
          <p className="muted">
            Esta pantalla es la trastienda de la correduría. Si crees que deberías tener acceso, tu cuenta
            tiene que estar dada de alta como usuario de la correduría.
          </p>
        </div>
      </>
    )
  }

  const { session } = acceso

  return (
    <>
      <nav className="nav">
        {/* Esta app es la TRASTIENDA: la pantalla de trabajo es plataforma →
            Correduría. Aquí solo vive lo que no puede vivir allí (retarificar,
            que gasta 0,50€, y subir una póliza). No se añaden pantallas de
            consulta: se duplicarían las de plataforma. */}
        <span className="brand">Grupo ASegura · trastienda</span>
        <Link href="/dashboard">Resumen</Link>
        <Link href="/cartera">Cartera</Link>
        <span className="muted" style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.85)' }}>
          {session.nombre}
        </span>
        <LogoutButton />
      </nav>
      <div className="container">{children}</div>
    </>
  )
}
