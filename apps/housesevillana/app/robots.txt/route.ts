// robots.txt de housesevillana.es
//
// No existía: el sitemap estaba publicado en /sitemap.xml pero no se anunciaba en ningún sitio,
// así que los buscadores solo lo encontraban por descubrimiento. Anunciarlo aquí es la forma
// estándar y la más barata de que se rastreen /barrio y /que-ver además de la home.
//
// Se permite todo a propósito: es una landing pública de 4 URLs sin zona privada. El día que
// haya rutas que no deban indexarse (un panel, un flujo de reserva a medias), se listan aquí.

export const runtime = 'edge'

export function GET() {
  const txt = `User-agent: *
Allow: /

Sitemap: https://www.housesevillana.es/sitemap.xml
`
  return new Response(txt, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Un día de caché: cambia rarísimamente y lo piden todos los rastreadores.
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
