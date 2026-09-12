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
 *
 * 🚨 **Tercer 400 real (mismo proyecto, mismo día): `productOptions` vacío no
 * basta para Allianz** — «El campo Fenómenos de la naturaleza de Allianz es
 * obligatorio». El vendor no publica por REST qué campos exige cada producto
 * (`docs/CODEOSCOPIC-API-PORTAL.md`), pero el CRM de Manuel (`asegura`) SÍ
 * tiene una captura real del formulario de Allianz Auto validada contra el
 * vendor: `opciones-producto.ts` la porta. El caller (`route.ts`) rellena
 * `productOptions` con ese catálogo cuando la cotización no trae nada.
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

/**
 * `PATCH /insurances/{id}` — corrige un campo del proyecto YA creado, GRATIS
 * (solo `POST /insurances` está documentado como facturable).
 *
 * 🚨 **Nace el 11/09/2026 tras el cuarto 400 real** (proyecto 40681298, Pilar
 * Franco Ruz): «Fecha de Efecto no puede estar más de 90 días en el futuro».
 * La fecha la tecleó el corredor al cotizar (`peticion-auto.ts`); corregirla
 * es una decisión de negocio (qué fecha quiere el cliente), nunca una
 * suposición del código — la decide quien pide el ReRate.
 *
 * 🚨 **Y NO es tan «incremental» como decía aquí (quinto 400 real,
 * 12/09/2026, mismo proyecto): «The `insuranceLine` field is missing or
 * invalid.»** `docs/CODEOSCOPIC-API-PORTAL.md` describe el PATCH como
 * «descarta lo que no esté en el esquema», pero el backend valida el
 * objeto ENTERO contra el esquema del ramo y `insuranceLine` es obligatorio
 * en él aunque no se esté tocando. Por eso `insuranceLineId` es un parámetro
 * obligatorio, no opcional: el caller lo relee del propio proyecto
 * (`Cotizacion.insuranceLineId`) en vez de suponerlo por ramo — un 'Car'
 * a fuego habría colado en auto pero roto hogar/vida/decesos/moto/salud.
 *
 * 🚨🚨 **[SEGURO, CONFIRMADO 12/09/2026 — octavo y noveno fallo real, mismo
 * proyecto]: `effectiveDate` NO es mutable por este PATCH. Punto.** Dos
 * lecturas independientes de diagnóstico (PR #2749 y #2756) lo prueban:
 * `fechaEfectoCorregida` llegó bien formada (`2026-09-12`, no vacía), el
 * PATCH no lanzó ningún `ErrorCodeoscopic` (200 limpio), y NI la relectura
 * INMEDIATA ni una SEGUNDA relectura tras 2,5s de pausa (para descartar
 * proceso asíncrono) mostraron el cambio — las dos siguieron devolviendo la
 * fecha ORIGINAL (`2027-09-10`). La hipótesis async queda descartada. La
 * frase de `docs/CODEOSCOPIC-API-PORTAL.md` sobre «modificar campos tras
 * cotizar invalida las cotizaciones anteriores» viene de `person-roles` y
 * NO aplica a `effectiveDate`: este campo, una vez fijado en el `POST
 * /insurances` inicial, es de solo lectura para el resto de la vida del
 * proyecto.
 *
 * **Consecuencia práctica: esta función y el campo «Fecha de efecto» de
 * `emision.tsx` NO SIRVEN PARA NADA tal y como están.** Sirven para
 * corregir `insuranceLine` si algún día hiciera falta (eso sí se valida),
 * pero el PATCH nunca va a cambiar la fecha con la que se re-tarifica. La
 * ÚNICA vía real para cambiar la fecha de efecto de una cotización ya
 * creada es volver a cotizar desde cero (`POST /insurances`, con coste
 * real de 0,50€, no idempotente) con la fecha correcta desde el principio.
 * Mientras no se implemente ese flujo de re-cotización, un proyecto
 * cotizado con una fecha de efecto rechazable (>90 días vista) queda
 * ATASCADO sin remedio vía ReRate — la única salida es descartarlo.
 *
 * **Al portar esto a hogar/vida/decesos/moto/salud: NO uses este PATCH
 * para corregir la fecha de efecto — está confirmado que no funciona en
 * auto y no hay ninguna razón para esperar que difiera por ramo** (el
 * campo y el mecanismo de PATCH son genéricos a todos los ramos). Si
 * aparece el mismo 400 en otro ramo, la solución es re-cotizar, no repetir
 * esta investigación.
 */
export async function actualizarFechaEfecto(
  config: ConfigCodeoscopic,
  projectId: string,
  fechaEfecto: string,
  insuranceLineId: string | null,
): Promise<void> {
  await peticion(config, {
    metodo: 'PATCH',
    path: `/insurances/${encodeURIComponent(projectId)}`,
    cuerpo: { effectiveDate: fechaEfecto, insuranceLine: { id: insuranceLineId } },
    timeoutMs: config.timeoutGenericoMs,
  })
}

// ─── 2-bis. Completar la PERSONA de un proyecto ya creado (GRATIS) ──────────
//
// El ReRate exige campos que la cotización inicial no pedía (11º 400 real: la
// calle). Cotizar de nuevo cuesta 0,50€ y puede mover el precio; un
// `PATCH /insurances/{id}` es gratis. Pero por la lección de `effectiveDate`
// (que el PATCH «acepta» y no aplica) aquí NUNCA se da por hecho: se relee el
// proyecto y se comprueba campo a campo. Si no ha cuajado, se dice.

import {
  aplicarCamposPersona,
  leerCampoPersona,
  mismoValor,
  type CampoPersona,
  type Papel,
} from './interprete-400.ts'
import { enmascararDni } from '@central/module-seguros'
import { ibanEnmascarado } from './emitir-iban.ts'

/** El proyecto tal cual lo devuelve el vendor (GET). Gratis. */
export async function leerProyectoCrudo(config: ConfigCodeoscopic, projectId: string): Promise<Json> {
  const crudo = await peticion(config, {
    metodo: 'GET',
    path: `/insurances/${encodeURIComponent(projectId)}`,
    timeoutMs: config.timeoutGenericoMs,
  })
  return obj(crudo)
}

export type ResultadoCompletar =
  | { estado: 'aplicado'; cotizacion: Cotizacion }
  /**
   * El PATCH no lanzó, pero al releer el proyecto los campos siguen sin estar.
   * `crudo` es la persona RELEÍDA (holder + risk), no lo que se mandó: es lo
   * único que dice si el vendor lo guardó con otra forma/clave (p. ej. un
   * `emails[]` en vez de `email`) en vez de haberlo descartado sin más — sin
   * esto, «no aplicó X» es una afirmación sin cómo comprobarla.
   */
  | { estado: 'no_aplicado'; sinAplicar: { campo: CampoPersona; papel: Papel }[]; crudo: Json }

/**
 * `crudo` viaja a la respuesta HTTP del puerto para que se pueda ver DÓNDE
 * puso el vendor el dato (o que no lo puso en ningún sitio) — pero es la
 * persona releída ENTERA, con DNI y teléfono dentro. Se enmascaran los dos
 * antes de que salgan de aquí, igual que `ibanEnmascarado()` con la cuenta:
 * un diagnóstico no es excusa para que un DNI o un móvil viajen en claro por
 * un log o una pantalla de error.
 */
export function redactarPersona(persona: unknown): Json {
  const p: Json = { ...obj(persona) }
  const idDoc = obj(p.identificationDocument)
  if (typeof idDoc.id === 'string') p.identificationDocument = { ...idDoc, id: enmascararDni(idDoc.id) }
  const phones = arr(p.phones)
  if (phones.length > 0) {
    p.phones = phones.map((ph) => {
      if (typeof ph !== 'object' || ph === null) return ph
      const phone = ph as Json
      const num = str(phone.number)
      return num ? { ...phone, number: `…${num.slice(-3)}` } : phone
    })
  }
  return p
}

// Toleran separador (espacio/punto/guion) entre grupos: un vendor que escribe
// «12345678-Z» o «ES91-2100-...» en un mensaje de texto libre no es un caso
// exótico. El match se limpia de separadores ANTES de enmascarar (por eso
// `enmascararDni`/el móvil reciben los dígitos ya juntos, no el string tal
// cual): un separador colado en los últimos caracteres no debe dejar dígitos
// identificativos a la vista.
const RE_DNI_NIE = /\b\d{2}[.\-\s]?\d{3}[.\-\s]?\d{3}[.\-\s]?[A-Za-z]\b|\b[XYZxyz][.\-\s]?\d{7}[.\-\s]?[A-Za-z]\b/g
const RE_MOVIL_ES = /(?<!\d)(?:\+?34[.\-\s]?)?[67](?:[.\-\s]?\d){8}(?!\d)/g
// Cualquier país, no solo España: `ibanValido()` (mismo fichero de origen,
// `emitir-iban.ts`) es deliberadamente agnóstica — «un cliente puede
// domiciliar en una cuenta extranjera y eso lo decide la compañía, no
// nosotros» — así que la máscara tiene que cubrir las mismas letras de país
// de ISO 3166, no solo `ES`.
// Dos ramas, porque una sola regla no cubre los dos casos sin reabrir el
// mismo agujero por el otro lado (probado y descartado dos veces):
//   1ª — PEGADO, sin separador (`ES9121000418450200051332`, la forma real de
//        un valor de campo JSON): sin separador que confundir con un hueco
//        entre palabras, es seguro admitir mayúsculas/minúsculas.
//   2ª — AGRUPADO de 4 en 4 con separador (`ES91 2100 0418…`, la forma
//        humana/escrita a mano, igual que ya hace
//        `apps/plataforma/lib/sivra/agente-huesped/reglas.ts`): el separador
//        SOLO puede ir entre grupos completos —permitirlo carácter a
//        carácter hace que el patrón «coma» frases enteras detrás de un
//        IBAN («DE89370400440532013000 ya en uso» → engullía «ya en
//        uso»)— y esta rama va en MAYÚSCULAS FIJAS: un IBAN escrito a mano
//        es por convención mayúscula, y esa restricción es lo que de
//        verdad frena que el grupo final de 1-4 se trague una palabra
//        adyacente en minúscula («1332 ya» → case-insensitive daba «32YA»).
const RE_IBAN =
  /\b[A-Za-z]{2}\d{2}[A-Za-z0-9]{11,30}\b|\b[A-Z]{2}\d{2}[.\-\s]?(?:[A-Z0-9]{4}[.\-\s]?){2,7}[A-Z0-9]{1,4}\b/g
// El correo del tomador (12/09/2026: desde que viaja en el POST y el Submit lo
// exige, un 400 que lo cite es lo esperable). Se deja el dominio: sirve para
// diagnosticar («el vendor rechaza gmail.com») sin identificar a la persona.
const RE_EMAIL_EN_TEXTO = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g

/**
 * `envio.crudo` (y `envio.mensaje`, el texto del 400/500) son la respuesta
 * ENTERA del vendor al Submit — sin sandbox ni fixture, no se sabe de
 * antemano si traen los mismos `holder`/`risk` con DNI/teléfono que
 * `redactarPersona()` ya protege en el camino de reparación, ni si un
 * mensaje de error cita un valor real (p. ej. «el titular 12345678Z ya
 * tiene otra cuenta»). En vez de asumir una forma que no está confirmada,
 * esto camina CUALQUIER JSON o texto y enmascara por PATRÓN (DNI/NIE, móvil
 * español, IBAN) esté donde esté — protege igual si el vendor cambia de
 * forma mañana.
 *
 * 🚨 Es heurística, no una garantía criptográfica, y hay dos huecos
 * CONOCIDOS y aceptados a propósito (probados, no se persigue más porque
 * cada intento de cerrarlos reabría el de "engulle palabras sueltas" por
 * otro lado — ver el comentario de `RE_IBAN`):
 *   - un IBAN escrito en minúscula CON separadores («es91 2100 0418…») no
 *     se enmascara (solo el pegado admite minúscula, por la razón de
 *     arriba); si el vendor cambia a mayúsculas o lo manda pegado, sí cae.
 *   - un valor PEGADO sin ningún espacio al texto vecino
 *     («titular12345678Z…») tampoco, porque las tres reglas exigen `\b`.
 * Los 14 400 reales catalogados en este repo NUNCA han citado un valor real
 * (DNI/IBAN/móvil) — siempre nombran el CAMPO que falta, en inglés — así que
 * esto es defensa en profundidad sobre un caso no observado, no la única
 * barrera: la fuga estructural de verdad (el `holder`/`risk` con forma
 * conocida) la tapa `redactarPersona()`, no esto.
 */
export function redactarCrudoVendor(v: unknown): unknown {
  if (typeof v === 'string') {
    return v
      .replace(RE_IBAN, (m) => ibanEnmascarado(m))
      .replace(RE_DNI_NIE, (m) => enmascararDni(m.replace(/[.\-\s]/g, '')) ?? m)
      .replace(RE_MOVIL_ES, (m) => `…${m.replace(/\D/g, '').slice(-3)}`)
      .replace(RE_EMAIL_EN_TEXTO, (m) => `…@${m.slice(m.indexOf('@') + 1)}`)
  }
  if (Array.isArray(v)) return v.map(redactarCrudoVendor)
  if (v && typeof v === 'object') {
    const out: Json = {}
    for (const [k, val] of Object.entries(v as Json)) out[k] = redactarCrudoVendor(val)
    return out
  }
  return v
}

const PAPELES_RIESGO: readonly Papel[] = ['owner', 'primaryDriver', 'secondaryDriver']

const dniDe = (persona: unknown): string | null => {
  const id = str(obj(obj(persona).identificationDocument).id)
  return id === null ? null : id.replace(/\s/g, '').toUpperCase()
}

/**
 * Los papeles del `risk` que son LA MISMA PERSONA que el tomador (mismo DNI).
 * Un `owner` o `secondaryDriver` con otro DNI es otra persona: escribirle el
 * teléfono o la fecha de nacimiento del tomador sería falsear sus datos. Sin
 * DNI en el tomador no se puede afirmar la identidad → solo el tomador.
 *
 * Exportada (13º 400 real, Submit) para que el caller compruebe ANTES de
 * gastar un reintento de Submit si el 400 pide un papel que `completarPersonas`
 * NO va a poder rellenar (p. ej. un `owner` con DNI distinto del tomador,
 * frecuente en vehículos de empresa o familiares): sin esta comprobación se
 * reintentaría un Submit real que fallaría otra vez por el mismo motivo.
 */
export function papelesDeLaMismaPersona(crudo: Json): Papel[] {
  const dniHolder = dniDe(crudo.holder)
  if (dniHolder === null) return []
  const risk = obj(crudo.risk)
  return PAPELES_RIESGO.filter((papel) => risk[papel] && typeof risk[papel] === 'object' && dniDe(risk[papel]) === dniHolder)
}

/**
 * Escribe `valores` en el tomador y en los papeles del `risk` que sean la
 * misma persona (mismo DNI) — el vendor cruza por DNI y rechaza si un campo
 * difiere entre ellos, así que no se puede completar solo uno. A otra persona
 * (otro DNI) no se le toca nada.
 *
 * El PATCH lleva `insuranceLine` (quinto 400 real) y los objetos ENTEROS de
 * `holder` y `risk` tal como se leyeron, con el campo añadido: el vendor
 * valida el objeto completo contra el esquema del ramo.
 */
export async function completarPersonas(
  config: ConfigCodeoscopic,
  projectId: string,
  valores: Partial<Record<CampoPersona, string>>,
): Promise<ResultadoCompletar> {
  const campos = (Object.keys(valores) as CampoPersona[]).filter((c) => typeof valores[c] === 'string')
  const crudo = await leerProyectoCrudo(config, projectId)
  const risk = obj(crudo.risk)
  const papeles = papelesDeLaMismaPersona(crudo)

  const cuerpo: Json = {
    insuranceLine: { id: str(obj(crudo.insuranceLine).id) },
    holder: aplicarCamposPersona(crudo.holder, valores),
  }
  if (Object.keys(risk).length > 0) {
    const riskPatched: Json = { ...risk }
    for (const papel of papeles) riskPatched[papel] = aplicarCamposPersona(risk[papel], valores)
    cuerpo.risk = riskPatched
  }

  await peticion(config, {
    metodo: 'PATCH',
    path: `/insurances/${encodeURIComponent(projectId)}`,
    cuerpo,
    timeoutMs: config.timeoutGenericoMs,
  })

  // 🔎 La verificación es la pieza, no el PATCH.
  const releido = await leerProyectoCrudo(config, projectId)
  const riskReleido = obj(releido.risk)
  const sinAplicar: { campo: CampoPersona; papel: Papel }[] = []
  const comprobar = (persona: unknown, papel: Papel) => {
    for (const c of campos) {
      if (!mismoValor(c, valores[c] as string, leerCampoPersona(persona, c))) sinAplicar.push({ campo: c, papel })
    }
  }
  comprobar(releido.holder, 'holder')
  for (const papel of papeles) comprobar(riskReleido[papel], papel)

  if (sinAplicar.length > 0) {
    const crudoPersonas: Json = { holder: redactarPersona(releido.holder) }
    for (const papel of papeles) crudoPersonas[papel] = redactarPersona(riskReleido[papel])
    return { estado: 'no_aplicado', sinAplicar, crudo: crudoPersonas }
  }
  return { estado: 'aplicado', cotizacion: leerCotizacion(releido) }
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
