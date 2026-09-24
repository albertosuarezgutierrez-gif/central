import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { MARCA_ASEGURA } from '@central/brand'
import { MEDIADOR } from '@central/module-seguros'

// El icono de la pestaña del navegador.
//
// 🚨 Hasta el 07/09/2026 esta app NO TENÍA NINGUNO: ni `icon.*`, ni
// `favicon.ico`, ni `metadata.icons`. O sea que la pestaña salía con el globo
// por defecto de Chrome, y el «AS» negro que se veía en una pestaña era el de
// `app.grupoasegura.com` (el CRM de Manuel), no el de esta web. No estaba roto:
// no existía, que es el mismo diagnóstico que el muro de compañías.
//
// Se pinta el monograma en AZUL DE MARCA sobre el azul suave, que es
// exactamente el mismo gesto que la cabecera (`.marca-tile` + `.marca-mono` en
// `globals.css`): el cuadro negro es la variante de la app de Manuel, no la de
// esta web. Decisión de Alberto, 07/09/2026: «me gusta más en azul, se ve más».
//
// 🚨 El dibujo NO se copia aquí: se LEE de `public/brand/marca-asegura.svg`,
// que es el único vectorial de la marca que existe. Copiar el `path` habría
// dejado dos monogramas que se separan el día que uno cambie, y el de la
// pestaña es justo el que nadie vuelve a mirar.
//
// ⚠️ Satori (el motor de `next/og`) no entiende `oklch()`, así que de la paleta
// se usan los dos tokens que están en hex. `acentoSuave` es el azul claro de la
// baldosa y `primario` el del trazo.

export const size = { width: 128, height: 128 }
export const contentType = 'image/png'
export const alt = MEDIADOR.marca

/**
 * El monograma con el color ya puesto.
 *
 * El fichero trae `fill="currentColor"` a propósito (el color lo pone el
 * contexto). Dentro de un `<img>` eso resuelve a NEGRO — que es precisamente
 * el icono viejo que se quiere dejar atrás —, así que aquí se sustituye por el
 * azul de marca antes de embeberlo. Si algún día el SVG dejara de traer
 * `currentColor`, esta sustitución se volvería un no-op silencioso y el trazo
 * saldría negro sin que fallara nada: lo vigila `lib/icono.test.ts`.
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
        {/* Las mismas proporciones que la baldosa de la cabecera: el monograma
            ocupa ~63 % del ancho, que es lo que evita que a 16 px se convierta
            en una mancha. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={monogramaAzul(primario)} alt="" width={81} height={56} />
      </div>
    ),
    size,
  )
}
