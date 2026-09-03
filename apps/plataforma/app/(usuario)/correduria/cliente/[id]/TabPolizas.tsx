import type { IntervinienteFicha, PolizaFicha } from '@/lib/ficha-asegura'
import { Polizas } from './piezas'

/**
 * Todo lo que el cliente tiene contratado, en cuatro bloques que NO son lo
 * mismo y por eso no se mezclan (el conteo de «pólizas vivas» se infla solo si
 * se juntan):
 *
 *   vivas          → entran por CIMA, confirmadas y sin cancelar;
 *   pendientes     → las emitimos nosotros y CIMA aún no las ha traído;
 *   canceladas     → CIMA las manda canceladas: ya no aseguran nada;
 *   históricas     → volcado de junio de 2026, para saber qué tuvo.
 */
export default function TabPolizas({ porClase, intervinientes }: {
  porClase: Record<'viva' | 'pendiente_cima' | 'cancelada' | 'historica', PolizaFicha[]>
  intervinientes: IntervinienteFicha[] | null
}) {
  return (
    <>
      <Polizas titulo="Pólizas vivas" polizas={porClase.viva} vacio="Ninguna póliza activa entra hoy por CIMA." intervinientes={intervinientes} />

      {porClase.pendiente_cima.length > 0 && (
        <Polizas
          titulo={`📝 Emitidas, pendientes de confirmación por CIMA (${porClase.pendiente_cima.length})`}
          nota="CIMA aún no la ha traído: no cuenta como viva ni genera avisos. Cuando la compañía la mande por CIMA se casará con esta y pasará a «Pólizas vivas»."
          polizas={porClase.pendiente_cima}
          vacio=""
          intervinientes={intervinientes}
        />
      )}

      {porClase.cancelada.length > 0 && (
        <Polizas
          titulo={`Canceladas en CIMA (${porClase.cancelada.length})`}
          nota="La compañía las manda por CIMA con estado «cancelada»: ya no aseguran nada. Sirven para saber qué tuvo y cuánto pagaba."
          polizas={porClase.cancelada}
          vacio=""
          plegado
          intervinientes={intervinientes}
        />
      )}

      {porClase.historica.length > 0 && (
        <Polizas
          titulo={`Volcado histórico (${porClase.historica.length})`}
          nota="Del volcado de junio de 2026, con vencimientos antiguos. Sirven para saber qué tuvo contratado, no para renovar."
          polizas={porClase.historica}
          vacio=""
          plegado
          intervinientes={intervinientes}
        />
      )}
    </>
  )
}
