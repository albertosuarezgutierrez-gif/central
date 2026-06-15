// Tipos del motor documental. AGNÓSTICO DE ENTIDAD: el owner es opaco (tipo + id).

/** Referencia al dueño del expediente. El módulo no sabe si es un empleado o una propiedad. */
export type OwnerRef = { tipo: string; id: string }

/** Quién realiza la acción. Cada vertical mapea sus roles a estos dos. */
export type Actor = 'gestor' | 'titular'

/** Configuración de una carpeta/categoría. La define cada vertical (no el módulo). */
export type ConfigCarpeta = {
  id: string
  etiqueta: string
  /** ¿El titular (p. ej. el empleado) puede SUBIR documentos a esta carpeta? */
  titularPuedeSubir: boolean
  /** ¿El titular puede VER los documentos de esta carpeta? */
  titularPuedeVer: boolean
}

/** Documento ya almacenado (metadata; el binario vive en el Storage de la vertical). */
export type Documento = {
  id: string
  carpeta: string
  nombre: string
  tipo: string | null
  tamano: number | null
  /** Quién lo subió, para trazabilidad/RGPD. */
  subidoPor: Actor
  caducidad: string | null
  creadoAt: string
}

/** Entrada de una subida, antes de validar/normalizar. */
export type EntradaSubida = {
  carpeta: string
  nombre: string
  tipo?: string | null
  tamano?: number | null
}

export type OpcionesValidacion = {
  /** Tamaño máximo por archivo en bytes (def. 20 MB). */
  tamanoMaxBytes?: number
}
