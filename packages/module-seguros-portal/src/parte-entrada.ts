// Qué enseña la pantalla del parte según la póliza con la que se ENTRA.
//
// ── POR QUÉ EXISTE (03/10/2026) ─────────────────────────────────────────────
//
// Alberto, entrando en la póliza de hogar de su padre (autorizada) → «siniestro»:
// le salían los teléfonos de TODAS las compañías. Causa: el enlace de la ficha
// solo llevaba `?poliza=` cuando la póliza admitía parte (`polizasParaParte`);
// sin el alcance de dar partes, el enlace iba a la pestaña general y la pantalla
// pintaba las compañías de toda la cartera. Y con `?poliza=` el formulario dejaba
// cambiar de póliza. Aclaración de Alberto: «el flujo debe ser UNO y el mismo para
// cualquier póliza (propia o ajena, de cualquier ramo): desde la póliza →
// teléfono de SU compañía → formulario de parte de esa póliza».
//
// Este helper es ese único camino. Recibe TODAS las opciones (propias, ajenas,
// donde figura, declaradas) en una sola lista, cada una con `puedeParte`, y la
// póliza elegida. No hay rama por tipo de póliza: la única diferencia admisible
// es la autorización (`puedeParte`), y esa la decide el servidor con
// `polizasParaParte` — la misma fuente que usa la ruta para devolver 403.
//
// Reglas:
//   · Sin póliza (o una que no está en la lista: un `?poliza=` manipulado) →
//     `elegir`: primero se elige el seguro. Las compañías NO se pintan de golpe;
//     van en `otras`, que la pantalla pliega detrás de un botón (plegar no es
//     borrar: quien no sabe de qué seguro es tiene que poder llegar a ellas).
//   · Con póliza → `principal` es el canal de ESA póliza, nunca uno «parecido»
//     de la lista (el cruce por nombre ya lo hizo `canalDeCompania`, exacto).
//     Si su compañía no casa con el catálogo, `principal.sinDatos` y la pantalla
//     dice «pídenoslo / llámanos»: no se sustituye por la lista entera.
//   · `otras` = el resto de compañías, sin la principal y sin duplicados.

import { canalesDeLasPolizas, type CanalCompania } from './canal-compania.ts'

export type OpcionEntradaParte = {
  /** `cartera:<uuid>` o `declarada:<uuid>`. */
  valor: string
  canal: CanalCompania
  /** Decidido en el SERVIDOR con `polizasParaParte`. La ruta lo vuelve a comprobar (403). */
  puedeParte: boolean
}

export type VistaParte =
  | { modo: 'elegir'; otras: CanalCompania[] }
  | {
      modo: 'poliza'
      valor: string
      /** El canal de la compañía de ESTA póliza. `sinDatos` = no lo tenemos verificado. */
      principal: CanalCompania
      puedeParte: boolean
      otras: CanalCompania[]
    }

const clave = (c: CanalCompania): string => c.nombre.trim().toLowerCase()

export function vistaDelParte(opciones: readonly OpcionEntradaParte[], elegida: string | null | undefined): VistaParte {
  const todas = canalesDeLasPolizas(opciones.map((o) => o.canal))
  const op = typeof elegida === 'string' && elegida !== '' ? opciones.find((o) => o.valor === elegida) : undefined
  if (op === undefined) return { modo: 'elegir', otras: todas }

  // Una compañía en blanco (aportada sin identificar) es «no lo sabemos»: se
  // enseña como sin datos, nunca se rellena con otra.
  const principal: CanalCompania =
    clave(op.canal) === '' ? { nombre: '', vias: [], sinDatos: true, verificadoEn: null } : op.canal
  const k = clave(principal)
  return {
    modo: 'poliza',
    valor: op.valor,
    principal,
    puedeParte: op.puedeParte === true,
    otras: k === '' ? todas : todas.filter((c) => clave(c) !== k),
  }
}

/** Qué `?poliza=` vale de verdad: solo uno que esté en la lista ya autorizada. */
export function entradaValida(opciones: readonly OpcionEntradaParte[], poliza: string | null | undefined): string | null {
  return typeof poliza === 'string' && opciones.some((o) => o.valor === poliza) ? poliza : null
}
