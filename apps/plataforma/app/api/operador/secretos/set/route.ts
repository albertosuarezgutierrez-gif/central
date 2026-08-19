// FASE 2 — escritura blindada de una env var desde el panel de secretos.
//
// Guardarraíles (defensa en profundidad):
//  1. Solo operador logueado (getAdmin).
//  2. 2º factor: re-teclear la contraseña de operador (loginAdmin / bcrypt).
//  3. Allow-list: solo claves del registro marcadas `editable` (api-externa, 1 proyecto).
//     NUNCA firma-sesion ni borrados (eso se hace en Vercel).
//  4. Write-only: nunca se devuelve ni lee el valor actual.
//  5. Auditoría: cada cambio deja rastro en `secrets_audit` (sin el valor).
//  6. Inerte sin `VERCEL_ADMIN_TOKEN` → 503.
//  7. Redeploy automático del proyecto destino tras escribir (best-effort): la env
//     entra en runtime sin que el operador tenga que entrar a Vercel.

import { NextRequest, NextResponse } from 'next/server'
import { getAdmin, loginAdmin } from '@/lib/superadmin'
import { SECRETS_REGISTRY } from '@/lib/secrets-registry'
import { isVercelAdminConfigured, upsertProjectEnv, redeployProjectProduction, VERCEL_PROJECT_IDS } from '@/lib/vercel-env'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
// La verificación del redeploy sondea el estado del deployment hasta ~15 s por proyecto.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const admin = await getAdmin().catch(() => null)
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!isVercelAdminConfigured()) {
    return NextResponse.json(
      { error: 'Edición no disponible: falta VERCEL_ADMIN_TOKEN en plataforma.' },
      { status: 503 },
    )
  }

  let body: { key?: string; value?: string; password?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const key = (body.key || '').trim()
  const value = body.value ?? ''
  const password = body.password ?? ''

  if (!key || !value) return NextResponse.json({ error: 'Falta clave o valor' }, { status: 400 })
  if (!password) return NextResponse.json({ error: 'Confirma con tu contraseña de operador' }, { status: 400 })

  // 2º factor: la contraseña de operador debe ser válida.
  const ok2fa = await loginAdmin(admin.email, password)
  if (!ok2fa) return NextResponse.json({ error: 'Contraseña de operador incorrecta' }, { status: 403 })

  // Allow-list: la clave debe existir en el registro y estar marcada editable.
  const entry = SECRETS_REGISTRY.find((s) => s.name === key)
  if (!entry || !entry.editable || !entry.vercelProject) {
    return NextResponse.json({ error: 'Esa clave no es editable desde el panel' }, { status: 400 })
  }
  // Doble candado: jamás escribir secretos de firma de sesión por aquí.
  if (entry.tipo === 'firma-sesion') {
    return NextResponse.json({ error: 'Los secretos de firma de sesión se editan en Vercel' }, { status: 400 })
  }

  // Lista de proyectos destino: el primario + los adicionales (ej: SERPER_API_KEY → sivra + plataforma).
  const allProjects = [entry.vercelProject, ...(entry.vercelProjects ?? [])]

  for (const projectName of allProjects) {
    const projectId = VERCEL_PROJECT_IDS[projectName]
    if (!projectId) return NextResponse.json({ error: `Proyecto Vercel desconocido: ${projectName}` }, { status: 400 })

    const res = await upsertProjectEnv(projectId, key, value)
    if (!res.ok) return NextResponse.json({ error: res.error || `Error escribiendo en Vercel (${projectName})` }, { status: 502 })

    // Auditoría (best-effort: si falta la tabla, no rompe la operación).
    try {
      await prisma.$executeRaw`
        INSERT INTO secrets_audit (actor_email, accion, env_key, vercel_project)
        VALUES (${admin.email}, 'upsert', ${key}, ${projectName})
      `
    } catch { /* tabla aún sin crear → ignora */ }
  }

  // Redeploy automático de todos los proyectos destino (best-effort).
  // `redeployed` solo es true si TODOS salieron: un fallo parcial (p. ej. un proyecto
  // cancelado por el Ignored Build Step y el otro construido) debe verse, no taparse.
  const redeployResults = await Promise.all(
    allProjects.map((p) => {
      const pid = VERCEL_PROJECT_IDS[p]
      return redeployProjectProduction(pid, p).catch(
        (e) => ({ ok: false, error: e?.message || 'error lanzando redeploy' }),
      )
    }),
  )
  const redeployed = redeployResults.every((r) => r.ok)
  const redeployError = redeployed
    ? undefined
    : redeployResults
        .map((r, i) => (r.ok ? null : `${allProjects[i]}: ${r.error || 'fallo'}`))
        .filter(Boolean)
        .join('; ')

  // Tercer estado: se lanzó, no se canceló, pero el sondeo se agotó con el build en
  // marcha. NO es «ha ido bien» — el panel lo pinta en ámbar y enlaza al deployment
  // para que el operador lo remate con la vista puesta (bug del 19/08/2026: se daba
  // por bueno el estado BUILDING, que es justo el anterior a la cancelación).
  const sinConfirmar = redeployed && redeployResults.some((r) => 'sinConfirmar' in r && r.sinConfirmar)
  const inspectorUrls = redeployResults
    .map((r, i) => ('inspectorUrl' in r && r.inspectorUrl ? `${allProjects[i]}|${r.inspectorUrl}` : null))
    .filter(Boolean) as string[]

  // Write-only: confirmamos el cambio, NO devolvemos el valor.
  return NextResponse.json({
    ok: true,
    projects: allProjects,
    redeployed,
    redeployError,
    sinConfirmar,
    inspectorUrls,
  })
}
