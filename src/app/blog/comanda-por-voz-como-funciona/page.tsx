import { SE, SN, SM } from '@/lib/colors'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Comanda por voz en restaurantes: cómo funciona | ia.rest',
  description: 'El camarero habla y la comanda llega a cocina en 0,4 segundos. Explicamos cómo la IA convierte la voz en comandas perfectas con alérgenos, cantidades y modificaciones.',
  alternates: { canonical: 'https://www.iarest.es/blog/comanda-por-voz-como-funciona' },
  openGraph: {
    title: 'Comanda por voz en restaurantes: cómo funciona',
    description: 'De la voz del camarero al KDS de cocina en menos de 0,5 segundos. Así funciona la IA de comandas de ia.rest.',
    url: 'https://www.iarest.es/blog/comanda-por-voz-como-funciona',
    type: 'article',
    publishedTime: '2026-05-21',
  },
  keywords: [
    'comanda por voz', 'cómo funciona comanda por voz', 'tpv por voz restaurante',
    'tpv con ia hosteleria', 'voice pos restaurante', 'comandas sin libreta',
    'software voz camarero', 'reducir errores comanda', 'kds cocina restaurante',
  ],
}

export default function ArticuloComandaVoz() {
  return (
    <div style={{ minHeight: '100vh', background: '#F6F1E7', color: '#1A1714', fontFamily: SN }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '48px 20px' }}>

        {/* Nav */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 48 }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: '#1A1714' }}>
              ia<span style={{ color: '#D9442B' }}>.</span>rest
            </span>
          </a>
          <span style={{ color: '#D8CDB6' }}>/</span>
          <a href="/blog" style={{ fontSize: 13, color: '#6B5F52', textDecoration: 'none' }}>Blog</a>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <span style={{
              fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
              fontWeight: 600, color: '#A8311E', background: '#D9442B15',
              padding: '3px 10px', borderRadius: 100,
            }}>Producto</span>
            <span style={{ fontSize: 12, color: '#6B5F52', fontFamily: SM }}>Mayo 2026 · 6 min lectura</span>
          </div>
          <h1 style={{
            fontFamily: SE, fontStyle: 'italic', fontSize: 38, color: '#1A1714',
            margin: '0 0 20px', lineHeight: 1.15, letterSpacing: '-0.5px',
          }}>
            Comanda por voz en restaurantes: cómo funciona y por qué funciona
          </h1>
          <p style={{ fontSize: 17, color: '#3A332C', lineHeight: 1.7, margin: 0 }}>
            La comanda por voz no es ciencia ficción. Es transcripción de voz con IA aplicada a un problema muy concreto: el camarero tiene que transmitir la comanda a cocina sin errores, sin perder tiempo y sin soltar al cliente. Te explicamos cómo funciona en la práctica.
          </p>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #D8CDB6', margin: '0 0 40px' }} />

        <div style={{ fontSize: 16, lineHeight: 1.8, color: '#3A332C' }}>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '0 0 16px', letterSpacing: '-0.3px' }}>
            El problema que resuelve
          </h2>
          <p>
            Un camarero tarda entre 30 y 60 segundos en anotar una comanda en un TPV táctil. En ese tiempo, tiene la espalda al cliente, busca el plato en un menú digital de 200 ítems y, si hay ruido, puede equivocarse. Un servicio de 50 mesas con 3 rondas implica hasta <strong>150 comandas</strong> por turno.
          </p>
          <p>
            La comanda por voz elimina ese cuello de botella. El camarero habla durante 4 segundos. La comanda ya está en cocina.
          </p>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            La tecnología detrás: Whisper + IA de estructura
          </h2>
          <p>
            ia.rest usa dos capas de IA en secuencia:
          </p>
          <ol style={{ paddingLeft: 20, margin: '0 0 16px' }}>
            <li style={{ marginBottom: 12 }}>
              <strong>Transcripción (Whisper de Groq):</strong> convierte el audio a texto en menos de 200ms. El modelo está optimizado para vocabulario hostelero en español: entiende "marchar", "sin", "86", "la dos", "de la casa", "medio de crevetas"... con todos los acentos regionales.
            </li>
            <li style={{ marginBottom: 12 }}>
              <strong>Estructuración (LLM con few-shot):</strong> el texto transcrito se convierte en una comanda estructurada — producto, cantidad, modificaciones, alérgenos — usando el contexto de la carta del restaurante. Si el camarero dice "dos de lo de siempre y el del ocho sin sal", el LLM lo resuelve usando las últimas comandas del turno activo como referencia.
            </li>
          </ol>

          <div style={{
            background: '#1A1714', borderRadius: 8, padding: '20px 24px', margin: '24px 0',
          }}>
            <p style={{ margin: '0 0 12px', fontSize: 11, color: '#6B5F52', fontFamily: SM, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ejemplo real</p>
            <p style={{ margin: '0 0 8px', fontSize: 14, color: '#D9442B', fontStyle: 'italic' }}>Camarero dice:</p>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: '#F6F1E7', fontFamily: SM }}>&ldquo;Mesa cuatro: dos de la casa, un agua sin gas fría, el del seis sin sal y ojo que es celíaco&rdquo;</p>
            <p style={{ margin: '0 0 8px', fontSize: 14, color: '#3F7D44' }}>ia.rest estructura:</p>
            <p style={{ margin: 0, fontSize: 13, color: '#D8CDB6', fontFamily: SM, lineHeight: 1.8 }}>
              Mesa 4 · Menú del día ×2<br />
              Mesa 4 · Agua mineral sin gas ×1 · fría<br />
              Mesa 4 · Menú del día ×1 · sin sal · ⚠️ CELÍACO
            </p>
          </div>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            Detección de ruido: los 4 filtros
          </h2>
          <p>
            El principal temor con la comanda por voz es el error en entornos ruidosos. ia.rest filtra la calidad de cada transcripción con cuatro capas:
          </p>
          <ol style={{ paddingLeft: 20, margin: '0 0 16px' }}>
            <li style={{ marginBottom: 8 }}>Detección de <strong>alucinaciones</strong> en el texto transcrito (frases sin sentido hostelero)</li>
            <li style={{ marginBottom: 8 }}>Longitud mínima del texto (menos de 4 caracteres = ruido, no comanda)</li>
            <li style={{ marginBottom: 8 }}>Probabilidad de <strong>no-speech</strong> alta = aviso automático</li>
            <li style={{ marginBottom: 8 }}>Score de confianza del perfil de voz del camarero (si está configurado)</li>
          </ol>
          <p>
            Si cualquiera de los cuatro filtros falla, ia.rest emite un tono de alerta y reabre el micrófono para que el camarero repita. En la práctica, esto ocurre en menos del 2% de las comandas.
          </p>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            Del móvil del camarero al KDS de cocina
          </h2>
          <p>
            Una vez estructurada, la comanda viaja por Supabase Realtime en menos de 100ms adicionales hasta el KDS (Kitchen Display System). En cocina se muestra con:
          </p>
          <ul style={{ paddingLeft: 20, margin: '0 0 16px' }}>
            <li style={{ marginBottom: 8 }}>Platos ordenados por partida (entrantes, principales, postres)</li>
            <li style={{ marginBottom: 8 }}>Alérgenos destacados en ámbar</li>
            <li style={{ marginBottom: 8 }}>Número de mesa y nombre del camarero</li>
            <li style={{ marginBottom: 8 }}>Tiempo transcurrido desde la comanda</li>
          </ul>
          <p>
            El cocinero confirma cada plato con un toque. El camarero recibe notificación cuando la mesa está lista.
          </p>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            ¿Con qué hardware funciona?
          </h2>
          <p>
            Cualquier smartphone Android moderno. ia.rest recomienda el <strong>Samsung Galaxy A15 5G</strong> (desde 180 €) por su batería, su micrófono y su soporte a larga duración. No se necesita hardware propietario, ni terminales TPV, ni datáfonos especiales.
          </p>
          <p>
            Para locales con mucho ruido (discotecas, terrazas con música), unos auriculares con micrófono de solapa mejoran significativamente la tasa de acierto.
          </p>

          <h2 style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 26, color: '#1A1714', margin: '32px 0 16px', letterSpacing: '-0.3px' }}>
            Resultados reales
          </h2>
          <p>
            En restaurantes con alta rotación de mesas, la comanda por voz produce tres efectos medibles:
          </p>
          <ul style={{ paddingLeft: 20, margin: '0 0 16px' }}>
            <li style={{ marginBottom: 8 }}>Reducción del 85% en errores de comanda frente a libreta manual</li>
            <li style={{ marginBottom: 8 }}>Tiempo de atención por mesa reducido de 40-60s (TPV táctil) a 4-6s</li>
            <li style={{ marginBottom: 8 }}>El camarero puede gestionar hasta 2 mesas más por turno sin aumentar el estrés</li>
          </ul>

        </div>

        {/* CTA */}
        <div style={{
          marginTop: 48, padding: '32px',
          background: '#1A1714', borderRadius: 8, textAlign: 'center',
        }}>
          <p style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: '#F6F1E7', margin: '0 0 8px' }}>
            Prueba la comanda por voz en tu restaurante
          </p>
          <p style={{ fontSize: 13, color: '#D8CDB6', margin: '0 0 20px' }}>
            14 días gratis · Sin tarjeta · Alta en 30 minutos
          </p>
          <a href="/registro" style={{
            display: 'inline-block', background: '#D9442B', color: '#F6F1E7',
            textDecoration: 'none', padding: '12px 28px', borderRadius: 6,
            fontSize: 14, fontWeight: 600,
          }}>
            Empezar prueba gratuita →
          </a>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid #D8CDB6', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <a href="/blog" style={{ color: '#6B5F52', fontSize: 13, textDecoration: 'none' }}>← Volver al blog</a>
          <a href="/comanda-por-voz" style={{ color: '#D9442B', fontSize: 13, textDecoration: 'none' }}>
            Ver la landing completa →
          </a>
        </div>

      </div>
    </div>
  )
}
