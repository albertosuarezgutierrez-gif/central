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
 * Sale de `NEXT_PUBLIC_PORTAL_URL`. El valor por defecto es la URL en la que
 * el portal sirve HOY (`asegura-portal.vercel.app`), que funciona: un botón que
 * apuntara al dominio bonito antes de que su DNS llegue a Vercel mandaría al
 * cliente a IONOS. Cuando `clientes.grupoasegura.es` esté repuntado, se cambia
 * la variable en Vercel y el botón sigue a ese dominio sin tocar código.
 */
export const PORTAL_URL = (process.env.NEXT_PUBLIC_PORTAL_URL || 'https://asegura-portal.vercel.app').replace(/\/+$/, '')

/** URL absoluta a partir de una ruta interna (`/seguros/hogar` → `https://…/seguros/hogar`). */
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
 * ⏳ Pendiente: la ficha de Google Business (existe y está verificada; falta su
 * URL canónica de Maps). Cuando entre, `geo` también deja de estar bloqueado.
 */
export const PERFILES: readonly string[] = [
  // Canal de YouTube. El handle canónico lleva las mayúsculas del monograma
  // («AS» = Alberto Suárez), igual que la marca: YouTube no las distingue, pero
  // en datos estructurados va la forma que el propio canal publica.
  'https://www.youtube.com/@GrupoASegura',
] as const

/** Navegación principal. El orden es el de prioridad comercial, no el alfabético. */
export const NAV = [
  { href: '/seguros/hogar', texto: 'Hogar' },
  { href: '/seguros/comunidades', texto: 'Comunidades' },
  { href: '/seguros/comercio', texto: 'Comercio y empresa' },
  { href: '/seguros/flota', texto: 'Flota de vehículos' },
  { href: '/seguros/auto', texto: 'Auto y moto' },
  { href: '/seguros/vida-y-salud', texto: 'Vida y salud' },
  // 🚨 Responsabilidad civil EXISTE como página (`RAMOS` la trae, el sitemap la
  // lista) y hasta el 07/09/2026 no la enlazaba NADIE: ni la cabecera, ni el
  // pie, ni las páginas hermanas. Una página que solo aparece en el sitemap es
  // una página que Google puede rastrear y no tiene motivo para valorar — todo
  // el peso interno de un sitio viaja por sus enlaces. Va aquí, que es la lista
  // del PIE (la cabecera se recorta abajo, y por medida, no por gusto).
  { href: '/seguros/responsabilidad-civil', texto: 'Responsabilidad civil' },
  { href: '/cambiar-de-correduria', texto: 'Cambiar de correduría' },
  // Recuperada del sitio anterior el 07/09/2026. No es un ramo: es la página de
  // más intención de problema que tiene el negocio, y la ÚNICA consulta en la
  // que ya competía —posición media 7,7 en Search Console, contra 49,3 de la
  // portada— mientras la servía un 404. Va al pie por lo mismo que RC: la
  // cabecera está medida al límite y una entrada más la desborda.
  { href: '/siniestro', texto: 'Tengo un siniestro' },
] as const

/**
 * Lo que cabe en la CABECERA.
 *
 * 🚨 No es una preferencia: está MEDIDO. Con las seis entradas, la marca
 * (171 px) + la nav (815 px) + el botón (147 px) suman ~1.145 px dentro de un
 * contenedor de 1.104 px, y lo que se salía por la derecha de la pantalla era
 * el botón «Área de clientes» — o sea, justo lo que el cliente viene a pulsar.
 * Se recorta la nav, que es lo que sobra: «Cambiar de correduría» tiene su
 * propia sección en la portada, su enlace en el pie y su página.
 *
 * ⚠️ Y por eso **responsabilidad civil tampoco entra en la cabecera**: sería la
 * sexta entrada y devolvería el desbordamiento medido. Se enlaza desde el pie y
 * desde las páginas de ramo hermanas, que es donde el enlace además tiene
 * sentido temático. Los cinco ramos de la cabecera son los de más volumen.
 *
 * ⚠️ **Flota (07/09/2026) queda fuera por lo mismo, y el cepo lo cazó**: al
 * meterla en el pie, `enlazado.test.ts` se puso rojo con «la cabecera lleva 6
 * entradas; se midió el desborde a partir de 6». No se sube el tope: el número
 * está medido en píxeles, no elegido. Flota se alcanza desde el pie y desde
 * comercio, que es quien tiene al mismo lector delante —el que decide el seguro
 * del negocio decide el de las furgonetas—, así que el enlace encaja mejor ahí
 * que en una cabecera que no cabe.
 */
const FUERA_DE_CABECERA: readonly string[] = ['/seguros/responsabilidad-civil', '/seguros/flota']

export const NAV_CABECERA = NAV.filter(
  (n) => n.href.startsWith('/seguros/') && !FUERA_DE_CABECERA.includes(n.href),
)

/**
 * Horario de atención.
 *
 * 🚨 `null` a propósito: **no se ha confirmado con Alberto**, y en una ficha de
 * negocio local el horario es de los datos sobre los que la gente decide si
 * llamar ahora o no llamar. Inventárselo es peor que no publicarlo: un cliente
 * que llama a una hora que la web dice que atendemos y no coge nadie no vuelve.
 *
 * Mientras siga a `null`, la ficha JSON-LD **omite `openingHours`** (ausente,
 * que es la verdad) y la web dice «horario de oficina» sin concretar. En cuanto
 * haya horario real se rellena aquí y aparece solo en los dos sitios.
 *
 * ⚠️ Tiene que coincidir con el que se declare en el perfil de Google Business:
 * dos horarios distintos para el mismo negocio es la clase de contradicción que
 * Google penaliza y que además cabrea a quien se presenta en la puerta.
 */
export const HORARIO: { schema: readonly string[]; texto: string } | null = null
