/**
 * El desempate identidad ↔ ficha vive ahora en `@central/module-seguros-portal`.
 *
 * 🚨 Se subió al paquete el 05/09/2026 porque dejó de tener UN solo consumidor:
 * `apps/asegura` lo necesita para PREDECIR, antes de invitar a un cliente al
 * portal, si su correo va a vincularle con su ficha o le va a dejar delante de
 * una bóveda vacía. Predecir con una copia distinta de la regla sería peor que
 * no predecir: el correo saldría diciendo «aquí están tus seguros» y dentro no
 * habría ninguno, sin que nada fallara.
 *
 * Este fichero se queda como re-export para no tocar a sus llamadores ni a su
 * cepo (`vinculo.test.ts`), que sigue apuntando aquí.
 */
export { elegirFicha } from '@central/module-seguros-portal'
export type { Candidato, FichaElegida } from '@central/module-seguros-portal'
