// Tipos del módulo de PATRIMONIO (portal del cliente de Grupo ASegura).
//
// 💶 DINERO EN CÉNTIMOS ENTEROS (`Centimos`). `module-contabilidad` trabaja en euros con `round2`; aquí se
// guardan céntimos para que sumar cien recibos no deje 0,01 € de deriva. Al pasar por `calcularRentabilidad`
// se le dan céntimos como `base_imponible` (la función suma y resta: es agnóstica de la unidad).
//
// 🚨 `null` = «no se sabe», NUNCA «no hay» (regla de la casa). Un inmueble sin prima de seguro leída no tiene
// «0 € de seguro»; un contrato sin fecha de fin no «no vence»; una obligación sin fecha no está «al día».

import type { Fecha } from './fechas.ts'

export type Centimos = number

/** Quién es dueño de los inmuebles. Una identidad del portal puede gestionar varios titulares. */
export type TipoTitular = 'persona' | 'sociedad'

export interface Titular {
  id: string
  tipo: TipoTitular
  nombre: string
  /** NIF/CIF normalizado (sin espacios ni guiones, en mayúsculas). `null` = no consta. */
  nif: string | null
  /**
   * ¿Deduce el IVA soportado? Solo un titular que factura con IVA (local, nave, oficina) lo deduce; el
   * alquiler de VIVIENDA está exento (art. 20.Uno.23º LIVA) y su IVA soportado es COSTE. `null` = no consta:
   * la rentabilidad cuenta el TOTAL (estado conservador) y lo dice.
   */
  deduceIva: boolean | null
}

export type UsoInmueble = 'vivienda' | 'local' | 'oficina' | 'nave' | 'garaje' | 'trastero' | 'otro'

export interface Inmueble {
  id: string
  titularId: string
  /** Nombre corto que pone el cliente («Socorro 2ºB»). Identifica el inmueble en pantalla, no el nº de finca. */
  alias: string
  uso: UsoInmueble
  /** Referencia catastral de 20 caracteres. `null` = no consta (se pide; sin ella no hay Catastro). */
  referenciaCatastral: string | null
  /** CUPS de luz/gas y nº de contrato de agua: sirven para imputar facturas de suministros solas. */
  suministros: string[]
  cp: string | null
  /** Dirección ya normalizada (CP → municipio → calle del callejero → número). Texto para casar facturas. */
  direccion: string | null
  /** m² construidos (Catastro). `null` = no consta. */
  superficieM2: number | null
  anioConstruccion: number | null
  /** El inmueble está en régimen de propiedad horizontal (tiene comunidad). `null` = no consta. */
  enComunidad: boolean | null
}

export type TipoInquilino = 'persona' | 'sociedad'

export interface Inquilino {
  id: string
  tipo: TipoInquilino
  nombre: string
  nif: string | null
  /** Correo al que va el enlace del inquilino (sin cuenta del portal). `null` = no consta. */
  email: string | null
}

export type IndiceActualizacion = 'IPC' | 'IRAV' | 'otro'

/** Cómo se actualiza la renta según el contrato. `ninguna` = el contrato no lo pacta (y entonces NO se actualiza). */
export type ClausulaActualizacion =
  | { tipo: 'ninguna' }
  | { tipo: 'indice'; indice: IndiceActualizacion; /** Descripción libre si es `otro`. */ descripcion?: string | null }

export interface ActualizacionAplicada {
  /** Desde qué día rige la nueva renta. */
  desde: Fecha
  rentaMensual: Centimos
}

export interface Fianza {
  importe: Centimos | null
  /** Fecha en que se depositó en el organismo autonómico. `null` = no consta que se haya depositado. */
  depositadaEn: Fecha | null
  /** Fecha en que se devolvió al inquilino. */
  devueltaEn: Fecha | null
}

export interface SeguroInquilino {
  /** El contrato obliga al inquilino a tener un seguro (RC/contenido). */
  exigido: boolean
  /** Vencimiento del último recibo aportado. `null` = no lo ha aportado. */
  venceRecibo: Fecha | null
}

/** Contrato de arrendamiento de LARGA ESTANCIA (LAU), no turístico. */
export interface Contrato {
  id: string
  inmuebleId: string
  inquilinoIds: string[]
  inicio: Fecha
  /** Fin del periodo PACTADO. Ojo: con la prórroga obligatoria de la LAU el fin real puede ser posterior. */
  fin: Fecha | null
  /** Fecha en que terminó de verdad (rescisión, desistimiento). Manda sobre `fin`. */
  terminadoEn: Fecha | null
  /** Renta mensual inicial (sin IVA en un local; la vivienda no lleva IVA). */
  rentaMensual: Centimos
  clausula: ClausulaActualizacion
  /** Actualizaciones YA aplicadas (historial). La renta vigente un día es la última con `desde` ≤ ese día. */
  actualizaciones: ActualizacionAplicada[]
  fianza: Fianza | null
  seguroInquilino: SeguroInquilino | null
}

/** Categorías de gasto (idea portada de `apps/plataforma/lib/sivra/constantes.ts`, ajustada a larga estancia). */
export const CATEGORIAS_GASTO = [
  'COMUNIDAD',
  'IMPUESTOS',
  'SUMINISTROS',
  'SEGURO',
  'MANTENIMIENTO',
  'REFORMAS',
  'GESTION',
  'FINANCIACION',
  'MOBILIARIO',
  'OTRO',
] as const

export type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number]

export function esCategoriaGasto(v: unknown): v is CategoriaGasto {
  return typeof v === 'string' && (CATEGORIAS_GASTO as readonly string[]).includes(v)
}

export type Periodicidad = 'mensual' | 'trimestral' | 'semestral' | 'anual'

/** Gasto FIJO: plantilla que se repite (cuota de comunidad, IBI, seguro, hipoteca, gestoría…). */
export interface PlantillaGasto {
  id: string
  titularId: string
  /** `null` = gasto del titular sin inmueble (gestoría de la sociedad). No se reparte solo. */
  inmuebleId: string | null
  concepto: string
  categoria: CategoriaGasto
  periodicidad: Periodicidad
  /** Día del mes del cargo (1–31). Un 31 cae el último día en los meses cortos. */
  diaMes: number
  inicio: Fecha
  fin: Fecha | null
  /** Importe de cada cargo. `null` = varía y se confirma con la factura (luz, agua). */
  importe: Centimos | null
  activo: boolean
}

/** Estado de un gasto: lo propone la IA (o la plantilla) y lo CONFIRMA el cliente. Solo cuenta lo confirmado. */
export type EstadoGasto = 'propuesto' | 'confirmado' | 'descartado'

export type OrigenGasto = 'plantilla' | 'factura' | 'manual' | 'derrama'

/** Gasto ya imputado (o pendiente de imputar) a un inmueble. */
export interface Gasto {
  id: string
  titularId: string
  inmuebleId: string | null
  fecha: Fecha
  categoria: CategoriaGasto | null
  concepto: string | null
  /** Base imponible. `null` = no consta. */
  base: Centimos | null
  /** Total con IVA. `null` = no consta. */
  total: Centimos | null
  estado: EstadoGasto
  origen: OrigenGasto
  /** Clave de deduplicación de lo generado por plantilla/derrama (`<plantilla>:<YYYY-MM>`). */
  clave: string | null
}

/** Prima de seguro atribuible a un inmueble (póliza de la cartera o declarada en el portal). */
export interface PrimaSeguroInmueble {
  inmuebleId: string
  /** Prima anual total (recibos del año). `null` = la póliza existe pero no sabemos la prima. */
  primaAnual: Centimos | null
  /** Periodo de la anualidad (efecto → vencimiento). */
  desde: Fecha
  hasta: Fecha
}
