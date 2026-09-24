/**
 * Envoltorio de TODA la sección de la correduría.
 *
 * Dos trabajos, y el segundo es el que importa:
 *
 * 1. Colgar la clase `.correduria`, que redefine los tokens de color con el
 *    acento cobalto de Grupo ASegura (ver el bloque en `app/globals.css`). Los
 *    componentes de dentro siguen usando `var(--primary)` sin enterarse.
 * 2. **Cerrar la puerta.** Hasta hoy bastaba con tener sesión: el layout de
 *    `(usuario)` solo acota el rol `'empresas'`, y las tres cuentas de la casa
 *    tienen `rol = null`. Cualquiera que se registrara veía la cartera entera.
 *    Quién es de la correduría lo decide `resolverAccesoCorreduria`, que es la
 *    MISMA función que guarda las ~45 rutas de `/api/correduria/**`.
 *
 * Los dos desenlaces de una denegación NO se tratan igual, porque no son lo
 * mismo: `no-autorizado` es una ausencia comprobada (fuera de aquí, a su
 * pantalla) y `sin-comprobar` es «no se ha podido mirar», que se DECLARA en
 * pantalla con lo que hay que configurar. Redirigir en ese caso dejaría a
 * Alberto fuera de su propia correduría sin una sola pista de por qué.
 */
import { Nunito_Sans, Quicksand } from 'next/font/google'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { ENV_LISTA_CORREDURIA, resolverAccesoCorreduria } from '@/lib/correduria-acceso'

// Tipografía de Grupo ASegura (24/09/2026, regla de Alberto para TODA superficie de la
// correduría): titulares, menús y botones en Quicksand; cuerpo en Nunito Sans. La misma que
// la web y el portal. Por next/font, como la Inter del resto de plataforma: self-hosted y solo
// en esta sección, que es la única que lleva la marca de la correduría.
const titulares = Quicksand({ subsets: ['latin'], weight: ['500', '600', '700'], display: 'swap', variable: '--font-correduria-display' })
const cuerpo = Nunito_Sans({ subsets: ['latin'], weight: ['400', '600', '700', '800'], display: 'swap', variable: '--font-correduria-sans' })
const FUENTES = `correduria-tipografia ${titulares.variable} ${cuerpo.variable}`

export default async function CorreduriaLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const acceso = await resolverAccesoCorreduria(session)

  if (acceso.estado === 'no-autorizado') redirect('/banca')

  if (acceso.estado === 'sin-comprobar') {
    return (
      <div className="correduria"><div className={FUENTES}>
        <div
          style={{
            maxWidth: 720,
            margin: '48px auto',
            padding: 24,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--surface)',
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
            No se ha podido comprobar el acceso a la correduría
          </h1>
          <p style={{ color: 'var(--muted)', marginBottom: 12 }}>
            No es que no seas de la casa: es que esta app no ha podido averiguarlo, así que no
            abre la cartera. Detalle: {acceso.detalle}.
          </p>
          <p style={{ color: 'var(--muted)' }}>
            Se arregla poniendo <code>{ENV_LISTA_CORREDURIA}</code> en el proyecto Vercel{' '}
            <code>plataforma</code> (los correos con acceso, separados por comas) y
            redesplegando; o concediendo al rol de esta app permiso de lectura sobre{' '}
            <code>seguros.usuarios</code>, que es la fuente buena.
          </p>
        </div>
      </div></div>
    )
  }

  return <div className="correduria"><div className={FUENTES}>{children}</div></div>
}
