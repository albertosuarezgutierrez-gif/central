// Qué hacer con un proyecto cuyo ÚLTIMO Submit acabó sin respuesta clara.
//
// 13/09/2026, proyecto 40685793 (Pilar Franco Ruz, Allianz): la persona iba
// completa, el Submit llegó al vendor y Codeoscopic contestó
// `500 «Unknown error while waiting for the operation to complete»` a los 8 s.
// Eso NO dice que la compañía no emitiera: dice que Codeoscopic dejó de
// esperar. Un segundo `POST .../policy-applications` a ciegas puede ser la
// segunda póliza del mismo coche (el vendor no deduplica — §6 del traspaso
// de Manuel, «fail-closed ante quizá-emitido, nunca retry ciego»).
//
// Módulo PURO (sin Prisma, sin red): importable desde `node --test`.

/** Un 5xx tal cual lo guarda `cerrarEnvio`: «`<status>: <cuerpo>`». */
export const RE_QUIZA_EMITIDO_5XX = /^5\d\d(?!\d)/
/** La frase con la que `enviarEmision` describe un corte de red sin respuesta. */
export const FRASE_SIN_CONFIRMACION = 'no hay confirmación de qué hizo el vendor'

/**
 * `true` cuando el último intento registrado en `codeoscopic_projects.error_mensaje`
 * terminó SIN saber qué hizo el vendor: un 5xx o el corte de red que
 * `enviarEmision` describe con `FRASE_SIN_CONFIRMACION`. Un 400/409/422 NO
 * cuenta: ahí el vendor rechazó y no hay nada emitido.
 *
 * Se decide SOLO por `error_mensaje`, no por `estado`: el ReRate (`/oferta`)
 * pone `estado='preemision'` en cada confirmación de precio y ese es justo el
 * camino que la pantalla ofrece tras un fallo — con `estado` en la condición
 * la guarda se saltaba sola. `error_mensaje` solo lo escribe `cerrarEnvio`
 * (NULL cuando un Submit cuaja).
 *
 * La MISMA regla vive en SQL dentro de `bloquearEnvio` (`emitir-envio.ts`)
 * para cerrar la carrera de dos peticiones casi simultáneas; hay cepo que
 * exige que las dos formas coincidan.
 */
export function intentoQuizaEmitido(errorMensaje: string | null | undefined): boolean {
  if (!errorMensaje) return false
  const t = errorMensaje.trim()
  return RE_QUIZA_EMITIDO_5XX.test(t) || t.toLowerCase().includes(FRASE_SIN_CONFIRMACION)
}

export type RastroSolicitud = { ruta: string; valor: unknown }

const vacio = (v: unknown): boolean =>
  v === null ||
  v === undefined ||
  v === '' ||
  v === false ||
  v === 0 ||
  (typeof v === 'string' && /^(none|null|n\/a|-)$/i.test(v.trim())) ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0)

/** Claves que HABLAN de solicitudes sin SER una: capacidades, contadores,
 *  plazos, el catálogo de campos. Sin fixture del proyecto post-Submit, la
 *  lista es la defensa contra un 409 que dejaría el proyecto sin salida. */
const RE_CLAVE_NO_SOLICITUD = /supported|enabled|allowed|available|fields|count|required|deadline|date|url|link/i

/**
 * Busca en el proyecto CRUDO del vendor (`GET /insurances/{id}`) cualquier
 * clave que hable de una solicitud de emisión (`policyApplication`,
 * `policyApplications`, `policyApplicationStatus`…) con contenido. Sin fixture
 * del fabricante para el proyecto DESPUÉS de un Submit, esta es la señal más
 * conservadora posible: si hay algo, no se manda otro Submit sin que el
 * corredor lo vea y lo confirme (`reintentoConfirmado`).
 * Devuelve `[]` si no hay rastro — que NO es «no se emitió»: es «el proyecto
 * no lo cuenta», y así lo debe decir la pantalla.
 */
export function rastroSolicitudEmision(crudo: unknown, profundidadMax = 4): RastroSolicitud[] {
  const out: RastroSolicitud[] = []
  const anda = (v: unknown, ruta: string, prof: number) => {
    if (prof > profundidadMax || v === null || typeof v !== 'object') return
    if (Array.isArray(v)) {
      v.forEach((x, i) => anda(x, `${ruta}[${i}]`, prof + 1))
      return
    }
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const aqui = ruta ? `${ruta}.${k}` : k
      // `policyApplicationSupported` (un precio) es una CAPACIDAD, no una solicitud.
      if (/policy.?applications?/i.test(k) && !RE_CLAVE_NO_SOLICITUD.test(k) && !vacio(val)) {
        out.push({ ruta: aqui, valor: val })
        continue
      }
      anda(val, aqui, prof + 1)
    }
  }
  anda(crudo, '', 0)
  return out
}

// ── Lo que el portal SÍ documenta (leído el 13/09/2026, tras el 500 del 40685793) ──
//
// `GET /insurances/{id}` trae `policyApplications[]` («The insurance policy
// applications that have been submitted»), cada una `PolicyApplication_V1`:
// `id`, `creationDateTime`, `status: {id, name, description}`, `policyNumber`
// («The policy number assigned by the issuer»), `quote`, `payment`… Y existe
// `GET /insurances/{id}/policy-applications/{policyApplicationId}`. No hay
// webhooks ni idempotencia: ESTA lectura es la única reconciliación posible.
// El único `status.id` con ejemplo en el portal es `Approved`; el resto se
// infiere de la prosa («approved or rejected… held pending for eligibility
// review or in need for manual intervention»), así que lo que no se reconoce
// se enseña tal cual, nunca se colapsa a «aprobada» ni a «rechazada».

export type VeredictoSolicitud = 'aprobada' | 'rechazada' | 'pendiente' | 'desconocido'

export type SolicitudEmision = {
  id: string | null
  creadaEn: string | null
  estadoId: string | null
  estadoNombre: string | null
  numeroPoliza: string | null
  veredicto: VeredictoSolicitud
}

const texto = (v: unknown): string | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/** `status.id` del vendor → qué significa para nosotros. `Approved` es el único
 *  valor documentado con ejemplo; los demás patrones vienen de la prosa. */
export function veredictoSolicitud(estadoId: string | null | undefined): VeredictoSolicitud {
  if (!estadoId) return 'desconocido'
  const s = estadoId.trim().toLowerCase()
  if (/^(approved|accepted|issued|emitida?)$/.test(s)) return 'aprobada'
  if (/^(rejected|denied|refused|cancel+ed|rechazada?)$/.test(s)) return 'rechazada'
  if (/pending|review|held|hold|manual|revised|waiting|process/.test(s)) return 'pendiente'
  return 'desconocido'
}

function leerSolicitud(v: unknown): SolicitudEmision | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const status = typeof o.status === 'object' && o.status !== null ? (o.status as Record<string, unknown>) : null
  const estadoId = texto(status?.id) ?? texto(o.status)
  const s: SolicitudEmision = {
    id: texto(o.id),
    creadaEn: texto(o.creationDateTime),
    estadoId,
    estadoNombre: texto(status?.name),
    numeroPoliza: texto(o.policyNumber),
    veredicto: veredictoSolicitud(estadoId),
  }
  // Un `id` o una fecha solos no bastan (el propio proyecto los tiene): hace
  // falta una señal PROPIA de PolicyApplication_V1 — el estado o el nº de póliza.
  if (!s.estadoId && !s.numeroPoliza) return null
  return s
}

/**
 * Las solicitudes de emisión que cuenta el vendor, con la forma que documenta
 * el portal. Acepta el proyecto entero (`GET /insurances/{id}` →
 * `policyApplications[]`), la respuesta del Submit (array de solicitudes, o un
 * objeto con `policyApplications`) o una solicitud suelta.
 * `[]` = «el vendor no cuenta ninguna», que NO es «la compañía no emitió» si
 * además el último intento acabó sin respuesta: ahí manda Avant2.
 */
export function solicitudesEmision(crudo: unknown): SolicitudEmision[] {
  if (Array.isArray(crudo)) return crudo.map(leerSolicitud).filter((s): s is SolicitudEmision => s !== null)
  if (typeof crudo !== 'object' || crudo === null) return []
  const o = crudo as Record<string, unknown>
  if (Array.isArray(o.policyApplications)) return solicitudesEmision(o.policyApplications)
  // Un PROYECTO (tiene `effectiveDate`/`mainQuotes`/`offers`) sin `policyApplications`
  // no cuenta ninguna solicitud: nunca se lee el objeto raíz como si lo fuera.
  if ('effectiveDate' in o || 'mainQuotes' in o || 'offers' in o || 'insuranceLine' in o) return []
  const suelta = leerSolicitud(o)
  return suelta ? [suelta] : []
}

/** Una solicitud APROBADA o PENDIENTE sigue viva en la compañía: reenviar
 *  sería la segunda póliza (o la segunda solicitud) del mismo riesgo. */
export function solicitudViva(solicitudes: readonly SolicitudEmision[]): SolicitudEmision | null {
  return solicitudes.find((s) => s.veredicto === 'aprobada') ?? solicitudes.find((s) => s.veredicto === 'pendiente') ?? null
}

/** El buzón que enlaza la fila del 500 en la tabla de errores del portal
 *  («report the issue, including the full response, to the API support team»).
 *  La cabecera del spec dice `soporteapi@codeoscopic.com`; el portal no aclara cuál. */
export const SOPORTE_API_CODEOSCOPIC = 'soporteapi@avant2.es'

export type ConsejoTrasFallo = { tipo: 'reportar' | 'reintentar_en_minutos'; texto: string }

/** El `requestId` que Codeoscopic pone en el cuerpo de cada error, para el parte a soporte. */
export function requestIdDe(errorMensaje: string | null | undefined): string | null {
  const m = errorMensaje?.match(/"requestId"\s*:\s*"([^"]+)"/)
  return m ? m[1] : null
}

/**
 * Qué manda hacer el PORTAL con cada 5xx (`#overview--errors`, literal):
 * 500 → «report the issue, including the full response, to the API support
 * team»; 502/503/504 → «try again the operation in a few minutes». No es lo
 * mismo, y hasta hoy la pantalla los trataba igual. `null` si no es un 5xx.
 */
export function consejoTrasFallo(errorMensaje: string | null | undefined): ConsejoTrasFallo | null {
  if (!errorMensaje) return null
  const m = errorMensaje.trim().match(RE_QUIZA_EMITIDO_5XX)
  if (!m) return null
  const status = Number(m[0])
  if (status === 502 || status === 503 || status === 504) {
    const que = status === 502 ? 'un error de comunicación con la compañía' : status === 504 ? 'un timeout con la compañía' : 'que la API está temporalmente fuera de servicio'
    return {
      tipo: 'reintentar_en_minutos',
      texto: `El portal de Codeoscopic documenta el ${status} como ${que} y pide «try again the operation in a few minutes» — pero SIN garantía de que no duplique: antes de reintentar, mira si el proyecto ya cuenta una solicitud.`,
    }
  }
  const rid = requestIdDe(errorMensaje)
  const conRid = rid ? ` (requestId ${rid})` : ''
  if (status === 500) {
    return {
      tipo: 'reportar',
      texto:
        `El portal de Codeoscopic documenta el 500 como «an unhandled exception» y NO pide reintentar: pide reportarlo a ${SOPORTE_API_CODEOSCOPIC} con la respuesta completa${conRid}. ` +
        'Solo 502/503/504 llevan «try again in a few minutes».',
    }
  }
  // Un 5xx que el portal no documenta (501, 505…): no se le atribuye ninguna cita.
  return {
    tipo: 'reportar',
    texto: `El portal de Codeoscopic no documenta el ${status}; repórtalo a ${SOPORTE_API_CODEOSCOPIC} con la respuesta completa${conRid} antes de reintentar.`,
  }
}
