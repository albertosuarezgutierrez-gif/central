// PATRIMONIO (22/10/2026, paso 9) — lógica PURA (puertos inyectados, sin prisma ni sesión) de contratos, inquilinos y
// actualización de renta: `POST /api/patrimonio/contratos`, `POST /api/patrimonio/contratos/[id]/{inquilinos,renta}` y
// `GET /api/patrimonio/inquilinos/[id]`. La BD real está en `contratos-bd.ts`; el puente a `apps/asegura`, en
// `inquilinos-puente.ts`.
//
// 🚨 Aislamiento: el inmueble, el contrato o el inquilino de la URL/cuerpo es una PETICIÓN: el puerto lo busca DENTRO
// de los titulares de `accesos()` (resueltos desde la cookie). No está, o el nivel no da la acción → la MISMA 404
// `no_encontrado` (nunca 403). Permisos (tabla §4 de la spec): todo lo de aquí es `alta_baja` (solo Total), y ver la PII
// del inquilino es `ver_pii_inquilino` (solo Total).
//
// 🚨 PII del inquilino (NIF, correo, teléfono): el portal NO la guarda ni la lee de su BD (no tiene la clave ni las
// columnas). Viaja tal cual al PUENTE y no toca ningún puerto de BD de esta app: `crearContrato`/`aplicarRenta` no
// tienen dónde meterla. Cepo: `test/regression-portal-patrimonio-inquilino.test.ts`.
import {
  esFecha,
  puede,
  validarTopeCliente,
  type AccionPatrimonio,
  type Contrato,
  type Fecha,
  type IndiceActualizacion,
  type NivelPatrimonio,
  type PreferenciaTope,
  type ResultadoActualizacion,
} from '@central/module-patrimonio'

import { eurosACentimos } from './gastos-api.ts'
import { confirmarAplicacion, propuestaRenta, type FilaIndice } from './indices.ts'

export type AccesosMapa = ReadonlyMap<string, NivelPatrimonio>
export type Respuesta = { status: number; body: Record<string, unknown> }

const NO_ENCONTRADO: Respuesta = { status: 404, body: { error: 'no_encontrado' } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const vacio = (v: unknown) => v === undefined || v === null || v === ''
const texto = (v: unknown, min: number, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/\s+/g, ' ')
  return t.length >= min && t.length <= max ? t : null
}

// ─── Validación del alta de contrato ────────────────────────────────────────────────────────────────────────

export type DatosAltaContrato = {
  inicio: Fecha
  fin: Fecha | null
  rentaMensualCent: number
  clausula: 'ninguna' | 'indice'
  indice: IndiceActualizacion | null
  indiceDescripcion: string | null
  fianzaCent: number | null
  fianzaDepositadaEn: Fecha | null
  fianzaOrganismo: string | null
  /** `null` = no consta si el contrato lo exige (nunca «no»). */
  seguroInquilinoExigido: boolean | null
  seguroInquilinoVence: Fecha | null
}

type V<T> = { ok: true; datos: T } | { ok: false; campo: string }
const INDICES: readonly IndiceActualizacion[] = ['IPC', 'IRAV', 'otro']

function fechaOpcional(v: unknown): Fecha | null | 'invalido' {
  if (vacio(v)) return null
  return esFecha(v) ? v : 'invalido'
}

/** Forma del alta de un contrato. Los CHECK de la BD lo repiten (cláusula ⇔ índice, `otro` descrito, fin ≥ inicio). */
export function validarAltaContrato(cuerpo: unknown): V<DatosAltaContrato> {
  const b = obj(cuerpo)
  if (!esFecha(b.inicio)) return { ok: false, campo: 'inicio' }
  const fin = fechaOpcional(b.fin)
  if (fin === 'invalido' || (fin !== null && fin < b.inicio)) return { ok: false, campo: 'fin' }
  const renta = eurosACentimos(b.renta)
  if (renta === null || renta === 'invalido') return { ok: false, campo: 'renta' }

  let clausula: 'ninguna' | 'indice'
  let indice: IndiceActualizacion | null = null
  let indiceDescripcion: string | null = null
  if (b.clausula === 'ninguna') {
    clausula = 'ninguna'
  } else if (b.clausula === 'indice') {
    clausula = 'indice'
    if (typeof b.indice !== 'string' || !(INDICES as readonly string[]).includes(b.indice)) return { ok: false, campo: 'indice' }
    indice = b.indice as IndiceActualizacion
    if (indice === 'otro') {
      indiceDescripcion = texto(b.indiceDescripcion, 2, 200)
      if (indiceDescripcion === null) return { ok: false, campo: 'indiceDescripcion' }
    }
  } else {
    return { ok: false, campo: 'clausula' }
  }

  // Fianza: vacía = no consta (null), nunca 0 €.
  const fianza = eurosACentimos(b.fianza)
  if (fianza === 'invalido') return { ok: false, campo: 'fianza' }
  const depositada = fechaOpcional(b.fianzaDepositadaEn)
  if (depositada === 'invalido') return { ok: false, campo: 'fianzaDepositadaEn' }
  const organismo = vacio(b.fianzaOrganismo) ? null : texto(b.fianzaOrganismo, 2, 200)
  if (!vacio(b.fianzaOrganismo) && organismo === null) return { ok: false, campo: 'fianzaOrganismo' }

  const exigido = b.seguroInquilinoExigido
  if (exigido !== null && exigido !== true && exigido !== false && exigido !== undefined) {
    return { ok: false, campo: 'seguroInquilinoExigido' }
  }
  const vence = fechaOpcional(b.seguroInquilinoVence)
  if (vence === 'invalido') return { ok: false, campo: 'seguroInquilinoVence' }

  return {
    ok: true,
    datos: {
      inicio: b.inicio,
      fin,
      rentaMensualCent: renta,
      clausula,
      indice,
      indiceDescripcion,
      fianzaCent: fianza,
      fianzaDepositadaEn: depositada,
      fianzaOrganismo: organismo,
      seguroInquilinoExigido: exigido === undefined ? null : exigido,
      seguroInquilinoVence: vence,
    },
  }
}

// ─── Validación del alta de inquilino (forma; las reglas del NIF/teléfono/correo las aplica asegura) ─────────

export type DatosAltaInquilino = {
  tipo: 'persona' | 'sociedad'
  nombre: string
  papel: 'titular' | 'avalista'
  /** Viajan al puente tal cual, sin guardarse aquí. `null` = no lo ha dado. */
  nif: string | null
  email: string | null
  telefono: string | null
  /** Inquilino ya existente del mismo titular que la persona ha aceptado reutilizar (lo que el servidor le propuso). */
  reutilizarId?: string | null
}

const pii = (v: unknown, max: number): string | null | 'invalido' => {
  if (vacio(v)) return null
  if (typeof v !== 'string') return 'invalido'
  const t = v.trim()
  return t.length === 0 ? null : t.length > max ? 'invalido' : t
}

export function validarAltaInquilino(cuerpo: unknown): V<DatosAltaInquilino> {
  const b = obj(cuerpo)
  if (b.tipo !== 'persona' && b.tipo !== 'sociedad') return { ok: false, campo: 'tipo' }
  const nombre = texto(b.nombre, 1, 200)
  if (nombre === null) return { ok: false, campo: 'nombre' }
  const papel = vacio(b.papel) ? 'titular' : b.papel
  if (papel !== 'titular' && papel !== 'avalista') return { ok: false, campo: 'papel' }
  const nif = pii(b.nif, 20)
  if (nif === 'invalido') return { ok: false, campo: 'nif' }
  const email = pii(b.email, 254)
  if (email === 'invalido') return { ok: false, campo: 'email' }
  const telefono = pii(b.telefono, 25)
  if (telefono === 'invalido') return { ok: false, campo: 'telefono' }
  if (!vacio(b.reutilizarId) && (typeof b.reutilizarId !== 'string' || !UUID.test(b.reutilizarId))) return { ok: false, campo: 'reutilizarId' }
  const reutilizarId = vacio(b.reutilizarId) ? null : (b.reutilizarId as string)
  return { ok: true, datos: { tipo: b.tipo, nombre, papel, nif, email, telefono, reutilizarId } }
}

// ─── Puertos ────────────────────────────────────────────────────────────────────────────────────────────────

/** El objeto pedido, encontrado DENTRO de los titulares autorizados. `clienteId` = clave de `accesos`. */
export type EnTitular<T> = { clienteId: string } & T

export type ResultadoPuenteAlta =
  | { estado: 'ok'; id: string }
  | { estado: 'invalido'; campo: string | null; motivo: string }
  | { estado: 'no_encontrado' }
  /** Ya hay un inquilino del mismo titular con ese documento: se propone reutilizarlo (no se ha escrito nada). */
  | { estado: 'duplicado'; id: string; nombre: string }
  | { estado: 'ya_en_contrato'; id: string }
  /** Faltan las envs del puente en este despliegue. NO es «falló el envío». */
  | { estado: 'sin_puente' }
  /** asegura no tiene la clave para cifrar: no se guarda NADA en claro. */
  | { estado: 'sin_clave' }
  | { estado: 'error'; causa: string }

export type PiiInquilino = { nif: string | null; email: string | null; telefono: string | null; ilegibles: string[] }
export type ResultadoPuentePii =
  | ({ estado: 'ok' } & PiiInquilino)
  | { estado: 'no_encontrado' }
  | { estado: 'sin_puente' }
  | { estado: 'error'; causa: string }

export interface PuertosContratos {
  /** `accesosPatrimonio(identidad.id)`: lo que ve ESTA sesión. */
  accesos(): Promise<AccesosMapa>
  hoy(): Fecha
  /** Solo busca dentro de `clientesIds` (claves de `accesos()`). */
  inmueble(id: string, clientesIds: readonly string[]): Promise<EnTitular<{ titularId: string }> | null>
  contrato(id: string, clientesIds: readonly string[]): Promise<EnTitular<{ contrato: Contrato; tope: PreferenciaTope }> | null>
  inquilino(id: string, clientesIds: readonly string[]): Promise<EnTitular<{ inquilinoId: string }> | null>
  crearContrato(x: { titularId: string; inmuebleId: string; datos: DatosAltaContrato }): Promise<{ id: string }>
  /** Filas de la tabla de índices (lectura global: no es de ningún titular). */
  indices(indice: IndiceActualizacion): Promise<FilaIndice[]>
  /** APPEND-ONLY: fila nueva. `duplicado` = ya hay una actualización con ese `desde`. */
  aplicarRenta(x: {
    contratoId: string
    propuesta: Extract<ResultadoActualizacion, { estado: 'propuesta' }>
  }): Promise<{ ok: true; id: string } | { ok: false; motivo: 'duplicado' }>
  /** Guarda el tope del cliente en SU contrato (ya autorizado). `defecto` limpia las columnas. */
  guardarTope(x: { contratoId: string; tope: PreferenciaTope }): Promise<boolean>
  altaInquilinoPuente(x: { contratoId: string; datos: DatosAltaInquilino }): Promise<ResultadoPuenteAlta>
  piiInquilinoPuente(inquilinoId: string): Promise<ResultadoPuentePii>
}

/** Busca DENTRO de los accesos y exige el nivel de la acción. `null` = la 404 única. */
async function dentro<T extends { clienteId: string }>(
  accesos: AccesosMapa,
  id: unknown,
  accion: AccionPatrimonio,
  buscar: (id: string, ids: readonly string[]) => Promise<T | null>,
): Promise<T | null> {
  if (accesos.size === 0 || typeof id !== 'string' || !UUID.test(id)) return null
  const r = await buscar(id, [...accesos.keys()])
  if (!r || !accesos.has(r.clienteId)) return null
  return puede(accesos.get(r.clienteId), accion) ? r : null
}

// ─── Handlers ───────────────────────────────────────────────────────────────────────────────────────────────

export async function responderAltaContrato(p: PuertosContratos, cuerpo: unknown): Promise<Respuesta> {
  const accesos = await p.accesos()
  const inm = await dentro(accesos, obj(cuerpo).inmueble, 'alta_baja', (id, ids) => p.inmueble(id, ids))
  if (!inm) return NO_ENCONTRADO
  const v = validarAltaContrato(cuerpo)
  if (!v.ok) return { status: 400, body: { error: 'datos_invalidos', campo: v.campo } }
  const r = await p.crearContrato({ titularId: inm.titularId, inmuebleId: obj(cuerpo).inmueble as string, datos: v.datos })
  return { status: 201, body: { id: r.id } }
}

/** La propuesta de HOY para un contrato ya autorizado (la usan la página y el aplicar: una sola regla). */
export async function propuestaDeContrato(
  p: Pick<PuertosContratos, 'hoy' | 'indices'>,
  c: Contrato,
  tope: PreferenciaTope = { modo: 'defecto' },
): Promise<ResultadoActualizacion> {
  const filas = c.clausula.tipo === 'indice' ? await p.indices(c.clausula.indice) : []
  return propuestaRenta(c, filas, p.hoy(), tope)
}

export async function responderAplicarRenta(p: PuertosContratos, contratoId: unknown, cuerpo: unknown): Promise<Respuesta> {
  const accesos = await p.accesos()
  const c = await dentro(accesos, contratoId, 'alta_baja', (id, ids) => p.contrato(id, ids))
  if (!c) return NO_ENCONTRADO
  // El servidor RECALCULA: el cuerpo solo confirma lo que la persona vio.
  const conf = confirmarAplicacion(cuerpo, await propuestaDeContrato(p, c.contrato, c.tope))
  if (!conf.ok) {
    return { status: conf.error === 'datos_invalidos' ? 400 : 409, body: { error: conf.error } }
  }
  const r = await p.aplicarRenta({ contratoId: c.contrato.id, propuesta: conf.propuesta })
  if (!r.ok) return { status: 409, body: { error: 'ya_aplicada' } }
  return { status: 201, body: { id: r.id, desde: conf.propuesta.aplicableDesde, rentaNuevaCent: conf.propuesta.rentaNueva } }
}

export async function responderAltaInquilino(p: PuertosContratos, contratoId: unknown, cuerpo: unknown): Promise<Respuesta> {
  const accesos = await p.accesos()
  const c = await dentro(accesos, contratoId, 'alta_baja', (id, ids) => p.contrato(id, ids))
  if (!c) return NO_ENCONTRADO
  const v = validarAltaInquilino(cuerpo)
  if (!v.ok) return { status: 400, body: { error: 'datos_invalidos', campo: v.campo } }
  const r = await p.altaInquilinoPuente({ contratoId: c.contrato.id, datos: v.datos })
  switch (r.estado) {
    case 'ok':
      return { status: 201, body: { id: r.id } }
    case 'invalido':
      return { status: 400, body: { error: 'datos_invalidos', campo: r.campo, motivo: r.motivo } }
    case 'no_encontrado':
      return NO_ENCONTRADO
    case 'duplicado':
      return { status: 409, body: { error: 'inquilino_duplicado', id: r.id, nombre: r.nombre } }
    case 'ya_en_contrato':
      return { status: 409, body: { error: 'ya_en_contrato' } }
    case 'sin_puente':
      return { status: 503, body: { error: 'sin_puente' } }
    case 'sin_clave':
      return { status: 503, body: { error: 'sin_clave' } }
    default:
      return { status: 502, body: { error: 'puente_fallido' } }
  }
}

export async function responderPiiInquilino(p: PuertosContratos, inquilinoId: unknown): Promise<Respuesta> {
  const accesos = await p.accesos()
  const q = await dentro(accesos, inquilinoId, 'ver_pii_inquilino', (id, ids) => p.inquilino(id, ids))
  if (!q) return NO_ENCONTRADO
  const r = await p.piiInquilinoPuente(q.inquilinoId)
  if (r.estado === 'ok') {
    return { status: 200, body: { nif: r.nif, email: r.email, telefono: r.telefono, ilegibles: r.ilegibles } }
  }
  if (r.estado === 'no_encontrado') return NO_ENCONTRADO
  if (r.estado === 'sin_puente') return { status: 503, body: { error: 'sin_puente' } }
  return { status: 502, body: { error: 'puente_fallido' } }
}

/** Cuerpo de `PUT /api/patrimonio/contratos/[id]/tope`: `{ modo: 'defecto' | 'propio' | 'sin_tope', pct? }`. */
export function validarTope(cuerpo: unknown): V<PreferenciaTope> {
  const b = obj(cuerpo)
  if (b.modo === 'defecto') return { ok: true, datos: { modo: 'defecto' } }
  if (b.modo === 'sin_tope') return { ok: true, datos: { modo: 'sin_tope' } }
  if (b.modo !== 'propio') return { ok: false, campo: 'modo' }
  // Acepta 2.5 y «2,5»; un texto que no es un número no se convierte en 0.
  const bruto = typeof b.pct === 'string' && /^\d{1,3}([.,]\d{1,2})?$/.test(b.pct.trim()) ? Number(b.pct.trim().replace(',', '.')) : b.pct
  const pct = validarTopeCliente(bruto)
  return pct === null ? { ok: false, campo: 'pct' } : { ok: true, datos: { modo: 'propio', pct } }
}

/** El cliente fija (o quita) el tope de actualización de SU contrato. Solo Total (`alta_baja`); ajeno = 404. */
export async function responderTopeRenta(p: PuertosContratos, contratoId: unknown, cuerpo: unknown): Promise<Respuesta> {
  const accesos = await p.accesos()
  const c = await dentro(accesos, contratoId, 'alta_baja', (id, ids) => p.contrato(id, ids))
  if (!c) return NO_ENCONTRADO
  const v = validarTope(cuerpo)
  if (!v.ok) return { status: 400, body: { error: 'datos_invalidos', campo: v.campo } }
  // 0 filas cambiadas (ya no es suyo / desapareció) = la misma 404 que lo ajeno, nunca un 200 falso.
  if (!(await p.guardarTope({ contratoId: c.contrato.id, tope: v.datos }))) return NO_ENCONTRADO
  return { status: 200, body: { ok: true } }
}
