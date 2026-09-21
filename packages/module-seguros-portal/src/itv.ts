/**
 * Cuándo le toca la próxima ITV a un vehículo, según su antigüedad.
 *
 * 🚨 LO PRIMERO, PORQUE ES LO QUE DECIDE CÓMO SE PINTA: esto NO sabe cuándo
 * pasó la última inspección — nadie en este sistema lo sabe. Lo único que hace
 * es aplicar la periodicidad LEGAL a la fecha de matriculación, así que hay
 * dos calidades de respuesta muy distintas y por eso `fiabilidad` no es un
 * adorno:
 *
 *  · `primera`  → al vehículo TODAVÍA no le ha tocado ninguna ITV, así que la
 *    fecha que sale es la de su primera inspección y **no depende de ninguna
 *    inspección previa**: es tan firme como la fecha de matriculación de la que
 *    parte.
 *  · `ciclo_estimado` → ya debería haber pasado alguna. La fecha supone que las
 *    fue pasando en el aniversario de su matriculación, y en la vida real la
 *    siguiente ITV se cuenta desde la ÚLTIMA inspección (que pudo adelantarse o
 *    retrasarse). Es una estimación y quien la pinte tiene que decirlo.
 *
 * Colapsar los dos casos en «tu próxima ITV es el X» es exactamente el fallo
 * que persigue la regla de la casa: un cálculo servido como dato confirmado.
 *
 * ── LA LEY ───────────────────────────────────────────────────────────────────
 * RD 920/2017, Anexo I (periodicidad de las inspecciones):
 *  · Turismos (M1) y ligeros de personas: exentos hasta los 4 años, bienal de
 *    4 a 10, anual a partir de 10.
 *  · Motocicletas y categoría L: exentos hasta los 4 años, bienal después.
 *
 * ⚠️ **Las furgonetas (N1) NO están aquí a propósito**, y no es un olvido: su
 * cuadro es otro (exentas 2 años, bienal de 2 a 6, anual después) y **este
 * sistema no sabe distinguir una furgoneta de un turismo** — el ramo de la
 * póliza solo dice `auto` o `moto`, y deducirlo de la marca y el modelo sería
 * adivinar. Añadir el perfil sin poder elegirlo sería código que no se alcanza;
 * lo correcto es que la pantalla AVISE de que ha calculado como turismo, que es
 * lo que hace.
 */
import { siguienteOcurrencia, ultimoDiaDelMes } from './recordatorio-libre.ts'

/** Los dos perfiles que se pueden DERIVAR del ramo de una póliza. Ver la cabecera. */
export type PerfilItv = 'turismo' | 'moto'

/**
 * De qué calidad es la fecha que sale. Ver la cabecera: no se colapsan.
 *  · `primera`        → aún no le ha tocado ninguna; la fecha no depende de nada más.
 *  · `ciclo_estimado` → ya le tocó alguna; se SUPONE que las pasó en su aniversario.
 */
export type FiabilidadItv = 'primera' | 'ciclo_estimado'

export type ProximaItv = {
  /** `YYYY-MM-DD`. */
  fecha: string
  fiabilidad: FiabilidadItv
  /** Cada cuántos meses le toca a partir de esta, para poder ofrecer la repetición. */
  periodicidadMeses: number
}

type Tramo = { readonly desdeMeses: number; readonly cadaMeses: number }

/**
 * Tramos por perfil, del más joven al más viejo. El primero marca además
 * cuándo deja de estar exento: su `desdeMeses` ES la edad de la primera ITV.
 */
const TRAMOS: Readonly<Record<PerfilItv, readonly Tramo[]>> = {
  turismo: [
    { desdeMeses: 48, cadaMeses: 24 },
    { desdeMeses: 120, cadaMeses: 12 },
  ],
  moto: [{ desdeMeses: 48, cadaMeses: 24 }],
}

/** El ramo de la póliza → perfil. Cualquier otro ramo no tiene ITV que calcular. */
export function perfilItvDeRamo(ramo: string | null | undefined): PerfilItv | null {
  if (ramo === 'auto') return 'turismo'
  if (ramo === 'moto') return 'moto'
  return null
}

/**
 * Tope de ciclos que se avanzan. Un vehículo de los años 60 son ~60 iteraciones;
 * 200 va sobrado y garantiza que un tramo mal escrito (`cadaMeses: 0`) no
 * cuelgue el render en vez de fallar.
 */
const TOPE_CICLOS = 200

function dia(iso: string): Date | null {
  const limpio = iso.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return null
  const d = new Date(`${limpio}T00:00:00Z`)
  // `new Date('2027-02-30T00:00:00Z')` NO da inválido: `Date` lo normaliza al 2
  // de marzo en silencio. Se comprueba que devuelve el mismo día que se pidió,
  // igual que `normalizarRecordatorio()`.
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== limpio) return null
  return d
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Meses completos entre dos fechas (el mismo criterio de «edad» que usa la ley).
 *
 * 🚨 El día del aniversario se RECORTA al último del mes de llegada, y eso no
 * es un detalle: un vehículo matriculado un 29 de febrero arrastra sus ciclos
 * sobre el 28 (ver `siguienteOcurrencia`), así que comparar el 28 contra el 29
 * a pelo diría que a los diez años solo tiene 119 meses — y se saltaría el
 * escalón a ITV anual durante un ciclo entero. Es el «un año tarde» que el test
 * de este módulo declara que no puede pasar, colándose por un día. Lo encontró
 * `code-review` con el caso `2016-02-29`, donde el 28 y el 1 de marzo sí
 * acertaban y solo fallaba el 29.
 */
function mesesEntre(desde: Date, hasta: Date): number {
  const meses =
    (hasta.getUTCFullYear() - desde.getUTCFullYear()) * 12 + (hasta.getUTCMonth() - desde.getUTCMonth())
  const aniversario = Math.min(
    desde.getUTCDate(),
    ultimoDiaDelMes(hasta.getUTCFullYear(), hasta.getUTCMonth()),
  )
  // Si aún no ha llegado el día del mes, ese mes no está cumplido.
  return hasta.getUTCDate() < aniversario ? meses - 1 : meses
}

/** Cada cuántos meses le toca a esa EDAD. El tramo más viejo que ya ha alcanzado. */
function cadaMesesEnEdad(tramos: readonly Tramo[], edadMeses: number): number {
  let cada = tramos[0]!.cadaMeses
  for (const t of tramos) if (edadMeses >= t.desdeMeses) cada = t.cadaMeses
  return cada
}

/**
 * La próxima ITV de un vehículo matriculado en `fechaMatriculacion`.
 *
 * Devuelve `null` —«no lo sé»— y NUNCA una fecha de relleno cuando la fecha de
 * matriculación no es una fecha real (`YYYY-MM-DD` válida). Un vehículo cuya
 * matriculación está en el futuro (una estimación pasada de rosca, una fecha mal
 * tecleada) no es un caso raro que haya que tapar: su primera ITV sale igual de
 * bien, más lejos.
 */
export function proximaItv(x: {
  /** `YYYY-MM-DD`. */
  fechaMatriculacion: string
  perfil: PerfilItv
  hoy: Date
}): ProximaItv | null {
  const matriculacion = dia(x.fechaMatriculacion)
  if (matriculacion === null) return null
  const hoyDia = new Date(
    Date.UTC(x.hoy.getUTCFullYear(), x.hoy.getUTCMonth(), x.hoy.getUTCDate()),
  )
  const tramos = TRAMOS[x.perfil]

  // La primera inspección: la edad en la que deja de estar exento.
  let fecha = siguienteOcurrencia(matriculacion, tramos[0]!.desdeMeses)
  if (fecha.getTime() >= hoyDia.getTime()) {
    return {
      fecha: iso(fecha),
      fiabilidad: 'primera',
      periodicidadMeses: cadaMesesEnEdad(tramos, mesesEntre(matriculacion, fecha)),
    }
  }

  // Ya le tocó alguna. Se avanza ciclo a ciclo —no se multiplica— porque la
  // periodicidad CAMBIA con la edad (a los 10 años un turismo pasa de bienal a
  // anual) y una división saltaría ese escalón.
  let ciclos = 0
  while (fecha.getTime() < hoyDia.getTime() && ciclos < TOPE_CICLOS) {
    fecha = siguienteOcurrencia(fecha, cadaMesesEnEdad(tramos, mesesEntre(matriculacion, fecha)))
    ciclos += 1
  }
  if (fecha.getTime() < hoyDia.getTime()) return null

  return {
    fecha: iso(fecha),
    fiabilidad: 'ciclo_estimado',
    periodicidadMeses: cadaMesesEnEdad(tramos, mesesEntre(matriculacion, fecha)),
  }
}
