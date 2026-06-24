// FASE 2 (write-through blindado) — escritura de env vars en Vercel por su API.
//
// SOLO ESCRIBE, nunca lee valores (se mantiene el principio "mapa, no baúl").
// La feature está INERTE salvo que exista `VERCEL_ADMIN_TOKEN` (token de Vercel con
// scope de gestión de env). Sin él, `isVercelAdminConfigured()` es false y la ruta
// de edición devuelve 503 → no se puede tocar nada.

const TOKEN = () => process.env.VERCEL_ADMIN_TOKEN || ''
const TEAM = process.env.VERCEL_TEAM_ID || 'team_f4gPpt6dPuNcd5YyMt3q27uf'

/** Mapa nombre de proyecto → Project ID de Vercel (allow-list de destinos). */
export const VERCEL_PROJECT_IDS: Record<string, string> = {
  'plataforma':   'prj_yNvQa4Gwy9HqGA1dAIkHfdLcxIfQ',
  'ialimp':       'prj_iayrcepFTNQ0ff6L8bO5bADn4TV4',
  'sivra':        'prj_dWkYfE657GykDXQbB9GUDdCkpQAv',
  'ia-rest':      'prj_A0xZtqWcH6dtNEmlRiOwgj52GTRo',
  'rrhh':         'prj_mHVfr7u1WEADltt4xqEyGmNEqXGu',
}

export function isVercelAdminConfigured(): boolean {
  return TOKEN().length > 0
}

/**
 * Crea o actualiza una env var en un proyecto (target production + preview).
 * Devuelve { ok } o { ok:false, error }. NO devuelve ni lee valores existentes.
 */
export async function upsertProjectEnv(
  projectId: string,
  key: string,
  value: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = TOKEN()
  if (!token) return { ok: false, error: 'VERCEL_ADMIN_TOKEN no configurado' }
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const base = `https://api.vercel.com`

  // 1) Intentar crear.
  const create = await fetch(`${base}/v10/projects/${projectId}/env?teamId=${TEAM}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ key, value, type: 'encrypted', target: ['production', 'preview'] }),
  })
  const data = await create.json().catch(() => ({}))
  if (create.ok) return { ok: true }

  // 2) Si ya existe → actualizar por su ID (PATCH). NUNCA leemos el valor anterior.
  if (data?.error?.code === 'ENV_ALREADY_EXISTS' && data?.error?.envVarId) {
    const patch = await fetch(
      `${base}/v9/projects/${projectId}/env/${data.error.envVarId}?teamId=${TEAM}`,
      { method: 'PATCH', headers, body: JSON.stringify({ value, target: ['production', 'preview'] }) },
    )
    if (patch.ok) return { ok: true }
    const perr = await patch.json().catch(() => ({}))
    return { ok: false, error: perr?.error?.message || `PATCH ${patch.status}` }
  }
  return { ok: false, error: data?.error?.message || `POST ${create.status}` }
}

/**
 * Redespliega la PRODUCCIÓN de un proyecto reusando su último deployment de
 * producción pero con el ÚLTIMO commit de su rama (`withLatestCommit`). Sirve
 * para que una env recién escrita entre en runtime SIN tener que entrar a Vercel.
 * No bloquea la operación principal: el caller la trata como best-effort.
 */
export async function redeployProjectProduction(
  projectId: string,
  projectName: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = TOKEN()
  if (!token) return { ok: false, error: 'VERCEL_ADMIN_TOKEN no configurado' }
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const base = `https://api.vercel.com`

  // 1) Localizar el último deployment de producción del proyecto.
  const list = await fetch(
    `${base}/v6/deployments?projectId=${projectId}&target=production&limit=1&teamId=${TEAM}`,
    { headers },
  )
  const ld = await list.json().catch(() => ({}))
  const last = ld?.deployments?.[0]
  const deploymentId = last?.uid || last?.id
  if (!deploymentId) return { ok: false, error: 'sin deployment de producción previo que redeployar' }

  // 2) Redeploy con el commit más reciente de la rama (no el viejo sha).
  const res = await fetch(`${base}/v13/deployments?teamId=${TEAM}&forceNew=1`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: projectName,
      project: projectId,
      deploymentId,
      target: 'production',
      withLatestCommit: true,
    }),
  })
  if (res.ok) return { ok: true }
  const e = await res.json().catch(() => ({}))
  return { ok: false, error: e?.error?.message || `POST ${res.status}` }
}
