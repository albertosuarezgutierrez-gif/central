// Parte de la pasada del motor de precios: qué se escribió, qué NO, y si eso invalida la pasada.
//
// 🚨 `apply-auto` era el ÚNICO eslabón de la cadena de pricing sin latido propio — y es el que
// escribe el precio que ve el huésped (auditoría 23/08/2026, `docs/AUDITORIA-2026-08-pricing-mudo.md`).
// Los otros siete jobs sí latían. La consecuencia se midió el 22/08: `pricing_applied` con cero
// filas NO distingue «corrió y nada cruzó el umbral del 3%» de «no corrió». Hubo que resolverlo a
// mano cruzando el patrón histórico con `lib/cron-dispatch.ts`.
//
// La entrada `pricing` del registro de latidos NO cubre esto: vigila `pricing_decisiones.ciclo_at`,
// que es la Rutina SEMANAL. El cron que tarifica tres veces al día es otro y escribe en otra tabla.
//
// 🛑 Y el segundo silencio, el caro: si Smoobu RECHAZA la escritura, hasta hoy solo se apuntaba en
// el array `results` de la respuesta HTTP, que no lee nadie. Ni `ok:false`, ni Telegram, ni latido.
// Es exactamente el patrón del `skipped: "datos_insuficientes"` que el PR #1594 acaba de sacar del
// silencio un eslabón más abajo. Aquí duele más: el motor decidió un precio, la tabla de auditoría
// dice que se aplicó, y el huésped sigue viendo el viejo.

/**
 * Cuántas veces al día corre `apply-auto` (`lib/cron-dispatch.ts`: `30 8,14,20 * * *`).
 *
 * Vive aquí porque es lo que hace que el umbral del latido (26 h) y el ensanchamiento del raíl
 * sin ancla (±X%/pasada en vez de ±X%/día) sean los números que son. Un test lo contrasta contra
 * el fuente del cron: si alguien añade una 4ª pasada, salta en rojo en vez de mentir en silencio.
 */
export const PASADAS_POR_DIA_APPLY = 3

/** Un piso cuya escritura a Smoobu no entró. `fechas` = cuántas noches se quedaron sin aplicar. */
export type FalloEscritura = { property: string; motivo: string; fechas: number }

/**
 * Un piso cuya LECTURA de `/rates` falló (GET, no POST): el motor ni siquiera pudo mirar el
 * precio/disponibilidad actual, así que no propuso nada para ese piso en esta pasada.
 *
 * 🚨 Hasta el 15/09/2026 esto solo se apuntaba en `results[].error` de la respuesta HTTP —
 * indistinguible del `smoobu_rechazos` (que SÍ tiñe el latido) para quien no lee el JSON entero.
 * Es el mismo patrón que el hallazgo del 23/08 pero un paso más arriba: allí Smoobu rechazaba la
 * ESCRITURA con el precio ya decidido; aquí ni se llega a decidir porque la LECTURA previa falla.
 * El caso real que lo destapó: 4+ días de 401 en `/rates` (HMAC, ticket Smoobu #1864141) con
 * `ok:true` en cada pasada y el latido en verde — exactamente el silencio que este repo prohíbe.
 */
export type FalloLectura = { property: string; motivo: string }

export type ParteApply = {
  /** Pisos con recomendación que el motor ha recorrido en esta pasada. */
  pisos: number
  /** Noches efectivamente escritas en Smoobu (las de los pisos que SÍ entraron). */
  fechasEscritas: number
  /** Pisos que la pasada no llegó a tarificar (corpus insuficiente o mercado viejo). */
  sinTarifar: number
  fallos: FalloEscritura[]
  /** Pisos cuya lectura de `/rates` falló antes de poder calcular nada. */
  fallosLectura: FalloLectura[]
  /** Degradaciones ya declaradas por el motor (eventos ilegibles, ocupación…). */
  degradaciones: string[]
  dryRun: boolean
  /** Pausa global del motor (`pricing_config.paused`), que convierte la pasada en simulacro. */
  paused?: boolean
  /** Mensaje del propio motor cuando sale por la puerta corta (p. ej. ningún piso con apply_enabled). */
  nota?: string | null
}

/**
 * ¿Vale esta pasada como «buena» para el vigía de latidos?
 *
 * Rojo si el motor tarificó degradado (ya era `ok:false` en la respuesta) **o si alguna escritura
 * fue rechazada**: un precio que no llega a Smoobu no es un precio aplicado, por mucho que el motor
 * lo haya calculado bien.
 *
 * 🚦 NO se pone en rojo por `sinTarifar`. Es deliberado y hay que mantenerlo: esos pisos ya tienen
 * su propio aviso (`avisoPisosSinTarifar`) y los demás sí se tarificaron, así que la pasada no está
 * inválida. Un vigía que grita por lo que no le toca acaba ignorándose, y entonces no avisa de nada.
 *
 * Tampoco se pone en rojo por `fechasEscritas === 0`: si ninguna noche cruzó el umbral del 3%, la
 * pasada hizo su trabajo y la respuesta correcta es no tocar nada. Lo que ese cero NO puede es
 * seguir siendo indistinguible de «no corrió» — y eso lo resuelve la EXISTENCIA del latido, no su
 * color.
 */
export function pasadaFiable(p: ParteApply): boolean {
  return p.fallos.length === 0 && p.fallosLectura.length === 0 && p.degradaciones.length === 0
}

/**
 * Parte legible para `agente_latidos.detalle`. Lo lee un humano a las 07:45 con el Telegram del
 * vigía delante, así que antepone lo que exige acción y dice SIEMPRE de cuántos pisos habla.
 */
export function detalleApply(p: ParteApply): string {
  const partes: string[] = []
  if (p.fallosLectura.length > 0) {
    partes.push(
      `🛑 Smoobu no respondió al LEER ${p.fallosLectura.length} piso(s), sin poder ni comparar precio ` +
      `(${p.fallosLectura.map(f => `${f.property.replace('prop_', '')}: ${f.motivo}`).join(' · ')})`,
    )
  }
  if (p.fallos.length > 0) {
    const noches = p.fallos.reduce((s, f) => s + f.fechas, 0)
    partes.push(
      `🛑 Smoobu RECHAZÓ ${p.fallos.length} piso(s), ${noches} noche(s) sin aplicar ` +
      `(${p.fallos.map(f => `${f.property.replace('prop_', '')}: ${f.motivo}`).join(' · ')})`,
    )
  }
  partes.push(`${p.fechasEscritas} noche(s) escritas en ${p.pisos} piso(s)`)
  if (p.sinTarifar > 0) partes.push(`${p.sinTarifar} piso(s) sin tarifar`)
  if (p.degradaciones.length > 0) partes.push(`degradado: ${p.degradaciones.join('; ')}`)
  // ⏸️ La pausa gana al simulacro en el parte, y no es cosmético: `apply` convierte la pasada en
  // dryRun cuando `pricing_config.paused`, así que ambos casos llegan aquí con `dryRun:true`. Decir
  // solo «SIMULACRO» dejaría una pausa global olvidada indistinguible de una llamada de prueba —
  // y una pausa olvidada es el motor entero apagado con el latido en verde.
  if (p.paused) partes.push('⏸️ motor en PAUSA global (no escribe)')
  else if (p.dryRun) partes.push('SIMULACRO (no escribe)')
  if (p.nota) partes.push(p.nota)
  return partes.join(' · ')
}

/**
 * Aviso de Telegram cuando Smoobu rechaza la escritura. `null` si no hay ninguno.
 *
 * El texto tiene que dejar claro lo que separa este fallo de todos los demás de la cadena: aquí el
 * precio NO cambió en el canal. Decir «no se aplicaron N noches» sin más se lee como «no hacía
 * falta»; lo que pasa de verdad es que el huésped sigue viendo el precio anterior.
 */
export function avisoSmoobuRechaza(fallos: FalloEscritura[]): string | null {
  if (fallos.length === 0) return null
  const noches = fallos.reduce((s, f) => s + f.fechas, 0)
  const lineas = fallos.map(f =>
    `• ${f.property.replace('prop_', '')}: ${f.fechas} noche(s) — ${f.motivo}`)
  return (
    `🛑 *Pricing: Smoobu ha RECHAZADO la escritura de ${fallos.length} piso(s)*\n\n` +
    lineas.join('\n') +
    `\n\nEsas ${noches} noche(s) siguen con el precio ANTERIOR en el canal: el motor calculó uno ` +
    `nuevo y no ha llegado. No se ha anotado en \`pricing_applied\` a propósito — una fila ahí ` +
    `diría que se aplicó, y además sería el ancla del raíl de mañana.\n\n` +
    `Revisa la API key de Smoobu y los logs de \`/api/sivra/pricing/apply\`.`
  )
}

/**
 * Aviso de Telegram cuando Smoobu no responde a la LECTURA de `/rates`. `null` si no hay ninguno.
 *
 * Un escalón MÁS grave que `avisoSmoobuRechaza`: ahí el motor al menos llegó a decidir un precio.
 * Aquí ni eso — la avería es previa, así que el texto tiene que dejarlo claro: no hay propuesta
 * que revisar, solo un canal que no contesta.
 */
export function avisoSmoobuLecturaFalla(fallos: FalloLectura[]): string | null {
  if (fallos.length === 0) return null
  const lineas = fallos.map(f => `• ${f.property.replace('prop_', '')}: ${f.motivo}`)
  return (
    `🛑 *Pricing: Smoobu no responde al leer precios de ${fallos.length} piso(s)*\n\n` +
    lineas.join('\n') +
    `\n\nEsta pasada NO ha podido ni comparar el precio actual para esos pisos — no se ha propuesto ` +
    `ningún cambio, siguen con el precio de la última pasada que sí funcionó.\n\n` +
    `Revisa la API key de Smoobu y los logs de \`/api/sivra/pricing/apply\`.`
  )
}
