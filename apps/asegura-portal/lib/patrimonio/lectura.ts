// PATRIMONIO (22/10/2026) — filas de Prisma (`PortalPatrimonio*`) → tipos PUROS de `@central/module-patrimonio`.
//
// PURO a propósito: aquí no hay `prisma` ni sesión. Quien lee las filas es quien ya pasó por
// `accesosPatrimonio()` (`lib/patrimonio/accesos.ts`) y trae SOLO las del titular autorizado; esto solo traduce.
// Las formas de entrada son estructurales (lo que devuelve el `select` de Prisma), así el test no monta Prisma.
//
// Tres reglas que no se negocian:
//  1. 💶 Céntimos `bigint` → `number` EXACTO. Un valor que no cabe exacto en un `number` no se redondea en
//     silencio: revienta (`centimos_fuera_de_rango`). 2^53 céntimos son 90 billones de euros: si llega, es un
//     dato roto y se tiene que ver.
//  2. 🚨 `null` se queda `null` («no se sabe»), NUNCA `?? 0` / `?? []` / `?? false`. Un gasto sin total no es
//     de 0 €; un contrato sin dato de seguro del inquilino no «no lo exige».
//  3. Un valor fuera de su lista (los CHECK de la BD lo impiden) no se convierte en un valor de cajón
//     (`'otro'`): revienta (`fila_invalida:<campo>`). Es deriva entre el SQL y el código y tiene que verse.
//
// Fechas `@db.Date`: Prisma las da como `Date` a medianoche UTC; se leen en UTC (`YYYY-MM-DD`), nunca con
// `getDate()` del huso local (Vercel corre en UTC, el portátil en Madrid).
import {
  esCategoriaGasto,
  type Centimos,
  type Contrato,
  type Derrama,
  type EstadoGasto,
  type Fecha,
  type Gasto,
  type IndiceActualizacion,
  type Inmueble,
  type Inquilino,
  type ObligacionInmueble,
  type OrigenGasto,
  type Periodicidad,
  type PlantillaGasto,
  type TipoInquilino,
  type TipoObligacion,
  type TipoTitular,
  type Titular,
  type UsoInmueble,
} from '@central/module-patrimonio'

/** Lo que Prisma da para `Decimal`: basta con `toString()` (no se importa `Prisma.Decimal`). */
type DecimalLike = { toString(): string }

function invalida(campo: string, valor: unknown): never {
  throw new Error(`fila_invalida:${campo}=${String(valor)}`)
}

function deLista<T extends string>(lista: readonly T[], v: unknown, campo: string): T {
  return typeof v === 'string' && (lista as readonly string[]).includes(v) ? (v as T) : invalida(campo, v)
}

/** Céntimos de la BD (`bigint`) → `number` exacto. `null` → `null`. Fuera de rango → error, nunca redondeo. */
export function centimos(v: bigint | null): Centimos | null {
  if (v === null) return null
  if (typeof v !== 'bigint') return invalida('centimos', v)
  if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`centimos_fuera_de_rango:${v.toString()}`)
  }
  return Number(v)
}

/** Igual que `centimos` para una columna NOT NULL: un `null` aquí es una fila rota. */
function centimosObligatorio(v: bigint, campo: string): Centimos {
  const n = centimos(v)
  return n === null ? invalida(campo, v) : n
}

/** Columna `date` → `YYYY-MM-DD` en UTC. `null` → `null`. */
export function fechaDe(d: Date | null): Fecha | null {
  if (d === null) return null
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return invalida('fecha', d)
  return d.toISOString().slice(0, 10)
}

function fechaObligatoria(d: Date, campo: string): Fecha {
  const f = fechaDe(d)
  return f === null ? invalida(campo, d) : f
}

/** `numeric` → `number`. `null` → `null`. Un texto no numérico es una fila rota. */
export function decimal(v: DecimalLike | null): number | null {
  if (v === null) return null
  const n = Number(v.toString())
  return Number.isFinite(n) ? n : invalida('decimal', v)
}

// ─── Titular ────────────────────────────────────────────────────────────────────────────────────────────────

const TIPOS_TITULAR: readonly TipoTitular[] = ['persona', 'sociedad']

export type FilaTitular = { id: string; clienteId: string; tipo: string; deduceIva: boolean | null }
/** El nombre sale de la FICHA (`clientes`), no se copia en `portal_patrimonio_titular`. */
export type FichaTitular = { nombre: string; apellidos: string | null }

/**
 * `nif` va SIEMPRE `null`: el rol del portal no lee `clientes.dni` (GRANT por columnas, spec §7). Es «el portal
 * no lo sabe», no «no tiene NIF»: la pantalla no puede decir que falta.
 */
export function titularDeFila(f: FilaTitular, ficha: FichaTitular): Titular {
  return {
    id: f.id,
    tipo: deLista(TIPOS_TITULAR, f.tipo, 'titular.tipo'),
    nombre: `${ficha.nombre} ${ficha.apellidos ?? ''}`.trim(),
    nif: null,
    deduceIva: f.deduceIva,
  }
}

// ─── Inmueble ───────────────────────────────────────────────────────────────────────────────────────────────

const USOS: readonly UsoInmueble[] = ['vivienda', 'local', 'oficina', 'nave', 'garaje', 'trastero', 'otro']

export type FilaInmueble = {
  id: string
  titularId: string
  alias: string
  uso: string
  referenciaCatastral: string | null
  cp: string | null
  direccionNormalizada: string | null
  superficieM2: DecimalLike | null
  anioConstruccion: number | null
  enComunidad: boolean | null
  suministros: string[]
}

export function inmuebleDeFila(f: FilaInmueble): Inmueble {
  return {
    id: f.id,
    titularId: f.titularId,
    alias: f.alias,
    uso: deLista(USOS, f.uso, 'inmueble.uso'),
    // `char(20)`: Postgres rellena con espacios a la derecha si alguien guardó menos.
    referenciaCatastral: f.referenciaCatastral === null ? null : f.referenciaCatastral.trim() || null,
    // Un array de Postgres no es «no se sabe»: `{}` es «no se ha anotado ninguno» (columna NOT NULL).
    suministros: [...f.suministros],
    cp: f.cp,
    direccion: f.direccionNormalizada,
    superficieM2: decimal(f.superficieM2),
    anioConstruccion: f.anioConstruccion,
    enComunidad: f.enComunidad,
  }
}

// ─── Inquilino ──────────────────────────────────────────────────────────────────────────────────────────────

const TIPOS_INQUILINO: readonly TipoInquilino[] = ['persona', 'sociedad']

export type FilaInquilino = { id: string; tipo: string; nombre: string }

/**
 * `nif` y `email` van SIEMPRE `null`: están CIFRADOS y el rol del portal ni los tiene concedidos ni tiene la
 * clave (spec §7). Se leen por el puente de `apps/asegura` cuando el nivel es `total`, no aquí.
 */
export function inquilinoDeFila(f: FilaInquilino): Inquilino {
  return { id: f.id, tipo: deLista(TIPOS_INQUILINO, f.tipo, 'inquilino.tipo'), nombre: f.nombre, nif: null, email: null }
}

// ─── Contrato ───────────────────────────────────────────────────────────────────────────────────────────────

const INDICES: readonly IndiceActualizacion[] = ['IPC', 'IRAV', 'otro']

export type FilaContrato = {
  id: string
  inmuebleId: string
  inicio: Date
  fin: Date | null
  terminadoEn: Date | null
  rentaMensualCent: bigint
  clausula: string
  indice: string | null
  indiceDescripcion: string | null
  fianzaCent: bigint | null
  fianzaDepositadaEn: Date | null
  fianzaDevueltaEn: Date | null
  seguroInquilinoExigido: boolean | null
  seguroInquilinoVence: Date | null
}
export type FilaRentaActualizacion = { desde: Date; rentaMensualCent: bigint }

/**
 * `inquilinoIds` y `actualizaciones` las trae quien lee (puente y tabla append-only) del MISMO contrato.
 * Fianza: sin importe, depósito ni devolución anotados → `null` («no consta»), no una fianza de 0 €.
 * Seguro del inquilino: `exigido` `null` → `null` (no se sabe si el contrato lo exige), no `false`.
 */
export function contratoDeFila(
  f: FilaContrato,
  inquilinoIds: readonly string[],
  actualizaciones: readonly FilaRentaActualizacion[],
): Contrato {
  let clausula: Contrato['clausula']
  if (f.clausula === 'ninguna') {
    if (f.indice !== null) invalida('contrato.indice', f.indice)
    clausula = { tipo: 'ninguna' }
  } else if (f.clausula === 'indice') {
    clausula = { tipo: 'indice', indice: deLista(INDICES, f.indice, 'contrato.indice'), descripcion: f.indiceDescripcion }
  } else {
    invalida('contrato.clausula', f.clausula)
  }

  const fianza =
    f.fianzaCent === null && f.fianzaDepositadaEn === null && f.fianzaDevueltaEn === null
      ? null
      : { importe: centimos(f.fianzaCent), depositadaEn: fechaDe(f.fianzaDepositadaEn), devueltaEn: fechaDe(f.fianzaDevueltaEn) }

  const seguroInquilino =
    f.seguroInquilinoExigido === null
      ? null
      : { exigido: f.seguroInquilinoExigido, venceRecibo: fechaDe(f.seguroInquilinoVence) }

  return {
    id: f.id,
    inmuebleId: f.inmuebleId,
    inquilinoIds: [...inquilinoIds],
    inicio: fechaObligatoria(f.inicio, 'contrato.inicio'),
    fin: fechaDe(f.fin),
    terminadoEn: fechaDe(f.terminadoEn),
    rentaMensual: centimosObligatorio(f.rentaMensualCent, 'contrato.renta_mensual_cent'),
    clausula,
    actualizaciones: actualizaciones
      .map((a) => ({
        desde: fechaObligatoria(a.desde, 'renta_actualizacion.desde'),
        rentaMensual: centimosObligatorio(a.rentaMensualCent, 'renta_actualizacion.renta_mensual_cent'),
      }))
      .sort((a, b) => (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0)),
    fianza,
    seguroInquilino,
  }
}

// ─── Gastos ─────────────────────────────────────────────────────────────────────────────────────────────────

const PERIODICIDADES: readonly Periodicidad[] = ['mensual', 'trimestral', 'semestral', 'anual']
const ESTADOS_GASTO: readonly EstadoGasto[] = ['propuesto', 'confirmado', 'descartado']
const ORIGENES_GASTO: readonly OrigenGasto[] = ['plantilla', 'factura', 'manual', 'derrama']

export type FilaPlantillaGasto = {
  id: string
  titularId: string
  inmuebleId: string | null
  concepto: string
  categoria: string
  periodicidad: string
  diaMes: number
  inicio: Date
  fin: Date | null
  importeCent: bigint | null
  activo: boolean
}

/** `importe` `null` = variable (espera la factura), NUNCA 0. */
export function plantillaDeFila(f: FilaPlantillaGasto): PlantillaGasto {
  return {
    id: f.id,
    titularId: f.titularId,
    inmuebleId: f.inmuebleId,
    concepto: f.concepto,
    categoria: esCategoriaGasto(f.categoria) ? f.categoria : invalida('plantilla.categoria', f.categoria),
    periodicidad: deLista(PERIODICIDADES, f.periodicidad, 'plantilla.periodicidad'),
    diaMes: f.diaMes,
    inicio: fechaObligatoria(f.inicio, 'plantilla.inicio'),
    fin: fechaDe(f.fin),
    importe: centimos(f.importeCent),
    activo: f.activo,
  }
}

export type FilaGasto = {
  id: string
  titularId: string
  inmuebleId: string | null
  fecha: Date
  categoria: string | null
  concepto: string | null
  baseCent: bigint | null
  totalCent: bigint | null
  estado: string
  origen: string
  clave: string | null
}

/** `categoria`, `base` y `total` `null` = no consta (un gasto sin total NO es de 0 €). */
export function gastoDeFila(f: FilaGasto): Gasto {
  return {
    id: f.id,
    titularId: f.titularId,
    inmuebleId: f.inmuebleId,
    fecha: fechaObligatoria(f.fecha, 'gasto.fecha'),
    categoria: f.categoria === null ? null : esCategoriaGasto(f.categoria) ? f.categoria : invalida('gasto.categoria', f.categoria),
    concepto: f.concepto,
    base: centimos(f.baseCent),
    total: centimos(f.totalCent),
    estado: deLista(ESTADOS_GASTO, f.estado, 'gasto.estado'),
    origen: deLista(ORIGENES_GASTO, f.origen, 'gasto.origen'),
    clave: f.clave,
  }
}

export type FilaDerrama = {
  id: string
  inmuebleId: string
  concepto: string
  totalCent: bigint
  cuotas: number
  primera: Date
}

/** La derrama cuelga de la comunidad; el titular lo pone quien la leyó DENTRO de un titular autorizado. */
export function derramaDeFila(f: FilaDerrama, titularId: string): Derrama {
  return {
    id: f.id,
    titularId,
    inmuebleId: f.inmuebleId,
    concepto: f.concepto,
    total: centimosObligatorio(f.totalCent, 'derrama.total_cent'),
    cuotas: f.cuotas,
    primera: fechaObligatoria(f.primera, 'derrama.primera'),
  }
}

// ─── Obligaciones del inmueble ──────────────────────────────────────────────────────────────────────────────

/**
 * Las que se GUARDAN (CHECK de `portal_patrimonio_obligacion.tipo`). Las de contrato (`fin_contrato`, fianza,
 * seguro del inquilino, actualización de renta) se CALCULAN: una fila con ese tipo es deriva y revienta.
 */
export const TIPOS_OBLIGACION_GUARDADA: readonly TipoObligacion[] = [
  'ite_iee',
  'certificado_energetico',
  'revision_gas',
  'inspeccion_ascensor',
  'boletin_electrico',
  'otra',
]

export type FilaObligacion = {
  id: string
  inmuebleId: string
  tipo: string
  aplica: boolean | null
  ultima: Date | null
  vence: Date | null
  periodicidadMeses: number | null
}

/** `aplica` `null` = no se sabe (sale `sin_dato`), no «no aplica». */
export function obligacionDeFila(f: FilaObligacion): ObligacionInmueble {
  return {
    id: f.id,
    inmuebleId: f.inmuebleId,
    tipo: deLista(TIPOS_OBLIGACION_GUARDADA, f.tipo, 'obligacion.tipo'),
    aplica: f.aplica,
    ultima: fechaDe(f.ultima),
    vence: fechaDe(f.vence),
    periodicidadMeses: f.periodicidadMeses,
  }
}
