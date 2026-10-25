import { patrimonioSenalesActivas } from '@central/module-patrimonio'

/**
 * Interruptor de las «señales de patrimonio» (P15/P16, 26/10/2026). APAGADO por defecto: solo `PATRIMONIO_SENALES_ACTIVAS=1`
 * enciende. Apagado, el portal NO enseña la casilla `comercial_patrimonio`, ni el aviso, ni el apartado de la política de
 * privacidad, ni escribe esa fila, y `VERSION_TEXTOS_LEGALES` no cambia (`versionTextosLegales(false)`).
 * Se lee en cada llamada (no se congela al cargar el módulo) para que un cepo pueda probar los dos estados.
 */
export function senalesActivas(): boolean {
  return patrimonioSenalesActivas(process.env.PATRIMONIO_SENALES_ACTIVAS)
}
