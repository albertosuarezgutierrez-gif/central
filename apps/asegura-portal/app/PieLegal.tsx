import Link from 'next/link'

import { lineaIdentificacion } from '@central/module-seguros'

/**
 * Pie legal del portal. Va en el layout raíz, así que sale en TODAS las
 * pantallas, incluida la de entrada.
 *
 * No es decoración ni un pie de cortesía: el art. 19 de la Ley 16/2018 obliga a
 * que el cliente pueda identificar al mediador y saber dónde reclamar antes de
 * darle un dato, y la única pantalla que ve alguien que aún no ha entrado es
 * justamente la que pide el correo. Por eso la línea de identificación está
 * aquí, visible, y no escondida detrás de un enlace.
 *
 * Server component a propósito: es texto constante, no necesita hidratarse.
 */
export function PieLegal() {
  return (
    <footer className="pie-legal">
      <p className="pie-legal-identidad">{lineaIdentificacion()}</p>
      <nav aria-label="Información legal">
        <Link href="/legal/mediador">Información del mediador</Link>
        <Link href="/legal/privacidad">Privacidad</Link>
        <Link href="/legal/cookies">Cookies</Link>
        <Link href="/legal/condiciones">Condiciones de uso</Link>
      </nav>
    </footer>
  )
}
