import LlamadaClient from './LlamadaClient'

export const dynamic = 'force-dynamic'

/**
 * Modo llamada (pieza 1-3 de ASegura OS, maqueta aprobada el 23/09/2026): la
 * lista de hoy, un lead por pantalla, con lo necesario para llamar y los
 * botones de resultado que dejan escrito el siguiente paso.
 */
export default function LlamadaPage() {
  return <LlamadaClient />
}
