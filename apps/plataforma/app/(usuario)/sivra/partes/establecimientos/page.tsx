// Alta de establecimientos SES.HOSPEDAJES — una fila por piso.
//
// Pantalla interna y pequeña a propósito (cuatro pisos): sin onboarding ni autoservicio.
// Existe porque cada piso tiene sus PROPIAS credenciales del servicio web, así que no caben
// en variables de entorno sin convertir cada alta y cada rotación de contraseña en un
// despliegue.
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { listar } from '@/lib/ses/establecimientos'
import EstablecimientosClient from './EstablecimientosClient'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await getSession()
  if (!session) redirect('/login')

  // SSR: la lista llega pintada, sin spinner. Son cuatro filas.
  let establecimientos = await listar().catch(() => null)

  return (
    <div style={{ padding: '1rem', maxWidth: 980, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.4rem', margin: '0 0 .25rem' }}>🛂 Establecimientos SES.HOSPEDAJES</h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 1.25rem', fontSize: '.9rem' }}>
        Credenciales del <strong>servicio web</strong> de cada piso (distintas de las del acceso
        web con certificado digital). Se guardan cifradas; no se muestran nunca.
      </p>

      {establecimientos === null ? (
        // 🚨 Un fallo de lectura NO se pinta como «no hay establecimientos»: eso invitaría a
        // dar de alta otra vez pisos que ya están, y dos filas para el mismo piso son dos
        // emisores potenciales ante el Ministerio.
        <div style={{
          padding: '1rem', borderRadius: 8,
          background: 'var(--warning-bg)', color: 'var(--text)',
        }}>
          <strong>No se ha podido leer la lista.</strong> Esto no significa que no haya
          establecimientos dados de alta — significa que ahora mismo no se sabe. Si la tabla
          <code> ses_establecimientos </code> aún no está creada, aplica primero
          <code> prisma/sql/2026-08-20_ses_establecimientos.sql</code>.
        </div>
      ) : (
        <EstablecimientosClient inicial={establecimientos} />
      )}
    </div>
  )
}
