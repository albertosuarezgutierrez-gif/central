import { Pagina } from '@/components/ui'
import { Esqueleto } from './piezas'

// Pinta al instante mientras el servidor arranca la página (antes, el Inicio no enseñaba nada
// hasta que terminaba la consulta más lenta).
export default function Cargando() {
  return (
    <Pagina ancho="tabla">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16, marginTop: 56 }}>
        <Esqueleto titulo="Correduría" />
        <Esqueleto titulo="Bolsa · IBKR" />
        <Esqueleto titulo="Pisos" ancha />
        <Esqueleto titulo="Banco" ancha />
      </div>
    </Pagina>
  )
}
