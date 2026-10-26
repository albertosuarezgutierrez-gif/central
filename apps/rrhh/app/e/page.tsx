import { redirect } from 'next/navigation'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import { AuthError } from '@/lib/tenant'
import { ACTOR_TITULAR, CARPETAS } from '@/lib/carpetas'
import { carpetasVisibles } from '@central/module-documental'
import { listarExpediente } from '@/lib/documental'
import { getBranding } from '@/lib/empresa'
import { listarAvisosEmpleado } from '@/lib/avisos'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { urlPortalAsegura } from '@/lib/marca-asegura'
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
  // Cabecera común: «Seguros» lleva al portal de clientes con SOLO el correo del empleado (y origen). Nada más de RR.HH.
  // Correo: la sesión del empleado (`SesionEmpleado`: empleado_id, empresa_id, v) NO guarda el correo con el que verificó
  // el código, así que va el de la ficha (en la entrada por código casa con él: `candidatosPorEmail` busca por ese correo).
  // El portal vuelve a verificarlo con su propio código: el enlace solo lo rellena.
  const r = await prisma.$queryRaw<{ email: string | null }[]>(Prisma.sql`
    SELECT email FROM rrhh.empleados WHERE id = ${s.empleado_id}::uuid AND empresa_id = ${s.empresa_id}::uuid LIMIT 1`).catch(() => [])
  const urlSeguros = urlPortalAsegura(r[0]?.email, process.env.ASEGURA_PORTAL_URL)
  // Carpetas donde el empleado puede subir (datos personales, partes médicos).
  const subibles = CARPETAS.filter(c => c.titularPuedeSubir).map(c => ({ id: c.id, etiqueta: c.etiqueta }))
  const visibles = carpetasVisibles(CARPETAS, ACTOR_TITULAR).map(c => ({ id: c.id, etiqueta: c.etiqueta }))
  return <ExpedienteEmpleado visibles={visibles} subibles={subibles} inicial={JSON.parse(JSON.stringify(documentos))} branding={branding} tieneFichaje={branding.tiene_fichaje} urlSeguros={urlSeguros} avisosIniciales={avisos ? JSON.parse(JSON.stringify(avisos)) : null} />
}
