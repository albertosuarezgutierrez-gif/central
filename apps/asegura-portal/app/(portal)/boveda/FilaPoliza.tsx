import Link from 'next/link'

import type { PolizaPortal } from '@/lib/cartera-lectura'
import { fechaEs } from '@/lib/fechas'

import { ESTADO, IconoRamo, RAMO, tituloDePoliza, tituloEsBien } from './PolizaVista'

/**
 * Una póliza en la LISTA: una fila, no una tarjeta.
 *
 * 🚨 Por qué cambió (05/09/2026). Alberto, mirando su propia bóveda: «muy
 * sucia la página… resumen de lo q es, icono de ramo, datos principal, y ya
 * pinchando entra en lo q sea». Tenía razón en el diagnóstico: la pantalla
 * pintaba coberturas, recibos, prima, vencimiento y chips **de todas** las
 * pólizas a la vez. Eso no se arregla con CSS.
 *
 * Y de paso resuelve la contradicción de sus dos peticiones del mismo día
 * («poca informacion» y «todo más sencillo»): el resumen es simple, la ficha es
 * completa. Ya no hay que elegir entre las dos.
 *
 * Lo que SÍ se queda en la fila, y no es negociable:
 *
 * - **El bien como titular.** Nadie se sabe su número de póliza; reconoce su
 *   coche y su calle. Es lo único que distingue dos pólizas de hogar de la
 *   misma compañía.
 * - **El recibo devuelto.** Es lo único de una póliza que puede dejar a alguien
 *   sin cobertura sin que se entere, así que **no puede quedar detrás de un
 *   clic**. Va como chip de peligro en la fila; el aviso entero, con la acción
 *   al lado, sigue en la ficha.
 * - **De quién es**, cuando no es tuya. Misma razón que la etiqueta de la
 *   tarjeta: quien cree que la póliza del coche de su padre es suya no llama a
 *   la compañía cuando hay que llamar.
 *
 * Lo que se va a la ficha: prima, recibos, coberturas, siniestros abiertos y
 * los teléfonos de la compañía.
 */
export function FilaPoliza({ p, deOtro }: { p: PolizaPortal; deOtro: string | null }) {
  const vence = fechaEs(p.fechaVencimiento)
  const ramo = RAMO[p.ramo] ?? p.ramo
  // Si el titular ya es el bien, la compañía baja a la segunda línea; si no, el
  // titular YA es «compañía · ramo» y repetirlo debajo sería ruido.
  const meta = [tituloEsBien(p) ? `${p.compania} · ${ramo}` : null, vence ? `Vence el ${vence}` : null]
    .filter(Boolean)
    .join(' · ')
  const devueltos = p.recibos?.devueltos ?? 0

  return (
    <li className="poliza-fila" data-de-otro={deOtro ? 'si' : undefined}>
      <Link href={`/boveda/poliza/${p.id}`} className="poliza-enlace">
        <IconoRamo ramo={p.ramo} />
        <span className="poliza-cuerpo">
          <span className="poliza-titulo">{tituloDePoliza(p)}</span>
          {meta && <span className="poliza-meta">{meta}</span>}
          <span className="chips">
            {/* 🚨 Arriba de todo lo demás y en rojo: un recibo devuelto es lo
                único que puede costarle la cobertura, y esconderlo detrás del
                clic sería exactamente el fallo que la regla de la casa
                persigue — no falla nada, simplemente no se ve. */}
            {devueltos > 0 && (
              <span className="chip peligro">
                {devueltos === 1 ? 'Recibo devuelto' : `${devueltos} recibos devueltos`}
              </span>
            )}
            <span className={`chip${p.vigencia === 'vigente' ? ' ok' : ''}`}>
              {ESTADO[p.estado] ?? p.estado}
            </span>
            {deOtro && <span className="chip acento">De {deOtro}</span>}
          </span>
        </span>
        {/* Decorativo: lo que anuncia que se puede entrar es que la fila ENTERA
            es un enlace, no esta flecha. */}
        <span className="poliza-flecha" aria-hidden>
          ›
        </span>
      </Link>
    </li>
  )
}
