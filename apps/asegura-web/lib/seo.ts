// Constructores de JSON-LD. Puros y testeados: devuelven objetos, no `<script>`.
//
// Por qué vive aquí y no incrustado en cada página: el mismo dato del mediador
// (clave DGSFP, domicilio, correo) aparece en la ficha del negocio, en las
// migas y en el pie. Escribirlo en cada `page.tsx` garantiza que un día tres
// páginas digan tres cosas distintas. La fuente es `MEDIADOR`, de
// `@central/module-seguros`, que es la que comparten el panel del corredor y el
// portal del asegurado.
import { MEDIADOR } from '@central/module-seguros'
import { AMBITO, HORARIO, SITIO_URL, url } from './sitio'
import type { Ramo } from './ramos'

/**
 * Ficha del negocio: `InsuranceAgency`, que es un subtipo de `LocalBusiness` y
 * de `FinancialService`. Es la que alimenta el panel de conocimiento y la que
 * Google cruza con el perfil de Google Business.
 *
 * 🚨 Todo lo que se declara aquí tiene que coincidir EXACTAMENTE con el perfil
 * de Google Business: nombre, dirección y teléfono. Es el famoso NAP, y una
 * discrepancia entre las dos fichas no es un detalle estético: reparte la señal
 * local en dos negocios distintos y hunde el posicionamiento que se pretendía.
 *
 * 📌 Lo que NO se declara, y es a propósito:
 *   · `openingHours` mientras `HORARIO` sea `null` (no se ha confirmado).
 *   · `telephone` mientras no haya un número público confirmado. Un teléfono en
 *     JSON-LD es una promesa de que alguien coge: si no lo hay, se omite. Un
 *     campo ausente es la verdad; un campo inventado es una mentira estructurada.
 *   · `aggregateRating`: no se autopublica nunca. Las valoraciones las emite
 *     Google a partir de reseñas reales, y marcarlas a mano es motivo de acción
 *     manual.
 */
export function fichaNegocio(): Record<string, unknown> {
  const ficha: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'InsuranceAgency',
    '@id': `${SITIO_URL}/#correduria`,
    name: MEDIADOR.marca,
    url: SITIO_URL,
    email: MEDIADOR.identidad.email,
    description:
      'Correduría de seguros en Sevilla. Analizamos entre varias compañías el seguro de hogar, comunidades, comercio, auto, vida y salud.',
    founder: { '@type': 'Person', name: MEDIADOR.identidad.nombre },
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'San Juan de La Palma, 28',
      postalCode: '41003',
      addressLocality: AMBITO.ciudad,
      addressRegion: AMBITO.provincia,
      addressCountry: AMBITO.pais,
    },
    areaServed: [
      { '@type': 'City', name: AMBITO.ciudad },
      { '@type': 'AdministrativeArea', name: AMBITO.comunidad },
    ],
    // La clave DGSFP es lo que distingue a un corredor inscrito de cualquiera
    // que monte una web de seguros. Va como identificador, no como texto suelto.
    identifier: {
      '@type': 'PropertyValue',
      name: 'Clave DGSFP',
      value: MEDIADOR.identidad.claveDgsfp,
    },
    knowsAbout: ['Seguro de hogar', 'Seguro de comunidades', 'Seguro de comercio', 'Seguro de auto', 'Seguro de vida', 'Seguro de salud'],
  }
  if (HORARIO) ficha.openingHours = [...HORARIO.schema]
  return ficha
}

/**
 * Migas de pan. Se emiten SOLO cuando hay jerarquía de verdad (home → sección →
 * página); una miga de un solo nivel no aporta nada y ensucia.
 */
export function migas(items: readonly { nombre: string; ruta: string }[]): Record<string, unknown> | null {
  if (items.length < 2) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.nombre,
      item: url(it.ruta),
    })),
  }
}

/**
 * `FAQPage` a partir del FAQ del ramo.
 *
 * Devuelve `null` si no hay preguntas: un `FAQPage` vacío es marcado inválido,
 * y aquí el hueco («este ramo aún no tiene FAQ») se respeta en vez de emitir un
 * esqueleto sin contenido.
 */
export function fichaFaq(ramo: Ramo): Record<string, unknown> | null {
  if (ramo.faq.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: ramo.faq.map((f) => ({
      '@type': 'Question',
      name: f.pregunta,
      acceptedAnswer: { '@type': 'Answer', text: f.respuesta },
    })),
  }
}

/** Serializa un objeto para meterlo en un `<script type="application/ld+json">`. */
export function jsonLd(obj: Record<string, unknown>): string {
  // `<` escapado: un `</script>` dentro de una cadena del JSON cerraría la
  // etiqueta y convertiría el resto de la página en marcado suelto.
  return JSON.stringify(obj).replace(/</g, '\\u003c')
}
