// «Tu parte ya está abierto con la compañía» / «Hemos revisado tu parte», en la campana.
//
// El cliente da el parte en el portal y la pantalla le dice, con razón, «lo hemos
// recibido nosotros; todavía no está comunicado a tu compañía». Sin este aviso,
// el siguiente paso —el que de verdad le cambia el día— solo lo descubre si
// vuelve a entrar a mirar la lista.
//
// Mismo patrón que la póliza nueva (`poliza-nueva.ts`): una VENTANA de días desde
// el cambio, sin marca de «visto». Se prefiere repetir el aviso unos días a añadir
// una columna de estado de lectura por un aviso que caduca solo.
//
// 🚨 Solo se avisa de lo que tiene FECHA de cambio: `abierto_en_compania_at` o
// `descartado_at`. Un `estado` sin su fecha no dice CUÁNDO pasó, y avisar de un
// cambio de hace un año como si fuera de hoy sería mentir con un dato viejo.

export const DIAS_AVISO_PARTE = 7

const MS_DIA = 86_400_000

export type ParteFilaAviso = {
  id: string
  fechaHecho: Date
  abiertoEnCompaniaAt: Date | null
  descartadoAt: Date | null
  motivoDescarte: string | null
  compania: string | null
}

export type ParteParaAviso = {
  id: string
  cambio: 'abierto' | 'descartado'
  /** `YYYY-MM-DD` del siniestro, para que la persona sepa de CUÁL se habla. */
  fechaHecho: string
  compania: string | null
  motivoDescarte: string | null
}

export function partesParaAviso(filas: readonly ParteFilaAviso[], hoy: Date): ParteParaAviso[] {
  const desde = hoy.getTime() - DIAS_AVISO_PARTE * MS_DIA
  const reciente = (d: Date | null): d is Date => d !== null && d.getTime() >= desde && d.getTime() <= hoy.getTime() + 60_000
  const salida: ParteParaAviso[] = []
  for (const f of filas) {
    const base = { id: f.id, fechaHecho: f.fechaHecho.toISOString().slice(0, 10), compania: f.compania }
    // Descartado gana: si se abrió y luego se descartó, lo último es lo que vale.
    if (reciente(f.descartadoAt)) salida.push({ ...base, cambio: 'descartado', motivoDescarte: f.motivoDescarte })
    else if (reciente(f.abiertoEnCompaniaAt)) salida.push({ ...base, cambio: 'abierto', motivoDescarte: null })
  }
  return salida
}
