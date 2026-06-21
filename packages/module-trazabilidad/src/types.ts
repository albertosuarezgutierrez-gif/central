// PUERTOS de Trazabilidad / APPCC. Modelan el "Parte de elaboración" de hostelería
// (molde tomado del parte real de Catering Joaquín Jaén). El módulo es PURO: no
// consulta BD, recibe estructuras ya normalizadas y devuelve validaciones/derivados.

/** Los 14 alérgenos de declaración obligatoria (Reglamento UE 1169/2011). */
export type Alergeno =
  | 'gluten'
  | 'crustaceos'
  | 'huevos'
  | 'pescado'
  | 'cacahuetes'
  | 'soja'
  | 'lacteos'
  | 'frutos_cascara'
  | 'apio'
  | 'mostaza'
  | 'sesamo'
  | 'sulfitos'
  | 'altramuces'
  | 'moluscos'

/** Registro de desinfección de un ingrediente (vegetales): los 3 pasos del parte. */
export interface RegistroDesinfeccion {
  dosificacion?: string   // p.ej. "1 pastilla / 10 L"
  permanencia?: string    // p.ej. "10 min"
  aclarado?: string       // p.ej. "agua abundante"
}

/** Una línea de la ficha de ingredientes (columnas del parte real). */
export interface Ingrediente {
  nombre: string
  cantidad?: string                 // texto libre ("500 g", "2 L") tal cual el parte
  lote?: string                     // Nº de lote del proveedor (se rellena en recepción)
  proveedor?: string
  desinfeccion?: RegistroDesinfeccion | null
  descongelacion?: boolean          // ¿requiere descongelación controlada?
}

/** Tipo de punto de control sanitario (APPCC). */
export type TipoControl = 'termico' | 'abatimiento' | 'congelacion' | 'refrigeracion'

/**
 * Un punto de control con su objetivo y, si ya se midió, su valor y hora.
 * Objetivos del parte real:
 *  - termico:     Tª interior > 70 °C mantenida 2 min
 *  - abatimiento: de 60 °C a ≤ 10 °C en < 2 h
 *  - congelacion: ≤ −18 °C
 *  - refrigeracion: ≤ 4 °C (conservación en frío)
 */
export interface PuntoControl {
  tipo: TipoControl
  valor?: number | null   // °C medidos (ausente = aún no registrado)
  hora?: string | null    // ISO 8601 del registro
  minutos?: number | null // para abatimiento: minutos empleados (objetivo < 120)
}

/** Registro de temperatura/hora (entrada o salida de cámara / cadena de frío). */
export interface RegistroTemp {
  hora?: string | null
  temp?: number | null
}

/**
 * Un grupo de comensales con DIETA ESPECIAL dentro de un evento (comensales
 * puntuales: 5 sin gluten, 3 veganos…). NO cambia el menú principal — pide una
 * elaboración aparte (el plato adaptado del catálogo) para esos comensales.
 */
export interface DietaGrupo {
  receta_id: string   // plato adaptado del catálogo que cubre esta dieta
  dieta: string       // etiqueta: 'sin gluten' | 'vegano' | 'sin lactosa' | …
  comensales: number  // nº de comensales de esa dieta para ese plato
}

/** Una elaboración del parte, con su ficha completa de trazabilidad. */
export interface ElaboracionTraza {
  id: string                         // id de la LÍNEA del parte (sintético en las de dieta)
  receta_base?: string               // id real de la receta del catálogo (para registros/asignaciones)
  nombre: string
  partida?: string | null
  ubicaciones: string[]              // ids de las ubicaciones/eventos destino
  depende_de?: string[]              // sub-elaboraciones (MAYÚSCULAS del parte)
  ingredientes: Ingrediente[]
  controles: PuntoControl[]
  muestra_testigo?: boolean | null   // ¿se ha guardado muestra? (Sí/No del parte)
  muestra_testigo_at?: string | null // cuándo se guardó (para caducidad de la muestra)
  entrada?: RegistroTemp             // Tª/hora de entrada (recepción / cámara)
  salida?: RegistroTemp              // Tª/hora de salida (expedición)
  firma?: string | null              // responsable que firma
  dieta?: string | null              // si es elaboración de dieta: la etiqueta (null = menú principal)
  comensales?: number | null         // nº de comensales de la dieta (null = menú principal → PAX evento)
}

/** Una ubicación/evento destino (con PAX y fecha de evento). */
export interface UbicacionEvento {
  id: string
  nombre: string
  pax: number
  fecha?: string | null       // fecha de elaboración(lote)
  fecha_evento: string        // FechaEvento
}

/** El parte de elaboración completo de una semana de servicio. */
export interface ParteElaboracion {
  semana: string
  ubicaciones: UbicacionEvento[]
  elaboraciones: ElaboracionTraza[]
}

/** Resultado de validar un punto de control. */
export interface ResultadoControl {
  tipo: TipoControl
  registrado: boolean      // ¿hay valor medido?
  conforme: boolean        // ¿cumple el objetivo? (false si no registrado)
  motivo?: string          // por qué no es conforme
}

/** Veredicto de si una elaboración puede expedirse. */
export interface VeredictoSalida {
  apta: boolean
  faltan_controles: TipoControl[]   // controles sin registrar
  no_conformes: TipoControl[]       // controles fuera de rango
  sin_muestra_testigo: boolean
  sin_firma: boolean
}
