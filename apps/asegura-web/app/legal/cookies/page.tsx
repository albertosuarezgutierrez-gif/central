// Política de cookies.
//
// El listado de abajo son las CATEGORÍAS que declara nuestro propio banner
// (`@central/core-consent`), no un rastreo automático del dominio — Cookiebot
// generaba esa tabla sola a partir de `cd.js`; nuestro CMP no lo hace, así que
// aquí se describe a mano lo que cada categoría cubre. Es deliberadamente
// genérico (categorías, no cookies individuales con nombre y caducidad) para
// no prometer un detalle que no se mantiene solo.
import type { Metadata } from 'next'
import Link from 'next/link'
import { VERSION_TEXTOS_WEB, FECHA_TEXTOS_WEB } from '@central/module-seguros'
import { url } from '@/lib/sitio'
import { POSTHOG_KEY } from '@/lib/analitica'
import BotonCookies from '@/components/BotonCookies'

export const metadata: Metadata = {
  title: 'Política de cookies',
  description:
    'Qué cookies usa la web de Grupo ASegura, para qué sirven y cómo cambiar o retirar tu consentimiento en cualquier momento.',
  // Como las otras tres legales: sin canonical, una página que está en el
  // sitemap puede indexarse por varias URLs y repartir la señal.
  alternates: { canonical: url('/legal/cookies') },
}

export default function Cookies() {
  return (
    // `wrap pagina` porque desde el rediseño del 05/09/2026 el `<main>` del
    // layout ya no lleva contenedor: sin esto el texto va de borde a borde.
    <div className="wrap pagina">
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
      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '16px 0' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderBottom: '1px solid var(--borde, #ddd)', padding: '8px 12px 8px 0' }}>
              Categoría
            </th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid var(--borde, #ddd)', padding: '8px 0' }}>
              Para qué se usa
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '8px 12px 8px 0', verticalAlign: 'top' }}>Necesarias</td>
            <td style={{ padding: '8px 0', verticalAlign: 'top' }}>
              Recuerdan tu elección de cookies (qué aceptaste y cuándo). No se pueden desactivar: sin ellas el
              banner te lo preguntaría en cada visita.
            </td>
          </tr>
          <tr>
            <td style={{ padding: '8px 12px 8px 0', verticalAlign: 'top' }}>Estadística</td>
            <td style={{ padding: '8px 0', verticalAlign: 'top' }}>
              {POSTHOG_KEY
                ? 'PostHog (analítica propia, alojada en la Unión Europea): nos dice qué páginas se visitan más, de forma anónima.'
                : 'Ahora mismo esta categoría no tiene ninguna herramienta activa detrás.'}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '8px 12px 8px 0', verticalAlign: 'top' }}>Marketing</td>
            <td style={{ padding: '8px 0', verticalAlign: 'top' }}>
              Esta web no usa hoy ninguna cookie de marketing. Si en algún momento se activa una, aparecerá aquí
              antes de que se instale.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Tus datos</h2>
      <p>
        Cómo tratamos los datos personales que nos das tú (por ejemplo, al pedir presupuesto) está en{' '}
        <Link href="/legal/privacidad">la política de privacidad</Link>.
      </p>

      {/* Las otras tres legales cierran igual. Sin versión no se puede saber
          qué texto estaba vigente cuando alguien dio su consentimiento, que es
          justo lo que hay que poder acreditar. */}
      <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 32 }}>
        Versión {VERSION_TEXTOS_WEB} · última revisión {FECHA_TEXTOS_WEB}
      </p>
    </div>
  )
}
