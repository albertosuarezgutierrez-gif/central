// La identidad de una ficha (DNI, nombre, apellidos, fecha de nacimiento) y QUÉ la acredita
// (05/10/2026). Puro: lo usan asegura (para decidir y validar) y plataforma (para pintar).
//
// Caso fundacional: la ficha «Estibaliz Slava» (un solo apellido) cuando la póliza Mapfre escaneada
// decía «ESTIBALIZ ESLAVA ANTOLI». Ni el volcado de la póliza ni la fusión de fichas tocan el nombre
// (bien: nunca pisan), pero tampoco lo PROPONÍAN, y el vendor exige el segundo apellido con DNI.
//
// Tres decisiones de Alberto:
// 1. La PÓLIZA escaneada vale como documento acreditativo para corregir nombre/apellidos SOLO si el
//    DNI leído de la póliza coincide con el DNI que la ficha YA tenía. Nunca se pisa sin que el
//    corredor lo confirme: aquí se PROPONE (`propuestaIdentidadDesdePoliza`), no se escribe.
// 2. Esa póliza cuenta en el gate de identidad (`documentoAcredita`) gracias a la MARCA que se guarda
//    con el documento (`MarcaIdentidadDocumento`): el índice ciego del DNI leído, la ficha en la que se
//    comprobó y si coincidía con el DNI que la ficha tenía ANTES de leerla. Que el DNI lo hubiera
//    escrito el propio documento no cuenta (sería circular).
// 3. El corredor (usuario interno de plataforma, nunca el portal) puede editar la identidad SIN
//    documento con un MOTIVO escrito (≥5 caracteres), que queda en el historial con quién, el valor
//    anterior y el nuevo (DNI enmascarado).

import { enmascararDni, normalizarDni } from './cliente-edicion.ts'

// ─── Marca de identidad guardada con el documento ───────────────────────────

/**
 * Lo que se guarda en `documentos.extraccion.identidad`. `dniHash` es el MISMO índice ciego que
 * `clientes.dni_lookup_hash` (HMAC con secreto, nunca el DNI en claro).
 */
export type MarcaIdentidadDocumento = {
  dniHash: string
  /** Ficha contra la que se comprobó. */
  clienteId: string
  /** El DNI leído era el que la ficha YA tenía antes de leer el documento. */
  coincidiaConFicha: boolean
}

/**
 * ¿Este documento acredita la identidad de ESTA ficha HOY? Tres estados:
 * - `null`: no se sabe (sin lectura, o leído antes de que existiera la marca).
 * - `false`: se leyó y no acredita (otro DNI, otra ficha, o la ficha cambió de DNI desde entonces).
 * - `true`: el DNI de la póliza es el de la ficha, lo era antes de leerla y lo sigue siendo.
 */
export function marcaAcreditaFicha(
  extraccion: unknown,
  ficha: { clienteId: string; dniLookupHash: string | null },
): boolean | null {
  if (!extraccion || typeof extraccion !== 'object' || Array.isArray(extraccion)) return null
  const m = (extraccion as Record<string, unknown>).identidad
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null
  const x = m as Record<string, unknown>
  if (typeof x.dniHash !== 'string' || x.dniHash === '' || typeof x.clienteId !== 'string') return null
  if (x.coincidiaConFicha !== true) return false
  if (x.clienteId !== ficha.clienteId) return false
  if (!ficha.dniLookupHash) return false
  return x.dniHash === ficha.dniLookupHash
}

// ─── Propuesta de corrección desde la póliza ────────────────────────────────

/** Para comparar: sin tildes, sin mayúsculas, sin signos, espacios simples. */
export function normalizarParaComparar(v: string | null | undefined): string {
  return (v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
}

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'i', 'da', 'do', 'dos', 'van', 'von'])

/**
 * «ESLAVA ANTOLI» → «Eslava Antoli». Solo si viene TODO en mayúsculas (como imprimen las
 * compañías); lo que ya trae mayúsculas y minúsculas se respeta tal cual.
 */
export function capitalizarNombre(v: string): string {
  const s = v.replace(/\s+/g, ' ').trim()
  if (s === '' || s !== s.toUpperCase()) return s
  return s
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && PARTICULAS.has(w) ? w : w.replace(/(^|[-'’])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())))
    .join(' ')
}

export type MotivoPropuesta = 'hueco' | 'un_apellido' | 'distinto'

export type PropuestaIdentidad = {
  nombre: string
  apellidos: string
  actual: { nombre: string; apellidos: string }
  motivo: MotivoPropuesta
}

/**
 * Propuesta de corregir nombre/apellidos con lo que dice la póliza. `null` = no se propone nada:
 * - sin DNI en la ficha o en la póliza, o DNI distintos (decisión de Alberto: solo con DNI coincidente);
 * - tomador empresa (la razón social no se parte en nombre/apellidos);
 * - la póliza no trae nombre, o dice lo mismo que la ficha (sin mirar mayúsculas ni tildes).
 * `dniFicha` es el DNI que la ficha tenía ANTES de leer el documento.
 */
export function propuestaIdentidadDesdePoliza(e: {
  dniFicha: string | null
  dniLeido: string | null
  esEmpresa: boolean
  ficha: { nombre: string | null; apellidos: string | null }
  leido: { nombre: string | null; apellidos: string | null }
}): PropuestaIdentidad | null {
  if (e.esEmpresa) return null
  const f = normalizarDni(e.dniFicha ?? '')
  const l = normalizarDni(e.dniLeido ?? '')
  if (!f.ok || !l.ok || f.valor.valor !== l.valor.valor) return null
  if (l.valor.tipoPersona === 'juridica') return null
  const nombre = capitalizarNombre(e.leido.nombre ?? '')
  const apellidos = capitalizarNombre(e.leido.apellidos ?? '')
  if (nombre === '') return null
  const actual = { nombre: (e.ficha.nombre ?? '').replace(/\s+/g, ' ').trim(), apellidos: (e.ficha.apellidos ?? '').replace(/\s+/g, ' ').trim() }
  const igualNombre = normalizarParaComparar(actual.nombre) === normalizarParaComparar(nombre)
  const igualApellidos = normalizarParaComparar(actual.apellidos) === normalizarParaComparar(apellidos)
  if (igualNombre && igualApellidos) return null
  // La póliza no trae apellidos y la ficha sí: no se propone borrarlos.
  if (apellidos === '' && actual.apellidos !== '') return null
  const palabras = (s: string) => normalizarParaComparar(s).split(' ').filter((w) => w !== '' && !PARTICULAS.has(w)).length
  const motivo: MotivoPropuesta =
    actual.nombre === '' || actual.apellidos === ''
      ? 'hueco'
      : palabras(actual.apellidos) === 1 && palabras(apellidos) >= 2
        ? 'un_apellido'
        : 'distinto'
  return { nombre, apellidos, actual, motivo }
}

// ─── Edición sin documento, con motivo (la regla, `motivoCambioValido`, vive en cliente-edicion.ts) ───

/** Día y mes tapados con asteriscos, el año a la vista (para reconocerla): la fecha va cifrada en la ficha. */
export function enmascararFecha(iso: string | null | undefined): string | null {
  if (!iso) return null
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(iso.trim())
  return m ? `**/**/${m[1]}` : '(ilegible)'
}

/**
 * Lo que queda en el historial de un cambio de identidad SIN documento: quién, por qué, y cada
 * campo con su valor anterior → nuevo. El DNI va enmascarado y la fecha de nacimiento solo con su
 * año (las dos van cifradas en la ficha y el historial va en claro).
 */
export function textoCambioIdentidadConMotivo(e: {
  actor: string
  motivo: string
  antes: { nombre?: string | null; apellidos?: string | null; dni?: string | null; fechaNacimiento?: string | null }
  despues: { nombre?: string; apellidos?: string; dni?: string | null; fechaNacimiento?: string | null }
}): string {
  const v = (s: string | null | undefined) => (s === null || s === undefined || s.trim() === '' ? '(vacío)' : `«${s}»`)
  const partes: string[] = []
  if (e.despues.nombre !== undefined) partes.push(`nombre ${v(e.antes.nombre)} → ${v(e.despues.nombre)}`)
  if (e.despues.apellidos !== undefined) partes.push(`apellidos ${v(e.antes.apellidos)} → ${v(e.despues.apellidos)}`)
  if (e.despues.dni !== undefined) partes.push(`DNI ${v(enmascararDni(e.antes.dni ?? null))} → ${v(enmascararDni(e.despues.dni))}`)
  if (e.despues.fechaNacimiento !== undefined) {
    partes.push(`fecha de nacimiento ${v(enmascararFecha(e.antes.fechaNacimiento))} → ${v(enmascararFecha(e.despues.fechaNacimiento))}`)
  }
  return `Identidad cambiada SIN documento por ${e.actor}. Motivo: «${e.motivo}». ${partes.join('; ')}.`
}
