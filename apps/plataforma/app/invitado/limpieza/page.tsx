// Intranet de limpieza (Sique Brilla): calendario de reservas de los 4 pisos de Alberto + resumen
// diario con limpiezas, tareas y notas. Fuera del grupo (usuario) → sin sidebar ni guard de
// sesión. Acceso por token (tabla limpieza_acceso_token) vía cookie httpOnly, o sesión de
// Alberto (preview). Mismo patrón que /invitado/empresas y /invitado/trading.
import { redirect } from 'next/navigation'
import { accesoLimpieza } from '@/lib/limpieza-acceso'
import IntranetLimpieza from './IntranetLimpieza'

export const dynamic = 'force-dynamic'

export default async function InvitadoLimpiezaPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const sp = await searchParams
  // Si llega ?token=, lo canjeamos por la cookie en la entrada y volvemos con la URL limpia.
  if (sp.token) redirect(`/api/sivra/limpieza-intranet/invitado?token=${encodeURIComponent(sp.token)}`)

  const modo = await accesoLimpieza()
  if (modo !== 'invitado' && modo !== 'sesion') {
    return (
      <div style={{ maxWidth: 480, margin: '15vh auto', padding: 24, textAlign: 'center', color: 'var(--text)' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
        <h1 style={{ fontSize: 20 }}>Acceso no válido</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>Este enlace no es correcto o ha caducado. Pide a Alberto el enlace actualizado.</p>
      </div>
    )
  }

  return <IntranetLimpieza />
}
