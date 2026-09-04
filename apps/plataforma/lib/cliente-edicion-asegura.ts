// Editar y dar de alta clientes de la correduría desde la pantalla de Alberto.
//
// La BD de la cartera vive en `apps/asegura`; esta app habla con su puerto
// (`/api/operador/cliente` y `/api/operador/cliente/contactos`) con el secreto
// de operador. Aquí hay dos cosas separadas a propósito:
//
//   1. Lo PURO: leer los bloques nuevos de la ficha (`contactos`, `identidad`)
//      e interpretar las respuestas de escritura (ok / conflicto / inválido…).
//      Tiene test en `test/regression-cliente-edicion-asegura.test.ts` y lo
//      importan también los client components (no toca red ni env).
//   2. La RED: las llamadas al puerto, solo desde las rutas API de plataforma.
//
// Regla de siempre: `null` = «no se ha podido consultar», `[]` = «se miró y no
// hay». Un `contactos: null` NUNCA se pinta como «no tiene teléfono».

import type { Coincidencia, ContactoCliente, TipoContacto } from '@central/module-seguros'

// ─── Bloques de la ficha ─────────────────────────────────────────────────────

export type ContactosCliente = { telefonos: ContactoCliente[]; emails: ContactoCliente[] }

export type IdentidadFicha = {
  nombre: string
  apellidos: string
  /** «*****678Z». `null` = sin DNI (o cifrado que no abre: mira `dniIlegible`). */
  dniEnmascarado: string | null
  dniIlegible: boolean
  /** `YYYY-MM-DD`. */
  fechaNacimiento: string | null
  fechaNacimientoIlegible: boolean
  tipoPersona: string | null
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

export function leerContacto(v: unknown): ContactoCliente | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.id !== 'string' || (o.tipo !== 'telefono' && o.tipo !== 'email')) return null
  return {
    id: o.id,
    tipo: o.tipo as TipoContacto,
    valor: cadena(o.valor),
    ilegible: o.ilegible === true,
    etiqueta: cadena(o.etiqueta),
    principal: o.principal === true,
    creado: cadena(o.creado) ?? '',
  }
}

/**
 * El bloque de contactos, o `null` si no llega o llega sin forma de lista.
 * Una fila rara se salta (no tumba el bloque); una LISTA que no es lista
 * degrada a `null` entero — jamás a `[]`, que diría «no tiene».
 */
export function leerContactos(v: unknown): ContactosCliente | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (!Array.isArray(o.telefonos) || !Array.isArray(o.emails)) return null
  const lee = (l: unknown[], tipo: TipoContacto) =>
    l.map(leerContacto).filter((c): c is ContactoCliente => c !== null && c.tipo === tipo)
  return { telefonos: lee(o.telefonos, 'telefono'), emails: lee(o.emails, 'email') }
}

/** El bloque de identidad, o `null` si asegura no lo manda (versión anterior). */
export function leerIdentidad(v: unknown): IdentidadFicha | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.nombre !== 'string') return null
  return {
    nombre: o.nombre,
    apellidos: typeof o.apellidos === 'string' ? o.apellidos : '',
    dniEnmascarado: cadena(o.dniEnmascarado),
    dniIlegible: o.dniIlegible === true,
    fechaNacimiento: cadena(o.fechaNacimiento),
    fechaNacimientoIlegible: o.fechaNacimientoIlegible === true,
    tipoPersona: cadena(o.tipoPersona),
  }
}

// ─── Respuestas ──────────────────────────────────────────────────────────────

export type RespuestaContactos =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }
  | { estado: 'no_encontrado' }
  | { estado: 'ok'; contactos: ContactosCliente }

/** `GET /api/operador/cliente/contactos` → tipado. */
export function interpretarContactos(status: number, json: unknown): RespuestaContactos {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status === 404) return { estado: 'no_encontrado' }
  if (typeof json !== 'object' || json === null) return { estado: 'error', motivo: `HTTP ${status}` }
  const o = json as Record<string, unknown>
  if (o.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (o.estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (o.estado !== 'ok') return { estado: 'error', motivo: cadena(o.causa) ?? cadena(o.motivo) ?? 'asegura_error' }
  const contactos = leerContactos({ telefonos: o.telefonos, emails: o.emails })
  if (contactos === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
  return { estado: 'ok', contactos }
}

/**
 * Lo que devuelve CUALQUIER escritura (alta, edición, contactos). Los estados
 * son los del contrato del puerto; `contactos` viene en las de contactos y
 * `id` en el alta. `error` es «no se pudo hacer», que NO es «no se hizo por
 * un motivo»: eso último es `invalido` o `conflicto`, y llevan su porqué.
 */
export type ResultadoEscritura =
  | { estado: 'ok'; id: string | null; contacto: ContactoCliente | null; contactos: ContactosCliente | null }
  | { estado: 'conflicto'; coincidencias: Coincidencia[]; forzable: boolean }
  | { estado: 'invalido'; motivo: string; campo: string | null }
  | { estado: 'no_encontrado' }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

const POR = new Set(['dni', 'telefono', 'email'])

export function leerCoincidencias(v: unknown): Coincidencia[] {
  if (!Array.isArray(v)) return []
  const out: Coincidencia[] = []
  for (const fila of v) {
    if (typeof fila !== 'object' || fila === null) continue
    const c = fila as Record<string, unknown>
    if (typeof c.id !== 'string' || typeof c.por !== 'string' || !POR.has(c.por)) continue
    out.push({ id: c.id, nombre: cadena(c.nombre) ?? 'sin nombre', por: c.por as Coincidencia['por'], tipo: cadena(c.tipo) ?? 'sin_informar' })
  }
  return out
}

export function interpretarEscritura(status: number, json: unknown): ResultadoEscritura {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 404 || o.estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (status === 409 || o.estado === 'conflicto') {
    return { estado: 'conflicto', coincidencias: leerCoincidencias(o.coincidencias), forzable: o.forzable === true }
  }
  if (status === 422 || o.estado === 'invalido') {
    return { estado: 'invalido', motivo: cadena(o.motivo) ?? 'datos no válidos', campo: cadena(o.campo) }
  }
  if ((status === 200 || status === 201) && o.estado === 'ok') {
    return {
      estado: 'ok',
      id: cadena(o.id),
      contacto: leerContacto(o.contacto),
      contactos: leerContactos(o.contactos),
    }
  }
  return { estado: 'error', motivo: cadena(o.causa) ?? cadena(o.motivo) ?? cadena(o.error) ?? `HTTP ${status}` }
}

// ─── Descartar / restaurar una ficha ────────────────────────────────────────
//
// 🚨 No es un borrado: asegura pone `clientes.activo = false` y la ficha deja de
// salir en el buscador, la lista y los contadores. Se deshace con «Restaurar».
//
// Los estados NO se colapsan, y aquí importa especialmente:
//   · `no_encontrado` = se miró y esa ficha no está.
//   · `error`         = no se ha podido hacer (o ni siquiera comprobar). NO es
//                       lo mismo, y por eso `no_se_pudo_comprobar_polizas` es un
//                       error y no un «adelante»: si asegura no ha podido contar
//                       las pólizas vivas, la ficha NO se descarta.
//   · `tiene_polizas_vivas` = se comprobó y sí las tiene, con cuántas.

export type ResultadoDescarte =
  | { estado: 'ok'; activo: boolean; yaEstaba: boolean }
  | { estado: 'tiene_polizas_vivas'; polizasVivas: number | null }
  | { estado: 'invalido'; motivo: string }
  | { estado: 'no_encontrado' }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }

function entero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null
}

/**
 * `DELETE /api/operador/cliente` y `POST /api/operador/cliente?restaurar` → tipado.
 *
 * `polizasVivas: null` cuando asegura dice que las tiene pero no manda cuántas:
 * la pantalla escribe «tiene pólizas vivas» sin número, jamás «tiene 0».
 */
export function interpretarDescarte(status: number, json: unknown): ResultadoDescarte {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 404 || o.estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (o.motivo === 'tiene_polizas_vivas') {
    return { estado: 'tiene_polizas_vivas', polizasVivas: entero(o.polizasVivas) }
  }
  if (status === 422 || o.estado === 'invalido') {
    return { estado: 'invalido', motivo: cadena(o.motivo) ?? 'datos no válidos' }
  }
  if (status === 200 && o.estado === 'ok') {
    return { estado: 'ok', activo: o.activo === true, yaEstaba: o.yaEstaba === true }
  }
  return { estado: 'error', motivo: cadena(o.causa) ?? cadena(o.motivo) ?? cadena(o.error) ?? `HTTP ${status}` }
}

/** El motivo del puerto, en castellano de pantalla. Los que ya son frase se dejan. */
export function textoMotivo(motivo: string): string {
  switch (motivo) {
    case 'documento_requerido':
      return 'Para cambiar DNI, nombre, apellidos o fecha de nacimiento hace falta el DNI en la ficha (regla: se pide documentado).'
    case 'documento_no_acredita':
      return 'Ese documento no sirve: tiene que ser un DNI RECIBIDO de este mismo cliente.'
    case 'secreto_rechazado':
      return 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos).'
    case 'respuesta_ilegible':
      return 'la respuesta de asegura no tenía la forma esperada.'
    case 'asegura_error':
      return 'asegura respondió, pero no pudo escribir en su base de datos.'
    case 'no_se_pudo_comprobar_polizas':
      return 'no se ha podido comprobar si la ficha tiene pólizas vivas, así que NO se ha descartado. Vuelve a intentarlo.'
    case 'tiene_polizas_vivas':
      return 'la ficha tiene pólizas vivas: no se descarta.'
    case 'red':
      return 'no se pudo llegar a asegura (timeout, DNS o TLS).'
    default:
      return motivo
  }
}

/**
 * Qué casilla del alta rellena un término del buscador que no encontró a nadie
 * («¿No está? Darlo de alta»). Por forma, sin el módulo de PII (que no está en
 * plataforma): `@` → email · 9 dígitos → teléfono · DNI/NIE → dni · resto → nombre.
 */
export type CampoTermino = 'email' | 'telefono' | 'dni' | 'nombre'

export function campoDesdeTermino(q: string): CampoTermino {
  const s = q.trim()
  if (s.includes('@')) return 'email'
  const compacto = s.replace(/[\s.\-()]/g, '')
  if (/^(\+34|0034)?\d{9}$/.test(compacto)) return 'telefono'
  const id = compacto.toUpperCase()
  if (/^\d{8}[A-Z]$/.test(id) || /^[XYZ]\d{7}[A-Z]$/.test(id)) return 'dni'
  return 'nombre'
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

export function contactosAsegura(clienteId: string): Promise<Reenvio> {
  return llamar(`/api/operador/cliente/contactos?id=${encodeURIComponent(clienteId)}`, { method: 'GET' })
}

export function anadirContactoAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/cliente/contactos', { method: 'POST', body: JSON.stringify(body) })
}

export function cambiarContactoAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/cliente/contactos', { method: 'PATCH', body: JSON.stringify(body) })
}

export function borrarContactoAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/cliente/contactos', { method: 'DELETE', body: JSON.stringify(body) })
}

/** `PATCH /api/operador/cliente` — edición. El `actor` lo pone la ruta (sesión). */
export function editarClienteAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/cliente', { method: 'PATCH', body: JSON.stringify(body) })
}

/** `POST /api/operador/cliente` — alta. */
export function altaClienteAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/cliente', { method: 'POST', body: JSON.stringify(body) })
}

/** `DELETE /api/operador/cliente` — DESCARTA la ficha (borrado suave, reversible). */
export function descartarClienteAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/cliente', { method: 'DELETE', body: JSON.stringify(body) })
}

/** `POST /api/operador/cliente?restaurar` — deshace el descarte. */
export function restaurarClienteAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/cliente?restaurar=1', { method: 'POST', body: JSON.stringify(body) })
}

/**
 * `POST /api/operador/cliente/historial` — anota una fila de historial en una
 * ficha que ya existe (`{ clienteId, tipo, texto, actor? }`). Lo usa el canal de
 * leads web cuando el teléfono/email ya está en la cartera: no se duplica la
 * ficha, se anota el contacto.
 */
export function historialClienteAsegura(body: Record<string, unknown>): Promise<Reenvio> {
  return llamar('/api/operador/cliente/historial', { method: 'POST', body: JSON.stringify(body) })
}
