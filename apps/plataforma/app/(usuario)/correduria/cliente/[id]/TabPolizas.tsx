import type { IntervinienteFicha, PolizaDeclaradaFicha, PolizaFicha, PolizaFiguraFicha } from '@/lib/ficha-asegura'
import { Polizas, PolizasDeclaradas, PolizasDondeFigura, tarjeta } from './piezas'

/**
 * Lo que la tarjeta «Seguros» enseña DEBAJO de los tres cubos (18/10/2026; antes, la pestaña «Todas las
 * pólizas»). «Pólizas vivas» y «pendientes de CIMA» ya NO salen aquí: son exactamente «Con nosotros»
 * (el reparto manda las vivas confirmadas y las emitidas sin CIMA a ese cubo, con su chip «Pendiente de
 * CIMA»), y pintarlas dos veces era la redundancia que se quitó.
 *
 *   figura en / declaradas → pólizas de otro tomador y las que subió el cliente (tablas propias);
 *   histórico              → sustituidas, canceladas y volcado de junio de 2026 (oportunidades, solo
 *                            consulta), plegado y con montaje perezoso: son cientos de filas.
 *
 * El volcado repite el MISMO riesgo cambiando solo la prima (84 grupos / 188 filas / 77 clientes,
 * medido 21/09/2026), así que ese bloque —y SOLO ese— agrupa las filas idénticas.
 */
export default function TabPolizas({ porClase, intervinientes, declaradas, figuraEn }: {
  porClase: Record<'viva' | 'pendiente_cima' | 'cancelada' | 'sustituida' | 'historica', PolizaFicha[]>
  intervinientes: IntervinienteFicha[] | null
  declaradas: PolizaDeclaradaFicha[] | null
  figuraEn: PolizaFiguraFicha[] | null
}) {
  const nHistorico = porClase.sustituida.length + porClase.cancelada.length + porClase.historica.length
  return (
    <>
      <PolizasDondeFigura polizas={figuraEn} />

      <PolizasDeclaradas declaradas={declaradas} />

      {nHistorico > 0 && (
        <div style={tarjeta}>
          {/* Cerrado y sin montar hasta abrirlo; dentro, cada bloque conserva su propio plegado. */}
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 14, minHeight: 44, display: 'flex', alignItems: 'center' }}>
              Histórico, canceladas y sustituidas ({nHistorico})
            </summary>
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
              {porClase.sustituida.length > 0 && (
                <Polizas
                  titulo={`Sustituidas por otra (${porClase.sustituida.length})`}
                  nota="Cambio de compañía ya emitido: cubren hasta su vencimiento y no se renuevan. No cuentan como vivas ni avisan de su vencimiento."
                  polizas={porClase.sustituida}
                  vacio=""
                  plegado
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
                  nota="Del volcado de junio de 2026: no son seguros nuestros sino oportunidades (se trabajan en «Seguros» → Oportunidades), con datos de hace años. El volcado repite el mismo riesgo cambiando solo la prima: esas filas van juntas en una línea con todas sus primas, sin borrar ninguna."
                  polizas={porClase.historica}
                  vacio=""
                  plegado
                  agruparIguales
                  intervinientes={intervinientes}
                />
              )}
            </div>
          </details>
        </div>
      )}
    </>
  )
}
