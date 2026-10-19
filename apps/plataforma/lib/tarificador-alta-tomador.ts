// Bloqueo de Mapfre por la ficha del tomador en los bots de MOTO (19/10/2026). PURO: sin red.
//
// Mapfre da de ALTA al tomador nuevo con nombre, primer apellido y nacimiento de la ficha: si faltan, asegura responde 422
// `falta_datos_tomador` al encolar. Auto ya pasa este bloqueo a `PrecioBots` (`BotsAutoRiesgo`); moto lo olvidaba y el botón
// quedaba activo. Misma regla (`faltanFichaTomadorParaAlta`) sobre los reparos de la precalificación de la ficha.
import { avisoFichaTomadorParaAlta, COMPANIAS_ALTA_TOMADOR, faltanFichaTomadorParaAlta } from './tarificador-auto-riesgo.ts'

/**
 * `bloqueosPorCompania` para `PrecioBots` a partir de los reparos de la ficha del tomador (`null` = precalificación ilegible:
 * no se afirma que falte nada, lo comprueba asegura al encolar). `undefined` = nada que bloquear. PURA.
 */
export function bloqueosAltaTomador(faltanTomador: readonly { campo: string }[] | null, tomadorEmpresa: boolean): Record<string, string> | undefined {
  if (faltanTomador === null) return undefined
  const aviso = avisoFichaTomadorParaAlta(faltanFichaTomadorParaAlta({ figuras: [{ rol: 'tomador', clienteId: '', empresa: tomadorEmpresa, faltan: faltanTomador.map((f) => f.campo) }] }))
  return aviso ? Object.fromEntries(COMPANIAS_ALTA_TOMADOR.map((c) => [c, aviso])) : undefined
}
