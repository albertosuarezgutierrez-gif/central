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

/**
 * `true` cuando el último intento registrado en `codeoscopic_projects`
 * (`estado` + `error_mensaje`) terminó SIN saber qué hizo el vendor: un 5xx
 * (`cerrarEnvio` guarda «`<status>: <cuerpo>`») o el corte de red que
 * `enviarEmision` describe con esa misma frase. Un 400/409/422 NO cuenta: ahí
 * el vendor rechazó y no hay nada emitido.
 */
export function intentoQuizaEmitido(estado: string | null | undefined, errorMensaje: string | null | undefined): boolean {
  if (estado !== 'error' || !errorMensaje) return false
  return /^5\d\d\b/.test(errorMensaje.trim()) || /no hay confirmación de qué hizo el vendor/i.test(errorMensaje)
}

export type RastroSolicitud = { ruta: string; valor: unknown }

const vacio = (v: unknown): boolean =>
  v === null ||
  v === undefined ||
  v === '' ||
  v === false ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0)

/**
 * Busca en el proyecto CRUDO del vendor (`GET /insurances/{id}`) cualquier
 * clave que hable de una solicitud de emisión (`policyApplication`,
 * `policyApplications`, `policyApplicationStatus`…) con contenido. Sin fixture
 * del fabricante para el proyecto DESPUÉS de un Submit, esta es la señal más
 * conservadora posible: si hay algo, no se manda otro Submit y se enseña.
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
      if (/policy.?applications?/i.test(k) && !/supported|enabled|allowed|available|fields/i.test(k) && !vacio(val)) {
        out.push({ ruta: aqui, valor: val })
        continue
      }
      anda(val, aqui, prof + 1)
    }
  }
  anda(crudo, '', 0)
  return out
}
