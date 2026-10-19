// Parte PURA de la lectura de la respuesta de un lead en su hilo (19/10/2026, spec lead → propuesta F2). La parte con
// BD es `correo-respuesta-lead.ts`. Aquí: validar los cuerpos del puerto, casar el hilo (0 o >1 = no se lee), leer y
// componer `info_riesgo.datosContrato` y los adjuntos.
import { messageIdValido } from './correo-hilo.ts'
import type { ValorContrato } from '@central/module-seguros'

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/
const CLAVE = /^[A-Za-z][A-Za-z0-9.]{0,39}$/
const ID_HILO = /^\d{1,15}$/

export type Casar = { referencias: string[]; from: string }
export type Guardar = { hiloId: string; from: string; gmailMessageId: string; valores: Record<string, ValorContrato>; actor: string }

const obj = (b: unknown): Record<string, unknown> => (typeof b === 'object' && b !== null && !Array.isArray(b) ? (b as Record<string, unknown>) : {})
const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** `{ accion:'casar', referencias[], from }`. PURA. */
export function validarCasar(b: unknown): { ok: true; valor: Casar } | { ok: false; motivo: string } {
  const o = obj(b)
  const referencias = Array.isArray(o.referencias) ? [...new Set(o.referencias.filter(messageIdValido))].slice(0, 50) : []
  if (!referencias.length) return { ok: false, motivo: 'sin referencias válidas' }
  const from = txt(o.from).toLowerCase()
  if (!EMAIL.test(from)) return { ok: false, motivo: 'from no es una dirección simple' }
  return { ok: true, valor: { referencias, from } }
}

/** `{ accion:'guardar', hiloId, from, gmailMessageId, valores{clave: valor}, actor }`. Los valores se revalidan en BD. PURA. */
export function validarGuardar(b: unknown): { ok: true; valor: Guardar } | { ok: false; motivo: string } {
  const o = obj(b)
  const hiloId = txt(String(o.hiloId ?? ''))
  if (!ID_HILO.test(hiloId)) return { ok: false, motivo: 'hiloId no válido' }
  const from = txt(o.from).toLowerCase()
  if (!EMAIL.test(from)) return { ok: false, motivo: 'from no es una dirección simple' }
  if (!messageIdValido(o.gmailMessageId)) return { ok: false, motivo: 'gmailMessageId no válido' }
  const crudos = obj(o.valores)
  const valores: Record<string, ValorContrato> = {}
  for (const [k, v] of Object.entries(crudos).slice(0, 80)) {
    if (!CLAVE.test(k)) continue
    if (typeof v === 'string') {
      const t = v.trim()
      if (t && t.length <= 400) valores[k] = t // vacío tras trim = «no dado»: no se guarda ni bloquea el campo
    }
    else if (typeof v === 'number' && Number.isFinite(v)) valores[k] = v
    else if (typeof v === 'boolean') valores[k] = v
  }
  const actor = txt(o.actor).slice(0, 120)
  if (!actor) return { ok: false, motivo: 'falta el actor' }
  return { ok: true, valor: { hiloId, from, gmailMessageId: o.gmailMessageId as string, valores, actor } }
}

// ─── Casar ────────────────────────────────────────────────────────────────────

export type FilaHilo = { id: string; clienteId: string; raiz: string; oportunidadId: string | null; ramo: string | null }
export type Casado =
  | { estado: 'sin_hilo' }
  /** Casa con hilos de VARIOS clientes o raíces: no se lee (se podría escribir en la ficha equivocada). */
  | { estado: 'ambiguo'; n: number }
  | { estado: 'ok'; hiloId: string; clienteId: string; raiz: string; oportunidades: { id: string; ramo: string }[] }

/** Un hilo = un cliente + una raíz (una fila por oportunidad). 0 → sin_hilo; >1 → ambiguo. PURA. */
export function agruparHilos(filas: readonly FilaHilo[]): Casado {
  const grupos = new Map<string, FilaHilo[]>()
  for (const f of filas) {
    const k = `${f.clienteId}|${f.raiz}`
    grupos.set(k, [...(grupos.get(k) ?? []), f])
  }
  if (grupos.size === 0) return { estado: 'sin_hilo' }
  if (grupos.size > 1) return { estado: 'ambiguo', n: grupos.size }
  const [g] = [...grupos.values()]
  const ordenadas = [...g].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
  const ops = new Map<string, string>()
  for (const f of ordenadas) if (f.oportunidadId && f.ramo) ops.set(f.oportunidadId, f.ramo)
  return { estado: 'ok', hiloId: ordenadas[0].id, clienteId: g[0].clienteId, raiz: g[0].raiz, oportunidades: [...ops].map(([id, ramo]) => ({ id, ramo })) }
}

// ─── info_riesgo.datosContrato ───────────────────────────────────────────────

/** Valor guardado: en claro, o `{ cifrado: 'v1:…', hash? }` (DNI con su índice ciego para comparar sin descifrar). */
export type ValorGuardado = ValorContrato | { cifrado: string; hash?: string }
export type Procedencia = { fuente: 'cliente'; at: string; correo: string }
export type DatosContrato = {
  valores: Record<string, ValorGuardado>
  _procedencia: Record<string, Procedencia>
  /**
   * F3b (19/10/2026): lo que el cliente dio DISTINTO de lo que ya había (ficha o respuesta anterior). No se pisa ni se usa:
   * espera a que Alberto elija (`elegirEnContrato`). Mientras haya alguno, el expediente NO está completo.
   */
  pendientes: Record<string, ValorGuardado>
  /** Lo que Alberto eligió en cada discrepancia (sin valores). */
  elecciones: Record<string, 'ficha' | 'correo'>
}

function valorGuardado(x: unknown): ValorGuardado | null {
  if (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') return x
  const c = obj(x)
  if (typeof c.cifrado === 'string' && c.cifrado.startsWith('v1:')) return { cifrado: c.cifrado, ...(typeof c.hash === 'string' ? { hash: c.hash } : {}) }
  return null
}

/** Lee `info_riesgo.datosContrato` sin fiarse (lo raro se ignora, nunca se inventa). PURA. */
export function leerDatosContrato(v: unknown): DatosContrato {
  const o = obj(v)
  const valores: Record<string, ValorGuardado> = {}
  for (const [k, x] of Object.entries(obj(o.valores))) { const g = valorGuardado(x); if (g !== null) valores[k] = g }
  const pendientes: Record<string, ValorGuardado> = {}
  for (const [k, x] of Object.entries(obj(o.pendientes))) { const g = valorGuardado(x); if (g !== null) pendientes[k] = g }
  const elecciones: Record<string, 'ficha' | 'correo'> = {}
  for (const [k, x] of Object.entries(obj(o.elecciones))) if (x === 'ficha' || x === 'correo') elecciones[k] = x
  const _procedencia: Record<string, Procedencia> = {}
  for (const [k, x] of Object.entries(obj(o._procedencia))) {
    const p = obj(x)
    if (p.fuente === 'cliente' && typeof p.at === 'string') _procedencia[k] = { fuente: 'cliente', at: p.at, correo: txt(p.correo) }
  }
  return { valores, _procedencia, pendientes, elecciones }
}

/** Añade lo nuevo (nunca quita ni cambia lo que ya había) con su procedencia. PURA. */
export function anadirDatosContrato(actual: DatosContrato, nuevos: Record<string, ValorGuardado>, p: { ahora: string; correo: string }): DatosContrato {
  const valores = { ...actual.valores }
  const _procedencia = { ...actual._procedencia }
  for (const [k, v] of Object.entries(nuevos)) {
    if (k in valores) continue
    valores[k] = v
    _procedencia[k] = { fuente: 'cliente', at: p.ahora, correo: p.correo }
  }
  return { ...actual, valores, _procedencia }
}

/** Lo DISTINTO que trae el correo queda pendiente de elección (el último gana; lo ya elegido se vuelve a preguntar). PURA. */
export function conPendientes(actual: DatosContrato, distintos: Record<string, ValorGuardado>): DatosContrato {
  if (!Object.keys(distintos).length) return actual
  const elecciones = { ...actual.elecciones }
  for (const k of Object.keys(distintos)) delete elecciones[k]
  return { ...actual, pendientes: { ...actual.pendientes, ...distintos }, elecciones }
}

/** Claves cuyo dato manda la FICHA del cliente (los bots leen de ahí al tomador: elegir «correo» no corrige la ficha). */
export const CLAVES_DE_FICHA = ['dni', 'nombre', 'apellido1', 'apellido2', 'fechaNacimiento', 'estadoCivil', 'telefono', 'email'] as const

export type ResultadoEleccion =
  | { ok: true; dc: DatosContrato; corregirFicha: boolean }
  | { ok: false; motivo: 'no_pendiente' }

/**
 * Alberto elige en una discrepancia. `ficha` = se queda lo que ya había (el del correo se descarta); `correo` = el del correo
 * pasa a ser EL dato del contrato (y, si es de los que guarda la ficha, se avisa de que la ficha sigue diciendo otra cosa).
 * Sin esa clave pendiente → `no_pendiente` (botón viejo o ya elegido). PURA.
 */
export function elegirEnContrato(actual: DatosContrato, clave: string, eleccion: 'ficha' | 'correo', p: { ahora: string }): ResultadoEleccion {
  if (!Object.hasOwn(actual.pendientes, clave)) return { ok: false, motivo: 'no_pendiente' }
  const { [clave]: valor, ...pendientes } = actual.pendientes
  const elecciones = { ...actual.elecciones, [clave]: eleccion }
  if (eleccion === 'ficha') return { ok: true, dc: { ...actual, pendientes, elecciones }, corregirFicha: false }
  return {
    ok: true,
    dc: { ...actual, pendientes, elecciones, valores: { ...actual.valores, [clave]: valor }, _procedencia: { ...actual._procedencia, [clave]: { fuente: 'cliente', at: p.ahora, correo: actual._procedencia[clave]?.correo ?? '' } } },
    corregirFicha: (CLAVES_DE_FICHA as readonly string[]).includes(clave),
  }
}

/** Lo que la ficha ya sabe de la persona (claves del contrato). Sin descifrar nada. PURA. */
export function conocidosDeFicha(f: {
  nombre: string | null; apellidos: string | null; dniLookupHash: string | null; telefonoLookupHash: string | null
  emailLookupHash: string | null; fechaNacimiento: string | null; estadoCivil: string | null
}): string[] {
  const out: string[] = []
  if (f.nombre && f.nombre.trim() && !/^sin nombre$/i.test(f.nombre.trim())) out.push('nombre')
  const ap = (f.apellidos ?? '').trim().split(/\s+/).filter(Boolean)
  if (ap.length >= 1) out.push('apellido1')
  if (ap.length >= 2) out.push('apellido2')
  if (f.dniLookupHash) out.push('dni')
  if (f.telefonoLookupHash) out.push('telefono')
  if (f.emailLookupHash) out.push('email')
  if (f.fechaNacimiento) out.push('fechaNacimiento')
  if (f.estadoCivil && f.estadoCivil.trim()) out.push('estadoCivil')
  return out
}

/** Estado del expediente tras leer la respuesta. Nunca baja de `tarificando`/`tarificada` (lo filtra el UPDATE). PURA. */
export function estadoDatosTrasRespuesta(faltanTotal: number): 'lista_para_tarificar' | 'incompleta' {
  return faltanTotal === 0 ? 'lista_para_tarificar' : 'incompleta'
}

/** Texto del historial de la ficha: conteos y etiquetas, nunca valores. PURA. */
export function textoHistorialRespuesta(r: { nuevos: number; discrepancias: number; faltan: number; actor: string }): string {
  return `Respuesta del cliente por correo, en el hilo de su lead: ${r.nuevos} ${r.nuevos === 1 ? 'dato nuevo guardado' : 'datos nuevos guardados'}` +
    `${r.discrepancias ? `, ${r.discrepancias} que no cuadran con lo que ya había (no se ha pisado nada)` : ''}` +
    `${r.faltan ? `; faltan ${r.faltan}` : '; datos completos para tarificar'}. Leído por ${r.actor}.`
}

// ─── Adjuntos ────────────────────────────────────────────────────────────────

/** Lista CERRADA: fotos y PDF (DNI, ficha técnica, póliza anterior). Lo demás no se guarda. */
export const MIME_ADJUNTO_LEAD = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'] as const
export const MAX_BYTES_ADJUNTO_LEAD = 2_500_000

export type AdjuntoLead = { hiloId: string; from: string; gmailMessageId: string; nombre: string; mime: string; contenido: Buffer }

/** `{ hiloId, from, gmailMessageId, nombre, mime, base64 }`. PURA. */
export function validarAdjunto(b: unknown): { ok: true; valor: AdjuntoLead } | { ok: false; motivo: string } {
  const o = obj(b)
  const hiloId = txt(String(o.hiloId ?? ''))
  if (!ID_HILO.test(hiloId)) return { ok: false, motivo: 'hiloId no válido' }
  const from = txt(o.from).toLowerCase()
  if (!EMAIL.test(from)) return { ok: false, motivo: 'from no es una dirección simple' }
  if (!messageIdValido(o.gmailMessageId)) return { ok: false, motivo: 'gmailMessageId no válido' }
  const mime = txt(o.mime).toLowerCase()
  if (!(MIME_ADJUNTO_LEAD as readonly string[]).includes(mime)) return { ok: false, motivo: 'tipo de fichero no admitido' }
  const b64 = txt(o.base64)
  if (!b64 || !/^[A-Za-z0-9+/=\s]+$/.test(b64)) return { ok: false, motivo: 'contenido no válido' }
  const contenido = Buffer.from(b64, 'base64')
  if (contenido.length < 100 || contenido.length > MAX_BYTES_ADJUNTO_LEAD) return { ok: false, motivo: 'tamaño fuera de límites' }
  const nombre = txt(o.nombre).replace(/[\r\n\0]/g, ' ').slice(0, 200) || 'adjunto'
  return { ok: true, valor: { hiloId, from, gmailMessageId: o.gmailMessageId as string, nombre, mime, contenido } }
}

/**
 * Lo que la FICHA ya dice de la persona, en la forma que compara `decidirFusion` (revisión F2, 19/10/2026): nombre y
 * apellidos en claro, estado civil tal cual (se compara por categoría) y la fecha de nacimiento DESCIFRADA y normalizada.
 * Un nacimiento que no se puede abrir o no tiene forma de fecha vale «¿?»: cuenta como «ya hay algo» y lo del correo sale
 * como DISCREPANCIA, nunca se guarda como dato nuevo por encima de la ficha. `descifrar` lo trae quien llama. PURA.
 */
export function previosDeFicha(
  f: { nombre: string | null; apellidos: string | null; fechaNacimiento: string | null; estadoCivil: string | null },
  conocidos: ReadonlySet<string>,
  descifrar: (v: string) => string,
): Record<string, unknown> {
  const ap = (f.apellidos ?? '').trim().split(/\s+/).filter(Boolean)
  const out: Record<string, unknown> = {
    ...(conocidos.has('nombre') ? { nombre: f.nombre } : {}),
    ...(ap[0] ? { apellido1: ap[0] } : {}),
    ...(ap.length >= 2 ? { apellido2: ap.slice(1).join(' ') } : {}),
    ...(f.estadoCivil && f.estadoCivil.trim() ? { estadoCivil: f.estadoCivil.trim() } : {}),
  }
  if (f.fechaNacimiento && f.fechaNacimiento.trim()) {
    let claro: string | null
    try { claro = descifrar(f.fechaNacimiento) } catch { claro = null }
    const t = (claro ?? '').trim()
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
    const es = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t)
    out.fechaNacimiento = iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : es ? `${es[3]}-${es[2]}-${es[1]}` : '¿?'
  }
  return out
}
