import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { MARCA_ASEGURA } from '@central/brand'
import { MEDIADOR } from '@central/module-seguros'

// El icono de la pestaña del navegador.
//
// 🚨 Hasta el 07/09/2026 esta app NO TENÍA NINGUNO: ni `icon.*`, ni
// `favicon.ico`, ni `metadata.icons`. Alberto, mandando la captura de su
// pestaña —«Mis seguros» con el globo gris por defecto de Chrome—: «pon el
// logo». No estaba roto: no existía. Es exactamente el mismo agujero que tenía
// `asegura-web` ese mismo día, y por eso este fichero es su gemelo.
//
// ⚠️ Y es el sitio donde más barato sale que se quede así: el icono de una
// pestaña no lo mira nadie que esté trabajando en el código, solo quien tiene el
// portal abierto entre otras diez pestañas — que es justo el cliente.
//
// Se pinta el monograma en AZUL DE MARCA sobre el azul suave, el mismo gesto que
// la web (decisión de Alberto, 07/09/2026: «me gusta más en azul, se ve más»).
// El cuadro negro es la variante del CRM de Manuel (`app.grupoasegura.com`), no
// la de estas apps.
//
// 🚨 El dibujo NO se copia aquí: se LEE de `public/brand/marca-asegura.svg`.
// Copiar el `path` dejaría dos monogramas que se separan el día que uno cambie.
//
// ⚠️ Satori (el motor de `next/og`) no entiende `oklch()`, así que de la paleta
// solo valen los dos tokens que están en hex: `primario` y `acentoSuave`.

export const size = { width: 128, height: 128 }
export const contentType = 'image/png'
export const alt = MEDIADOR.marca

/**
 * El monograma con el color ya puesto.
 *
 * El fichero trae `fill="currentColor"` a propósito (el color lo pone el
 * contexto). Dentro de un `<img>` eso resuelve a NEGRO —el icono viejo que se
 * quiere dejar atrás—, así que aquí se sustituye por el azul de marca antes de
 * embeberlo. Si el SVG dejara de traer `currentColor`, la sustitución se
 * volvería un no-op silencioso y el trazo saldría negro sin que fallara nada:
 * lo vigila `lib/icono.test.ts`.
 */
function monogramaAzul(color: string): string {
  const svg = readFileSync(join(process.cwd(), 'public/brand/marca-asegura.svg'), 'utf8')
  return `data:image/svg+xml;base64,${Buffer.from(svg.replaceAll('currentColor', color)).toString('base64')}`
}

export default function Icono() {
  const { primario, acentoSuave } = MARCA_ASEGURA.paleta

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: acentoSuave,
        }}
      >
        {/* El monograma ocupa ~63 % del ancho: es lo que evita que a 16 px
            —el tamaño al que se ve de verdad— se convierta en una mancha. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={monogramaAzul(primario)} alt="" width={81} height={56} />
      </div>
    ),
    size,
  )
}
