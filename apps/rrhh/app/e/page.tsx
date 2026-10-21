import { redirect } from 'next/navigation'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import { AuthError } from '@/lib/tenant'
import { ACTOR_TITULAR, CARPETAS } from '@/lib/carpetas'
import { carpetasVisibles } from '@central/module-documental'
import { listarExpediente } from '@/lib/documental'
import { getBranding } from '@/lib/empresa'
import { listarAvisosEmpleado } from '@/lib/avisos'
import ExpedienteEmpleado from './ExpedienteEmpleado'

export default async function Page() {
  let s
  try { s = await getSesionEmpleado() } catch (e) { if (e instanceof AuthError) redirect('/e/entrar'); throw e }
  const [documentos, branding, avisos] = await Promise.all([
    listarExpediente(s.empresa_id, s.empleado_id, ACTOR_TITULAR),
    getBranding(s.empresa_id),
    // Los avisos no tumban el portal: si fallan (p. ej. migración 0023 sin aplicar), no se muestran.
    listarAvisosEmpleado(s.empresa_id, s.empleado_id).catch(e => { console.error('avisos /e', e?.message); return null }),
  ])
  // Carpetas donde el empleado puede subir (datos personales, partes médicos).
  const subibles = CARPETAS.filter(c => c.titularPuedeSubir).map(c => ({ id: c.id, etiqueta: c.etiqueta }))
  const visibles = carpetasVisibles(CARPETAS, ACTOR_TITULAR).map(c => ({ id: c.id, etiqueta: c.etiqueta }))
  return <ExpedienteEmpleado visibles={visibles} subibles={subibles} inicial={JSON.parse(JSON.stringify(documentos))} branding={branding} tieneFichaje={branding.tiene_fichaje} avisosIniciales={avisos ? JSON.parse(JSON.stringify(avisos)) : null} />
}
