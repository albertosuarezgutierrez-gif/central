import type { EstadoModulo } from '@/lib/modulos-empresa-reglas'
import Card from '@/components/ui/Card'

/** Solo LECTURA: el responsable ve el estado; activarlo lo hace el operador (no hay botón a propósito). */
export default function EstadoModuloNominas({ estado }: { estado: EstadoModulo }) {
  let titulo: string
  let detalle: string
  if (estado.estado === 'activo' && estado.modo === 'calculo') {
    titulo = 'Cálculo de nóminas: ACTIVO'
    detalle = 'El día 25 se generan los borradores del mes con el motor de nóminas. Revísalos antes de confirmar.'
  } else if (estado.estado === 'activo') {
    titulo = 'Nóminas: modo reparto'
    detalle = 'Tu gestoría calcula las nóminas; aquí repartes sus PDF a cada empleado.'
  } else if (estado.estado === 'apagado') {
    titulo = 'Cálculo de nóminas: no activado'
    detalle = 'No se generan borradores automáticos. Puedes repartir los PDF de tu gestoría. Para activarlo, pídelo a Grupo ASegura.'
  } else {
    titulo = 'Estado del módulo de nóminas: no se sabe'
    detalle = 'No se ha podido leer la configuración. Mientras tanto no se generan borradores automáticos.'
  }
  const cuando = estado.estado === 'activo' && estado.activadoAt
    ? ` Activado el ${new Date(estado.activadoAt).toLocaleDateString('es-ES')}${estado.activadoPor ? ` por ${estado.activadoPor}` : ''}.`
    : ''
  return (
    <Card>
      <p className="m-0 font-semibold">{titulo}</p>
      <p className="m-0 mt-1 text-sm text-ink-3">{detalle}{cuando}</p>
    </Card>
  )
}
