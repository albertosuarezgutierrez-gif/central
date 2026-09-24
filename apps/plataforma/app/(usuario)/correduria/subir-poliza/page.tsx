import { redirect } from 'next/navigation'
import { urlSubirPoliza } from '@/lib/ficha-asegura'

/**
 * Puerta de entrada a «subir una póliza que me han mandado».
 *
 * La pantalla que lee el documento vive en `apps/asegura` (comparte sitio con
 * la cotización que sale de lo leído), pero **la URL es de plataforma** por dos
 * motivos:
 *
 *   1. `urlSubirPoliza()` sale de `lib/ficha-asegura.ts`, que es código de
 *      SERVIDOR (lee `ASEGURA_OPERADOR_SECRET`). Enlazarlo desde la cabecera,
 *      que es un componente de cliente, arrastraría ese módulo al bundle del
 *      navegador. Aquí se resuelve en el servidor y no viaja nada.
 *   2. El día que la pantalla se porte a plataforma, la dirección que Alberto
 *      tiene en la mano no cambia.
 */
export const dynamic = 'force-dynamic'

export default function SubirPolizaPage() {
  redirect(urlSubirPoliza())
}
