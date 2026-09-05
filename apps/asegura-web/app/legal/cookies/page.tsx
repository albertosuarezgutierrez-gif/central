// Política de cookies.
//
// El listado de cookies NO se escribe a mano: lo publica Cookiebot a partir de
// lo que su rastreo encuentra de verdad en el dominio (`cd.js`). Una lista
// escrita a mano envejece el día que se añade una herramienta y entonces dice
// algo falso sobre datos personales, que es peor que no decir nada.
import type { Metadata } from 'next'
import Link from 'next/link'
import { COOKIEBOT_ID } from '@/lib/analitica'
import BotonCookies from '@/components/BotonCookies'

export const metadata: Metadata = {
  title: 'Política de cookies',
  description:
    'Qué cookies usa la web de Grupo ASegura, para qué sirven y cómo cambiar o retirar tu consentimiento en cualquier momento.',
}

export default function Cookies() {
  return (
    <>
      <h1>Política de cookies</h1>

      <p>
        Esta web usa las cookies imprescindibles para funcionar y, <strong>solo si tú lo aceptas</strong>, cookies de
        medición que nos dicen qué páginas se visitan y desde dónde. No hay cookies de publicidad ni se comparte tu
        navegación con redes sociales.
      </p>

      <p>
        Si no aceptas las de medición, la web funciona igual: simplemente no sabremos que has pasado por aquí. No se
        instala ninguna cookie de análisis antes de que contestes.
      </p>

      <h2>Cambiar de opinión</h2>
      <p>
        Puedes retirar o cambiar tu consentimiento cuando quieras, y es tan fácil como darlo:
      </p>
      <p>
        <BotonCookies />
      </p>

      <h2>Qué cookies hay exactamente</h2>
      {COOKIEBOT_ID ? (
        <>
          {/* Lo pinta Cookiebot en el cliente a partir de su rastreo del dominio. */}
          <script
            id="CookieDeclaration"
            src={`https://consent.cookiebot.com/${COOKIEBOT_ID}/cd.js`}
            type="text/javascript"
            async
          />
          <noscript>
            <p>
              El listado detallado se carga con JavaScript. Si lo tienes desactivado, escríbenos y te lo enviamos.
            </p>
          </noscript>
        </>
      ) : (
        // 🚨 Sin gestor de consentimiento configurado NO se mide nada (ver
        // `lib/analitica.ts`). Se dice, en vez de dejar el hueco en blanco: un
        // apartado vacío se lee como «no hay cookies», que sería afirmar algo
        // que nadie ha comprobado.
        <p>
          El listado detallado aún no está publicado en esta web. Mientras tanto no se activa ninguna cookie de
          medición: solo funcionan las imprescindibles para servir la página.
        </p>
      )}

      <h2>Tus datos</h2>
      <p>
        Cómo tratamos los datos personales que nos das tú (por ejemplo, al pedir presupuesto) está en{' '}
        <Link href="/legal/privacidad">la política de privacidad</Link>.
      </p>
    </>
  )
}
