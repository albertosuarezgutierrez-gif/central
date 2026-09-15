export interface DatosVehiculo {
  matricula: string
  marca: string | null
  modelo: string | null
  version: string | null
  potenciaCv: number | null
  potenciaKw: number | null
  cilindradaCc: number | null
  combustible: string | null
  fechaMatriculacion: string | null
  vin: string | null
  transmision: string | null
  numeroPlazas: number | null
  numeroPuertas: number | null
  /** Respuesta cruda de APIVehículo (`data`), para no perder ningún campo. */
  bruto: Record<string, unknown>
}
