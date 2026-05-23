// Test mínimo para aislar el problema
export default async function WebRestaurantePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return (
    <html lang="es">
      <head><title>Test {slug}</title></head>
      <body>
        <h1>Test: {slug}</h1>
      </body>
    </html>
  )
}
