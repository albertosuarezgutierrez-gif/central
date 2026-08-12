export function GET() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.housesevillana.es/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>https://www.housesevillana.es/barrio</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>https://www.housesevillana.es/que-ver</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
</urlset>`
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } })
}
