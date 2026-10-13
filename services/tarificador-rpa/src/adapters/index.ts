import { crearRegistro } from '@central/module-tarificacion'
import type { AdaptadorPortal } from '../adaptador.ts'
import { allianzComunidades } from './allianz/comunidades.ts'
import { allianzMoto, MOTO_ACTIVO } from './allianz/auto.ts'

/** Los adaptadores que trae compilados esta imagen. Uno nuevo se registra AQUÍ. */
export const adaptadores = crearRegistro<AdaptadorPortal>()
adaptadores.registrar(allianzComunidades)
// Allianz MOTO (avance de pestaña autorizado por Alberto el 13/10/2026): solo con su flag propio, APAGADO hasta que lo
// encienda tras revisar el PR. Turismos (`allianzAuto`, AUTO_ACTIVO) NO se registra: sin formulario grabado.
// OJO: el registro está tipado para Comunidades y el runner valida el riesgo con `validarRiesgoComunidad`: hasta que el
// runner sepa validar un `FormularioAuto`, un trabajo de Moto cae como `datos` ANTES de abrir el navegador (fail-closed).
if (MOTO_ACTIVO) adaptadores.registrar(allianzMoto as unknown as AdaptadorPortal)
