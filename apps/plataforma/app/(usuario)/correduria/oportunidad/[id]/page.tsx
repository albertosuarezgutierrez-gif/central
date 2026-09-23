import SeguimientoClient from './SeguimientoClient'

export const dynamic = 'force-dynamic'

/** Seguimiento de UNA oportunidad: estado, tareas e historial (maqueta aprobada el 23/09/2026). */
export default async function OportunidadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <SeguimientoClient id={id} />
}
