import type { IntervinienteFicha, PolizaDeclaradaFicha, PolizaFicha } from '@/lib/ficha-asegura'
import { Polizas, PolizasDeclaradas } from './piezas'

/**
 * Todo lo que el cliente tiene contratado, en cuatro bloques que NO son lo
 * mismo y por eso no se mezclan (el conteo de «pólizas vivas» se infla solo si
 * se juntan):
 *
 *   vivas          → entran por CIMA, confirmadas y sin cancelar;
 *   pendientes     → las emitimos nosotros y CIMA aún no las ha traído;
 *   canceladas     → CIMA las manda canceladas: ya no aseguran nada;
 *   históricas     → volcado de junio de 2026, para saber qué tuvo.
 *
 * El volcado repite el MISMO riesgo cambiando solo la prima (84 grupos / 188
 * filas / 77 clientes, medido 21/09/2026: el FORD FOCUS 3935GPY sale a 201€ y
 * a 210€ con el mismo vencimiento). En la ficha eso se lee como una duplicidad,
 * así que ese bloque —y SOLO ese— agrupa las filas idénticas en una línea y
 * enseña todas las primas. En las vivas no se agrupa: ahí dos filas iguales son
 * un fallo de conciliación que hay que ver, no esconder.
 */
export default function TabPolizas({ porClase, intervinientes, declaradas }: {
  porClase: Record<'viva' | 'pendiente_cima' | 'cancelada' | 'historica', PolizaFicha[]>
  intervinientes: IntervinienteFicha[] | null
  declaradas: PolizaDeclaradaFicha[] | null
}) {
  return (
    <>
      <Polizas titulo="Pólizas vivas" polizas={porClase.viva} vacio="Ninguna póliza activa entra hoy por CIMA." intervinientes={intervinientes} />

      <PolizasDeclaradas declaradas={declaradas} />

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
          nota="Del volcado de junio de 2026, con vencimientos antiguos. Sirven para saber qué tuvo contratado, no para renovar. El volcado repite el mismo riesgo cambiando solo la prima: esas filas van juntas en una línea (🔁) con todas sus primas, sin borrar ninguna."
          polizas={porClase.historica}
          vacio=""
          plegado
          agruparIguales
          intervinientes={intervinientes}
        />
      )}
    </>
  )
}
