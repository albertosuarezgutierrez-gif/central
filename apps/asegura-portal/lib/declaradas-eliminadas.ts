/**
 * Las pólizas que APORTA el cliente se quitan sin perderse (10/10/2026).
 *
 * Alberto: «el portal es para que cada persona CONTROLE SUS SEGUROS, estén o no con nosotros. Lo
 * que el cliente sube puede modificarlo y eliminarlo, pero NADA se pierde: todo queda registrado
 * para poder restaurar si se equivoca».
 *
 * Este módulo es PURO (sin Prisma en tiempo de ejecución, solo tipos) y tiene tres piezas:
 *
 *   1. Los `where` compartidos. 🚨 `DECLARADA_NO_ELIMINADA` va en TODA lectura de
 *      `portalPolizaDeclarada` del portal: bóveda, ficha, carta, hoja QR, partes, calendario,
 *      recordatorios, autorizados… Una lectura que lo olvide vuelve a enseñar —y a avisar de— una
 *      póliza que la persona quitó, y nada falla. Lo vigila
 *      `test/regression-portal-declaradas-eliminadas.test.ts`, que mira CADA llamada.
 *   2. El historial: qué se guarda de una póliza (lista BLANCA, no la fila entera) y el diff de
 *      una edición (solo lo que cambió).
 *   3. La foto de las obligaciones (vencimiento, recibo, recordatorios propios) que se apartan al
 *      quitarla y se devuelven, con sus sellos de aviso, al restaurarla.
 */
import type { Prisma } from '@prisma/client'

// ─── 1. Los `where` ──────────────────────────────────────────────────────────

/** En la bóveda. Se ESPARCE dentro del `where` (`{ id, identidadId, ...DECLARADA_NO_ELIMINADA }`). */
export const DECLARADA_NO_ELIMINADA = { eliminadaEn: null } satisfies Prisma.PortalPolizaDeclaradaWhereInput

/** En «Eliminadas»: lo único que se puede restaurar. */
export const DECLARADA_ELIMINADA = {
  eliminadaEn: { not: null },
} satisfies Prisma.PortalPolizaDeclaradaWhereInput

// ─── 2. El historial ─────────────────────────────────────────────────────────

export const ACCIONES_HISTORIAL = ['creada', 'editada', 'eliminada', 'restaurada'] as const
export type AccionHistorial = (typeof ACCIONES_HISTORIAL)[number]

/**
 * Lo que se registra de una póliza aportada. LISTA BLANCA a propósito: lo que no está aquí no
 * entra en el historial aunque cambie. Fuera, y no por olvido:
 *   · `extraccionBruta` y `coberturas`: volcados largos de la IA, no algo que la persona tecleó ni
 *     que necesite para deshacer un error; duplicarlos en cada edición es guardar el PDF a trozos.
 *   · `documentoNombre`, `procedencia`, `datosRamoOrigen`, sellos de carta y fechas de fila: los
 *     pone el sistema, no la persona.
 */
export const CAMPOS_HISTORIAL = [
  'compania',
  'numeroPoliza',
  'ramo',
  'primaAnual',
  'periodicidadPago',
  'fechaVencimiento',
  'matricula',
  'bastidor',
  'fechaMatriculacion',
  'referenciaCatastral',
  'datosRamo',
  'titularTipo',
  'titularEmpresaNombre',
  'titularEmpresaCif',
  'confirmadaPorUsuario',
] as const
export type CampoHistorial = (typeof CAMPOS_HISTORIAL)[number]

/** El `select` de Prisma que trae justo `CAMPOS_HISTORIAL` (un test comprueba que son los mismos). */
export const SELECT_HISTORIAL = {
  compania: true,
  numeroPoliza: true,
  ramo: true,
  primaAnual: true,
  periodicidadPago: true,
  fechaVencimiento: true,
  matricula: true,
  bastidor: true,
  fechaMatriculacion: true,
  referenciaCatastral: true,
  datosRamo: true,
  titularTipo: true,
  titularEmpresaNombre: true,
  titularEmpresaCif: true,
  confirmadaPorUsuario: true,
} as const satisfies Prisma.PortalPolizaDeclaradaSelect

/** Un valor tal como se guarda en el `jsonb`: sin `Date` ni `Decimal`, que no sobreviven a JSON. */
export type ValorHistorial = string | number | boolean | null | ValorHistorial[] | { [k: string]: ValorHistorial }
export type FotoHistorial = Partial<Record<CampoHistorial, ValorHistorial>>

/**
 * Normaliza para el `jsonb`. Las fechas de esta lista son TODAS `@db.Date` (sin hora), así que se
 * guardan como `AAAA-MM-DD`: un ISO con hora inventaría una hora que nadie dijo. El `Decimal` de la
 * prima pasa a número. `undefined` → `null`: aquí no hay «no lo toques», hay lo que había.
 */
export function valorHistorial(v: unknown): ValorHistorial {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  if (typeof v === 'string' || typeof v === 'boolean') return v
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (Array.isArray(v)) return v.map(valorHistorial)
  if (typeof v === 'object') {
    // `Prisma.Decimal` (decimal.js): tiene `toFixed` y se serializa por `toString()`.
    if (typeof (v as { toFixed?: unknown }).toFixed === 'function') {
      const n = Number(String(v))
      return Number.isFinite(n) ? n : null
    }
    const out: { [k: string]: ValorHistorial } = {}
    for (const k of Object.keys(v as object).sort()) out[k] = valorHistorial((v as Record<string, unknown>)[k])
    return out
  }
  return null
}

/** La foto de la póliza para el historial: solo la lista blanca, normalizada. */
export function fotoHistorial(fila: Partial<Record<string, unknown>>): FotoHistorial {
  const foto: FotoHistorial = {}
  for (const c of CAMPOS_HISTORIAL) {
    if (c in fila) foto[c] = valorHistorial(fila[c])
  }
  return foto
}

/**
 * Qué cambió en una edición: SOLO los campos de la lista blanca cuyo valor normalizado difiere.
 * `null` si no cambió nada (no se escribe una fila de historial que no cuenta nada).
 *
 * Se compara normalizado y con las claves de los JSON ordenadas: `{a:1,b:2}` y `{b:2,a:1}` son la
 * misma declaración, y `Decimal('120.00')` frente a `120` también.
 */
export function cambiosDeEdicion(
  antes: Partial<Record<string, unknown>>,
  despues: Partial<Record<string, unknown>>,
): { antes: FotoHistorial; despues: FotoHistorial } | null {
  const a = fotoHistorial(antes)
  const d = fotoHistorial(despues)
  const salidaA: FotoHistorial = {}
  const salidaD: FotoHistorial = {}
  let hay = false
  for (const c of CAMPOS_HISTORIAL) {
    if (!(c in a) && !(c in d)) continue
    const va = c in a ? a[c] : null
    const vd = c in d ? d[c] : null
    if (JSON.stringify(va) === JSON.stringify(vd)) continue
    salidaA[c] = va ?? null
    salidaD[c] = vd ?? null
    hay = true
  }
  return hay ? { antes: salidaA, despues: salidaD } : null
}

// ─── 3. Las obligaciones que se apartan al quitarla ──────────────────────────
//
// 🚨 Por qué se BORRAN de `portal_obligacion` (y se guardan aquí) en vez de quedarse y filtrarse:
// esa tabla la leen DOS apps. La campana, el calendario y el cron de push del portal, pero también
// el cron de correo y la intranet de `apps/asegura`, que no saben nada de `eliminada_en`. Una fila
// que se queda es un aviso que alguien manda sobre una póliza que la persona quitó. Hasta hoy el
// borrado físico se las llevaba en cascada (FK `ON DELETE CASCADE`): esto conserva ese efecto para
// todos los lectores y, a la vez, NO las pierde — con su `avisadaAt`/`avisadaPushAt`, para que
// restaurar no vuelva a mandar un aviso que ya se mandó.

const TIPOS_OBLIGACION = ['poliza', 'itv', 'carnet', 'recibo', 'mantenimiento', 'revision_gas', 'libre'] as const
const PROCEDENCIAS = ['compania', 'calculado', 'declarado', 'documento'] as const
type TipoObligacion = (typeof TIPOS_OBLIGACION)[number]
type Procedencia = (typeof PROCEDENCIAS)[number]

/** Una obligación tal como se guarda en `antes.obligaciones` del historial. */
export type ObligacionGuardada = {
  id: string
  tipo: TipoObligacion
  titulo: string
  /** `AAAA-MM-DD` (columnas `date`). */
  fechaEvento: string
  fechaAccionable: string
  procedencia: Procedencia
  /** ISO completo (columnas `timestamptz`). `null` = no consta. */
  confirmadaAt: string | null
  avisadaAt: string | null
  avisadaPushAt: string | null
  repiteCadaMeses: number | null
  bienId: string | null
  creadaAt: string | null
}

type FilaObligacion = {
  id: string
  tipo: string
  titulo: string
  fechaEvento: Date
  fechaAccionable: Date
  procedencia: string
  confirmadaAt: Date | null
  avisadaAt: Date | null
  avisadaPushAt: Date | null
  repiteCadaMeses: number | null
  bienId: string | null
  creadaAt: Date | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DIA = /^\d{4}-\d{2}-\d{2}$/

const isoODia = (d: Date) => d.toISOString().slice(0, 10)
const isoONull = (d: Date | null) => (d === null || Number.isNaN(d.getTime()) ? null : d.toISOString())

export function guardarObligaciones(filas: readonly FilaObligacion[]): ObligacionGuardada[] {
  return filas
    .filter((f) => (TIPOS_OBLIGACION as readonly string[]).includes(f.tipo) && (PROCEDENCIAS as readonly string[]).includes(f.procedencia))
    .map((f) => ({
      id: f.id,
      tipo: f.tipo as TipoObligacion,
      titulo: f.titulo,
      fechaEvento: isoODia(f.fechaEvento),
      fechaAccionable: isoODia(f.fechaAccionable),
      procedencia: f.procedencia as Procedencia,
      confirmadaAt: isoONull(f.confirmadaAt),
      avisadaAt: isoONull(f.avisadaAt),
      avisadaPushAt: isoONull(f.avisadaPushAt),
      repiteCadaMeses: f.repiteCadaMeses,
      bienId: f.bienId,
      creadaAt: isoONull(f.creadaAt),
    }))
}

const fechaIsoONull = (v: unknown): Date | null => {
  if (typeof v !== 'string') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Lo contrario, al restaurar: el `jsonb` del historial → filas listas para `createMany`.
 *
 * 🚨 El JSON NO se cree a ciegas, aunque lo haya escrito el propio portal: la identidad y la póliza
 * se IMPONEN desde fuera (las de la sesión y la URL ya comprobadas), nunca se leen del JSON, y una
 * entrada con forma rara se descarta en vez de reventar la restauración entera. Si una obligación
 * no se puede recuperar, la siguiente visita a la bóveda vuelve a derivar las de vencimiento y
 * recibo desde la póliza; lo que se perdería es solo un sello de aviso.
 */
export function obligacionesParaRestaurar(
  json: unknown,
  destino: { identidadId: string; polizaDeclaradaId: string; bienesValidos: ReadonlySet<string> },
): {
  id: string
  identidadId: string
  polizaDeclaradaId: string
  tipo: TipoObligacion
  titulo: string
  fechaEvento: Date
  fechaAccionable: Date
  procedencia: Procedencia
  confirmadaAt: Date | null
  avisadaAt: Date | null
  avisadaPushAt: Date | null
  repiteCadaMeses: number | null
  bienId: string | null
}[] {
  if (!Array.isArray(json)) return []
  const out = []
  for (const o of json as unknown[]) {
    if (typeof o !== 'object' || o === null) continue
    const r = o as Record<string, unknown>
    if (typeof r.id !== 'string' || !UUID.test(r.id)) continue
    if (typeof r.tipo !== 'string' || !(TIPOS_OBLIGACION as readonly string[]).includes(r.tipo)) continue
    if (typeof r.procedencia !== 'string' || !(PROCEDENCIAS as readonly string[]).includes(r.procedencia)) continue
    if (typeof r.titulo !== 'string' || r.titulo.trim() === '') continue
    if (typeof r.fechaEvento !== 'string' || !DIA.test(r.fechaEvento)) continue
    if (typeof r.fechaAccionable !== 'string' || !DIA.test(r.fechaAccionable)) continue
    const repite = typeof r.repiteCadaMeses === 'number' && Number.isInteger(r.repiteCadaMeses) ? r.repiteCadaMeses : null
    // Un bien que ya no existe (o no es de esta identidad) haría fallar la FK de la fila ENTERA:
    // se suelta el bien y se conserva el recordatorio.
    const bienId = typeof r.bienId === 'string' && destino.bienesValidos.has(r.bienId) ? r.bienId : null
    out.push({
      id: r.id,
      identidadId: destino.identidadId,
      polizaDeclaradaId: destino.polizaDeclaradaId,
      tipo: r.tipo as TipoObligacion,
      titulo: r.titulo,
      fechaEvento: new Date(`${r.fechaEvento}T00:00:00Z`),
      fechaAccionable: new Date(`${r.fechaAccionable}T00:00:00Z`),
      procedencia: r.procedencia as Procedencia,
      confirmadaAt: fechaIsoONull(r.confirmadaAt),
      avisadaAt: fechaIsoONull(r.avisadaAt),
      avisadaPushAt: fechaIsoONull(r.avisadaPushAt),
      repiteCadaMeses: repite,
      bienId,
    })
  }
  return out
}

/** Los `bienId` que trae el JSON guardado (para comprobar cuáles siguen siendo de la identidad). */
export function bienesDeObligacionesGuardadas(json: unknown): string[] {
  if (!Array.isArray(json)) return []
  const ids = new Set<string>()
  for (const o of json as unknown[]) {
    const b = typeof o === 'object' && o !== null ? (o as Record<string, unknown>).bienId : null
    if (typeof b === 'string' && UUID.test(b)) ids.add(b)
  }
  return [...ids]
}

// ─── Textos (los dicen la API y la pantalla: una sola redacción) ─────────────

export const TEXTO_CONFIRMAR_QUITAR =
  'Deja de salir en tu bóveda y dejamos de avisarte de ella. Si te equivocas, la tienes en «Eliminadas» ' +
  'y la puedes recuperar tal como estaba. Esto no cancela el seguro: si lo tienes contratado, sigue en ' +
  'vigor con su compañía.'

export const TEXTO_ELIMINADAS =
  'Las que has quitado de tu bóveda. No te avisamos de ellas mientras estén aquí; si la recuperas, ' +
  'vuelve tal como estaba, con sus recordatorios.'
