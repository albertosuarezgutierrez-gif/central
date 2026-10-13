// ────────────────────────────────────────────────────────────────────────────
// Aviso de SEGUIMIENTO de sustituciones (cambios de compañía) de la correduría.
//
// La cola «Seguimiento de sustituciones» de /correduria solo sirve si Alberto
// entra a mirarla. Este mensaje es el mismo digest que Renovaciones: se manda
// TODOS los días mientras haya algo pendiente (no hay hito legal que marque
// un único momento de aviso, así que no hace falta dedupe por fila — la
// pregunta «¿ya lo confirmó CIMA?» sigue siendo la misma pregunta cada día
// hasta que la respuesta cambia). Todo lo de aquí es PURO: sin BD, sin red.
// ────────────────────────────────────────────────────────────────────────────

type PolizaAviso = { aseguradora: string; numeroPoliza: string | null }

export type SustitucionAviso = {
  cliente: string
  diasSustituida: number
  polizaVieja: PolizaAviso
  polizaNueva: PolizaAviso | null
  /** Tres estados: `null` = no se sabe (nunca se lee como `false`). Opcionales: ausente = `null`. */
  nuevaConfirmadaCima?: boolean | null
  nuevaReciboCima?: boolean | null
  viejaEnVigorCima?: boolean | null
}

export type EstadoNueva = 'sin_rastro' | 'cobrada_sin_ficha' | 'confirmada' | 'desconocido'
export type EstadoVieja = 'en_vigor' | 'anulada' | 'desconocido'

/**
 * Clasifica una fila. Nueva: ficha CIMA → `confirmada`; recibo cobrado sin ficha → `cobrada_sin_ficha`;
 * ambos `false` → `sin_rastro`; cualquier `null` sin prueba positiva → `desconocido` (no se afirma ausencia).
 * Vieja: `en_vigor` (posible doble seguro: confirmar la anulación en la compañía) | `anulada` | `desconocido`.
 */
export function clasificarSustitucion(f: Pick<SustitucionAviso, 'nuevaConfirmadaCima' | 'nuevaReciboCima' | 'viejaEnVigorCima'>): { nueva: EstadoNueva; vieja: EstadoVieja } {
  const conf = f.nuevaConfirmadaCima ?? null
  const rec = f.nuevaReciboCima ?? null
  const nueva: EstadoNueva =
    conf === true ? 'confirmada'
    : rec === true ? 'cobrada_sin_ficha'
    : conf === false && rec === false ? 'sin_rastro'
    : 'desconocido'
  const v = f.viejaEnVigorCima ?? null
  const vieja: EstadoVieja = v === true ? 'en_vigor' : v === false ? 'anulada' : 'desconocido'
  return { nueva, vieja }
}

const TEXTO_NUEVA: Record<EstadoNueva, string> = {
  sin_rastro: 'sin rastro en CIMA',
  cobrada_sin_ficha: 'cobrada (recibo en CIMA), falta la ficha de póliza',
  confirmada: 'confirmada por CIMA',
  desconocido: 'estado en CIMA sin determinar',
}

function nombrePoliza(p: PolizaAviso): string {
  return `${p.aseguradora}${p.numeroPoliza ? ` nº ${p.numeroPoliza}` : ''}`
}

/** `null` = no hay nada que avisar (lista vacía): no se manda mensaje. */
export function mensajeSustituciones(filas: readonly SustitucionAviso[]): string | null {
  if (filas.length === 0) return null
  const clasif = filas.map((f) => ({ f, c: clasificarSustitucion(f) }))
  // Posible doble seguro primero: es lo realmente peligroso.
  const ordenadas = [...clasif.filter((x) => x.c.vieja === 'en_vigor'), ...clasif.filter((x) => x.c.vieja !== 'en_vigor')]
  const nDoble = clasif.filter((x) => x.c.vieja === 'en_vigor').length
  const cabecera = `🛡️ *Seguimiento de sustituciones · Grupo ASegura*\n` +
    `${filas.length} póliza(s) sustituida(s) por cambio de compañía, pendientes de cerrar en CIMA` +
    (nDoble > 0 ? ` (${nDoble} con posible DOBLE SEGURO)` : '') + `:\n\n`
  const lineas = ordenadas
    .slice(0, 20)
    .map(({ f, c }) => {
      const vieja = nombrePoliza(f.polizaVieja)
      const nueva = f.polizaNueva ? nombrePoliza(f.polizaNueva) : '?'
      const dias = f.diasSustituida === 1 ? 'hace 1 día' : `hace ${f.diasSustituida} días`
      const aviso = c.vieja === 'en_vigor'
        ? `\n  ⚠️ Confirma en ${f.polizaVieja.aseguradora} la anulación de${f.polizaVieja.numeroPoliza ? ` nº ${f.polizaVieja.numeroPoliza}` : ' la póliza vieja'} (sigue en vigor en CIMA)`
        : ''
      return `• ${f.cliente}: ${vieja} → ${nueva} (${dias})${aviso}\n  Nueva: ${TEXTO_NUEVA[c.nueva]}`
    })
    .join('\n')
  const pie = filas.length > 20 ? `\n\n… y ${filas.length - 20} más. Lista completa en /correduria.` : ''
  return cabecera + lineas + pie
}

/**
 * Avisos de «póliza sustituida que sigue viva». `null` = nada que avisar. Sin PII: solo el texto de la señal
 * (nº de póliza + compañía) que ya compuso `avisoDobleSeguro`.
 */
export function mensajeDobleSeguro(avisos: readonly { texto: string }[]): string | null {
  if (avisos.length === 0) return null
  const lineas = avisos.slice(0, 20).map((a) => `• ${a.texto}`).join('\n')
  const pie = avisos.length > 20 ? `\n… y ${avisos.length - 20} más.` : ''
  return `⚠️ *Posible doble seguro · Grupo ASegura*\n${avisos.length} póliza(s) sustituida(s) siguen vivas:\n\n${lineas}${pie}`
}

/**
 * Envía varios avisos de forma INDEPENDIENTE: un fallo de uno no impide los demás. Los errores se agregan.
 * `mensaje === null` = nada que enviar (no cuenta).
 */
export async function enviarAvisosIndependientes(
  envios: ReadonlyArray<{ id: string; mensaje: string | null; enviar: (mensaje: string) => Promise<unknown> }>,
): Promise<{ enviados: number; errores: string[] }> {
  let enviados = 0
  const errores: string[] = []
  for (const e of envios) {
    if (e.mensaje === null) continue
    try {
      await e.enviar(e.mensaje)
      enviados++
    } catch (err) {
      errores.push(`${e.id}: ${String(err).slice(0, 120)}`)
    }
  }
  return { enviados, errores }
}
