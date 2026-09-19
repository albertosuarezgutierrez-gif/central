'use client'
import { useState } from 'react'

import { TEXTO_CONSENTIMIENTO_COMERCIAL } from '@central/module-seguros-portal'

/**
 * La casilla INDEPENDIENTE de «quiero que me propongáis alternativas».
 *
 * Es la pieza que faltaba para que el gestor de pólizas pueda ser, además de
 * un servicio, una fuente de leads sin engaño: subir una póliza no es pedir
 * una oferta, y hasta hoy la correduría no tenía forma de saber quién SÍ la
 * quiere. Con esta casilla lo dice la persona, con fecha y texto sellados.
 *
 * 🚨 Reglas de la casilla, que un test lee del fuente:
 *  - `inicial` viene del SERVIDOR (última fila de `portal_consentimiento`).
 *    `null` = nunca preguntado → se pinta DESMARCADA. Nunca premarcada.
 *  - El texto es `TEXTO_CONSENTIMIENTO_COMERCIAL` del módulo, no una copia:
 *    la fila de la BD sella la versión de ESE texto.
 *  - Retirar es una acción tan visible como dar: el mismo control, sin
 *    confirmaciones extra ni «¿seguro?» (art. 7.3 RGPD: retirar tiene que ser
 *    tan fácil como dar).
 *  - Si el guardado falla, la casilla VUELVE al estado anterior y lo dice.
 *    Dejarla marcada tras un error sería enseñar un consentimiento que no
 *    existe en la BD.
 */
export function ConsentimientoComercial({ inicial }: { inicial: boolean | null }) {
  const [marcado, setMarcado] = useState(inicial === true)
  const [estado, setEstado] = useState<'reposo' | 'guardando' | 'guardado' | 'error'>('reposo')

  async function cambiar(valor: boolean) {
    const anterior = marcado
    setMarcado(valor)
    setEstado('guardando')
    try {
      const r = await fetch('/api/consentimiento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otorgado: valor }),
      })
      if (!r.ok) throw new Error(String(r.status))
      setEstado('guardado')
    } catch {
      setMarcado(anterior)
      setEstado('error')
    }
  }

  return (
    <section className="seccion" aria-labelledby="consentimiento-titulo">
      <p className="antetitulo">Propuestas de la correduría</p>
      <h2 id="consentimiento-titulo">¿Quieres que revisemos lo que tienes?</h2>
      <p className="suave" style={{ marginTop: 0 }}>
        Guardar aquí tus seguros no nos autoriza a nada más que a guardarlos. Si además quieres que te
        propongamos alternativas cuando se acerque un vencimiento, márcalo aquí. Es independiente del resto
        del servicio y lo puedes retirar cuando quieras.
      </p>
      <label className="consentimiento-casilla">
        <input
          type="checkbox"
          checked={marcado}
          disabled={estado === 'guardando'}
          onChange={(e) => void cambiar(e.target.checked)}
        />
        <span>{TEXTO_CONSENTIMIENTO_COMERCIAL}</span>
      </label>
      <p className="tenue consentimiento-estado" aria-live="polite">
        {estado === 'guardando' && 'Guardando…'}
        {estado === 'guardado' && (marcado ? 'Anotado: te contactaremos con propuestas.' : 'Anotado: no te contactaremos con propuestas.')}
        {estado === 'error' && 'No se ha podido guardar. La casilla se ha dejado como estaba; inténtalo de nuevo.'}
        {estado === 'reposo' && inicial === null && 'Todavía no nos has dicho nada: mientras tanto, no te contactamos con propuestas.'}
        {estado === 'reposo' && inicial === true && 'Nos dijiste que sí. Puedes retirarlo desmarcando la casilla.'}
        {estado === 'reposo' && inicial === false && 'Nos dijiste que no. Puedes cambiarlo cuando quieras.'}
      </p>
    </section>
  )
}
