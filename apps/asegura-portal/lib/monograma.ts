import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * El monograma «AS» de la marca, con el color ya puesto y listo para `<img>`.
 *
 * 🚨 El dibujo NO se copia en ningún sitio: se LEE de
 * `public/brand/marca-asegura.svg`. Copiar el `path` dejaría dos monogramas que
 * se separan el día que uno cambie.
 *
 * ⚠️ El fichero trae `fill="currentColor"` a propósito (el color lo pone el
 * contexto). Dentro de un `<img>` eso resuelve a NEGRO —el icono viejo del CRM
 * de Manuel, que es justo el que se quiere dejar atrás—, así que aquí se
 * sustituye antes de embeberlo. Si el SVG dejara de traer `currentColor`, la
 * sustitución se volvería un no-op silencioso y el trazo saldría negro sin que
 * fallara nada: lo vigila `lib/icono.test.ts`.
 *
 * Vive aquí y no dentro de `app/icon.tsx` porque lo usan DOS superficies: el
 * icono de la pestaña (128 px) y el de la app instalada (512 px).
 */
export function monogramaTenido(color: string): string {
  const svg = readFileSync(join(process.cwd(), 'public/brand/marca-asegura.svg'), 'utf8')
  return `data:image/svg+xml;base64,${Buffer.from(svg.replaceAll('currentColor', color)).toString('base64')}`
}
