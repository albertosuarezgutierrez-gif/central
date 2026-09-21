// De lo que sirve el puerto de asegura a lo que la tabla de precios necesita
// para decir, de cada fila, si se puede emitir o se irá por defensa de cartera.
//
// Vive aparte de la pantalla por una razón concreta: esto es la frontera entre
// dos apps que se despliegan por separado, o sea el sitio exacto donde un campo
// ausente se convierte en una afirmación falsa. Aquí se puede probar.

import type { CompaniaCatalogo, PolizaCliente } from '@central/module-seguros'
import { catalogoParaDefensa, polizasParaDefensa, type CarteraCompanias } from './retarificar-asegura.ts'

/** Lo que la tabla necesita. `null` = la cartera del cliente no se ha mirado. */
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
 * 🚨 Devuelve `null` —y entonces la tabla no afirma nada de ninguna fila y lo
 * declara en pantalla— siempre que la cartera no se haya podido mirar: una
 * `apps/asegura` desplegada antes que esto no manda el bloque. **Un `[]` aquí
 * diría que el cliente no tiene póliza en ninguna compañía**, que es justo la
 * respuesta que tranquiliza, y pintaría las 24 filas como emitibles.
 *
 * La comprobación de forma la hizo ya `leerCarteraCompanias()`, que nunca
 * devuelve el campo ausente como una lista vacía. Aquí solo se compone.
 */
export function leerContextoDefensa(
  cartera: CarteraCompanias | null | undefined,
  p: PolizaEnCurso,
): ContextoDefensa | null {
  const polizas = polizasParaDefensa(cartera)
  if (polizas === null) return null
  return {
    polizas,
    catalogo: catalogoParaDefensa(cartera),
    // El puerto manda cuál es la póliza en curso; si no llega, la de la
    // pantalla. Su compañía es `actual` (ahí se renueva, no se emite nueva).
    polizaActualId:
      cartera && cartera.estado === 'ok' ? (cartera.polizaActualId ?? p.id) : p.id,
    companiaActualDgs: p.codigoEntidadDgs,
    companiaActualNombre: p.aseguradora,
  }
}

/** Por qué no se ha podido mirar, para pintarlo. `null` = sí se ha mirado. */
export function motivoSinCartera(cartera: CarteraCompanias | null | undefined): string | null {
  if (!cartera) return 'el puerto de asegura no ha mandado la cartera del cliente.'
  return cartera.estado === 'no_disponible' ? cartera.porque : null
}
