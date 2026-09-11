// Envío REAL a Codeoscopic: ReRate (confirma el precio) y Submit (emite la
// póliza). Construido el 11/09/2026 sobre el caso real de Pilar Franco Ruz
// (proyecto `40675025`, Allianz Terceros Ampliado) — OK explícito de Alberto.
//
// 🚨 SIN SANDBOX Y SIN FIXTURE DEL FABRICANTE para estas dos llamadas, a
// diferencia de `POST /insurances` (que sí tiene un fixture real en
// `fixtures/codeoscopic/`). `docs/CODEOSCOPIC-API-PORTAL.md` solo describe QUÉ
// hacen estas dos operaciones, nunca el JSON exacto que esperan — no hay
// ningún ejemplo de request/response de `POST .../offers` ni de
// `POST .../policy-applications` en ningún sitio de este repo.
//
// El cuerpo de aquí es la lectura MÁS LITERAL posible de esa prosa:
//   - ReRate: el portal dice «re-tarificar cambiando mainQuote.product.options»
//     → se manda `{ mainQuote: { product: { id: quoteId } } }`, sin tocar
//     `options`, para aceptar los valores por defecto de la compañía en vez de
//     inventar nombres de campo que no están confirmados.
//   - El `id` del precio (p.ej. "Q7601460") NO se guarda en
//     `seguros.tarificacion_precios` (solo el precio, no el id del vendor), así
//     que se recupera con un `GET /insurances/{id}` — GRATIS, es una lectura —
//     en vez de suponerlo.
//
// Si el vendor rechaza esta forma con un 400/422, ESE MENSAJE es la fuente de
// verdad que falta, y se enseña ENTERO (nunca se traga un error de un
// tercero): es la única manera de corregir el contrato sin sandbox.
//
// 🚨 Este fichero es PURO (sin BD): solo config, parseo y las llamadas de
// LECTURA/ReRate al vendor. El Submit de verdad (que SÍ necesita BD para el
// candado de idempotencia) vive en `emitir-envio.ts`, aparte — exactamente
// igual que `respuesta.ts` (puro) está separado de `cotizaciones.ts` (BD).
// La razón no es solo estilo: `tenant.ts` importa `./db` SIN extensión, y eso
// rompe bajo `node --test` (el guardián de gasto/tests corre sin `next`, que
// es quien resuelve esa ruta). Si este fichero importara `tenant.ts`, ningún
// test que lo importe podría cargar — y aquí SÍ hay funciones puras que
// merecen test (`leerOferta`, `encontrarPrecio`), ver `emitir.test.ts`.

import { resolverConfig, type ConfigCodeoscopic, type ResolucionConfig } from './config.ts'
import { peticion } from './cliente.ts'
import { leerCotizacion, type Cotizacion, type Precio } from './respuesta.ts'

/**
 * Config de EMISIÓN. Gate PROPIO, `CODEOSCOPIC_EMISION_ACTIVA`, distinto del
 * de tarificar (`CODEOSCOPIC_TARIFICACION_ACTIVA`): emitir compromete un
 * contrato real, no solo cuesta dinero, y no se enciende con el mismo
 * interruptor que enciende cotizar.
 */
export function resolverConfigEmision(
  env: Record<string, string | undefined> = process.env,
): ResolucionConfig {
  if (env.CODEOSCOPIC_EMISION_ACTIVA !== 'true') {
    return {
      estado: 'apagado',
      motivo:
        'CODEOSCOPIC_EMISION_ACTIVA no está a "true". El envío real (ReRate + Submit) arranca ' +
        'apagado a propósito: sin sandbox, un despiste aquí compromete un contrato, no solo dinero.',
    }
  }
  return resolverConfig(env, { ignorarInterruptor: true })
}

// ─── 1. Refrescar el proyecto (GRATIS) ───────────────────────────────────────

/** `GET /insurances/{id}`. Gratis: es una lectura, no una cotización nueva. */
export async function refrescarProyecto(
  config: ConfigCodeoscopic,
  projectId: string,
): Promise<Cotizacion> {
  const crudo = await peticion(config, {
    metodo: 'GET',
    path: `/insurances/${encodeURIComponent(projectId)}`,
    timeoutMs: config.timeoutGenericoMs,
  })
  return leerCotizacion(crudo)
}

/** El precio elegido por compañía + categoría, tal y como se enseñó en
 *  pantalla. Sin esto no hay `id` de precio con el que pedir el ReRate. */
export function encontrarPrecio(
  cotizacion: Cotizacion,
  compania: string,
  categoria: string,
): Precio | null {
  const normCompania = compania.trim().toLowerCase()
  const normCategoria = categoria.trim().toLowerCase()
  return (
    cotizacion.precios.find(
      (p) =>
        p.compania.trim().toLowerCase() === normCompania &&
        (p.categoria ?? '').trim().toLowerCase() === normCategoria,
    ) ?? null
  )
}

// ─── 2. ReRate: confirma el precio con la compañía ───────────────────────────

export type Oferta = {
  offerId: string
  primaEur: number | null
  firmeza: 'firme' | 'condicionado' | 'estimado'
  caducaEn: string | null
  avisos: string[]
}

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * Lee la respuesta de `POST .../offers`.
 *
 * 🚨 Defensivo A PROPÓSITO: la forma exacta NO está verificada contra el
 * fabricante. Se acepta tanto `{ mainQuote: {...} }` como el objeto pelado,
 * porque no se sabe cuál de las dos usa esta operación (la de cotizar SÍ es
 * pelada; el nombre `mainQuote` que usa el propio portal para describir el
 * cuerpo sugiere que la respuesta también lo envuelve, pero no hay fixture
 * que lo confirme). Si ninguna de las dos formas trae un `id`, se lanza con
 * el crudo recortado para que el mensaje diga qué llegó de verdad.
 */
export function leerOferta(raw: unknown): Oferta {
  const o = obj(raw)
  const mainQuote = obj(o.mainQuote ?? o)
  const id = str(mainQuote.id) ?? (num(mainQuote.id) !== null ? String(mainQuote.id) : null)
  if (id === null) {
    throw new Error(
      `codeoscopic_oferta_sin_id: la respuesta del ReRate no trae un id reconocible. ` +
        `Crudo: ${JSON.stringify(raw).slice(0, 500)}`,
    )
  }
  const mensajes = arr(mainQuote.messages)
  const avisos = mensajes
    .map((m) => {
      const p = obj(m)
      return [str(p.text), str(p.description)].filter(Boolean).join(': ')
    })
    .filter((t) => t !== '')
  const estimate = mainQuote.estimate
  const firmeza: Oferta['firmeza'] =
    estimate === true ? 'estimado' : avisos.length > 0 ? 'condicionado' : estimate === false ? 'firme' : 'estimado'

  return {
    offerId: id,
    primaEur: num(mainQuote.premium),
    firmeza,
    caducaEn: str(mainQuote.expirationDate) ?? str(o.expirationDate),
    avisos,
  }
}

/**
 * `POST /insurances/{projectId}/offers` — confirma el precio elegido
 * (ReRate/preemisión).
 *
 * 🚨 **Corregido el 11/09/2026 tras el primer 400 real** (proyecto 40681298,
 * Pilar Franco Ruz): el vendor exige `mainQuote.id` (el id del mainQuote,
 * `"Q7601460"`) Y `mainQuote.product.id` (el id del PRODUCTO del catálogo,
 * un número — `10` para «Reale Autos» en el fixture real, NADA que ver con
 * el id del mainQuote). La forma anterior mandaba `quoteId` (el id del
 * mainQuote) en el sitio del `product.id` y nunca ponía `mainQuote.id`:
 * `[Path '/mainQuote'] Object has missing required properties (['id'])`.
 *
 * `productOptions` se reenvía TAL CUAL desde la cotización — el fixture real
 * demuestra que el vendor **no lo devuelve al cotizar**, así que casi
 * siempre será `null`. 🚨 **Segundo 400 real (mismo proyecto, mismo día):**
 * un `{}` no vale — el backend Java lo declara
 * `ArrayList<InsuranceProductOption>` (`Cannot deserialize value of type
 * java.util.ArrayList<...InsuranceProductOption> from Object value`), o sea
 * que `options` es un ARRAY, no un objeto. Se manda `[]` cuando falta
 * (intención: "sin cambios, usa los valores por defecto de la compañía").
 *
 * UN SOLO INTENTO: si el vendor rechaza el cuerpo (400/422), NO se reintenta
 * con otra forma a ciegas — `peticion()` ya clasifica ese caso como
 * `validacion` y su mensaje trae el texto del vendor recortado, que sigue
 * siendo la única fuente de verdad que hay sin sandbox.
 */
export async function reRate(
  config: ConfigCodeoscopic,
  projectId: string,
  quoteId: string,
  productId: unknown,
  productOptions: unknown,
): Promise<Oferta> {
  const crudo = await peticion(config, {
    metodo: 'POST',
    path: `/insurances/${encodeURIComponent(projectId)}/offers`,
    cuerpo: {
      mainQuote: {
        id: quoteId,
        product: { id: productId, options: productOptions ?? [] },
      },
    },
    timeoutMs: config.timeoutGenericoMs,
  })
  return leerOferta(crudo)
}

// ─── 3. Qué exige la emisión (GRATIS): lo dice el vendor, no se adivina ─────

export type CampoEmision = {
  id: string
  etiqueta: string | null
  obligatorio: boolean
  tipo: string | null
}

/**
 * `GET /insurances/{projectId}/policy-application-fields?offerId=`. Gratis:
 * es una lectura. Existe para no adivinar el cuerpo del Submit: dice de
 * antemano qué va a pedir, así que ese cuerpo se construye con esto delante.
 */
export async function camposDeEmision(
  config: ConfigCodeoscopic,
  projectId: string,
  offerId: string,
): Promise<CampoEmision[]> {
  const crudo = await peticion(config, {
    metodo: 'GET',
    path: `/insurances/${encodeURIComponent(projectId)}/policy-application-fields?offerId=${encodeURIComponent(offerId)}`,
    timeoutMs: config.timeoutGenericoMs,
  })
  const lista = Array.isArray(crudo) ? crudo : arr(obj(crudo).fields)
  return lista
    .map((f): CampoEmision | null => {
      const o = obj(f)
      const id = str(o.id) ?? str(o.name)
      if (id === null) return null
      return {
        id,
        etiqueta: str(o.label),
        obligatorio: o.required === true || o.mandatory === true,
        tipo: str(o.type),
      }
    })
    .filter((c): c is CampoEmision => c !== null)
}

// El Submit real (`POST .../policy-applications`) y su candado de idempotencia
// viven en `emitir-envio.ts`, que SÍ toca BD — ver la cabecera de este fichero.
