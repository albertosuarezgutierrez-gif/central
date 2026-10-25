// Patrimonio del portal (22/10/2026, paso 9) — REGLAS puras del alta de inquilino que llega del portal por el puente
// (`app/api/portal/patrimonio/inquilino`). Sin BD. Lo de BD (acceso, inserción, lectura) está en
// `lib/patrimonio-inquilino-portal.ts`.
//
// Dos cosas que no se negocian:
//  1. 🚨 NUNCA en claro. `encryptField` de `@central/module-seguros-pii` devuelve el TEXTO tal cual si falta
//     `PII_ENCRYPTION_KEY` fuera de producción (modo desarrollo). Para la PII de un inquilino —que es un tercero, y cuyos
//     datos son un encargo de tratamiento del propietario— eso no vale: `cifrarPii` exige el sobre `v1:` y, si no sale,
//     devuelve `null` y el alta se rechaza con `sin_clave`. Lo mismo el índice ciego del correo (`PII_LOOKUP_KEY`).
//  2. Las reglas del NIF, el teléfono y el correo son LAS de la cartera (`normalizarDni`/`normalizarTelefono`/
//     `normalizarEmail` de `@central/module-seguros`), no una copia. Un NIF de sociedad (CIF) no es de una persona.
import { computeEmailLookupHash, encryptField } from '@central/module-seguros-pii'
import { normalizarDni, normalizarEmail, normalizarTelefono } from '@central/module-seguros'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type AltaInquilinoPortal = {
  identidadId: string
  contratoId: string
  tipo: 'persona' | 'sociedad'
  nombre: string
  papel: 'titular' | 'avalista'
  /** Forma canónica (mayúsculas, sin separadores). `null` = no lo dio. */
  nif: string | null
  email: string | null
  telefono: string | null
  /** Id del inquilino YA existente (del mismo titular) que la persona acepta reutilizar. El servidor lo vuelve a comprobar. */
  reutilizarId: string | null
}

export type Revision<T> = { ok: true; datos: T } | { ok: false; campo: string; motivo: string }

const vacio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

export function revisarAltaInquilino(cuerpo: unknown): Revision<AltaInquilinoPortal> {
  const b = cuerpo && typeof cuerpo === 'object' ? (cuerpo as Record<string, unknown>) : {}
  if (typeof b.identidadId !== 'string' || !UUID.test(b.identidadId)) return { ok: false, campo: 'identidadId', motivo: 'sin identidad' }
  if (typeof b.contratoId !== 'string' || !UUID.test(b.contratoId)) return { ok: false, campo: 'contratoId', motivo: 'sin contrato' }
  if (b.tipo !== 'persona' && b.tipo !== 'sociedad') return { ok: false, campo: 'tipo', motivo: 'Elige persona o sociedad.' }
  const nombre = typeof b.nombre === 'string' ? b.nombre.trim().replace(/\s+/g, ' ') : ''
  if (nombre.length < 1 || nombre.length > 200) return { ok: false, campo: 'nombre', motivo: 'Falta el nombre.' }
  const papel = vacio(b.papel) ? 'titular' : b.papel
  if (papel !== 'titular' && papel !== 'avalista') return { ok: false, campo: 'papel', motivo: 'Papel no válido.' }

  let nif: string | null = null
  if (!vacio(b.nif)) {
    const r = normalizarDni(b.nif)
    if (!r.ok) return { ok: false, campo: 'nif', motivo: r.motivo }
    if ((b.tipo === 'persona') !== (r.valor.tipoPersona === 'fisica')) {
      return {
        ok: false,
        campo: 'nif',
        motivo: b.tipo === 'persona' ? 'Ese NIF es de una sociedad, no de una persona.' : 'Ese NIF es de una persona, no de una sociedad.',
      }
    }
    nif = r.valor.valor
  }
  let email: string | null = null
  if (!vacio(b.email)) {
    const r = normalizarEmail(b.email)
    if (!r.ok) return { ok: false, campo: 'email', motivo: r.motivo }
    email = r.valor
  }
  let telefono: string | null = null
  if (!vacio(b.telefono)) {
    const r = normalizarTelefono(b.telefono)
    if (!r.ok) return { ok: false, campo: 'telefono', motivo: r.motivo }
    telefono = r.valor
  }
  let reutilizarId: string | null = null
  if (!vacio(b.reutilizarId)) {
    if (typeof b.reutilizarId !== 'string' || !UUID.test(b.reutilizarId)) return { ok: false, campo: 'reutilizarId', motivo: 'Inquilino no válido.' }
    reutilizarId = b.reutilizarId.toLowerCase()
  }
  return { ok: true, datos: { identidadId: b.identidadId, contratoId: b.contratoId, tipo: b.tipo, nombre, papel, nif, email, telefono, reutilizarId } }
}

export type CandidatoDuplicado = { id: string; nombre: string; tipo: string; nif: string | null }

/**
 * ¿Ya hay un inquilino del MISMO titular con este documento? Agrupa por IDENTIDAD (el documento normalizado), nunca por
 * nombre: dos «Juan García» con DNI distinto son dos personas. `nif` de un candidato = el descifrado (`null` = no lo dio
 * o no abre: ni coincide ni descarta). El documento de entrada ya viene normalizado; el del candidato se normaliza aquí
 * igual (mayúsculas, sin separadores), así que un registro antiguo con otra grafía tampoco se escapa.
 */
export function buscarDuplicadoPorNif(nif: string | null, candidatos: readonly CandidatoDuplicado[]): CandidatoDuplicado | null {
  if (nif === null) return null
  const buscado = normalizarDni(nif)
  if (!buscado.ok) return null
  for (const c of candidatos) {
    if (c.nif === null) continue
    const otro = normalizarDni(c.nif)
    if (otro.ok && otro.valor.valor === buscado.valor.valor) return c
  }
  return null
}

/** Cifra o NADA: sin el sobre `v1:` (falta la clave) devuelve `null`, nunca el texto en claro. */
export function cifrarPii(v: string): string | null {
  try {
    const c = encryptField(v)
    return c.startsWith('v1:') && c !== v ? c : null
  } catch {
    return null
  }
}

export type PiiCifrada = { nifCifrado: string | null; emailCifrado: string | null; emailHash: string | null; telefonoCifrado: string | null }

/** Lo que se escribe en BD. `null` (con algún dato dado) = falta una clave: el alta NO se hace. */
export function cifrarAltaInquilino(d: Pick<AltaInquilinoPortal, 'nif' | 'email' | 'telefono'>): PiiCifrada | null {
  const nifCifrado = d.nif === null ? null : cifrarPii(d.nif)
  const telefonoCifrado = d.telefono === null ? null : cifrarPii(d.telefono)
  const emailCifrado = d.email === null ? null : cifrarPii(d.email)
  const emailHash = d.email === null ? null : computeEmailLookupHash(d.email)
  if (d.nif !== null && nifCifrado === null) return null
  if (d.telefono !== null && telefonoCifrado === null) return null
  // CHECK `portal_patrimonio_inquilino_email_par`: hash y cifrado, los dos o ninguno.
  if (d.email !== null && (emailCifrado === null || emailHash === null)) return null
  return { nifCifrado, emailCifrado, emailHash, telefonoCifrado }
}
