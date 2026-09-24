/**
 * «Configuración» — el cliente gestiona TODOS sus teléfonos y correos, no solo
 * el principal.
 *
 * ─── Por qué esto es distinto de «Mis datos» (`lib/mis-datos.ts`) ───────────
 * `guardarMisDatos()` solo sabe SUSTITUIR el canal principal: escribe uno
 * nuevo y el que había baja a secundario (no se pierde, pero desaparece de la
 * pantalla). Alberto pidió que el cliente pueda **autogestionarse** — añadir
 * un segundo teléfono, marcar cuál usar, borrar uno que ya no vale — igual que
 * ya puede hacer el corredor desde `/correduria/cliente/contactos`. Es la
 * MISMA capacidad del backend (`anadirContacto`/`cambiarContacto`/
 * `borrarContacto` de `apps/asegura/lib/cartera-edicion.ts`), expuesta al
 * cliente por un puerto propio (`/api/portal/contactos`) que **nunca** acepta
 * forzar un duplicado: si el valor ya es el principal de OTRA ficha, lo
 * resuelve el corredor, no un botón del portal.
 *
 * ─── El VALOR de un contacto no se toca desde aquí ───────────────────────────
 * Cambiar el número de un teléfono ya existente sigue siendo
 * `guardarMisDatos()` (sustituye el principal); esto es AÑADIR uno nuevo,
 * decidir cuál es el PRINCIPAL, o BORRARLO. Dos módulos para dos gestos
 * distintos, como ya hace el corredor.
 */
import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config'

export type TipoContactoPropio = 'telefono' | 'email'

export type ContactoPropioFila = {
  id: string
  tipo: TipoContactoPropio
  valor: string | null
  ilegible: boolean
  etiqueta: string | null
  principal: boolean
  creado: string
}

export type ListaContactosPropios = { telefonos: ContactoPropioFila[]; emails: ContactoPropioFila[] }

export type ResultadoListaContactos =
  | { estado: 'ok'; contactos: ListaContactosPropios }
  | { estado: 'sin_ficha' }
  | { estado: 'varias_fichas' }
  | { estado: 'sin_puente' }
  | { estado: 'error'; causa: string }

export type ResultadoEscrituraContacto =
  | { estado: 'ok'; contactos: ListaContactosPropios }
  | { estado: 'invalido'; motivo: string; campo?: string }
  /** Ese valor ya es principal en OTRA ficha. No se fuerza desde el portal. */
  | { estado: 'conflicto'; campo?: string }
  | { estado: 'no_encontrado' }
  | { estado: 'sin_ficha' }
  | { estado: 'varias_fichas' }
  /** El puente no está configurado en este despliegue. NO es «falló el envío». */
  | { estado: 'sin_puente' }
  | { estado: 'error'; causa: string }

function puente(): { base: string; secret: string } | null {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return null
  return { base: base.replace(/\/+$/, ''), secret }
}

function contactosDe(j: Record<string, unknown>): ListaContactosPropios {
  const c = (j.contactos ?? {}) as Record<string, unknown>
  const lista = (v: unknown): ContactoPropioFila[] =>
    Array.isArray(v)
      ? v.map((f) => {
          const o = (f ?? {}) as Record<string, unknown>
          return {
            id: typeof o.id === 'string' ? o.id : '',
            tipo: o.tipo === 'email' ? 'email' : 'telefono',
            valor: typeof o.valor === 'string' ? o.valor : null,
            ilegible: o.ilegible === true,
            etiqueta: typeof o.etiqueta === 'string' ? o.etiqueta : null,
            principal: o.principal === true,
            creado: typeof o.creado === 'string' ? o.creado : '',
          }
        })
      : []
  return { telefonos: lista(c.telefonos), emails: lista(c.emails) }
}

export async function listarContactosPropios(identidadId: string): Promise<ResultadoListaContactos> {
  const p = puente()
  if (!p) return { estado: 'sin_puente' }
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const res = await fetch(`${p.base}/api/portal/contactos?identidadId=${encodeURIComponent(identidadId)}`, {
      headers: { authorization: `Bearer ${p.secret}` },
      cache: 'no-store',
      signal: control.signal,
    })
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
    const estado = typeof j?.estado === 'string' ? j.estado : null
    if (res.ok && estado === 'ok') return { estado: 'ok', contactos: contactosDe(j!) }
    if (estado === 'sin_ficha') return { estado: 'sin_ficha' }
    if (estado === 'varias_fichas') return { estado: 'varias_fichas' }
    if (estado === 'sin_configurar') return { estado: 'sin_puente' }
    console.error(`[portal/contactos-propios] lectura inesperada del puente: ${res.status} ${estado ?? 'sin estado'}`)
    return { estado: 'error', causa: `puente_${res.status}` }
  } catch (e) {
    const abortado = e instanceof Error && e.name === 'AbortError'
    console.error('[portal/contactos-propios] el puente no respondió a la lectura:', abortado ? 'timeout' : e instanceof Error ? e.message : e)
    return { estado: 'error', causa: abortado ? 'timeout' : 'red' }
  } finally {
    clearTimeout(reloj)
  }
}

/** Traduce una respuesta de escritura (POST/PATCH/DELETE) del puerto de contactos. */
function traducirEscritura(res: Response, j: Record<string, unknown> | null): ResultadoEscrituraContacto {
  const estado = typeof j?.estado === 'string' ? j.estado : null
  if (res.ok && estado === 'ok') return { estado: 'ok', contactos: contactosDe(j!) }
  if (estado === 'invalido') {
    return { estado: 'invalido', motivo: typeof j?.motivo === 'string' ? j.motivo : 'dato no válido', campo: typeof j?.campo === 'string' ? j.campo : undefined }
  }
  if (estado === 'conflicto') return { estado: 'conflicto', campo: typeof j?.campo === 'string' ? j.campo : undefined }
  if (estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (estado === 'sin_ficha') return { estado: 'sin_ficha' }
  if (estado === 'varias_fichas') return { estado: 'varias_fichas' }
  if (estado === 'sin_configurar') return { estado: 'sin_puente' }
  console.error(`[portal/contactos-propios] escritura inesperada del puente: ${res.status} ${estado ?? 'sin estado'}`)
  return { estado: 'error', causa: `puente_${res.status}` }
}

async function escribir(ruta: string, init: RequestInit): Promise<ResultadoEscrituraContacto> {
  const p = puente()
  if (!p) return { estado: 'sin_puente' }
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const res = await fetch(`${p.base}${ruta}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${p.secret}` },
      cache: 'no-store',
      signal: control.signal,
    })
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return traducirEscritura(res, j)
  } catch (e) {
    const abortado = e instanceof Error && e.name === 'AbortError'
    console.error('[portal/contactos-propios] el puente no respondió a la escritura:', abortado ? 'timeout' : e instanceof Error ? e.message : e)
    return { estado: 'error', causa: abortado ? 'timeout' : 'red' }
  } finally {
    clearTimeout(reloj)
  }
}

/** Añade un teléfono o email NUEVO — no sustituye ninguno de los que ya hay. */
export async function anadirContactoPropio(
  identidadId: string,
  entrada: { tipo: TipoContactoPropio; valor: string; etiqueta?: string | null },
): Promise<ResultadoEscrituraContacto> {
  return escribir('/api/portal/contactos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identidadId, ...entrada }),
  })
}

/** Marca ESTE contacto como el principal del canal (el que usan los avisos). */
export async function hacerPrincipalPropio(identidadId: string, id: string): Promise<ResultadoEscrituraContacto> {
  return escribir(`/api/portal/contactos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identidadId, principal: true }),
  })
}

/** Quita un teléfono o email de la lista. Si era el principal, asciende el más antiguo que quede. */
export async function borrarContactoPropio(identidadId: string, id: string): Promise<ResultadoEscrituraContacto> {
  return escribir(`/api/portal/contactos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identidadId }),
  })
}
