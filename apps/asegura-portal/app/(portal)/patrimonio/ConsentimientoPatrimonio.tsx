'use client'
import { useState } from 'react'

import { TEXTO_CONSENTIMIENTO_COMERCIAL_PATRIMONIO } from '@central/module-seguros-portal'

/**
 * Aviso + casilla de la revisión de seguros de los inmuebles (P15, BORRADOR 26/10/2026). Solo se monta con
 * `PATRIMONIO_SENALES_ACTIVAS=1` (la página decide). Texto: docs/legal/2026-10-26-borrador-p15-patrimonio.md.
 *
 * 🚨 Reglas, que un test lee del fuente: `inicial` viene del servidor (`null` = nunca preguntado → DESMARCADA, nunca
 * premarcada); el texto de la casilla es el del módulo (la fila sella la versión de ESE texto); retirar es el mismo
 * control, sin confirmaciones; si el guardado falla la casilla vuelve a como estaba y lo dice.
 */
export function ConsentimientoPatrimonio({ inicial }: { inicial: boolean | null }) {
  const [marcado, setMarcado] = useState(inicial === true)
  const [estado, setEstado] = useState<'reposo' | 'guardando' | 'guardado' | 'error'>('reposo')

  async function cambiar(valor: boolean) {
    const anterior = marcado
    setMarcado(valor)
    setEstado('guardando')
    try {
      const r = await fetch('/api/consentimiento-patrimonio', {
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
    <section className="seccion" aria-labelledby="consentimiento-patrimonio-titulo">
      <p className="antetitulo">Revisión de seguros de tus inmuebles</p>
      <h2 id="consentimiento-patrimonio-titulo">¿Quieres que revisemos los seguros de tus inmuebles?</h2>
      <p className="suave" style={{ marginTop: 0 }}>
        Lo que apuntas aquí es tuyo: lo usamos para enseñártelo y calcular tu rentabilidad y tu calendario. Si marcas la
        casilla, además, Grupo ASegura comprobará una vez al día si a tus inmuebles les falta algún seguro (por ejemplo, uno
        que nos has dicho que no tienen, un capital por debajo del valor estimado, un alquiler sin seguro de impago o una
        póliza de otra compañía a punto de vencer) y una persona de la correduría lo verá para proponértelo. No usamos los
        datos de tus inquilinos ni de tu comunidad. Esto no te envía ningún mensaje: solo te contactamos si lo pides con
        «Pedir precio» o si marcas la casilla. Detalle en la{' '}
        <a href="/legal/privacidad">política de privacidad</a>.
      </p>
      <label className="consentimiento-casilla">
        <input
          type="checkbox"
          checked={marcado}
          disabled={estado === 'guardando'}
          onChange={(e) => void cambiar(e.target.checked)}
        />
        <span>{TEXTO_CONSENTIMIENTO_COMERCIAL_PATRIMONIO}</span>
      </label>
      <p className="tenue consentimiento-estado" aria-live="polite">
        {estado === 'guardando' && 'Guardando…'}
        {estado === 'guardado' && (marcado
          ? 'Anotado: revisaremos los seguros de tus inmuebles.'
          : 'Anotado: dejaremos de revisarlos y retiraremos lo que tuviéramos apuntado (puede tardar hasta un día).')}
        {estado === 'error' && 'No se ha podido guardar. La casilla se ha dejado como estaba; inténtalo de nuevo.'}
        {estado === 'reposo' && inicial === null && 'Todavía no nos has dicho nada: mientras tanto, no revisamos los seguros de tus inmuebles.'}
        {estado === 'reposo' && inicial === true && 'Nos dijiste que sí. Puedes retirarlo desmarcando la casilla.'}
        {estado === 'reposo' && inicial === false && 'Nos dijiste que no. Puedes cambiarlo cuando quieras.'}
      </p>
    </section>
  )
}
