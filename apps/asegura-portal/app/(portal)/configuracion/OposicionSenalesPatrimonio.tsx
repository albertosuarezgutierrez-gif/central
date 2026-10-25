'use client'
import { useState } from 'react'

import { TEXTO_OPOSICION_SENALES } from '@central/module-seguros-portal'

/**
 * Información + derecho de OPOSICIÓN a la revisión de los seguros de los inmuebles (P15 publicado, 26/10/2026; base:
 * interés legítimo informado, apartado «3 bis» de la política de privacidad). Se monta en «Configuración → Privacidad»
 * (siempre) y en «Patrimonio» (con algún titular), para informar ANTES de calcular. Texto: docs/legal/2026-10-26-borrador-p15-patrimonio.md.
 *
 * 🚨 Reglas, que un test lee del fuente: `inicial` viene del servidor (`true` opuesto · `false` retirada · `null` nunca);
 * la casilla «No quiero…» solo nace marcada si CONSTA la oposición (`useState(inicial === true)`); retirar es el mismo
 * control, sin confirmaciones; si el guardado falla vuelve a como estaba y lo dice.
 */
export function OposicionSenalesPatrimonio({ inicial, conAviso = false }: { inicial: boolean | null; conAviso?: boolean }) {
  const [opuesto, setOpuesto] = useState(inicial === true)
  const [estado, setEstado] = useState<'reposo' | 'guardando' | 'guardado' | 'error'>('reposo')

  async function cambiar(valor: boolean) {
    const anterior = opuesto
    setOpuesto(valor)
    setEstado('guardando')
    try {
      const r = await fetch('/api/oposicion-senales-patrimonio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opuesto: valor }),
      })
      if (!r.ok) throw new Error(String(r.status))
      setEstado('guardado')
    } catch {
      setOpuesto(anterior)
      setEstado('error')
    }
  }

  return (
    <div className="oposicion-senales">
      {conAviso && (
        <p className="suave" style={{ marginTop: 0 }}>
          Lo que apuntas en «Patrimonio» es tuyo: lo usamos para enseñártelo y calcular tu rentabilidad y tu calendario.
          Además, para ayudarte a no quedarte sin cobertura, Grupo ASegura puede comprobar una vez al día si a tus inmuebles
          les falta algún seguro (por ejemplo, uno que nos has dicho que no tienen, un capital por debajo del valor estimado,
          un alquiler sin seguro de impago o una póliza de otra compañía a punto de vencer), y una persona de la correduría
          lo verá. No usamos los datos de tus inquilinos ni de tu comunidad, y esto no te envía ningún mensaje. Puedes
          oponerte aquí cuando quieras. Detalle en la <a href="/legal/privacidad#senales-patrimonio">política de privacidad</a>.
        </p>
      )}
      <label className="consentimiento-casilla">
        <input
          type="checkbox"
          checked={opuesto}
          disabled={estado === 'guardando'}
          onChange={(e) => void cambiar(e.target.checked)}
        />
        <span>{TEXTO_OPOSICION_SENALES}</span>
      </label>
      <p className="tenue consentimiento-estado" aria-live="polite">
        {estado === 'guardando' && 'Guardando…'}
        {estado === 'guardado' && (opuesto
          ? 'Anotado: no revisaremos los seguros de tus inmuebles y retiraremos lo que tuviéramos apuntado (puede tardar hasta un día).'
          : 'Anotado: has retirado tu oposición.')}
        {estado === 'error' && 'No se ha podido guardar. La casilla se ha dejado como estaba; inténtalo de nuevo.'}
        {estado === 'reposo' && inicial === true && 'Te has opuesto. Puedes retirarlo desmarcando la casilla.'}
        {estado === 'reposo' && inicial !== true && 'No te has opuesto. Puedes hacerlo marcando la casilla.'}
      </p>
    </div>
  )
}
