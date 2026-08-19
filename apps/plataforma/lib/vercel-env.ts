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
): Promise<ResultadoRedeploy> {
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
  //    La API de Vercel a veces NO devuelve `error.envVarId` en el conflicto (solo el
  //    mensaje "already exists … on branch undefined"), así que NO dependemos de él:
  //    listamos las env del proyecto (ids/targets, el valor cifrado nunca se descifra —
  //    no pasamos `decrypt=true`) y localizamos la(s) que coincide(n) por nombre.
  const fastId = data?.error?.envVarId as string | undefined
  let ids: string[] = fastId ? [fastId] : []
  if (!ids.length) {
    const list = await fetch(`${base}/v9/projects/${projectId}/env?teamId=${TEAM}`, { headers })
    const ld = await list.json().catch(() => ({}))
    const envs: Array<{ id?: string; key?: string }> = ld?.envs || ld?.env || []
    ids = envs.filter((e) => e?.key === key && e?.id).map((e) => e.id as string)
    if (!ids.length) return { ok: false, error: data?.error?.message || `POST ${create.status}` }
  }

  // PATCH de solo el VALOR (preservamos target/rama existentes → evita el conflicto
  // "on branch undefined"). Si hay varias entradas con el mismo nombre, todas se rotan.
  for (const id of ids) {
    const patch = await fetch(`${base}/v9/projects/${projectId}/env/${id}?teamId=${TEAM}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ value }),
    })
    if (!patch.ok) {
      const perr = await patch.json().catch(() => ({}))
      return { ok: false, error: perr?.error?.message || `PATCH ${patch.status}` }
    }
  }
  return { ok: true }
}

/**
 * Redespliega la PRODUCCIÓN de un proyecto reusando su último deployment de
 * producción pero con el ÚLTIMO commit de su rama (`withLatestCommit`). Sirve
 * para que una env recién escrita entre en runtime SIN tener que entrar a Vercel.
 * No bloquea la operación principal: el caller la trata como best-effort.
 */
/**
 * Estado de un deployment de Vercel, reducido a lo que decide el veredicto.
 * PURO y testeable. `desconocido` se trata como «aún no sé», nunca como éxito.
 */
export type EstadoRedeploy = 'listo' | 'construyendo' | 'cancelado' | 'error' | 'desconocido'

export function clasificarEstadoRedeploy(estado: unknown): EstadoRedeploy {
  switch (estado) {
    case 'READY':        return 'listo'
    case 'CANCELED':     return 'cancelado'
    case 'ERROR':        return 'error'
    case 'QUEUED':
    case 'INITIALIZING':
    case 'BUILDING':     return 'construyendo'
    default:             return 'desconocido'
  }
}

/** `sinConfirmar` = se lanzó y no se canceló, pero no dio tiempo a verlo terminar. */
export type ResultadoRedeploy = { ok: boolean; sinConfirmar?: boolean; error?: string; inspectorUrl?: string }

export async function redeployProjectProduction(
  projectId: string,
  projectName: string,
): Promise<ResultadoRedeploy> {
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

  // 2) Redeploy del MISMO deployment, sin `withLatestCommit`.
  //
  //    🚨 Antes iba con `withLatestCommit: true` y por eso moría (19/08/2026): eso
  //    redespliega el ÚLTIMO commit de main, que casi siempre es el de la auditoría con
  //    `[skip ci]` en el asunto — y `vercel-ignore-build.mjs` salta esos SIEMPRE, por
  //    asunto y sin mirar rutas. O sea, el redeploy pedía justo el commit que el filtro
  //    tiene orden de cancelar.
  //
  //    Sin ese flag se redespliega el commit del último deployment de producción que SÍ
  //    construyó, que por construcción ya pasó el filtro de ESTE proyecto → vuelve a
  //    pasarlo. Y de paso es lo correcto: guardar un secreto no debe publicar además
  //    código nuevo que nadie ha pedido desplegar.
  //
  //    `commandForIgnoringBuildStep: ''` se mantiene como segundo cinturón, pero ya no
  //    se depende de que Vercel lo respete en un redeploy.
  const cuerpo: Record<string, unknown> = {
    name: projectName,
    project: projectId,
    deploymentId,
    target: 'production',
  }
  let res = await fetch(`${base}/v13/deployments?teamId=${TEAM}&forceNew=1`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...cuerpo, projectSettings: { commandForIgnoringBuildStep: '' } }),
  })
  if (!res.ok) {
    // Si la API rechaza el override en un redeploy, reintentar sin él (mejor un
    // redeploy que puede cancelarse que ninguno) — la sonda de abajo lo detecta.
    res = await fetch(`${base}/v13/deployments?teamId=${TEAM}&forceNew=1`, {
      method: 'POST',
      headers,
      body: JSON.stringify(cuerpo),
    })
  }
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    return { ok: false, error: e?.error?.message || `POST ${res.status}` }
  }

  // 3) Verificar que el deployment creado no se cancela: "redeploy lanzado" no es
  //    "redeploy hecho".
  //
  //    🚨 El bug que esto arregla (19/08/2026): el bucle salía con `break` al ver
  //    BUILDING y devolvía ok:true. Pero el Ignored Build Step corre DENTRO del build,
  //    así que BUILDING es justo el estado ANTERIOR a la cancelación — se declaraba
  //    éxito en la antesala del fallo. El panel cantaba «✅ redeploy lanzado» mientras
  //    el deployment moría en CANCELED y la env se quedaba fuera de runtime.
  //
  //    Ahora BUILDING/QUEUED no terminan el sondeo: solo lo terminan READY (confirmado),
  //    CANCELED/ERROR (fallo) o agotar el presupuesto → `sinConfirmar`, que NO es verde.
  //    Tres estados, porque «aún construyendo» no es «ha ido bien».
  const creado = await res.json().catch(() => ({}))
  const nuevoId: string | undefined = creado?.id || creado?.uid
  const inspectorUrl: string | undefined = creado?.inspectorUrl
  if (!nuevoId) return { ok: true, sinConfirmar: true, inspectorUrl }

  const limite = Date.now() + 20_000
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 3_000))
    const st = await fetch(`${base}/v13/deployments/${nuevoId}?teamId=${TEAM}`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
    switch (clasificarEstadoRedeploy(st?.readyState ?? st?.status)) {
      case 'cancelado':
        return {
          ok: false,
          inspectorUrl,
          error: `el redeploy de ${projectName} se canceló (Ignored Build Step) — la env está guardada pero NO en runtime`,
        }
      case 'error':
        return { ok: false, inspectorUrl, error: `el build del redeploy de ${projectName} falló — la env no está en runtime` }
      case 'listo':
        return { ok: true, inspectorUrl }
      default:
        break // construyendo / desconocido → seguir mirando
    }
  }
  // Se agotó el presupuesto con el build todavía en marcha. No es un fallo, pero
  // tampoco una confirmación: se declara como tal para que el panel no lo pinte verde.
  return { ok: true, sinConfirmar: true, inspectorUrl }
}
