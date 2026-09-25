/**
 * Con qué fecha de efecto arranca el campo de la pantalla de retarificar.
 *
 * Una cotización guardada trae sus `correcciones` enteras, `fechaEfecto`
 * incluida, y se volcaban tal cual sobre el default: la del proyecto
 * 40685666 (efecto 12/09, cotizado el 12/09) reaparecía el 13/09 como valor
 * del campo — ya caducada — y «Pedir precio» moría en el 422 de asegura hasta
 * que Alberto la cambiaba a mano. Una fecha guardada solo se reutiliza si la
 * compañía la sigue admitiendo: ni anterior a hoy ni a más de `maxDias`.
 * Fuera de eso, el default (mañana).
 */
const RE_ISO = /^\d{4}-\d{2}-\d{2}$/

export function fechaEfectoInicial(
  guardada: string | undefined,
  hoy: string,
  porDefecto: string,
  maxDias = 90,
): string {
  if (!guardada || !RE_ISO.test(guardada) || !RE_ISO.test(hoy)) return porDefecto
  const tope = new Date(`${hoy}T00:00:00Z`)
  tope.setUTCDate(tope.getUTCDate() + maxDias)
  const topeIso = tope.toISOString().slice(0, 10)
  return guardada >= hoy && guardada <= topeIso ? guardada : porDefecto
}

/**
 * La fecha de efecto por defecto al retarificar una póliza de la cartera.
 *
 * Regla de Alberto (25/09/2026): si la póliza está en cartera y su vencimiento
 * es FIABLE, la nueva se emite con **la misma fecha** que el vencimiento — ni un
 * día de hueco sin seguro ni un día solapado con la vieja. Fiable = lo trae
 * CIMA (póliza viva) y no es una emitida nuestra, cuyo vencimiento es el
 * provisional «emisión + 1 año»; eso lo decide el llamador y pasa `null` si no.
 *
 * Solo se usa si la compañía lo admite (entre hoy y hoy+`maxDias`). Si ya pasó
 * o queda más lejos, se cae a `manana`, como antes: esa sigue siendo la fecha
 * que siempre cumple la ventana del vendor.
 */
export function fechaEfectoPorDefecto(
  vencimientoFiable: string | null,
  hoy: string,
  manana: string,
  maxDias = 90,
): string {
  const v = vencimientoFiable?.slice(0, 10)
  return fechaEfectoInicial(v, hoy, manana, maxDias)
}
