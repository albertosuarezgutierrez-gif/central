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
 * 🚨 **Solo se monta dentro de `<ConSesion>`** (ver `app/layout.tsx`): quien
 * todavía no ha entrado no ve un botón de salir. La verificación del token vive
 * allí desde el 08/09/2026, compartida con el botón de instalar.
 */
export function SalirDelPortal() {
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
