/**
 * La regla PURA del envío por lotes de la invitación al portal: de toda la
 * cartera en vigor, a quién se le escribe y a quién no, y por qué.
 *
 * ── Por qué existe (23/09/2026) ─────────────────────────────────────────────
 *
 * Medido ese día: el portal lleva desde el 01/09 funcionando y **no se había
 * mandado ni una invitación**. Había 51 fichas en vigor a las que se podía
 * invitar, y la única forma era abrir cada ficha y pulsar su botón. El lote no
 * cambia QUÉ se envía —es el mismo `invitarAlPortal`, con las mismas guardas—
 * sino que deja hacerlo con una sola confirmación.
 *
 * 🚨 Solo entra quien está `invitable`. `ya_entra` NO se «reinvita» (su correo
 * le diría que ya puede entrar a quien entró ayer), y los estados de fallo
 * (`ambiguo`, `resuelve_a_otra`, `ilegible`, `no_comprobado`…) se cuentan
 * aparte, cada uno con su nombre, porque se arreglan en sitios distintos.
 *
 * 🚨 Y a quien ya se invitó hace menos de `DIAS_SIN_REPETIR` no se le vuelve a
 * escribir: pulsar dos veces el botón no puede mandar dos correos a 51
 * personas. `null` en `invitadoHaceDias` = no consta invitación, y entonces sí
 * entra: la nota se escribe siempre tras un envío con éxito.
 */
import type { EstadoPortal } from './invitacion-portal'

export const DIAS_SIN_REPETIR = 30
/**
 * Tope por pulsación. El envío es secuencial (cada correo abre su SMTP y vuelve
 * a comprobar la ficha) y la ruta tiene 300 s: si la función muriera a mitad, el
 * último correo podría salir sin su nota en el historial y repetirse en la
 * siguiente tanda. Tandas cortas + `SEGUNDOS_PRESUPUESTO` lo evitan.
 */
export const MAX_POR_LOTE = 25
/** A partir de aquí no se empieza otro envío: lo que quede sale como `sinIntentar`. */
export const SEGUNDOS_PRESUPUESTO = 180

export type FichaCenso = {
  clienteId: string
  estado: EstadoPortal
  /** Días desde la última invitación anotada. `null` = no consta ninguna. */
  invitadoHaceDias: number | null
}

export type MotivoFuera = Exclude<EstadoPortal, 'invitable'> | 'invitado_hace_poco'

export type DecisionLote = {
  enviar: string[]
  fuera: Partial<Record<MotivoFuera, number>>
}

export function decidirLote(fichas: FichaCenso[], diasSinRepetir = DIAS_SIN_REPETIR): DecisionLote {
  const enviar: string[] = []
  const fuera: Partial<Record<MotivoFuera, number>> = {}
  const contar = (m: MotivoFuera) => {
    fuera[m] = (fuera[m] ?? 0) + 1
  }
  for (const f of fichas) {
    if (f.estado !== 'invitable') {
      contar(f.estado)
      continue
    }
    if (f.invitadoHaceDias !== null && Number.isFinite(f.invitadoHaceDias) && f.invitadoHaceDias < diasSinRepetir) {
      contar('invitado_hace_poco')
      continue
    }
    enviar.push(f.clienteId)
  }
  return { enviar, fuera }
}

/**
 * Los fallos que no son de UNA ficha sino de la instalación: si salen, los
 * siguientes envíos van a fallar igual y el lote se para en vez de repetir el
 * mismo error 50 veces.
 */
export const FALLOS_QUE_PARAN = ['sin_correo_configurado', 'sin_portal', 'remitente_no_verificado'] as const

export function paraElLote(estadoFallo: string): boolean {
  return (FALLOS_QUE_PARAN as readonly string[]).includes(estadoFallo)
}

/**
 * Y aunque el fallo no se reconozca como de instalación: si los últimos
 * `FALLOS_SEGUIDOS_PARAN` intentos fallaron IGUAL, la avería no es de las fichas.
 * Caso real (23/09/2026): 25 rechazos idénticos del proveedor en una tanda.
 * Un envío con éxito en medio rompe la racha.
 */
export const FALLOS_SEGUIDOS_PARAN = 3

export function rachaDeFallos(estados: readonly (string | null)[], n = FALLOS_SEGUIDOS_PARAN): boolean {
  if (estados.length < n) return false
  const ultimos = estados.slice(-n)
  return ultimos[0] !== null && ultimos.every((e) => e === ultimos[0])
}
