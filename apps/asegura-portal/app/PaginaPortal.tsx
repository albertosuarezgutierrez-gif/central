import type { ReactNode } from 'react'

/**
 * El encabezado y el armazón ÚNICOS de las pantallas del portal (26/10/2026, «diseño único», Alberto).
 *
 * Hasta hoy solo la bóveda llevaba el vocabulario de marca (saludo + «Mis <em>seguros</em>» con el acento cobalto);
 * Inicio, Herramientas, Configuración, Patrimonio… pintaban un `<h1>` plano y las pantallas de fuera del armazón
 * (`/mi-alquiler`, `/inquilino`) un `fontSize: '1.5rem'` en línea. Aquí se escribe UNA vez:
 *
 *   saludo (opcional) · antetítulo (opcional) · `<h1>` con la palabra de acento en `<em>` (cobalto, sin cursiva:
 *   Quicksand no la tiene) · el contenido.
 *
 * - **Dentro del armazón** (`app/(portal)/layout.tsx` ya pone el `<main>`, el ancho y el menú): fragmento, nada más.
 * - **`suelta`**: para las pantallas que viven FUERA de ese armazón (sin menú, p. ej. el inquilino): abre su propio
 *   `<main>` con el tope de ancho y el aire de marca. Siempre `<main>`, nunca estilos en línea.
 *
 * El acento va en una palabra, no en toda la frase: es la que lleva el significado («Mis <em>seguros</em>»).
 * `idTitulo` existe porque algunas pantallas enlazan su `aria-labelledby` al titular.
 */
type PropsEncabezado = {
  /** El texto de delante del acento («Mis», «Lo que está»). Sin acento, es el titular entero. */
  titulo: ReactNode
  /** La palabra que lleva el color de marca. */
  acento?: ReactNode
  /** El rótulo pequeño sobre el titular (`.antetitulo`). */
  antetitulo?: ReactNode
  /** «Hola, Ana»: va encima del titular y no forma parte de él (el titular sigue diciendo en qué pantalla estás). */
  saludo?: ReactNode
  idTitulo?: string
}

/** Solo el encabezado (saludo · antetítulo · `<h1>`), para las pantallas que ya tienen su propio cuerpo. */
export function EncabezadoPortal({ titulo, acento, antetitulo, saludo, idTitulo }: PropsEncabezado) {
  return (
    <>
      {saludo && <p className="saludo">{saludo}</p>}
      {antetitulo && <p className="antetitulo">{antetitulo}</p>}
      <h1 id={idTitulo}>
        {titulo}
        {acento ? <> <em>{acento}</em></> : null}
      </h1>
    </>
  )
}

export function PaginaPortal({
  suelta,
  estrecha,
  children,
  ...encabezado
}: PropsEncabezado & {
  /** Fuera del armazón del portal: abre su propio `<main>`. */
  suelta?: boolean
  /** Solo con `suelta`: columna estrecha (formularios y enlaces) en vez de la ancha. */
  estrecha?: boolean
  children?: ReactNode
}) {
  const cuerpo = (
    <>
      <EncabezadoPortal {...encabezado} />
      {children}
    </>
  )
  if (!suelta) return cuerpo
  return <main className={estrecha ? 'pagina-portal-suelta pagina-portal-estrecha' : 'pagina-portal-suelta'}>{cuerpo}</main>
}
