// De la respuesta del puerto de asegura a lo que la tabla de precios necesita
// para decir, de cada fila, si se puede emitir o se irá por defensa de cartera.
//
// Vive aparte de la pantalla por una razón concreta: esto es la frontera entre
// dos apps que se despliegan por separado, o sea el sitio exacto donde un
// campo ausente se convierte en una afirmación falsa. Aquí se puede probar.

import type { CompaniaCatalogo, PolizaCliente } from '@central/module-seguros'

/** Lo que la tabla necesita. `null` = la cartera no se ha podido mirar. */
export type ContextoDefensa = {
  polizas: readonly PolizaCliente[]
  catalogo: readonly CompaniaCatalogo[]
  polizaActualId: string | null
  companiaActualDgs: string | null
  companiaActualNombre: string | null
}

/** Lo mínimo de la póliza que se retarifica (para distinguir `actual`). */
export type PolizaEnCurso = {
  id: string
  codigoEntidadDgs: string | null
  aseguradora: string
}

/**
 * En qué compañías está ya el cliente, leído del bloque que sirve la
 * precalificación de asegura (que es gratis y ya tiene la ficha delante).
 *
 * 🚨 Devuelve `null` —y la tabla entonces no afirma nada de ninguna fila—
 * siempre que el bloque no venga con la forma esperada: una asegura desplegada
 * antes que esto no lo manda, y **un `[]` aquí diría que el cliente no tiene
 * póliza en ninguna compañía**, que es justo la mentira que tranquiliza.
 *
 * Se lee sobre `unknown` a propósito, como todo lo que cruza el puerto: la
 * forma se comprueba en ejecución, no se confía en el tipo de la otra app.
 */
export function leerContextoDefensa(pre: unknown, p: PolizaEnCurso): ContextoDefensa | null {
  if (typeof pre !== 'object' || pre === null) return null
  const bruto = (pre as Record<string, unknown>).carteraCompanias
  if (typeof bruto !== 'object' || bruto === null) return null
  const b = bruto as Record<string, unknown>
  if (!Array.isArray(b.polizas) || !Array.isArray(b.catalogo)) return null

  const polizas: PolizaCliente[] = []
  for (const fila of b.polizas) {
    if (typeof fila !== 'object' || fila === null) return null
    const f = fila as Record<string, unknown>
    // `viva` tiene que venir declarado: sin él no se puede decidir si esa
    // póliza defiende, y suponer `false` la dejaría fuera en silencio.
    if (typeof f.viva !== 'boolean') return null
    polizas.push({
      id: cadenaONulo(f.id),
      codigoEntidadDgs: cadenaONulo(f.codigoEntidadDgs),
      aseguradora: cadenaONulo(f.aseguradora),
      estado: cadenaONulo(f.estado),
      viva: f.viva,
      ramo: cadenaONulo(f.ramo),
      numeroPoliza: cadenaONulo(f.numeroPoliza),
    })
  }

  const catalogo: CompaniaCatalogo[] = []
  for (const fila of b.catalogo) {
    if (typeof fila !== 'object' || fila === null) return null
    const f = fila as Record<string, unknown>
    if (typeof f.codigoDgs !== 'string' || typeof f.nombreComun !== 'string') return null
    catalogo.push({
      codigoDgs: f.codigoDgs,
      nombreComun: f.nombreComun,
      nombreCima: cadenaONulo(f.nombreCima),
      alias: Array.isArray(f.alias) ? f.alias.filter((x): x is string => typeof x === 'string') : [],
    })
  }

  return {
    polizas,
    catalogo,
    polizaActualId: p.id,
    companiaActualDgs: p.codigoEntidadDgs,
    companiaActualNombre: p.aseguradora,
  }
}

function cadenaONulo(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}
