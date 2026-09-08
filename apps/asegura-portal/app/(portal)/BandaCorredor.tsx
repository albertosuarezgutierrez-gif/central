import { nombreDeFichaEnVista } from '@/lib/vista-corredor'

/**
 * La banda que dice que quien mira es el CORREDOR, no el cliente (08/09/2026).
 * `null` en una sesión normal: el cliente no tiene por qué saber que esto existe.
 *
 * En el flujo y no `position: fixed`: un elemento fijo no desborda, se pone
 * ENCIMA, y taparía la primera fila sin que ninguna medición lo delatara.
 */
export async function BandaCorredor() {
  // `null` = no es la sesión del corredor: sin banda.
  const nombre = await nombreDeFichaEnVista()
  if (nombre === null) return null
  return (
    <aside className="banda-corredor" role="status">
      <strong>Vista de corredor.</strong> Estás viendo el portal como lo ve <strong>{nombre}</strong>. Solo lectura:
      nada de lo que pulses se guarda en su nombre. Pulsa «Salir» para cerrarla.
    </aside>
  )
}
