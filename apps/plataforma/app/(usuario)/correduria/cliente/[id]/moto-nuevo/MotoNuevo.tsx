'use client'

// La pantalla COMPLETA de presupuesto de moto (07/10/2026): el cotizador vive en `CotizadorMoto.tsx`, que también
// se monta `embebido` en el bloque «Pedir precio» de la oportunidad. Esta entrada lo monta siempre en modo completo
// (catálogo, matrícula, figuras…): la usan `moto-nuevo/page.tsx` («➕ Presupuestar» de la ficha) y retarificar una
// póliza de moto (`poliza/[id]/retarificar/page.tsx`).

import type { ComponentProps } from 'react'
import CotizadorMoto from './CotizadorMoto'

export type { PolizaMoto } from './CotizadorMoto'

export default function MotoNuevo(props: Omit<ComponentProps<typeof CotizadorMoto>, 'embebido' | 'bloqueo' | 'onCotizando' | 'onCotizado'>) {
  return <CotizadorMoto {...props} />
}
