'use client'
import { useState, useTransition } from 'react'
import { FirmaLienzo, useFirma } from '../../_firma'
import { entregarOtAccion } from '../acciones'

/**
 * Entrega del vehículo: el texto de conformidad del taller, el nombre de quien retira y su firma en el lienzo. También se puede
 * poner o corregir el vencimiento del seguro del vehículo (`vencimientoSeguro` = AAAA-MM-DD que ya constaba, o '' si no se sabe).
 */
export function EntregaCliente({ otId, texto, version, obligatoria, vencimientoSeguro }: { otId: string; texto: string; version: string; obligatoria: boolean; vencimientoSeguro: string }) {
  const f = useFirma()
  const [nombre, setNombre] = useState('')
  const [vence, setVence] = useState(vencimientoSeguro)
  const [error, setError] = useState<string | null>(null)
  const [pend, iniciar] = useTransition()
  const falta = obligatoria && (!f.firmado || !nombre.trim())

  function entregar() {
    setError(null)
    iniciar(async () => {
      const fd = new FormData()
      fd.set('otId', otId)
      fd.set('nombre', nombre)
      fd.set('versionTexto', version)
      fd.set('vencimientoSeguro', vence)
      const png = await f.aPng()
      if (png) fd.set('firma', new File([png], 'firma.png', { type: 'image/png' }))
      const r = await entregarOtAccion(fd)
      if (r && !r.ok) setError(r.errores.join(' · '))
    })
  }

  return (
    <form className="formulario" onSubmit={(e) => { e.preventDefault(); entregar() }}>
      <fieldset>
        <legend>Entrega del vehículo{obligatoria ? '' : ' (firma opcional)'}</legend>
        <p>{texto}</p>
        <label className="campo">Nombre de quien retira el vehículo
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={200} required={obligatoria} />
        </label>
        <label className="campo">Vencimiento del seguro del vehículo (opcional{vencimientoSeguro ? '; corrígelo si ha cambiado' : ''})
          <input type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
        </label>
        <FirmaLienzo f={f} etiqueta="Firma de quien retira el vehículo" />
        {error && <p className="aviso-error" role="alert">{error}</p>}
        <button type="submit" className="btn" disabled={pend || falta}>{pend ? 'Entregando…' : 'Entregar el vehículo'}</button>
      </fieldset>
    </form>
  )
}
