/**
 * Cliente mínimo de Google OAuth + People API por `fetch` (05/10/2026). Sin `googleapis`: son
 * nueve llamadas y el paquete entero pesa decenas de MB en la función de Vercel.
 *
 * 🚨 Los tokens NUNCA salen de aquí en un mensaje: `ErrorGoogle` lleva el status y el cuerpo de
 * Google (que no los incluye), jamás la petición. Nada de `console.log` de cabeceras ni cuerpos.
 *
 * Reintentos: 429 y 5xx con backoff (`Retry-After` si viene) hasta `MAX_INTENTOS`; el resto se
 * lanza tal cual. Las mutaciones se mandan EN SERIE (Google lo pide para el mismo usuario).
 * Sin BD: la orquestación vive en `lib/google-contactos.ts`. Lo prueba `google-people.test.ts`.
 */
import {
  esReintentable, esperaReintento, syncTokenCaducado, MASCARA_GESTIONADA, NOMBRE_GRUPO_GOOGLE,
  type PersonaGoogle, type PersonaParaEscribir,
} from '@central/module-seguros/google-contactos'

export const SCOPE_CONTACTOS = 'https://www.googleapis.com/auth/contacts'
/** `openid email` (no sensibles) solo para saber QUÉ cuenta se conectó. */
export const SCOPES_PEDIDOS = [SCOPE_CONTACTOS, 'openid', 'email']
const PEOPLE = 'https://people.googleapis.com/v1'
const TOKEN = 'https://oauth2.googleapis.com/token'
const REVOKE = 'https://oauth2.googleapis.com/revoke'
const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
/** Campos que se LEEN de cada persona. Un syncToken solo vale con los MISMOS campos. */
export const CAMPOS_LECTURA = 'names,phoneNumbers,emailAddresses,organizations,externalIds,memberships,metadata,biographies,urls,birthdays'
const MAX_INTENTOS = 5

export class ErrorGoogle extends Error {
  status: number
  cuerpo: string
  constructor(status: number, cuerpo: string, donde: string) {
    super(`Google ${donde} respondió ${status}: ${cuerpo.slice(0, 300)}`)
    this.status = status
    this.cuerpo = cuerpo
  }
}
export class SyncTokenCaducado extends Error {}

export type Credenciales = { clientId: string; clientSecret: string; redirectUri: string }

export type Red = {
  fetch: typeof fetch
  dormir: (ms: number) => Promise<void>
}
export const redPorDefecto: Red = { fetch: (...a) => fetch(...a), dormir: (ms) => new Promise((r) => setTimeout(r, ms)) }

async function llamar(red: Red, url: string, init: RequestInit, donde: string): Promise<Response> {
  for (let intento = 0; ; intento++) {
    const res = await red.fetch(url, init)
    if (res.ok) return res
    if (esReintentable(res.status) && intento < MAX_INTENTOS - 1) {
      await red.dormir(esperaReintento(intento, res.headers.get('retry-after')))
      continue
    }
    throw new ErrorGoogle(res.status, await res.text().catch(() => ''), donde)
  }
}

async function json<T>(red: Red, url: string, init: RequestInit, donde: string): Promise<T> {
  const res = await llamar(red, url, init, donde)
  const t = await res.text()
  return (t ? JSON.parse(t) : {}) as T
}

const form = (o: Record<string, string>) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(o).toString(),
})

// ─── OAuth ────────────────────────────────────────────────────────────────────

export function urlAutorizacion(c: Credenciales, state: string): string {
  const q = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: 'code',
    scope: SCOPES_PEDIDOS.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `${AUTH}?${q.toString()}`
}

export type TokensIniciales = { refreshToken: string; scopes: string[]; cuentaGoogle: string | null }

/** Canjea el `code`. Sin refresh token o sin el scope de contactos → lanza (no se guarda nada). */
export async function canjearCodigo(c: Credenciales, code: string, red: Red = redPorDefecto): Promise<TokensIniciales> {
  const r = await json<{ refresh_token?: string; scope?: string; id_token?: string }>(red, TOKEN, form({
    code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: c.redirectUri, grant_type: 'authorization_code',
  }), 'token')
  const scopes = (r.scope ?? '').split(/\s+/).filter(Boolean)
  if (!scopes.includes(SCOPE_CONTACTOS)) throw new Error('Google no concedió el permiso de contactos (casilla desmarcada en la pantalla de consentimiento)')
  if (!r.refresh_token) throw new Error('Google no devolvió refresh token (¿acceso ya concedido sin prompt=consent?)')
  return { refreshToken: r.refresh_token, scopes, cuentaGoogle: emailDeIdToken(r.id_token) }
}

/**
 * El email del `id_token`. Llega por TLS directamente del endpoint de token de Google, así que
 * (OIDC §3.1.3.7) no hace falta verificar la firma para LEERLO; solo se usa para informar.
 */
export function emailDeIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null
  try {
    const p = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8'))
    return typeof p.email === 'string' ? p.email : null
  } catch {
    return null
  }
}

export class TokenRevocado extends Error {}

export async function accesoDesdeRefresh(c: Credenciales, refreshToken: string, red: Red = redPorDefecto): Promise<string> {
  try {
    const r = await json<{ access_token?: string }>(red, TOKEN, form({
      client_id: c.clientId, client_secret: c.clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token',
    }), 'token')
    if (!r.access_token) throw new Error('Google no devolvió access token')
    return r.access_token
  } catch (e) {
    if (e instanceof ErrorGoogle && e.status === 400 && /invalid_grant/.test(e.cuerpo)) {
      throw new TokenRevocado('El refresh token ya no vale (revocado o caducado): hay que volver a conectar')
    }
    throw e
  }
}

/**
 * ¿Se revoca el refresh token ANTERIOR al reconectar? Solo si era de OTRA cuenta de Google.
 * `oauth2/revoke` retira el GRANT entero (cliente + usuario), no un token suelto: revocar el viejo
 * de la MISMA cuenta mataba también el nuevo recién guardado y la sincronización quedaba
 * `revocada` en la pasada siguiente. Con una de las dos cuentas desconocida (`null`) no se sabe
 * si es la misma: no se revoca (el viejo ya no está en la BD; matar el nuevo rompe la conexión).
 */
export function debeRevocarAnterior(p: { cuentaAnterior: string | null; cuentaNueva: string | null; tokenAnterior: string; tokenNuevo: string }): boolean {
  if (p.tokenAnterior === p.tokenNuevo) return false
  return p.cuentaAnterior !== null && p.cuentaNueva !== null && p.cuentaAnterior !== p.cuentaNueva
}

/** Revoca en Google. Un 400 «invalid_token» es que YA estaba revocado: cuenta como hecho. */
export async function revocar(token: string, red: Red = redPorDefecto): Promise<void> {
  try {
    await llamar(red, REVOKE, form({ token }), 'revoke')
  } catch (e) {
    if (e instanceof ErrorGoogle && e.status === 400) return
    throw e
  }
}

// ─── People API ───────────────────────────────────────────────────────────────

export class People {
  private token: string
  private red: Red
  constructor(token: string, red: Red = redPorDefecto) {
    this.token = token
    this.red = red
  }

  private init(method: string, body?: unknown): RequestInit {
    return {
      method,
      headers: { authorization: `Bearer ${this.token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }
  }

  /**
   * Lista las conexiones. Con `syncToken` solo devuelve lo cambiado (incluidos borrados con
   * `metadata.deleted`); si el token caducó lanza `SyncTokenCaducado` y quien llama hace el
   * listado completo. Siempre pide un `nextSyncToken` nuevo.
   */
  async listar(syncToken: string | null): Promise<{ personas: PersonaGoogle[]; nextSyncToken: string | null; totalCuenta: number | null }> {
    const personas: PersonaGoogle[] = []
    let pageToken: string | undefined
    let nextSyncToken: string | null = null
    let totalCuenta: number | null = null
    do {
      const q = new URLSearchParams({ personFields: CAMPOS_LECTURA, pageSize: '1000', requestSyncToken: 'true' })
      if (syncToken) q.set('syncToken', syncToken)
      if (pageToken) q.set('pageToken', pageToken)
      let r: { connections?: PersonaGoogle[]; nextPageToken?: string; nextSyncToken?: string; totalPeople?: number }
      try {
        r = await json(this.red, `${PEOPLE}/people/me/connections?${q}`, this.init('GET'), 'connections.list')
      } catch (e) {
        if (syncToken && e instanceof ErrorGoogle && syncTokenCaducado(e.status, e.cuerpo)) throw new SyncTokenCaducado('syncToken caducado')
        throw e
      }
      personas.push(...(r.connections ?? []))
      pageToken = r.nextPageToken
      if (r.nextSyncToken) nextSyncToken = r.nextSyncToken
      if (!syncToken && typeof r.totalPeople === 'number') totalCuenta = r.totalPeople
    } while (pageToken)
    return { personas, nextSyncToken, totalCuenta }
  }

  /** UN contacto, solo su nombre (SOLO LECTURA; «Unificar» lee el nombre actual para el mote). */
  async obtenerNombre(resourceName: string): Promise<PersonaGoogle> {
    const q = new URLSearchParams({ personFields: 'names' })
    return json(this.red, `${PEOPLE}/${resourceName}?${q}`, this.init('GET'), 'people.get')
  }

  /** El grupo «Grupo ASegura» por nombre, SOLO LECTURA (la simulación): `null` si no existe. */
  async buscarGrupo(): Promise<string | null> {
    let pageToken: string | undefined
    do {
      const q = new URLSearchParams({ pageSize: '1000' })
      if (pageToken) q.set('pageToken', pageToken)
      const r = await json<{ contactGroups?: { resourceName: string; name?: string; groupType?: string }[]; nextPageToken?: string }>(
        this.red, `${PEOPLE}/contactGroups?${q}`, this.init('GET'), 'contactGroups.list')
      const g = r.contactGroups?.find((x) => x.groupType === 'USER_CONTACT_GROUP' && x.name === NOMBRE_GRUPO_GOOGLE)
      if (g) return g.resourceName
      pageToken = r.nextPageToken
    } while (pageToken)
    return null
  }

  /** El grupo «Grupo ASegura»: lo busca por nombre y, si no existe, lo crea. */
  async asegurarGrupo(): Promise<string> {
    const ya = await this.buscarGrupo()
    if (ya) return ya
    const nuevo = await json<{ resourceName: string }>(this.red, `${PEOPLE}/contactGroups`,
      this.init('POST', { contactGroup: { name: NOMBRE_GRUPO_GOOGLE } }), 'contactGroups.create')
    return nuevo.resourceName
  }

  async miembrosGrupo(grupo: string): Promise<string[]> {
    const r = await json<{ memberResourceNames?: string[] }>(this.red, `${PEOPLE}/${grupo}?maxMembers=30000`, this.init('GET'), 'contactGroups.get')
    return r.memberResourceNames ?? []
  }

  async anadirAlGrupo(grupo: string, resourceNames: string[]): Promise<void> {
    for (let i = 0; i < resourceNames.length; i += 1000) {
      await json(this.red, `${PEOPLE}/${grupo}/members:modify`,
        this.init('POST', { resourceNamesToAdd: resourceNames.slice(i, i + 1000) }), 'members.modify')
    }
  }

  /** ≤200. Devuelve, en el MISMO orden, el contacto creado o `null` si ese falló. */
  async crearLote(personas: PersonaParaEscribir[]): Promise<(PersonaGoogle | null)[]> {
    const r = await json<{ createdPeople?: { person?: PersonaGoogle; httpStatusCode?: number }[] }>(
      this.red, `${PEOPLE}/people:batchCreateContacts`,
      this.init('POST', { contacts: personas.map((p) => ({ contactPerson: p })), readMask: CAMPOS_LECTURA }), 'batchCreateContacts')
    const creados = r.createdPeople ?? []
    return personas.map((_, i) => {
      const c = creados[i]
      return c?.person && (c.httpStatusCode === undefined || c.httpStatusCode === 200) ? c.person : null
    })
  }

  /** ≤200. Solo los campos de `MASCARA_GESTIONADA`: nada más del contacto se pisa. */
  async actualizarLote(porRecurso: Record<string, PersonaParaEscribir>): Promise<Record<string, PersonaGoogle | null>> {
    const r = await json<{ updateResult?: Record<string, { person?: PersonaGoogle; httpStatusCode?: number }> }>(
      this.red, `${PEOPLE}/people:batchUpdateContacts`,
      this.init('POST', { contacts: porRecurso, updateMask: MASCARA_GESTIONADA, readMask: CAMPOS_LECTURA }), 'batchUpdateContacts')
    const out: Record<string, PersonaGoogle | null> = {}
    for (const rn of Object.keys(porRecurso)) {
      const u = r.updateResult?.[rn]
      out[rn] = u?.person && (u.httpStatusCode === undefined || u.httpStatusCode === 200) ? u.person : null
    }
    return out
  }

  /** ≤500. */
  async borrarLote(resourceNames: string[]): Promise<void> {
    if (resourceNames.length === 0) return
    await json(this.red, `${PEOPLE}/people:batchDeleteContacts`, this.init('POST', { resourceNames }), 'batchDeleteContacts')
  }

  async borrarGrupo(grupo: string): Promise<void> {
    await llamar(this.red, `${PEOPLE}/${grupo}?deleteContacts=false`, this.init('DELETE'), 'contactGroups.delete')
  }
}
