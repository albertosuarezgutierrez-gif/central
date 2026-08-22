// Lógica PURA del resumen patrimonial (sin `@/` ni prisma → testeable con `node --test`).
//
// Regla de la casa que este módulo encarna: NULL = «no se sabe todavía». Un activo sin
// valoración NO entra como 0 en el neto — no entra, y el neto se declara PARCIAL con el
// motivo. Igual con una hipoteca cuya cuota se conoce (banco) pero no su capital pendiente:
// es un pasivo SIN CUANTIFICAR, nunca un 0 silencioso. El neto siempre es un MÍNIMO.

export type ValoracionVigente = {
  valor: number
  /** 'vivienda' | 'vut' | 'mixto' — ver patrimonio_valoraciones. */
  enfoque: string
  /** ISO YYYY-MM-DD. */
  fecha: string
  /** 'alberto' | 'agente:<método>' | 'tasacion'. */
  fuente: string
  metodo: string | null
}

export type ActivoPatrimonio = {
  id: string
  nombre: string
  tipo: string
  /** 'propiedad' | 'alquilado' (subarrendado: negocio, no activo en propiedad). */
  tenencia: string
  uso: string | null
  m2: number | null
  refCatastral: string | null
  pctTitular: number | null
  pctConyuge: number | null
  valorAdquisicion: number | null
  hipotecaCapitalPendiente: number | null
  hipotecaCuotaMensual: number | null
  licenciaVut: boolean | null
  licenciaVutNum: string | null
  /** Valoración vigente (la más reciente); null = sin valorar todavía. */
  valoracion: ValoracionVigente | null
}

export type EstadoActivo = 'valorado' | 'pendiente_valoracion' | 'no_aplica'

// Estado tri-valuado de un activo de cara al neto. Un subarrendado no aplica (genera
// negocio, pero no es propiedad); un propio sin valoración está PENDIENTE, no a cero.
export function estadoActivo(a: ActivoPatrimonio): EstadoActivo {
  if (a.tenencia !== 'propiedad') return 'no_aplica'
  return a.valoracion ? 'valorado' : 'pendiente_valoracion'
}

export type ResumenPatrimonio = {
  liquidez: number
  broker: number
  /** Suma de valoraciones vigentes de los activos en propiedad (valor familiar completo). */
  inmuebles: number
  pasivosConocidos: number
  /** true si existe deuda cuya cuantía no consta (cuota sin capital pendiente). */
  pasivoDesconocido: boolean
  /** Neto MÍNIMO con lo conocido: liquidez + broker + inmuebles − pasivosConocidos. */
  neto: number
  /** true si al neto le falta algo (valoraciones, pasivos, cuentas sin saldo). */
  parcial: boolean
  /** Motivos legibles de por qué es parcial. */
  faltan: string[]
}

export function resumenPatrimonio(
  activos: ActivoPatrimonio[],
  liquidez: number,
  broker: number,
  opts?: { cuentasSinSaldo?: number },
): ResumenPatrimonio {
  const faltan: string[] = []
  let inmuebles = 0
  let pasivosConocidos = 0
  let pasivoDesconocido = false

  for (const a of activos) {
    const estado = estadoActivo(a)
    // El valor entra COMPLETO (patrimonio familiar: Socorro 50/50 con Pilar cuenta entero);
    // el reparto por titular es asunto fiscal, no del neto de la familia.
    if (estado === 'valorado' && a.valoracion) inmuebles += a.valoracion.valor
    if (estado === 'pendiente_valoracion') faltan.push(`${a.nombre}: sin valoración de mercado`)

    if (a.hipotecaCapitalPendiente != null) {
      pasivosConocidos += a.hipotecaCapitalPendiente
    } else if (a.hipotecaCuotaMensual != null) {
      // Hay deuda (se paga cuota) pero no consta cuánta: declararla, no taparla.
      pasivoDesconocido = true
      faltan.push(`${a.nombre}: capital pendiente de la hipoteca sin dato`)
    }
  }

  const sinSaldo = opts?.cuentasSinSaldo ?? 0
  if (sinSaldo > 0) faltan.push(`${sinSaldo} cuenta(s) bancaria(s) sin saldo conocido`)

  return {
    liquidez,
    broker,
    inmuebles,
    pasivosConocidos,
    pasivoDesconocido,
    neto: liquidez + broker + inmuebles - pasivosConocidos,
    parcial: faltan.length > 0,
    faltan,
  }
}

// Preguntas de intake: los NULL que impiden valorar o decidir, en lenguaje de Alberto.
// Solo se pregunta lo que falta; a un subarrendado no se le piden datos de propietario.
export function preguntasIntake(activos: ActivoPatrimonio[]): string[] {
  const preguntas: string[] = []
  for (const a of activos) {
    if (a.tenencia !== 'propiedad') continue
    if (a.m2 == null) preguntas.push(`${a.nombre}: ¿cuántos m² tiene? (necesario para valorar por €/m²)`)
    if (a.refCatastral == null) preguntas.push(`${a.nombre}: referencia catastral (la trae el recibo del IBI)`)
    if (a.valorAdquisicion == null) preguntas.push(`${a.nombre}: valor de compra y año (escritura)`)
    if (a.pctTitular == null) preguntas.push(`${a.nombre}: ¿titularidad? (% tuyo / de Pilar / de la SL)`)
    if (a.hipotecaCuotaMensual != null && a.hipotecaCapitalPendiente == null)
      preguntas.push(`${a.nombre}: capital pendiente, tipo y vencimiento de la hipoteca`)
    if (a.licenciaVut === true && a.licenciaVutNum == null)
      preguntas.push(`${a.nombre}: nº de licencia VUT (registro de turismo)`)
  }
  return preguntas
}
