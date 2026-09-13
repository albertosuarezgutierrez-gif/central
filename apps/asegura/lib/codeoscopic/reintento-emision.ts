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
