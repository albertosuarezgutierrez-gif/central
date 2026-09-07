import { ImageResponse } from 'next/og'
import { MARCA_ASEGURA } from '@central/brand'
import { MEDIADOR } from '@central/module-seguros'
import { AMBITO } from '@/lib/sitio'

// Tarjeta que se ve cuando alguien pega un enlace de la web en WhatsApp,
// LinkedIn o Telegram — que es, para una correduría local, por donde llega
// buena parte del tráfico que no viene de Google.
//
// 🚨 Por qué se genera y no se sube un PNG: el nombre comercial, la clave DGSFP
// y los colores salen de `MEDIADOR` y `MARCA_ASEGURA`. Un PNG con el texto
// quemado es una copia más de la marca que el día que cambie la clave seguirá
// enseñando la vieja sin que falle nada — exactamente lo que el resto de esta
// app evita leyendo siempre de la fuente.
//
// Next aplica esta imagen a TODA página que no declare la suya, así que una
// sola pieza cubre la portada, los seis ramos y las legales.
//
// ⚠️ Satori (el motor de `next/og`) NO entiende `oklch()`. De la paleta solo se
// usan aquí los tokens que están en hex; el blanco del texto es una decisión de
// composición sobre fondo de marca, no un token que falte.

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = `${MEDIADOR.marca} · Correduría de seguros en ${AMBITO.nacional}`

export default function Imagen() {
  const { primario, acento, acentoInk } = MARCA_ASEGURA.paleta

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          color: '#ffffff',
          backgroundColor: primario,
          backgroundImage: `linear-gradient(135deg, ${acento} 0%, ${primario} 55%, ${acentoInk} 100%)`,
          fontFamily: 'sans-serif',
        }}
      >
        {/* 🚨 El ámbito que se anuncia es NACIONAL, no la ciudad de la oficina.
            Lo decidió el PR #2464: un corredor inscrito en la DGSFP media en
            todo el territorio, y poner «Sevilla» en el primer renglón le dice a
            quien entra desde otra provincia que no es cliente. La señal local
            sale del NAP y del perfil de Google Business, no de repetirlo aquí.
            Lo vigila `ACOTA_AMBITO` en `lib/ramos.test.ts`, que barre este
            fichero. */}
        <div style={{ display: 'flex', fontSize: 30, letterSpacing: 2, opacity: 0.9 }}>
          CORREDURÍA DE SEGUROS · {AMBITO.nacional.toUpperCase()}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 92, fontWeight: 800, letterSpacing: -2 }}>{MEDIADOR.marca}</div>
          <div style={{ display: 'flex', fontSize: 44, marginTop: 8, opacity: 0.95 }}>
            Mediamos con varias compañías en toda {AMBITO.nacional}
          </div>
          {/* Sin promesa de precio: la misma regla que el copy de las páginas
              (RDL 3/2020). Lo que diferencia es mediar entre compañías, no un
              importe. */}
          <div style={{ display: 'flex', fontSize: 32, marginTop: 22, opacity: 0.85, maxWidth: 900 }}>
            Hogar · Comunidades · Comercio · Auto · Vida y salud · Responsabilidad civil
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 26, opacity: 0.8 }}>
          Corredor inscrito en la DGSFP · Clave {MEDIADOR.identidad.claveDgsfp}
        </div>
      </div>
    ),
    size,
  )
}
