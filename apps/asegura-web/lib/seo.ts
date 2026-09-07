// Constructores de JSON-LD. Puros y testeados: devuelven objetos, no `<script>`.
//
// Por qué vive aquí y no incrustado en cada página: el mismo dato del mediador
// (clave DGSFP, domicilio, correo) aparece en la ficha del negocio, en las
// migas y en el pie. Escribirlo en cada `page.tsx` garantiza que un día tres
// páginas digan tres cosas distintas. La fuente es `MEDIADOR`, de
// `@central/module-seguros`, que es la que comparten el panel del corredor y el
// portal del asegurado.
import { MEDIADOR } from '@central/module-seguros'
import { AMBITO, HORARIO, PERFILES, SITIO_URL, url } from './sitio.ts'
import { RAMOS, type Ramo } from './ramos.ts'
import type { Articulo } from './articulos.ts'

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
 *   · `aggregateRating`: ver abajo.
 *
 * ✅ `telephone` SÍ se declara desde el 05/09/2026: Alberto confirmó su móvil
 * para publicarlo. Hasta entonces se omitía a propósito —un teléfono en
 * JSON-LD es la promesa de que alguien coge—. Sale de `MEDIADOR`, no de aquí,
 * porque el mismo número tiene que ir al pie, al botón de WhatsApp y a Google
 * Business: si esta ficha y ese perfil declaran teléfonos distintos, Google
 * reparte la señal local entre dos negocios.
 *   · `aggregateRating`: no se autopublica nunca. Las valoraciones las emite
 *     Google a partir de reseñas reales, y marcarlas a mano es motivo de acción
 *     manual.
 */
/**
 * Parte el domicilio del mediador en calle y código postal.
 *
 * `MEDIADOR.identidad.domicilio` es una línea («San Juan de La Palma, nº 28,
 * 41003 Sevilla») porque es como se lee en una web; schema.org los quiere
 * separados. Si algún día esa cadena deja de encajar con este patrón, el CP se
 * omite en vez de inventarse: un `postalCode` equivocado en la ficha local es
 * peor que no declararlo.
 */
function partirDomicilio(): { calle: string; cp: string | null } {
  const dom = MEDIADOR.identidad.domicilio
  const m = /^(.*?),\s*(\d{5})\s+.*$/.exec(dom)
  if (!m) return { calle: dom, cp: null }
  return { calle: m[1].replace(/,?\s*n[ºo°]\s*/i, ', ').replace(/\s+/g, ' ').trim(), cp: m[2] }
}

export function fichaNegocio(): Record<string, unknown> {
  const { calle, cp } = partirDomicilio()
  const ficha: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'InsuranceAgency',
    '@id': `${SITIO_URL}/#correduria`,
    name: MEDIADOR.marca,
    url: SITIO_URL,
    email: MEDIADOR.identidad.email,
    telephone: MEDIADOR.identidad.telefono,
    description:
      'Correduría de seguros que media en toda España. Analizamos entre varias compañías el seguro de hogar, comunidades, comercio, auto, vida y salud.',
    founder: { '@type': 'Person', name: MEDIADOR.identidad.nombre },
    address: {
      '@type': 'PostalAddress',
      // 🚨 DERIVADO de `MEDIADOR.identidad.domicilio`, no escrito a mano. Lo
      // estaba, y coincidía por suerte: es exactamente la segunda copia que la
      // cabecera de este fichero dice querer evitar, y la que rompe el NAP el
      // día que alguien corrija una sola de las dos.
      streetAddress: calle,
      // Se OMITE si no se pudo leer, en vez de mandar null: un campo ausente
      // es la verdad, un `postalCode: null` es basura en la ficha.
      ...(cp ? { postalCode: cp } : {}),
      addressLocality: AMBITO.ciudad,
      addressRegion: AMBITO.provincia,
      addressCountry: AMBITO.pais,
    },
    // 🚨 `areaServed` es dónde se PRESTA el servicio, no dónde está la oficina
    // (eso lo dice `address`, y sigue siendo Sevilla). Declaraba ciudad y
    // comunidad, o sea que la propia ficha afirmaba que fuera de Andalucía no
    // se atiende. Se media en toda España: el país, y punto.
    areaServed: { '@type': 'Country', name: AMBITO.nacional },
    // La clave DGSFP es lo que distingue a un corredor inscrito de cualquiera
    // que monte una web de seguros. Va como identificador, no como texto suelto.
    identifier: {
      '@type': 'PropertyValue',
      name: 'Clave DGSFP',
      value: MEDIADOR.identidad.claveDgsfp,
    },
    // 🚨 DERIVADO de `RAMOS`, no escrito a mano. Era una lista de seis cadenas
    // fijas, y el día que se publicó flota (07/09/2026) se quedó corta sin que
    // fallara nada: la ficha habría declarado que la correduría no sabe de un
    // ramo con página propia, formulario y enlace en el pie. Es la misma segunda
    // copia que la cabecera de este fichero dice querer evitar.
    knowsAbout: RAMOS.map((r) => `Seguro de ${r.nombre.toLowerCase()}`),
  }
  if (HORARIO) ficha.openingHours = [...HORARIO.schema]
  // `sameAs` = los perfiles que son ESTE mismo negocio. Se OMITE cuando no hay
  // ninguno: un array vacío afirmaría «se miró y no hay», y lo cierto es que
  // todavía no se han dado de alta. Lo vigila `seo-perfiles.test.ts`.
  if (PERFILES.length > 0) ficha.sameAs = [...PERFILES]
  return ficha
}

/**
 * Ficha de SERVICIO por ramo (`Service`).
 *
 * Qué añade sobre lo que ya había: la ficha `InsuranceAgency` dice quién es el
 * negocio, y el `FAQPage` dice qué preguntas responde una página. Faltaba el
 * dato del medio — que ESTE negocio presta ESTE servicio —, y es justo el que
 * une la página de ramo con la entidad. Sin él, «seguro de flota» es una
 * cadena de texto en una página; con él, un servicio atribuido a una correduría
 * con clave DGSFP.
 *
 * 🚨 El `provider` va por referencia (`@id`), nunca copiando la ficha. Dos
 * descripciones del mismo negocio en la misma página es la segunda copia de
 * siempre: el día que cambie el teléfono, una de las dos se queda vieja.
 *
 * 🚨 Y sin `offers` ni `price`. No es una omisión técnica: una prima publicada
 * en datos estructurados es una promesa de precio —lo que RDL 3/2020 convierte
 * en asesoramiento— y además sería falsa, porque la fija cada compañía por
 * riesgo. Lo vigila `seo-servicio.test.ts`.
 */
export function fichaServicio(ramo: Ramo): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${url(`/seguros/${ramo.slug}`)}#servicio`,
    name: ramo.h1,
    serviceType: `Seguro de ${ramo.nombre.toLowerCase()}`,
    url: url(`/seguros/${ramo.slug}`),
    description: ramo.description,
    provider: { '@id': `${SITIO_URL}/#correduria` },
    areaServed: { '@type': 'Country', name: AMBITO.nacional },
  }
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
/**
 * Ficha de ARTÍCULO (`Article`).
 *
 * Los seguros son un tema YMYL —de los que afectan al dinero de quien lee—, y
 * ahí lo que un buscador pondera es quién firma. Por eso el `author` no es la
 * marca: es la PERSONA, con su clave DGSFP como identificador. Es exactamente
 * lo que un comparador no puede declarar.
 *
 * 🚨 El autor sale de `MEDIADOR`, no se teclea. Es el mismo dato del pie legal,
 * de la ficha del negocio y de la credencial: tres copias del nombre son dos
 * copias de más.
 *
 * 📌 `dateModified` se emite SOLO si el artículo se ha revisado de verdad.
 * Rellenarlo con la fecha de publicación —o peor, con la de hoy— afirma una
 * revisión que no ha ocurrido, y es justo el dato que se usa para decidir si el
 * contenido está al día.
 */
export function fichaArticulo(a: Articulo): Record<string, unknown> {
  const url_ = url(`/blog/${a.slug}`)
  const ficha: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${url_}#articulo`,
    headline: a.h1,
    description: a.description,
    url: url_,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url_ },
    inLanguage: 'es-ES',
    datePublished: a.fecha,
    author: {
      '@type': 'Person',
      name: MEDIADOR.identidad.nombre,
      jobTitle: MEDIADOR.identidad.figura,
      identifier: {
        '@type': 'PropertyValue',
        name: 'Clave DGSFP',
        value: MEDIADOR.identidad.claveDgsfp,
      },
    },
    publisher: { '@id': `${SITIO_URL}/#correduria` },
  }
  if (a.revisado) ficha.dateModified = a.revisado
  return ficha
}

export function jsonLd(obj: Record<string, unknown>): string {
  // `<` escapado: un `</script>` dentro de una cadena del JSON cerraría la
  // etiqueta y convertiría el resto de la página en marcado suelto.
  return JSON.stringify(obj).replace(/</g, '\\u003c')
}
