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
