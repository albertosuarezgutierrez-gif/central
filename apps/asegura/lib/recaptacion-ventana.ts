// Ventana de contacto para los leads con VENCIMIENTO ANTIGUO (Fase 2,
// 20/09/2026). Lógica PURA, sin BD — mismo motivo que `recaptacion-lote.ts`:
// que `node --test` la corra sin arrastrar el cliente Prisma.
//
// ─── Por qué existe ─────────────────────────────────────────────────────────
// Alberto: "los que tienen vencimiento aunque hace años, coger mes y día para
// ir mandando WhatsApp mes y medio antes; el resto podemos ir captando ya".
// El AÑO de esos leads no sirve (son de 2014-2018), pero el MES/DÍA es una
// pista real de cuándo solía renovar cada año — y avisar 45 días antes, no en
// cualquier momento, es lo que hace de esa pista algo accionable en vez de
// ruido: escribir a alguien en julio sobre un seguro que renovaba en enero no
// tiene ningún motivo real detrás.
//
// Los leads `sin_vencimiento` (Fase 1) NO pasan por aquí: sin fecha a la que
// anclar, no hay ventana que calcular — siguen siendo contactables siempre,
// como ya eran.

/** Días de antelación con los que se abre la ventana de contacto. */
export const VENTANA_DIAS_ANTIGUO = 45

function diasEnMes(mes: number, anio: number): number {
  // Día 0 del mes SIGUIENTE = último día de `mes`. Cubre bisiestos sin tabla.
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

function medianoche(hoy: Date): number {
  return Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
}

/**
 * La próxima fecha en la que cae ese mes/día, a partir de hoy (hoy incluido).
 * Un 29 de febrero cae en año no bisiesto se ajusta al día 28 — no se salta
 * el año entero por un dato que en el fondo apunta a "finales de febrero".
 */
export function proximoAniversario(mes: number, dia: number, hoy: Date = new Date()): Date {
  const anio = hoy.getUTCFullYear()
  const diaAjustado = Math.min(dia, diasEnMes(mes, anio))
  const candidato = Date.UTC(anio, mes - 1, diaAjustado)
  if (candidato >= medianoche(hoy)) return new Date(candidato)
  const anioSig = anio + 1
  const diaAjustadoSig = Math.min(dia, diasEnMes(mes, anioSig))
  return new Date(Date.UTC(anioSig, mes - 1, diaAjustadoSig))
}

/** Días que faltan hasta esa fecha (0 = hoy). Nunca negativo: siempre mira al futuro. */
export function diasHastaAniversario(mes: number, dia: number, hoy: Date = new Date()): number {
  const aniversario = proximoAniversario(mes, dia, hoy).getTime()
  return Math.round((aniversario - medianoche(hoy)) / 86_400_000)
}

/**
 * `true` si hoy cae dentro de los `ventanaDias` anteriores a su aniversario
 * (los 45 días por defecto). Al salir de la ventana no se pierde el lead:
 * simplemente deja de ser candidato hasta que se acerque otra vez el año que
 * viene — `colaRecaptacion` lo cuenta aparte (`enEsperaVentana`), nunca lo
 * descarta de la BD ni deja de existir.
 */
export function dentroVentanaAntiguo(
  mes: number,
  dia: number,
  hoy: Date = new Date(),
  ventanaDias: number = VENTANA_DIAS_ANTIGUO,
): boolean {
  return diasHastaAniversario(mes, dia, hoy) <= ventanaDias
}
