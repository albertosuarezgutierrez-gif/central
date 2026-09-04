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
 * El valor por defecto es el apex de la marca: si la variable falta, las URL
 * salen correctas igualmente en producción, y en una preview salen apuntando a
 * producción (que es preferible a emitir un canonical hacia una URL de preview,
 * porque eso sí ensucia el índice de Google).
 */
export const SITIO_URL = (process.env.NEXT_PUBLIC_SITIO_URL || 'https://grupoasegura.com').replace(/\/+$/, '')

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
