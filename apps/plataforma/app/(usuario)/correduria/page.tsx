import CorreduriaClient from './CorreduriaClient'

/**
 * La pantalla de la correduría. Alberto usa UNA página —este cuadro de mando—
 * y la correduría es un negocio más dentro de ella; `apps/asegura` es la
 * trastienda que sirve los datos por su puerto HTTP.
 *
 * Desde el 03/09/2026 esta pantalla no compone ninguna URL de asegura:
 * retarificar —que es lo que gasta 0,50€— tiene su propia pantalla DENTRO de
 * plataforma, con su confirmación delante. El secreto del puerto no sale nunca
 * de las rutas de API ni de las acciones de servidor.
 */
export default function CorreduriaPage() {
  // Ya no se compone ninguna URL de asegura aquí: desde el 03/09/2026 el único
  // salto que quedaba desde esta pantalla —«Precio en otra compañía» de la cola
  // de retención— es INTERNO (`urlRetarificar` de `lib/ficha-asegura.ts`).
  return <CorreduriaClient />
}
