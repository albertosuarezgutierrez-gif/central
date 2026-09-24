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

export type SustitucionAviso = {
  cliente: string
  diasSustituida: number
  polizaVieja: { aseguradora: string; numeroPoliza: string | null }
  polizaNueva: { aseguradora: string; numeroPoliza: string | null } | null
}

/** `null` = no hay nada que avisar (lista vacía): no se manda mensaje. */
export function mensajeSustituciones(filas: readonly SustitucionAviso[]): string | null {
  if (filas.length === 0) return null
  const cabecera = `🛡️ *Seguimiento de sustituciones · Grupo ASegura*\n` +
    `${filas.length} póliza(s) sustituida(s) por cambio de compañía, todavía sin confirmar por CIMA:\n\n`
  const lineas = filas
    .slice(0, 20)
    .map((f) => {
      const vieja = `${f.polizaVieja.aseguradora}${f.polizaVieja.numeroPoliza ? ` nº ${f.polizaVieja.numeroPoliza}` : ''}`
      const nueva = f.polizaNueva
        ? `${f.polizaNueva.aseguradora}${f.polizaNueva.numeroPoliza ? ` nº ${f.polizaNueva.numeroPoliza}` : ''}`
        : '?'
      const dias = f.diasSustituida === 1 ? 'hace 1 día' : `hace ${f.diasSustituida} días`
      return `• ${f.cliente}: ${vieja} → ${nueva} (${dias})`
    })
    .join('\n')
  const pie = filas.length > 20 ? `\n\n… y ${filas.length - 20} más. Lista completa en /correduria.` : ''
  return cabecera + lineas + pie
}
