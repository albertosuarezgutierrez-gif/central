import { Pagina, cardStyle } from '@/components/ui'

// Pinta al instante mientras el servidor lee saldos, bandejas y libro (antes la página se
// quedaba en blanco hasta la consulta más lenta).
export default function Cargando() {
  const bloque = (alto: number) => (
    <div style={{ ...cardStyle, height: alto, marginBottom: 16, opacity: 0.5 }} aria-hidden />
  )
  return (
    <Pagina ancho="tabla">
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '8px 0 16px' }}>Cargando banca…</p>
      {bloque(84)}
      {bloque(140)}
      {bloque(320)}
    </Pagina>
  )
}
