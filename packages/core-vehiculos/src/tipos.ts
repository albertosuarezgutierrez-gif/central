export interface DatosVehiculo {
  matricula: string
  marca: string | null
  modelo: string | null
  version: string | null
  potenciaCv: number | null
  cilindradaCc: number | null
  combustible: string | null
  fechaMatriculacion: string | null
  /** Campo crudo del proveedor, para no perder nada de lo que sí trae. */
  bruto: Record<string, unknown>
}
