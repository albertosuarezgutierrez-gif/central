// El acceso de un CLIENTE al portal (`apps/asegura-portal`), desde la pantalla
// de Alberto.
//
// ── El hueco que tapa (Alberto, 05/09/2026) ─────────────────────────────────
// «No aparece el enviar invitación a la intranet.» No aparecía porque no
// existía: el portal funciona desde el 01/09 y la única forma de entrar era que
// el cliente supiera por su cuenta que está ahí. Es la regla de `CLAUDE.md` —«un
// aviso que sale por un canal que esa persona no abre es un aviso que no
// existe»— en su forma extrema: el canal entero era invisible.
//
// La BD y el envío viven en `apps/asegura` (`lib/invitacion-portal.ts`); esta
// app habla con su puerto (`/api/operador/cliente/portal`) con el secreto de
// operador. Dos partes, como en `relaciones-asegura.ts`:
//
//   1. Lo PURO: interpretar la respuesta y traducir cada estado a la frase que
//      dice QUÉ HACER. Sin `fetch` dentro (los client components lo importan).
//      Test en `test/regression-portal-cliente-asegura.test.ts`.
//   2. La RED: las llamadas al puerto, solo desde las rutas API de plataforma.
//
// 🚨 Lo que hace que esto no sea «mandar un correo y ya»: el portal vincula a
// una persona con su ficha por el índice ciego de su email, y **solo si no es
// ambiguo**. Así que hay un modo de fallo PEOR que no invitar: invitar a alguien
// cuyo correo no resuelve a su ficha. Recibe el correo, entra, teclea su
// código… y ve una bóveda VACÍA, sin ningún error, como si no tuviera pólizas.
// Por eso esta pantalla PREGUNTA antes de ofrecer el botón, y por eso los siete
// estados no se colapsan en «no se puede invitar»: cada uno se arregla en un
// sitio distinto (pedirle el correo al cliente · resolver un duplicado · mirar
// una variable de Vercel · volver a intentarlo).

/**
 * Los siete estados del puerto (`EstadoPortal` de `apps/asegura`). El orden es
 * el de allí; la lista se usa para leer, nunca para decidir nada.
 */
export const ESTADOS_PORTAL = [
  'ya_entra',
  'invitable',
  'ambiguo',
  'resuelve_a_otra',
  'sin_email',
  'ilegible',
  'no_comprobado',
] as const
export type EstadoPortalCartera = (typeof ESTADOS_PORTAL)[number]

export type PortalCartera = {
  estado: EstadoPortalCartera
  /**
   * Última vez que alguien entró con esta ficha. `null` = **no consta cuándo**
   * (la identidad no tiene la marca, o asegura no lo pudo leer). 🚨 Jamás
   * significa «nunca ha entrado»: eso lo dice `estado`, no esta fecha.
   */
  ultimoAccesoEn: string | null
  /** Identidades vinculadas. `null` = **no se pudo contar**, que NO es 0. */
  identidades: number | null
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function enteroONull(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null
}

function esEstado(v: unknown): v is EstadoPortalCartera {
  return typeof v === 'string' && (ESTADOS_PORTAL as readonly string[]).includes(v)
}

/**
 * El bloque `portal` del puerto → `PortalCartera`, o `null` si no llega o no
 * tiene forma de objeto (o sea: no se ha podido leer, y eso lo dice la pantalla
 * con otras palabras).
 *
 * 🚨 Un `estado` que no está en la lista **NO se cae a `invitable`**: se lee
 * como `no_comprobado`. Un valor desconocido es un «no lo sé» —una versión de
 * asegura más nueva, un typo, una respuesta a medias—, y convertirlo en
 * «adelante, invítale» es exactamente prometer un acceso que puede acabar en
 * una bóveda vacía. Lo conservador aquí no es «no se puede», es «no se ha
 * mirado», que es otra cosa y manda a volver a intentarlo.
 */
export function leerPortal(v: unknown): PortalCartera | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const iso = cadena(o.ultimoAccesoEn)
  return {
    estado: esEstado(o.estado) ? o.estado : 'no_comprobado',
    // Una fecha que no se puede parsear vale lo mismo que no venir: `null`, que
    // se pinta «no consta cuándo». Nunca se inventa un día.
    ultimoAccesoEn: iso !== null && !Number.isNaN(Date.parse(iso)) ? iso : null,
    identidades: enteroONull(o.identidades),
  }
}

// ─── GET: qué se puede hacer hoy con esta ficha ──────────────────────────────

/**
 * Lo que devuelve el puerto al preguntar. `error` es «no se pudo consultar»;
 * `no_encontrado` es «se miró y esa ficha no está en la correduría». No se
 * colapsan: el primero manda a mirar la conexión, el segundo a mirar el id.
 */
export type RespuestaPortal =
  | { estado: 'ok'; portal: PortalCartera }
  | { estado: 'no_encontrado' }
  | { estado: 'sin_configurar' }
  | { estado: 'invalido'; motivo: string }
  | { estado: 'error'; motivo: string }

export function interpretarPortal(status: number, json: unknown): RespuestaPortal {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 404 || o.estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (status === 422 || o.estado === 'invalido') return { estado: 'invalido', motivo: cadena(o.motivo) ?? 'datos no válidos' }
  if (status === 200 && o.estado === 'ok') {
    const portal = leerPortal(o.portal)
    // Un `ok` sin bloque legible no se convierte en «no tiene acceso»: no se ha
    // podido leer, y se dice.
    if (portal === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
    return { estado: 'ok', portal }
  }
  return { estado: 'error', motivo: cadena(o.causa) ?? cadena(o.motivo) ?? cadena(o.error) ?? `HTTP ${status}` }
}

// ─── POST: el correo con el enlace ───────────────────────────────────────────

/** Los ocho desenlaces de `invitarAlPortal` (`FalloInvitacion` de asegura). */
export const FALLOS_INVITACION = [
  'no_encontrado',
  'sin_email',
  'ilegible',
  'ambiguo',
  'resuelve_a_otra',
  'sin_portal',
  'no_comprobado',
  'error_envio',
] as const
export type FalloInvitacion = (typeof FALLOS_INVITACION)[number]

/**
 * 🚨 Ninguno de los desenlaces se colapsa con otro, porque se arreglan en
 * sitios distintos y el que los mira decide qué hacer después: `sin_email` es
 * «ponle un correo», `ambiguo`/`resuelve_a_otra` es «resuelve el duplicado»,
 * `ilegible` es «mira Vercel», `no_comprobado` es «vuelve a intentarlo» y
 * `error_envio` es una avería del proveedor que sí se reintenta. Un «no se pudo
 * invitar» genérico dejaría a Alberto llamando al cliente por un problema de
 * una variable de entorno.
 */
export type RespuestaInvitacion =
  | {
      estado: 'ok'
      /**
       * `true` = se le reenvió el enlace a quien ya entraba · `false` = era su
       * primera invitación · `null` = **asegura no lo dijo**. El tercero existe
       * porque el texto de pantalla cambia, y afirmar «ya entraba» sin dato es
       * decirle a Alberto que el cliente usa un portal en el que quizá no ha
       * entrado nunca.
       */
      yaEntraba: boolean | null
    }
  | { estado: FalloInvitacion; motivo: string }
  | { estado: 'sin_configurar'; motivo: string }
  | { estado: 'invalido'; motivo: string }
  | { estado: 'error'; motivo: string }

export function interpretarInvitacion(status: number, json: unknown): RespuestaInvitacion {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (status === 200 && o.estado === 'ok') {
    return { estado: 'ok', yaEntraba: typeof o.yaEntraba === 'boolean' ? o.yaEntraba : null }
  }
  // El estado del puerto manda sobre el código HTTP: los dos vienen del mismo
  // sitio, pero el estado dice CUÁL de los ocho es (dos comparten el 422, dos
  // el 409 y dos el 503).
  for (const f of FALLOS_INVITACION) {
    if (o.estado === f) return { estado: f, motivo: cadena(o.motivo) ?? f }
  }
  if (o.estado === 'invalido' || status === 422) return { estado: 'invalido', motivo: cadena(o.motivo) ?? 'datos no válidos' }
  if (o.estado === 'sin_configurar' || status === 503) {
    return { estado: 'sin_configurar', motivo: cadena(o.motivo) ?? 'asegura no está configurada.' }
  }
  return { estado: 'error', motivo: cadena(o.causa) ?? cadena(o.motivo) ?? cadena(o.error) ?? `HTTP ${status}` }
}

// ─── Qué se dice en pantalla ─────────────────────────────────────────────────

/** Qué botón tiene sentido HOY. `ninguna` = no se ofrece ninguno, y se explica por qué. */
export type AccionPortal = 'invitar' | 'reenviar' | 'ninguna'

/** Los tonos de `Badge` (`components/ui.tsx`), para no traducirlos en el JSX. */
export type TonoPortal = 'neutral' | 'positivo' | 'negativo' | 'aviso'

export type FrasePortal = {
  /** Qué pasa hoy, en una línea. */
  titulo: string
  /** QUÉ HACER, y dónde se arregla. Nunca «no se pudo» a secas. */
  queHacer: string
  accion: AccionPortal
  tono: TonoPortal
}

/** Una fecha ISO en castellano de pantalla: «3 de septiembre de 2026». */
export function fechaAcceso(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Cuándo entró por última vez. 🚨 Sin fecha se dice **«no consta cuándo»**,
 * nunca «nunca ha entrado»: llegamos aquí porque hay una identidad vinculada,
 * o sea que entrar, entró — lo que falta es la marca de cuándo. Decir «nunca»
 * sería colapsar un `null` en una afirmación, y encima en la dirección que
 * empuja a mandarle un correo que no hace falta.
 */
export function textoUltimoAcceso(ultimoAccesoEn: string | null): string {
  return ultimoAccesoEn === null ? 'no consta cuándo fue la última vez' : `última vez el ${fechaAcceso(ultimoAccesoEn)}`
}

/**
 * El estado → la frase que dice qué hacer. Vive aquí (puro, con test) y no en
 * el JSX: es lo que Alberto lee para decidir, y el sitio donde dos estados que
 * se arreglan en sitios distintos acabarían con el mismo texto por descuido.
 * Hay un test que exige que los siete sean DISTINTOS.
 */
export function explicarPortal(p: PortalCartera): FrasePortal {
  switch (p.estado) {
    case 'ya_entra':
      return {
        titulo: `Ya entra al portal · ${textoUltimoAcceso(p.ultimoAccesoEn)}`,
        queHacer:
          'No hay nada que hacer. Si dice que no lo encuentra, se le puede reenviar el enlace: no abre ningún acceso nuevo, solo le recuerda dónde está.',
        accion: 'reenviar',
        tono: 'positivo',
      }
    case 'invitable':
      return {
        titulo: 'Se le puede invitar',
        queHacer:
          'Su correo le llevaría a ESTA ficha. El botón le manda el enlace; el acceso lo abre él tecleando un código de un solo uso, así que invitarle no le da acceso a nada por sí solo.',
        accion: 'invitar',
        tono: 'neutral',
      }
    case 'ambiguo':
      return {
        titulo: 'No se le puede invitar todavía: su correo está en más de una ficha',
        queHacer:
          'El portal no sabría cuál enseñarle, así que entraría y vería una bóveda VACÍA, sin ningún error: peor que no invitarle. Se arregla resolviendo el duplicado (fusionar o corregir la otra ficha), no reintentando.',
        accion: 'ninguna',
        tono: 'aviso',
      }
    case 'resuelve_a_otra':
      return {
        titulo: 'No se le puede invitar todavía: su correo lleva a OTRA ficha',
        queHacer:
          'Con ese correo el portal no le traería aquí, así que entraría y no vería sus pólizas. Revisa si hay una ficha duplicada suya y resuélvela antes de escribirle.',
        accion: 'ninguna',
        tono: 'aviso',
      }
    case 'sin_email':
      return {
        titulo: 'No hay ninguna dirección a la que escribirle',
        queHacer:
          'Añádele un correo aquí mismo, en «Editar datos del cliente» (justo arriba, en esta pestaña), y vuelve a mirar. También puede ser que esté de baja de correo.',
        accion: 'ninguna',
        tono: 'neutral',
      }
    case 'ilegible':
      return {
        titulo: 'Tiene correo guardado y no se puede leer',
        queHacer:
          'Está cifrado con una clave que asegura no puede abrir (PII_ENCRYPTION_KEY). Se arregla en las variables de Vercel, NO llamando al cliente: la dirección sigue en su ficha.',
        accion: 'ninguna',
        tono: 'aviso',
      }
    case 'no_comprobado':
      return {
        titulo: 'No se ha podido comprobar',
        queHacer:
          'No es que no se pueda invitar: es que no se ha podido mirar si su correo le llevaría a su ficha, y sin eso no se manda nada (una invitación a ciegas puede acabar en un portal vacío). Vuelve a intentarlo dentro de un rato.',
        accion: 'ninguna',
        tono: 'neutral',
      }
  }
}

/** Cuántas personas entran con esta ficha. `null` = no se contó, y se dice. */
export function textoIdentidades(identidades: number | null): string {
  if (identidades === null) return 'no se ha podido contar cuántas personas entran con esta ficha'
  if (identidades === 0) return 'no entra nadie todavía (se ha mirado)'
  return identidades === 1 ? '1 persona entra con esta ficha' : `${identidades} personas entran con esta ficha`
}

/**
 * El desenlace del envío, en una frase. Puro y con test para que un «se ha
 * enviado» no pueda salir de un desenlace que no envió nada.
 *
 * 🚨 En el caso bueno el texto NO dice que el cliente ya esté dentro: el correo
 * ha salido y el acceso lo abre él con su código. Decir «ya puede entrar» y que
 * el bloque siga diciendo «no entra nadie» sería la pantalla contradiciéndose.
 */
export function textoInvitacion(r: RespuestaInvitacion, nombre: string): string {
  switch (r.estado) {
    case 'ok':
      if (r.yaEntraba === true) return `✅ Enlace reenviado a ${nombre}. No abre ningún acceso nuevo: ya entraba.`
      if (r.yaEntraba === false) {
        return (
          `✅ Invitación enviada a ${nombre}. El correo ha salido, pero el acceso lo abre él: hasta que entre con su ` +
          'código, aquí seguirá diciendo que todavía no entra nadie.'
        )
      }
      return `✅ Correo enviado a ${nombre}. asegura no ha dicho si ya entraba antes, así que aquí no se afirma.`
    case 'sin_email':
      return `📭 ${nombre} no tiene ningún correo legible en su ficha (o está de baja de correo): añádeselo y vuelve a intentarlo. No se ha enviado nada.`
    case 'ilegible':
      return '🔑 No se ha enviado: el correo está guardado cifrado y asegura no lo puede abrir (PII_ENCRYPTION_KEY). Se arregla en Vercel, no llamando al cliente.'
    case 'ambiguo':
      return `⚠️ No se ha enviado, y es lo correcto: ese correo está en más de una ficha, así que ${nombre} entraría a una bóveda vacía. Resuelve el duplicado primero.`
    case 'resuelve_a_otra':
      return `⚠️ No se ha enviado, y es lo correcto: con ese correo el portal no le traería a esta ficha, así que ${nombre} entraría y no vería sus pólizas.`
    case 'no_comprobado':
      return '🕐 No se ha enviado: no se ha podido comprobar si su correo le llevaría a su ficha. Vuelve a intentarlo; no es que no se pueda invitar.'
    case 'sin_portal':
      return '⚙️ No se ha enviado: no hay dirección de portal configurada (ASEGURA_PORTAL_URL), así que el correo no tendría a dónde llevar.'
    case 'error_envio':
      return `⚠️ El proveedor de correo no aceptó el mensaje, así que a ${nombre} NO le ha llegado. Vuelve a intentarlo.`
    case 'no_encontrado':
      return 'Esa ficha ya no está en la correduría. No se ha enviado nada.'
    case 'sin_configurar':
      return `⚙️ No se ha enviado: ${textoMotivoPortal(r.motivo)}`
    default:
      return `⚠️ No se ha enviado: ${textoMotivoPortal(r.motivo)}`
  }
}

/** El motivo técnico del puerto, en castellano de pantalla. Los que ya son frase se dejan. */
export function textoMotivoPortal(motivo: string): string {
  switch (motivo) {
    case 'secreto_rechazado':
      return 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos).'
    case 'respuesta_ilegible':
      return 'la respuesta de asegura no tenía la forma esperada.'
    case 'red':
      return 'no se pudo llegar a asegura (timeout, DNS o TLS).'
    default:
      return motivo
  }
}

// ─── Red (solo desde las rutas API de plataforma) ────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

function cabeceras(): Record<string, string> | null {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  return secret ? { Authorization: `Bearer ${secret}` } : null
}

export type Reenvio = { status: number; json: unknown }

async function llamar(path: string, init: RequestInit): Promise<Reenvio> {
  const h = cabeceras()
  if (!h) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(`${urlAsegura()}${path}`, {
      ...init,
      headers: { ...h, ...(init.body ? { 'content-type': 'application/json' } : {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}

/** `GET /api/operador/cliente/portal?clienteId=` — qué se puede hacer hoy con esa ficha. Gratis. */
export function portalAsegura(clienteId: string): Promise<Reenvio> {
  return llamar(`/api/operador/cliente/portal?clienteId=${encodeURIComponent(clienteId)}`, { method: 'GET' })
}

/**
 * `POST /api/operador/cliente/portal` — `{clienteId, actor}`: le manda el correo
 * con el enlace del portal.
 *
 * 🚨 Escribe a una persona real, así que no es un `GET` más: lo dispara Alberto
 * pulsando, nunca un efecto de pantalla ni un reintento automático (regla de
 * comunicaciones salientes del `CLAUDE.md` raíz — el clic es la autorización
 * para ESE envío).
 */
export function invitarPortalAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/cliente/portal', { method: 'POST', body: JSON.stringify(body) })
}
