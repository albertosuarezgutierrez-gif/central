// `issuedDocuments[]` (`InsuranceFile_V1`) de una solicitud de emisión — lo que
// el vendor deja descargar tras un `Approved`. Confirmado el 23/09/2026 leyendo
// el OpenAPI vivo de INT (docs/CODEOSCOPIC-API-PORTAL.md § 12): la forma es
// `{ name, description?, url, creationDateTime, expirationDateTime }`, con
// `name`/`url`/`creationDateTime`/`expirationDateTime` obligatorios. Se descarga
// con `GET {url}` + el MISMO Bearer OAuth2 (portal, literal: «Execute a GET
// request to this URL with the Authorization header to download the file»).
//
// Módulo PURO (sin Prisma, sin red): solo interpreta lo que ya trajo
// `GET /insurances/{id}/policy-applications/{policyApplicationId}`.

import type { VeredictoSolicitud } from './reintento-emision.ts'

export type DocumentoEmitido = {
  nombre: string
  url: string
  creadaEn: string | null
  caducaEn: string | null
}

const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null

/**
 * Lee `issuedDocuments[]` de la respuesta cruda del vendor. Acepta las TRES
 * formas que de verdad llegan (mismo espíritu que `solicitudesEmision()` de
 * `reintento-emision.ts`, que ya resuelve esta misma ambigüedad para el
 * `status`/`policyNumber`):
 *  - una `PolicyApplication_V1` suelta (el Retrieve individual, `documentos/route.ts`);
 *  - el proyecto entero con `policyApplications[]` (`GET /insurances/{id}`,
 *    `crudoPrevio` de `emitir/route.ts`);
 *  - el array crudo del Submit (`envio.crudo`), donde solo ALGUNA solicitud
 *    trae `issuedDocuments` (ver `SUBMIT_RESPONSE_ARRAY` del test).
 * Un elemento sin `name` o sin `url` no se puede descargar ni archivar con
 * sentido: se descarta en vez de inventar un nombre o intentar un `GET` a
 * `undefined`.
 *
 * `[]` = «no hay ninguno documentado en esta respuesta» — no es «el vendor no
 * emitió nada»: puede que la solicitud siga pendiente, o que el proyecto no
 * traiga esta clave. Quien llama decide qué decir sobre esa ausencia.
 */
export function documentosEmitidos(crudo: unknown): DocumentoEmitido[] {
  const lista = extraerArray(crudo)
  const out: DocumentoEmitido[] = []
  for (const item of lista) {
    if (typeof item !== 'object' || item === null) continue
    const o = item as Record<string, unknown>
    const nombre = texto(o.name)
    const url = texto(o.url)
    if (!nombre || !url) continue
    out.push({ nombre, url, creadaEn: texto(o.creationDateTime), caducaEn: texto(o.expirationDateTime) })
  }
  return out
}

function extraerArray(crudo: unknown): unknown[] {
  // El array del Submit: cada elemento es SU PROPIA solicitud — se agregan los
  // `issuedDocuments` de todas (lo normal es que solo una los traiga).
  if (Array.isArray(crudo)) return crudo.flatMap((item) => extraerDeUnaSolicitud(item))
  if (typeof crudo !== 'object' || crudo === null) return []
  const o = crudo as Record<string, unknown>
  // El proyecto entero (`GET /insurances/{id}`): las solicitudes van dentro.
  if (Array.isArray(o.policyApplications)) return extraerArray(o.policyApplications)
  return extraerDeUnaSolicitud(o)
}

function extraerDeUnaSolicitud(v: unknown): unknown[] {
  if (typeof v !== 'object' || v === null) return []
  const o = v as Record<string, unknown>
  return Array.isArray(o.issuedDocuments) ? o.issuedDocuments : []
}

/**
 * ¿Sigue vigente para descargar HOY? Los ejemplos reales del portal muestran
 * ~365 días para la «Póliza» y 24 h para informes de oferta — la duración NO
 * es una regla documentada, así que nunca se afirma «va a caducar en N días»:
 * solo si YA caducó, comparando contra el reloj.
 */
export function documentoCaducado(d: DocumentoEmitido, ahora: Date = new Date()): boolean {
  if (!d.caducaEn) return false
  const t = Date.parse(d.caducaEn)
  return Number.isFinite(t) && t < ahora.getTime()
}

/** El de nombre "Póliza" primero — es el único que Avant2 muestra descargando
 *  en la pantalla de la solicitud emitida; el resto (informes, etc.) se listan
 *  igual pero no se asumen como "la póliza". */
export function documentoPoliza(docs: readonly DocumentoEmitido[]): DocumentoEmitido | null {
  return docs.find((d) => /p[óo]liza/i.test(d.nombre)) ?? docs[0] ?? null
}

/**
 * ¿Merece la pena volver a pedir esta solicitud? Solo si la compañía YA
 * aprobó y esta lectura no trae ningún documento todavía — si está
 * `pendiente`/`rechazada`/`desconocida`, esperar no va a traer un PDF que la
 * compañía no ha generado (y puede que nunca genere). Es la guarda del
 * reintento ÚNICO de `documentos/route.ts` (mismo patrón, un solo reintento
 * tras una pausa corta, que `oferta/route.ts` ya usa con la fecha de
 * efecto): nunca un bucle sin salida ni un reintento sobre algo que no va a
 * cambiar por esperar.
 */
export function meritaReintentoDocumento(veredicto: VeredictoSolicitud, docs: readonly DocumentoEmitido[]): boolean {
  return veredicto === 'aprobada' && docs.length === 0
}
