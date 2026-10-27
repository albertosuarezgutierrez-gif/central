import Link from 'next/link'

import { pendientesDeInicio, textoInmueblesInicio, textoPendientesInicio } from '@/lib/patrimonio/gastos-vista'

import { TarjetaPortal } from '../../TarjetaPortal'

/**
 * «Mi patrimonio» en Inicio (27/10/2026): nº de inmuebles y gastos por confirmar. `null` = no se sabe: nunca se pinta 0
 * ni «0 pendientes» sobre una cifra que no se ha podido leer. `resumen === null` = ni siquiera se pudo leer el acceso.
 */
export function TarjetaPatrimonio({ resumen }: { resumen: { inmuebles: number | null; pendientes: number | null; puedeConfirmar: boolean } | null }) {
  const inm = resumen === null ? null : textoInmueblesInicio(resumen.inmuebles)
  const pend = pendientesDeInicio(resumen === null ? null : resumen.pendientes)
  return (
    <TarjetaPortal
      id="inicio-patrimonio"
      antetitulo="Tus inmuebles"
      titulo="Mi patrimonio"
      tono={pend.tipo === 'hay' ? 'aviso' : undefined}
      accion={
        <>
          {resumen !== null && resumen.puedeConfirmar && pend.tipo === 'hay' && (
            <Link className="boton" style={{ minHeight: 44 }} href="/patrimonio/gastos">Confirmar gastos</Link>
          )}
          <Link className={pend.tipo === 'hay' && resumen?.puedeConfirmar ? 'boton secundario' : 'boton'} style={{ minHeight: 44 }} href="/patrimonio">Ver mis inmuebles</Link>
        </>
      }
    >
      <p style={{ margin: '0 0 4px' }}>{inm ?? 'Ahora no hemos podido contar tus inmuebles.'}</p>
      <p className="suave" style={{ margin: 0 }} role={pend.tipo === 'sin_comprobar' ? 'status' : undefined}>
        {resumen !== null && !resumen.puedeConfirmar && pend.tipo === 'ninguno' ? 'Solo puedes consultar estos inmuebles.' : textoPendientesInicio(resumen === null ? null : resumen.pendientes)}
      </p>
    </TarjetaPortal>
  )
}
