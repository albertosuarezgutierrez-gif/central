// Tarjeta de compartir (WhatsApp, Telegram, redes) de las subpáginas — 27/09/2026.
//
// La portada (`app/route.ts`) lleva su `og:image` escrita en el HTML porque ese fichero lo
// reescribe cada lunes el agente SEO de sivra por la Contents API; las subpáginas no la
// llevaban y salían sin foto al compartirlas. Aquí vive la URL una sola vez y
// `tarjeta.test.ts` comprueba que la portada dice la misma.
export const IMAGEN_TARJETA = 'https://lh3.googleusercontent.com/d/1rDXs-fjAmmDQFTfZ7fTutPZvosAV2GMo'

export const TARJETA = `<meta property="og:image" content="${IMAGEN_TARJETA}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:image" content="${IMAGEN_TARJETA}"/>`
