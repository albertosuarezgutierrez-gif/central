// Configuración del sitio público de Grupo ASegura.
//
// 🚨 Esta app es la ÚNICA superficie de marketing de la correduría y no toca la
// base de datos: no tiene Prisma, ni rol de BD, ni secreto de sesión. Lo único
// que sale de aquí es el formulario de leads, y sale por `/api/lead`, que
// reenvía al puerto público que ya existe en `apps/plataforma`. Si algún día
// esta app necesita credenciales de BD, la decisión correcta casi siempre es
// mover esa función a `apps/asegura`, no traer la BD al sitio público.
//
// Los datos del mediador (clave DGSFP, domicilio, correo) NO se escriben aquí:
// vienen de `@central/module-seguros` (`MEDIADOR`), que es la fuente única de
// los dos lados de la correduría. Una segunda copia de la clave DGSFP es una
// copia de más: el día que cambie una, la otra miente sin que falle nada.

/**
 * Origen público del sitio, sin barra final.
 *
 * Sale de `NEXT_PUBLIC_SITIO_URL` para que el sitemap, los canonical y las
 * tarjetas Open Graph apunten al dominio de verdad desde el primer despliegue.
 * El valor por defecto es el apex donde la web SIRVE, `grupoasegura.es`
 * (atado a este proyecto Vercel el 05/09/2026): si la variable falta, las URL
 * salen correctas igualmente en producción, y en una preview salen apuntando a
 * producción (que es preferible a emitir un canonical hacia una URL de preview,
 * porque eso sí ensucia el índice de Google).
 *
 * 🚨 NO poner aquí `grupoasegura.com`: ese apex existe pero apunta a un parking
 * de IONOS (`217.160.0.254`, medido 05/09/2026). Con él por defecto, cada
 * página servida en `.es` declaraba como canónica una URL que no carga, y el
 * sitemap listaba 17 URL de un dominio vacío — un «no lo sé» disfrazado de
 * valor que Google se cree. Si algún día el `.com` se ata a este proyecto,
 * será como redirección al `.es`, no como canónico.
 */
export const SITIO_URL = (process.env.NEXT_PUBLIC_SITIO_URL || 'https://grupoasegura.es').replace(/\/+$/, '')

/**
 * Intranet del cliente (`apps/asegura-portal`), sin barra final.
 *
 * Es el ÚNICO acceso que esta web ofrece: el asegurado entra a ver y guardar
 * sus pólizas. Decisión de Alberto (05/09/2026): la web es 100 % venta, y **no
 * lleva enlace a la intranet de la correduría** — él entra por su panel de
 * plataforma, no desde aquí. Un «Acceso corredor» en la web pública es una
 * puerta que ningún cliente necesita y que enseña dónde está la trastienda.
 *
 * Sale de `NEXT_PUBLIC_PORTAL_URL`. **Ya pasó lo que esta nota anunciaba**
 * (07/09/2026): `clientes.grupoasegura.es` está atado al proyecto
 * `asegura-portal` con «Valid Configuration», sirve el portal (título medido:
 * «Mis seguros — Grupo ASegura»), y la variable está puesta en los tres
 * entornos. Así que el defecto pasa a ser ese dominio y no el
 * `asegura-portal.vercel.app` de antes: si algún día falta la variable, el
 * botón tiene que llevar al dominio de la casa, no a una URL de Vercel.
 *
 * El `.vercel.app` sigue existiendo y sirviendo, así que esto no arregla nada
 * roto — cambia cuál es el canónico.
 */
export const PORTAL_URL = (process.env.NEXT_PUBLIC_PORTAL_URL || 'https://clientes.grupoasegura.es').replace(/\/+$/, '')

/** URL absoluta a partir de una ruta interna (`/seguros/hogar` → `https://…/seguros/hogar`). */
/**
 * Tarjeta de compartir (WhatsApp, LinkedIn, Telegram) para las páginas que
 * declaran su propio `openGraph`. 🚨 Next NO hereda la imagen de
 * `app/opengraph-image.tsx` en cuanto una página pone `openGraph` en su
 * `metadata`: el objeto hijo sustituye al del padre ENTERO, imagen incluida.
 * Medido el 27/09/2026 — los ramos, el blog y las guías salían sin `og:image`.
 * Por eso toda página con `openGraph` lleva `images: [OG_IMAGEN]` (lo vigila
 * `lib/og-imagen.test.ts`), y `opengraph-image.tsx` lee de aquí su tamaño.
 */
export const OG_IMAGEN = { url: '/opengraph-image', width: 1200, height: 630 } as const

export function url(ruta: string): string {
  return `${SITIO_URL}${ruta.startsWith('/') ? ruta : `/${ruta}`}`
}

/**
 * Ámbito geográfico.
 *
 * 🚨 DOS COSAS DISTINTAS, y confundirlas fue lo que había que arreglar
 * (07/09/2026, dictado de Alberto: «vendemos a nivel nacional, no provinciales
 * solo»):
 *
 *   · `nacional` es el ámbito en el que se VENDE y se media. Un corredor
 *     inscrito en la DGSFP puede mediar en toda España, y así se trabaja. Es lo
 *     que dice el copy visible y lo que declara `areaServed` en el JSON-LD.
 *   · `ciudad`/`provincia`/`comunidad` son el DOMICILIO de la oficina, no un
 *     límite de servicio. Solo se usan para la dirección postal de la ficha
 *     `InsuranceAgency` —que tiene que coincidir con el perfil de Google
 *     Business (NAP)— y para el fuero del aviso legal.
 *
 * Hasta esta fecha los `<h1>`, los `<title>` y la ficha decían «en Sevilla» y
 * «atendemos en Sevilla y su provincia»: eso no acotaba el SEO, acotaba la
 * OFERTA — quien entraba desde otra provincia leía que no se le atiende. El
 * anclaje local no se pierde: sigue en la dirección publicada y en el perfil de
 * Google Business, que es de donde sale la señal del pack local, no de repetir
 * la ciudad en cada encabezado.
 */
export const AMBITO = {
  /** Dónde se vende y se media. Es el ámbito que se declara al visitante. */
  nacional: 'España',
  ciudad: 'Sevilla',
  provincia: 'Sevilla',
  comunidad: 'Andalucía',
  pais: 'ES',
} as const

/**
 * Perfiles oficiales del negocio. Alimentan `sameAs` en la ficha
 * `InsuranceAgency` (`lib/seo.ts`), que es lo que le dice a un buscador que la
 * web y esos perfiles son EL MISMO negocio, no varios con nombre parecido.
 *
 * Aquí eso no es cosmético: conviven tres dominios propios (`grupoasegura.es`,
 * `app.grupoasegura.com` con el CRM, y la landing vieja de plataforma) y existe
 * una correduría HOMÓNIMA en Montevideo (`grupoasegura.com.uy`). Sin `sameAs`,
 * la señal de marca se reparte entre todos.
 *
 * 🚨 Reglas, vigiladas por `seo-perfiles.test.ts`: URL **canónica** del perfil
 * (nunca un acortador como `share.google`, que caduca y esconde su destino),
 * sin parámetros de campaña (el botón «compartir» de las apps pega un `?si=`),
 * y sin repetir. Si la lista queda vacía, `sameAs` **no se emite** — un array
 * vacío afirmaría «se miró y no hay perfiles», que no es lo mismo que «todavía
 * no se han dado de alta».
 *
 * ⚠️ **Nada de esto está MEDIDO desde el repo**: el proxy de esta sesión deniega
 * `youtube.com` y `google.com`, así que un perfil entra aquí por la palabra de
 * Alberto. El guardián comprueba la FORMA; que la URL sea suya, no puede.
 *
 * 📍 La ficha de Google Business va en su forma `?cid=`: es el identificador
 * estable del sitio en Maps. La URL `/maps/place/…/@lat,lng,17z/data=…` que da el
 * navegador lleva el encuadre del mapa pegado y cambia con cada vista. `cid` es
 * el ÚNICO parámetro que el guardián admite, y solo en `/maps`.
 */
export const PERFILES: readonly string[] = [
  // Canal de YouTube. El handle canónico lleva las mayúsculas del monograma
  // («AS» = Alberto Suárez), igual que la marca: YouTube no las distingue, pero
  // en datos estructurados va la forma que el propio canal publica.
  'https://www.youtube.com/@GrupoASegura',
  // Ficha de Google Business (Maps). CID = 0xc09217e32b3f9bbc de la URL del
  // sitio, pasado a decimal. Dado por el panel de la ficha el 29/09/2026.
  'https://www.google.com/maps?cid=13876179666332523452',
] as const

/**
 * Coordenadas del pin de la ficha de Google Business (29/09/2026). Salen de la
 * propia ficha, no de geocodificar la dirección: `geo` tiene que coincidir con
 * el pin que Google ya muestra, o la ficha y la web se contradicen.
 */
export const GEO = { latitude: 37.3948384, longitude: -5.9904272 } as const

/**
 * La calculadora del seguro del banco (29/09/2026). Solo con el enlace del pie
 * no la encontraba nadie (Alberto: «no veo en la web la calculadora del banco»),
 * así que también sale en la portada y en los dos ramos que el banco pide con
 * la hipoteca: hogar (daños del inmueble) y vida. En la cabecera no cabe: está
 * medida al límite (ver `NAV_CABECERA`).
 */
export const CALCULADORA_HIPOTECA = '/calculadora-bonificacion-hipoteca'
export const RAMOS_CON_CALCULADORA_HIPOTECA: readonly string[] = ['hogar', 'vida-y-salud']

/** Navegación principal. El orden es el de prioridad comercial, no el alfabético. */
export const NAV = [
  { href: '/seguros/hogar', texto: 'Hogar' },
  { href: '/seguros/comunidades', texto: 'Comunidades' },
  { href: '/seguros/comercio', texto: 'Comercio y empresa' },
  { href: '/seguros/flota', texto: 'Flota de vehículos' },
  { href: '/seguros/auto', texto: 'Auto y moto' },
  { href: '/seguros/vida-y-salud', texto: 'Vida y salud' },
  // 03/10/2026: página de intención de salud (ver `lib/ramos.ts`); al pie,
  // fuera de la cabecera (`FUERA_DE_CABECERA`).
  { href: '/seguros/salud-sin-copago', texto: 'Salud sin copago' },
  // 27/09/2026: al pie y fuera de la cabecera (ver `FUERA_DE_CABECERA`).
  { href: '/seguros/decesos', texto: 'Decesos' },
  { href: '/seguros/seguro-perro', texto: 'Seguro de perro' },
  { href: '/seguros/impago-alquiler', texto: 'Impago de alquiler' },
  { href: '/seguros/patinete-electrico', texto: 'Patinete eléctrico' },
  // 🚨 Responsabilidad civil EXISTE como página (`RAMOS` la trae, el sitemap la
  // lista) y hasta el 07/09/2026 no la enlazaba NADIE: ni la cabecera, ni el
  // pie, ni las páginas hermanas. Una página que solo aparece en el sitemap es
  // una página que Google puede rastrear y no tiene motivo para valorar — todo
  // el peso interno de un sitio viaja por sus enlaces. Va aquí, que es la lista
  // del PIE (la cabecera se recorta abajo, y por medida, no por gusto).
  { href: '/seguros/responsabilidad-civil', texto: 'Responsabilidad civil' },
  // Página de intención de oficio (15/09/2026, ver `lib/ramos.ts`): mismo
  // motivo que RC y flota para ir al pie y no a la cabecera — está medida al
  // límite, ver `FUERA_DE_CABECERA` más abajo.
  { href: '/seguros/responsabilidad-civil-fontaneros', texto: 'RC de fontaneros' },
  { href: '/seguros/responsabilidad-civil-autonomos', texto: 'RC para autónomos' },
  { href: '/cambiar-de-correduria', texto: 'Cambiar de correduría' },
  // La página de intención del gestor (19/09/2026): «organizar mis seguros en
  // un solo sitio». Va al pie, como todo lo que no es ramo — la cabecera está
  // medida al límite y `NAV_CABECERA` solo toma `/seguros/*`.
  { href: '/gestor-de-seguros', texto: 'Gestor de seguros gratis' },
  // Recuperada del sitio anterior el 07/09/2026. No es un ramo: es la página de
  // más intención de problema que tiene el negocio, y la ÚNICA consulta en la
  // que ya competía —posición media 7,7 en Search Console, contra 49,3 de la
  // portada— mientras la servía un 404. Va al pie por lo mismo que RC: la
  // cabecera está medida al límite y una entrada más la desborda.
  { href: '/siniestro', texto: 'Tengo un siniestro' },
  // 24/09/2026: el pie es el único enlace que sale de TODAS las páginas, y es
  // por donde Google descubre antes una URL nueva. Hasta hoy solo la enlazaban
  // `/siniestro` y un artículo, y Google no sabía ni que existía.
  { href: '/telefonos-siniestros', texto: 'Teléfonos para dar parte' },
  // 26/09/2026: la herramienta de la carta de baja, por el mismo motivo — el pie
  // es lo que la enlaza desde todas las páginas.
  { href: '/carta-baja-seguro', texto: 'Carta para dar de baja un seguro' },
  // 29/09/2026: la calculadora del seguro del banco, enlazada desde el pie por lo mismo.
  { href: '/calculadora-bonificacion-hipoteca', texto: 'Calculadora del seguro de la hipoteca' },
  // 30/09/2026: entrada nueva por otro agente, enlazada desde cabecera pero fuera de ella.
  { href: '/seguro-hipoteca-banco-obligatorio', texto: '¿Es obligatorio el seguro del banco?' },
] as const

/**
 * Herramientas de valor añadido accesibles desde la cabecera (desktop + móvil).
 * Son enlaces directos a secciones/herramientas de la portada, con máximo 3
 * en la cabecera (desktop: después de Seguros desplegable; móvil: chips). */
export const HERRAMIENTAS = [
  { href: '/calculadora-bonificacion-hipoteca', texto: '¿Seguro del banco?', key: 'calculadora' },
  { href: '/#vencimiento', texto: '¿Cuándo vence?', key: 'vencimiento' },
  { href: '/#subir', texto: 'Sube tu póliza', key: 'subir' },
] as const

/**
 * Lo que cabe en la CABECERA.
 *
 * 🚨 No es una preferencia: está MEDIDO. El nuevo diseño (30/09/2026) acomoda:
 * marca (171 px) · Seguros ▾ (70 px) · 3 herramientas (3 × 120 px) · ¿Siniestro? (120 px) · Mis seguros (147 px)
 * sumando ~800 px que caben en 1.104 px, dejando aire para responsive.
 *
 * Antigua regla (se retiene para referencia histórica): Con los seis ramos,
 * marca + nav + botón sumaban ~1.145 px dentro de 1.104 px. Se pasó a desplegable.
 */
const FUERA_DE_CABECERA: readonly string[] = [
  '/seguros/responsabilidad-civil',
  '/seguros/flota',
  '/seguros/responsabilidad-civil-fontaneros',
  '/seguros/responsabilidad-civil-autonomos',
  '/seguros/decesos',
  '/seguros/seguro-perro',
  '/seguros/impago-alquiler',
  '/seguros/patinete-electrico',
  '/seguros/salud-sin-copago',
]

export const NAV_CABECERA = NAV.filter(
  (n) => n.href.startsWith('/seguros/') && !FUERA_DE_CABECERA.includes(n.href),
)

/**
 * Horario de atención.
 *
 * Estuvo a `null` a propósito hasta el 15/09/2026: en una ficha de negocio local
 * el horario es de los datos sobre los que la gente decide si llamar ahora o no
 * llamar, e inventárselo es peor que no publicarlo — un cliente que llama a una
 * hora que la web dice que atendemos y no coge nadie no vuelve. El tipo sigue
 * admitiendo `null` por eso: es el estado «no se sabe», y con él la ficha
 * JSON-LD omite `openingHours` y el pie no anuncia ninguna hora.
 *
 * 🚨 Esta constante es la ÚNICA copia del horario en la web. De aquí salen las
 * dos publicaciones —el texto del pie y el `openingHours` del JSON-LD— y
 * ninguna de las dos se teclea aparte: una segunda copia se queda vieja sin que
 * nada falle. Lo vigila `seo-horario.test.ts`, que compara las horas del texto
 * con las del schema y lee el fuente del pie.
 *
 * ⚠️ Tiene que coincidir con el que se declare en el perfil de Google Business:
 * dos horarios distintos para el mismo negocio es la clase de contradicción que
 * Google penaliza y que además cabrea a quien se presenta en la puerta.
 *
 * ✅ CONFIRMADO POR ALBERTO el 15/09/2026: «de 9 a 18h de lunes a viernes».
 * Jornada continua, sin pausa de mediodía, y fines de semana cerrado — por eso
 * el `schema` es UN solo rango `Mo-Fr 09:00-18:00` y no dos tramos. Sábado y
 * domingo no se declaran: en schema.org lo que no aparece es cerrado, y
 * declararlos con horas vacías sería peor que omitirlos.
 * ⏳ El perfil de Google Business seguía SIN horario cuando esto se escribió
 * (medido ese mismo día): ponérselo es tarea de Alberto y está pendiente. O sea
 * que hoy la web concreta y el perfil no — el riesgo no es que se contradigan,
 * es que Google no tenga el dato donde más se mira. Cuando se ponga allí, tiene
 * que ser ESTE horario; y si algún día cambia uno, se cambian los dos.
 */
export const HORARIO: { schema: readonly string[]; texto: string } | null = {
  schema: ['Mo-Fr 09:00-18:00'],
  texto: 'Lunes a viernes, de 9:00 a 18:00',
}

/**
 * Clave de IndexNow (Bing, Yandex, Seznam…; Google NO lo usa). Es pública por
 * diseño: el protocolo la verifica leyendo `/<clave>.txt` en la raíz del sitio
 * (`public/`). La usa el cron `seo-correduria` de plataforma para avisar de URLs
 * nuevas o cambiadas; allí se repite en `INDEXNOW_CLAVE` de `tipos.ts`, y un test
 * de cada lado comprueba que coincide con el fichero.
 */
export const INDEXNOW_CLAVE = 'ffa5eb8e9b6bd9192f772dc833b742d3'
