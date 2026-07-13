import { redirect } from 'next/navigation'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import { AuthError } from '@/lib/tenant'
import { ACTOR_TITULAR, CARPETAS } from '@/lib/carpetas'
import { carpetasVisibles } from '@central/module-documental'
import { listarExpediente } from '@/lib/documental'
import { getBranding } from '@/lib/empresa'
import ExpedienteEmpleado from './ExpedienteEmpleado'

export default async function Page() {
  let s
  try { s = await getSesionEmpleado() } catch (e) { if (e instanceof AuthError) redirect('/'); throw e }
  const [documentos, branding] = await Promise.all([
    listarExpediente(s.empresa_id, s.empleado_id, ACTOR_TITULAR),
    getBranding(s.empresa_id),
  ])
  // Carpetas donde el empleado puede subir (datos personales, partes médicos).
  const subibles = CARPETAS.filter(c => c.titularPuedeSubir).map(c => ({ id: c.id, etiqueta: c.etiqueta }))
  const visibles = carpetasVisibles(CARPETAS, ACTOR_TITULAR).map(c => ({ id: c.id, etiqueta: c.etiqueta }))
  return <ExpedienteEmpleado visibles={visibles} subibles={subibles} inicial={JSON.parse(JSON.stringify(documentos))} branding={branding} tieneFichaje={branding.tiene_fichaje} />
}
