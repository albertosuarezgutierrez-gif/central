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
import { interpretarLogin, type EstadoLogin } from '@central/module-subastas'

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

async function abrir(): Promise<SesionPortal> {
  const cred = credenciales()
  if (!cred) return SIN_CREDENCIALES

  const cuerpo = new URLSearchParams({
    usuario: cred.usuario,
    password: cred.password,
    conectar: 'Conectar',
  })

  let html = ''
  let cookies: string[] = []
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
    // `getSetCookie()` conserva las cabeceras repetidas; `get('set-cookie')` las
    // pega en una sola cadena y parte mal las que llevan `expires=…, dd-Mon`.
    cookies = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : []
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

  const r = interpretarLogin(html, cookies)
  if (r.estado !== 'iniciada') {
    return { estado: r.estado, cookie: null, motivo: r.motivo, abiertaEn: 0 }
  }

  // Solo el par nombre=valor: el resto de atributos (Path, HttpOnly, expires…)
  // no van en la cabecera `Cookie` y algunos servidores rechazan la petición.
  const cookie = cookies
    .map((c) => c.split(';', 1)[0].trim())
    .filter(Boolean)
    .join('; ')

  return { estado: 'iniciada', cookie, motivo: null, abiertaEn: Date.now() }
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
