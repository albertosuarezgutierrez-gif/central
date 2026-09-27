// A qué dirección se escribe el aviso de vencimiento cuando el TOMADOR no
// tiene ninguna email propia en su ficha.
//
// Dictado por Alberto (19/09/2026), viendo «Instituto Studium» y «Grupo ELCA
// 83» en «Clientes sin canal»: «muchos tienen contactos como estas empresas,
// suele tener persona de contacto, también habrá pólizas a nombre de personas
// sin teléfono pero si contacto... es la persona de referencia sobre esta
// póliza». No es un contacto de segunda: es a quién escribir cuando el titular
// no tiene por dónde.
//
// Reutiliza `contactoEfectivo()` (póliza → intervinientes: su propio dato mal
// guardado, o el de un tercero de la misma póliza) y, si eso tampoco da nada,
// cae a la persona de referencia declarada en `cliente_relaciones` — el CUARTO
// sitio de `clientes-sin-canal.ts`. Mismo orden, misma prioridad.

import { contactoEfectivo, type IntervinienteFicha } from './intervinientes.ts'

/** Una persona de referencia CON email propio, ya resuelta (ficha activa,
 *  vínculo distinto de «Sin vínculo», su propio destinatario ya calculado). */
export type AllegadoConEmail = {
  fichaId: string
  nombre: string
  /** El `tipo_relacion` tal cual lo escribió el CRM («Administración», «Cónyuge»…). */
  parentesco: string
  email: string
}

export type EmailAlternativo = {
  email: string
  /** `tomador_en_poliza` = SUYO, mal guardado (se llama igual, pero el cron
   *  lee la ficha y no le sale nada hasta que se copie). `interviniente` =
   *  otra persona de la MISMA póliza. `allegado` = persona de referencia
   *  declarada en `cliente_relaciones`, fuera de esa póliza. */
  via: 'tomador_en_poliza' | 'interviniente' | 'allegado'
  /** Quién es, cuando NO es el propio tomador — para que el correo pueda
   *  decir a quién se dirige y por qué motivo. `null` = es él mismo. */
  quien: { nombre: string | null; rol: string } | null
}

/**
 * `null` = de verdad no hay nadie a quien escribir (se cuenta como `sinCanal`,
 * no se inventa un destinatario). El orden de las dos fuentes importa: la
 * póliza primero (más pegada al hecho concreto), la persona de referencia
 * declarada, después.
 */
export function emailAlternativo(
  intervinientes: IntervinienteFicha[] | null,
  allegados: readonly AllegadoConEmail[],
): EmailAlternativo | null {
  const c = contactoEfectivo({ telefono: null, email: null }, intervinientes)
  if (c.email) {
    // `viaEmail` solo puede salir 'tomador_en_poliza' o 'interviniente' aquí:
    // se le pasa `email: null` como tomador, así que 'tomador' nunca sale.
    const via = c.viaEmail === 'interviniente' ? 'interviniente' : 'tomador_en_poliza'
    return { email: c.email, via, quien: c.quien ? { nombre: c.quien.nombre, rol: c.quien.rol } : null }
  }
  const a = allegados.find((x) => x.email)
  if (!a) return null
  return { email: a.email, via: 'allegado', quien: { nombre: a.nombre, rol: a.parentesco } }
}
