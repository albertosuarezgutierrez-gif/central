import { ImageResponse } from 'next/og'
import { MARCA_ASEGURA } from '@central/brand'

import { monogramaTenido } from '@/lib/monograma'

/**
 * El icono de la app INSTALADA (el que queda en la pantalla de inicio).
 *
 * No vale el de la pestaña (`app/icon.tsx`, 128 px): Chrome solo ofrece
 * instalar si el manifiesto declara un icono de **192 px o más**, y usa el de
 * 512 para la pantalla de arranque. Con solo 128 px el botón de instalar no
 * aparece — y no aparece EN SILENCIO, que es la forma cara de que esto falle.
 *
 * 🎭 El monograma ocupa ~52 % del ancho, bastante menos que en la pestaña, y es
 * a propósito: Android recorta los iconos `maskable` a la forma del sistema
 * (círculo, cuadrado redondeado, gota…) y solo garantiza el 80 % central. Un
 * dibujo a sangre saldría con las puntas comidas en unos móviles sí y en otros
 * no, según el lanzador.
 *
 * Se genera en BUILD (`force-static`): así el fichero de la marca se lee cuando
 * el repo está entero delante, no desde una función servidor.
 */
export const dynamic = 'force-static'

const LADO = 512

export function GET() {
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={monogramaTenido(primario)} alt="" width={266} height={184} />
      </div>
    ),
    { width: LADO, height: LADO },
  )
}
