import type { Metadata } from 'next'
import Link from 'next/link'

import { MEDIADOR, FECHA_TEXTOS_LEGALES, VERSION_TEXTOS_LEGALES } from '@central/module-seguros'

export const metadata: Metadata = {
  title: 'Cookies — Grupo Asegura',
  description:
    'El portal del cliente de Grupo Asegura usa una única cookie, técnica y necesaria para mantener la sesión. No hay analítica ni publicidad.',
}

/**
 * Aviso de cookies del portal.
 *
 * 🚨 Esta página dice que hay UNA cookie. Es verdad hoy —`asegura_portal_session`
 * es la única que se emite, y no hay ningún script de terceros en el `<head>`—
 * y por eso NO hay banner: el art. 22.2 LSSI exime del consentimiento a las
 * cookies estrictamente necesarias, pero solo a esas.
 *
 * El día que alguien meta analítica, un píxel o un chat embebido, esta página
 * pasa de ser cierta a ser una infracción documentada, porque el texto seguirá
 * afirmando lo contrario. Encender cualquier cosa de esas obliga, EN EL MISMO
 * PR, a: reescribir esta página, montar un banner con rechazo tan fácil como la
 * aceptación, y no cargar nada antes de que el usuario acepte. Lo vigila
 * `test/regression-portal-legal.test.ts`.
 */
export default function Cookies() {
  const { identidad } = MEDIADOR

  return (
    <>
      <p className="legal-antetitulo">Cookies · Art. 22.2 LSSI</p>
      <h1>Cookies</h1>
      <p className="legal-entradilla">
        Este portal usa <strong>una sola cookie</strong>, y es la que hace falta para mantenerte
        dentro. No hay analítica, ni publicidad, ni nada de terceros mirando lo que haces aquí. Por
        eso tampoco te sale un banner pidiéndote permiso: no hay nada que consentir.
      </p>

      <section>
        <h2>La única cookie</h2>
        <div className="legal-tabla-scroll">
          <table className="legal-tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Para qué</th>
                <th>Duración</th>
                <th>Tipo</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>asegura_portal_session</code>
                </td>
                <td>
                  Mantener tu sesión abierta después de meter el código, para no pedírtelo en cada
                  pantalla.
                </td>
                <td>30 días</td>
                <td>Propia · técnica y necesaria</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Es una cookie propia: la emite este mismo sitio, no la lee ningún script del navegador y
          solo viaja por conexión cifrada. No sirve para seguirte por otras webs, porque no la ve
          nadie más.
        </p>
      </section>

      <section>
        <h2>Cómo quitarla</h2>
        <p>
          Borrando las cookies de este sitio desde tu navegador, o cerrando sesión. La consecuencia
          es la esperable: se te pedirá otra vez el código para entrar. Si bloqueas las cookies del
          sitio por completo, el portal no podrá reconocerte y no funcionará.
        </p>
      </section>

      <section>
        <h2>Lo que no hay</h2>
        <p>
          Ni Google Analytics, ni PostHog, ni píxeles de redes sociales, ni cookies de terceros de
          ningún tipo. Si esto cambiara, esta página cambiaría antes y te pediríamos permiso de
          verdad, con un «rechazar» tan fácil de pulsar como el «aceptar».
        </p>
        <p>
          Qué datos tratamos y con quién los compartimos está en la{' '}
          <Link href="/legal/privacidad">política de privacidad</Link>. Para cualquier duda:{' '}
          <a href={`mailto:${identidad.email}`}>{identidad.email}</a>.
        </p>
      </section>

      <p className="legal-version">
        Versión {VERSION_TEXTOS_LEGALES} · última revisión {FECHA_TEXTOS_LEGALES}
      </p>
    </>
  )
}
