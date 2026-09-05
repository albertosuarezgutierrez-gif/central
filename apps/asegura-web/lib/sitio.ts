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
 * Ámbito geográfico declarado.
 *
 * 📌 Es una DECISIÓN comercial, no un dato medido: el 76 % de la cartera viva
 * está en Sevilla y ahí es donde se puede competir en búsquedas locales. Un
 * corredor puede mediar en toda España, así que el texto dice dónde trabajamos,
 * no dónde podemos.
 */
export const AMBITO = {
  ciudad: 'Sevilla',
  provincia: 'Sevilla',
  comunidad: 'Andalucía',
  pais: 'ES',
} as const

/** Navegación principal. El orden es el de prioridad comercial, no el alfabético. */
export const NAV = [
  { href: '/seguros/hogar', texto: 'Hogar' },
  { href: '/seguros/comunidades', texto: 'Comunidades' },
  { href: '/seguros/comercio', texto: 'Comercio y empresa' },
  { href: '/seguros/auto', texto: 'Auto y moto' },
  { href: '/seguros/vida-y-salud', texto: 'Vida y salud' },
  { href: '/cambiar-de-correduria', texto: 'Cambiar de correduría' },
] as const

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
