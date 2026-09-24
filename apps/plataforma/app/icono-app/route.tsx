import { ImageResponse } from 'next/og'

/**
 * Icono de la app INSTALADA (24/09/2026). Chrome solo ofrece instalar con un icono de ≥192 px en el
 * manifiesto, y sin él el botón no aparece EN SILENCIO. Marca NEUTRA del grupo —cuatro bloques, uno
 * por negocio—, no el monograma «AS»: ese es solo de la correduría (decisión de Alberto).
 * El dibujo ocupa el ~50 % central porque Android recorta los `maskable` y solo garantiza el 80 %.
 * Mismo dibujo que `public/icon.svg`; el color es el cobalto de `--primary` en `globals.css`.
 */
export const dynamic = 'force-static'

const LADO = 512
const COBALTO = '#3364ee'

export function GET() {
  const bloque = (opacity: number) => ({ width: 104, height: 104, borderRadius: 24, background: '#ffffff', opacity })
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COBALTO }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', width: 240, gap: 32 }}>
          <div style={bloque(1)} /><div style={bloque(0.72)} /><div style={bloque(0.72)} /><div style={bloque(1)} />
        </div>
      </div>
    ),
    { width: LADO, height: LADO },
  )
}
