import { cookies } from 'next/headers'

import { COOKIE_NAME, verificarSesion } from '@/lib/auth'

/**
 * El botón de salir de la barra de marca.
 *
 * Hasta el 07/09/2026 el portal **no tenía ninguno**: la cookie dura 30 días y
 * la única forma de salir era borrarla a mano desde el navegador. En una
 * pantalla que se abre desde el móvil o desde el ordenador de casa —y que
 * enseña las pólizas, las primas y, con una autorización aceptada, las de otra
 * persona— eso no es una comodidad que falta: es que no se puede deshacer el
 * «entrar».
 *
 * 🚨 **Se pinta solo si HAY sesión, y eso se comprueba VERIFICANDO el token,
 * no viendo que la cookie existe.** Una cookie caducada o manipulada sigue
 * siendo una cookie: con la comprobación barata, quien no tiene sesión vería un
 * «Salir» que no significa nada. Y al revés importa más — si esto se pintara
 * siempre, la portada de quien aún no ha entrado ofrecería salir.
 *
 * No toca la BD a propósito: `verificarSesion` es firma, no consulta. Esta
 * cabecera la ve TODA la app, incluidas las páginas legales, y una consulta por
 * carga para decidir si se pinta un botón es un precio que no hay que pagar.
 */
export async function SalirDelPortal() {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (!token) return null
  if ((await verificarSesion(token)) === null) return null

  return (
    // Un `<form>` y no un enlace: la ruta es POST a propósito (ver
    // `app/api/salir/route.ts`), así que un `<Link>` aquí no cerraría nada — y
    // si la ruta aceptara GET para que funcionara, la precarga de los enlaces
    // cerraría la sesión al pasar el ratón.
    <form className="salir-form" action="/api/salir" method="post">
      <button type="submit" className="salir-boton">
        Salir
      </button>
    </form>
  )
}
