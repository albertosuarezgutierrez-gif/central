// SOLICITUD DE DATOS DE LA RENOVACIÓN, lado PORTAL (05/11/2026, Alberto): «Estamos revisando la renovación de tu seguro de
// hogar; necesitamos unos datos». La campana (lectura directa, columna a columna, migración 2026-11-05d) y la página (por el
// PUENTE: el portal no tiene la clave de cifrado y asegura valida y guarda).
//
// 🛡️ Aislamiento por CÓDIGO (el rol no tiene RLS): la identidad sale SIEMPRE de la cookie (`requireIdentidad`/`getIdentidad`),
// nunca de la petición; el id de la solicitud de la URL no abre nada por sí mismo: asegura decide con la regla ÚNICA
// (`quienContestaDatosRenovacion`: tomador con nivel de operar, o autorizado Gestión/Total vigente de esa póliza) y cualquier
// otra persona recibe 404. La campana parte de `portalVinculo` de la sesión (tomador que opera) y de las autorizaciones que
// llegan a ESA identidad (`solicitudesDatosParaAutorizado`).
// 🚨 Sin la migración no puede haber ninguna: `[]` (leído, no hay). Cualquier otro fallo LANZA (la campana lo declara ilegible).
import { nivelPuedeOperar, type DatosRenovacionParaAviso } from '@central/module-seguros-portal'
import { ramoSolicitud, type CampoSolicitud, type RamoSolicitud } from '@central/module-seguros'

import { prisma } from './db'
import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config'
import { solicitudesDatosParaAutorizado } from './renovacion-autorizado'
import { getIdentidad, requireIdentidad } from './session'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** La fuente de la campana. Tomador que opera (vínculo propio, sin vistas de corredor) + autorizado con Gestión/Total. */
export async function datosRenovacionParaAvisoDeIdentidad(identidadId: string): Promise<DatosRenovacionParaAviso[]> {
  const sesion = await requireIdentidad()
  if (sesion.id !== identidadId || sesion.corredor) return []
  const vinculos = (await prisma.portalVinculo.findMany({
    where: { identidadId, origen: { not: 'corredor' } },
    select: { clienteId: true, correduriaId: true, nivel: true },
  })).filter((v) => nivelPuedeOperar(v.nivel))
  const out: DatosRenovacionParaAviso[] = []
  for (const v of vinculos) {
    try {
      const filas = await prisma.$queryRaw<{ id: string }[]>`
        select s.id::text as id from seguros.solicitud_datos s
        where s.correduria_id = ${v.correduriaId}::uuid and s.cliente_id = ${v.clienteId}::uuid
          and s.motivo = 'renovacion_poliza' and s.publicada_at is not null and s.estado = 'pendiente' and s.caduca_at > now()
        order by s.publicada_at desc limit 5`
      out.push(...filas)
    } catch (e) {
      if (/42703|does not exist|no existe/i.test(e instanceof Error ? e.message : String(e))) return []
      throw e
    }
  }
  const ya = new Set(out.map((x) => x.id))
  for (const s of await solicitudesDatosParaAutorizado(identidadId)) if (!ya.has(s.id)) out.push(s)
  return out
}

// ─── La página (por el puente) ───────────────────────────────────────────────

export type DatosRenovacionLeida =
  | { estado: 'ok'; ramo: RamoSolicitud; campos: CampoSolicitud[]; papel: 'tomador' | 'autorizado' }
  | { estado: 'completada' | 'muerta' | 'no_encontrada' | 'sin_sesion' | 'error' }

function puente(): { base: string; secret: string } | null {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return null
  return { base: base.replace(/\/+$/, ''), secret }
}

/** Lo que devuelve el puente → la página. Una forma rara es `error` (no «no encontrada»: no se sabe). PURA. */
export function interpretarDatosRenovacion(status: number, json: unknown): DatosRenovacionLeida {
  const o = json !== null && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null
  if (status === 404) return { estado: 'no_encontrada' }
  if (status !== 200 || !o) return { estado: 'error' }
  if (o.estado === 'completada' || o.estado === 'muerta') return { estado: o.estado }
  const ramo = ramoSolicitud(o.ramo)
  if (o.estado === 'ok' && ramo && Array.isArray(o.campos) && (o.papel === 'tomador' || o.papel === 'autorizado')) {
    const campos = o.campos.filter((c): c is CampoSolicitud => c !== null && typeof c === 'object' && typeof (c as CampoSolicitud).clave === 'string' && typeof (c as CampoSolicitud).etiqueta === 'string')
    if (campos.length > 0) return { estado: 'ok', ramo, campos, papel: o.papel }
  }
  return { estado: 'error' }
}

/** La solicitud para la identidad de la SESIÓN. El id de la URL solo dice QUÉ; quién eres lo dice la cookie. */
export async function leerDatosRenovacion(solicitudId: string): Promise<DatosRenovacionLeida> {
  const identidad = await getIdentidad()
  if (!identidad) return { estado: 'sin_sesion' }
  // La vista de corredor no contesta en nombre del cliente (y el middleware veta su POST): ni se le enseña el formulario.
  if (identidad.corredor) return { estado: 'no_encontrada' }
  if (!UUID.test(solicitudId)) return { estado: 'no_encontrada' }
  const p = puente()
  if (!p) return { estado: 'error' }
  try {
    const qs = new URLSearchParams({ identidadId: identidad.id, solicitudId }).toString()
    const res = await fetch(`${p.base}/api/portal/solicitud-renovacion?${qs}`, {
      headers: { authorization: `Bearer ${p.secret}` }, cache: 'no-store', signal: AbortSignal.timeout(PORTAL_PUENTE_TIEMPO_MS),
    })
    return interpretarDatosRenovacion(res.status, await res.json().catch(() => null))
  } catch (e) {
    console.error('[portal/datos-renovacion] el puente no respondió:', e instanceof Error ? e.message : e)
    return { estado: 'error' }
  }
}

/** Manda las respuestas en nombre de la identidad de la SESIÓN. `null` = no hay sesión o no hay puente. */
export async function enviarDatosRenovacion(solicitudId: string, respuestas: unknown): Promise<{ status: number; json: unknown } | null> {
  const identidad = await getIdentidad()
  if (!identidad || identidad.corredor || !UUID.test(solicitudId)) return null
  const p = puente()
  if (!p) return null
  try {
    const res = await fetch(`${p.base}/api/portal/solicitud-renovacion`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${p.secret}` },
      body: JSON.stringify({ identidadId: identidad.id, solicitudId, respuestas: respuestas !== null && typeof respuestas === 'object' && !Array.isArray(respuestas) ? respuestas : {} }),
      cache: 'no-store',
      // Asegura valida la calle contra el callejero (≤3,5 s) antes de contestar: más margen que una lectura.
      signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch (e) {
    console.error('[portal/datos-renovacion] el puente no respondió al enviar:', e instanceof Error ? e.message : e)
    return null
  }
}
