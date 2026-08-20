// ────────────────────────────────────────────────────────────────────────────
// Sesión con el Portal de Subastas del BOE para los crons.
//
// Por qué existe: el bloque «Información complementaria» —donde vive la lista de
// documentos, incluida la CERTIFICACIÓN DE CARGAS— solo se sirve a usuarios
// identificados en muchas subastas (8 de 13 vivas el 20/08/2026). Anónimo, el
// lector no puede leer las cargas de justo las fichas que más importan.
//
// De las tres vías de acceso del Portal solo una vale aquí: **usuario + contraseña**
// (`/id/login.php`). El certificado cualificado y Cl@ve exigen una persona
// delante, y además la firma digital de Alberto no entra en este repo ni en
// Vercel bajo ningún concepto: es su identidad legal, no una credencial de app.
//
// 🚨 UN INTENTO Y NO MÁS. El error literal del Portal ante datos malos es «…los
// datos de acceso proporcionados son incorrectos, el usuario no está activo o
// está bloqueado». O sea: el Portal bloquea cuentas. Un cron que reintenta la
// contraseña en cada pasada le quita a Alberto el acceso a su propia cuenta. Por
// eso un rechazo se recuerda para todo el proceso y NO se vuelve a probar; lo
// único reintentable es el «no sé qué ha pasado» (red, portal caído).
//
// 🚨 Y LA SESIÓN SE VERIFICA EN CADA FICHA, no solo al abrirla. Si caduca a
// mitad de una pasada, el resto de fichas se leerían como anónimas y su muro
// documental quedaría grabado como si fuera lo que ve un usuario registrado —
// convertiría un «no me han dejado verlo» en «ni registrado se ve», que es la
// afirmación que manda a Alberto al Registro de la Propiedad sin necesidad.
// ────────────────────────────────────────────────────────────────────────────
import { formularioOtp, interpretarLogin, pideCodigo, type EstadoLogin } from '@central/module-subastas'
import { esperarCodigoPortal } from '@/lib/subastas/gmail-boe'

const LOGIN = 'https://subastas.boe.es/id/login.php'
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

/** Las sesiones PHP del Portal caducan solas; se renueva antes de que moleste. */
const VIDA_SESION_MS = 15 * 60 * 1000

export type EstadoPortal = 'sin-credenciales' | EstadoLogin

export interface SesionPortal {
  estado: EstadoPortal
  /** Cabecera `Cookie` lista para usar, o `null` si no hay sesión. */
  cookie: string | null
  /** Por qué no hay sesión, en castellano, para el aviso. `null` si la hay. */
  motivo: string | null
  /** Cuándo se abrió (ms epoch). */
  abiertaEn: number
}

const SIN_CREDENCIALES: SesionPortal = {
  estado: 'sin-credenciales',
  cookie: null,
  motivo: 'no hay BOE_PORTAL_USUARIO / BOE_PORTAL_PASSWORD configurados',
  abiertaEn: 0,
}

/**
 * Estado recordado durante toda la vida del proceso.
 *
 * `rechazada` se queda pegado A PROPÓSITO: es lo que impide que la siguiente
 * ficha vuelva a probar la contraseña mala y acabe bloqueando la cuenta.
 */
/** No se ha intentado abrir sesión porque no hacía falta (no es un fallo). */
export const SIN_INTENTO: SesionPortal = {
  estado: 'desconocido',
  cookie: null,
  motivo: 'no hacía falta sesión en esta pasada (ninguna ficha con muro pendiente)',
  abiertaEn: 0,
}

let cache: SesionPortal | null = null
/** Login en vuelo, para que N fichas en paralelo no manden N logins. */
let enVuelo: Promise<SesionPortal> | null = null

/** Solo para los tests y para el diagnóstico manual: vuelve a empezar. */
export function olvidarSesionPortal(): void {
  cache = null
  enVuelo = null
}

/**
 * Marca la sesión como caducada. La llama el lector cuando una ficha vuelve a
 * responder como anónima: la siguiente petición reabrirá sesión.
 *
 * No toca `rechazada`: una credencial mala no se rescata reintentando.
 */
export function sesionPortalCaducada(): void {
  if (cache?.estado === 'iniciada') cache = null
}

function credenciales(): { usuario: string; password: string } | null {
  const usuario = (process.env.BOE_PORTAL_USUARIO ?? '').trim()
  const password = process.env.BOE_PORTAL_PASSWORD ?? ''
  if (!usuario || !password) return null
  return { usuario, password }
}

/** Une las cookies recibidas en una cabecera `Cookie`, sin sus atributos. */
function unirCookies(previas: Map<string, string>, set: readonly string[]): Map<string, string> {
  for (const c of set) {
    const par = c.split(';', 1)[0].trim()
    const i = par.indexOf('=')
    if (i > 0) previas.set(par.slice(0, i), par.slice(i + 1))
  }
  return previas
}

function cabeceraCookie(jar: Map<string, string>): string {
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
}

function leerSetCookie(r: Response): string[] {
  return typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : []
}

/**
 * Segundo factor: el Portal ha pedido el código. Se espera al correo, se
 * reenvía el formulario ENTERO (con sus ocultos) y se comprueba el resultado.
 *
 * 🚨 El código va atado a la cookie del intento, no al usuario: por eso todo
 * esto ocurre dentro de la misma ejecución y con el mismo `jar`. Un código
 * correcto enviado con otra sesión es un intento quemado.
 */
async function segundoFactor(html: string, jar: Map<string, string>, intentoEn: Date): Promise<SesionPortal> {
  const form = formularioOtp(html)
  if (!form) {
    return { estado: 'desconocido', cookie: null, motivo: 'el Portal pide código pero no se reconoce su formulario', abiertaEn: 0 }
  }

  const codigo = await esperarCodigoPortal(intentoEn).catch((e) => {
    console.error('[portal-sesion] IMAP', e)
    return null
  })
  if (!codigo) {
    // NUNCA se cae al último código del buzón: sería el de otra sesión.
    return { estado: 'desconocido', cookie: null, motivo: 'no llegó el código de verificación a tiempo', abiertaEn: 0 }
  }

  const destino = new URL(form.action || '/id/login.php', LOGIN).toString()
  const cuerpo = new URLSearchParams({ ...form.campos, [form.campoCodigo]: codigo })

  let html2 = ''
  try {
    const r = await fetch(destino, {
      method: form.method === 'get' ? 'GET' : 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,application/xhtml+xml',
        Cookie: cabeceraCookie(jar),
      },
      body: form.method === 'get' ? undefined : cuerpo.toString(),
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })
    unirCookies(jar, leerSetCookie(r))
    html2 = await r.text()
  } catch (e) {
    return { estado: 'desconocido', cookie: null, motivo: `fallo al enviar el código: ${(e as Error).message}`, abiertaEn: 0 }
  }

  const res = interpretarLogin(html2, [...jar.keys()])
  if (res.estado !== 'iniciada') {
    return { estado: res.estado, cookie: null, motivo: res.motivo ?? 'el código no abrió sesión', abiertaEn: 0 }
  }
  return { estado: 'iniciada', cookie: cabeceraCookie(jar), motivo: null, abiertaEn: Date.now() }
}

async function abrir(): Promise<SesionPortal> {
  const cred = credenciales()
  if (!cred) return SIN_CREDENCIALES

  const cuerpo = new URLSearchParams({
    usuario: cred.usuario,
    password: cred.password,
    conectar: 'Conectar',
  })

  // Se sella ANTES del POST: es el suelo de frescura del código. Sellarlo
  // después dejaría fuera el correo que llega mientras la petición viaja.
  const intentoEn = new Date()
  const jar = new Map<string, string>()

  let html = ''
  try {
    const r = await fetch(LOGIN, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,application/xhtml+xml',
      },
      body: cuerpo.toString(),
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })
    unirCookies(jar, leerSetCookie(r))
    html = await r.text()
  } catch (e) {
    // Fallo de RED: no se sabe si las credenciales valen. Reintentable, y sobre
    // todo NO se apunta como rechazo (que sería no volver a intentarlo nunca).
    return {
      estado: 'desconocido',
      cookie: null,
      motivo: `no se pudo contactar con el Portal: ${(e as Error).message}`,
      abiertaEn: 0,
    }
  }

  const r = interpretarLogin(html, [...jar.keys()])
  // Credenciales rechazadas: se corta aquí y no se reintenta jamás.
  if (r.estado === 'rechazada') return { estado: r.estado, cookie: null, motivo: r.motivo, abiertaEn: 0 }
  if (r.estado === 'iniciada') {
    return { estado: 'iniciada', cookie: cabeceraCookie(jar), motivo: null, abiertaEn: Date.now() }
  }
  // Ni sesión ni rechazo: si lo que hay es la pantalla del código, se resuelve.
  if (pideCodigo(html)) return segundoFactor(html, jar, intentoEn)
  return { estado: r.estado, cookie: null, motivo: r.motivo, abiertaEn: 0 }
}

/**
 * Sesión utilizable, abriéndola si hace falta.
 *
 * NUNCA lanza: sin sesión el lector sigue funcionando en anónimo — peor, pero
 * honesto, porque el muro documental queda registrado como lo que es.
 */
export async function sesionPortal(): Promise<SesionPortal> {
  // Un rechazo o la falta de credenciales son definitivos para este proceso.
  if (cache && (cache.estado === 'rechazada' || cache.estado === 'sin-credenciales')) return cache
  if (cache?.estado === 'iniciada' && Date.now() - cache.abiertaEn < VIDA_SESION_MS) return cache
  if (enVuelo) return enVuelo

  enVuelo = abrir()
    .then((s) => {
      // El `desconocido` por red NO se cachea: es reintentable en la siguiente ficha.
      cache = s.estado === 'desconocido' ? null : s
      return s
    })
    .finally(() => {
      enVuelo = null
    })
  return enVuelo
}

/**
 * Cabeceras para pedirle una página al Portal, con sesión si la hay.
 */
export function cabecerasPortal(s: SesionPortal | null, extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { 'User-Agent': UA, ...extra }
  if (s?.cookie) h.Cookie = s.cookie
  return h
}

/** Frase para el aviso/diagnóstico. Dice SIEMPRE si se está leyendo a ciegas. */
export function titularSesionPortal(s: SesionPortal): string {
  switch (s.estado) {
    case 'iniciada':
      return '🔓 Sesión abierta en el Portal del BOE: se leen también los documentos que exigen identificarse.'
    case 'sin-credenciales':
      return '🔒 Sin credenciales del Portal: las subastas con muro documental se quedan sin leer (configura BOE_PORTAL_USUARIO y BOE_PORTAL_PASSWORD).'
    case 'rechazada':
      return `🚨 El Portal RECHAZA las credenciales y no se reintenta para no bloquear la cuenta: ${s.motivo}. Entra a mano en subastas.boe.es y revísalas.`
    case 'desconocido':
      return `⚠️ No se ha podido abrir sesión en el Portal (${s.motivo}): esta pasada lee en anónimo.`
  }
}

/**
 * SOLO DIAGNÓSTICO: hace el primer POST del login y devuelve el HTML crudo de
 * la respuesta, sin enviar ningún código. Es la forma de capturar la pantalla
 * del segundo factor para escribir su parser contra el documento REAL en vez
 * de contra una suposición (regla de la casa: nada de parsers a ciegas).
 *
 * No devuelve cookies ni credenciales: solo la página, que no contiene ningún
 * secreto — el código viaja por correo y SMS, nunca en el HTML.
 */
export async function volcarLoginPortal(): Promise<{ estado: EstadoPortal; pideCodigo: boolean; html: string }> {
  const cred = credenciales()
  if (!cred) return { estado: 'sin-credenciales', pideCodigo: false, html: '' }
  const cuerpo = new URLSearchParams({ usuario: cred.usuario, password: cred.password, conectar: 'Conectar' })
  const r = await fetch(LOGIN, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html,application/xhtml+xml' },
    body: cuerpo.toString(),
    redirect: 'follow',
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  })
  const html = await r.text()
  const cookies = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : []
  return { estado: interpretarLogin(html, cookies).estado, pideCodigo: pideCodigo(html), html }
}
