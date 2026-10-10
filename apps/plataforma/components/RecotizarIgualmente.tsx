'use client'

// «Recotizar igualmente (0,50€)» (08/10/2026): asegura contestó 409 `duplicado` (misma cotización en curso o de hace
// menos de 15 minutos, SIN cargo). Este botón es el gesto explícito del corredor para pagar otra vez: pide confirmación
// y reenvía la MISMA petición con `forzar: true`. Nunca se lanza solo.

import { btnStyle } from '@/components/ui'

export const TEXTO_CONFIRMAR_RECOTIZAR =
  'Esto vuelve a llamar a la compañía y se cobrarán otros 0,50€ por una cotización idéntica a la reciente. ¿Recotizar igualmente?'

export default function RecotizarIgualmente({ onRecotizar, deshabilitado }: { onRecotizar: () => void; deshabilitado: boolean }) {
  return (
    <button
      type="button"
      disabled={deshabilitado}
      onClick={() => {
        if (deshabilitado) return
        if (!window.confirm(TEXTO_CONFIRMAR_RECOTIZAR)) return
        onRecotizar()
      }}
      style={{ ...btnStyle('secundario'), width: '100%', maxWidth: 420, marginTop: 8, minHeight: 44 }}
    >
      Recotizar igualmente (0,50€)
    </button>
  )
}
