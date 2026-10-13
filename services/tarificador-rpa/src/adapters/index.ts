import { crearRegistro } from '@central/module-tarificacion'
import type { AdaptadorPortal } from '../adaptador.ts'
import { allianzComunidades } from './allianz/comunidades.ts'

/** Los adaptadores que trae compilados esta imagen. Uno nuevo se registra AQUÍ. */
export const adaptadores = crearRegistro<AdaptadorPortal>()
adaptadores.registrar(allianzComunidades)
// Allianz MOTO (`allianzMoto`, flag `MOTO_ACTIVO` en allianz/auto.ts, avance autorizado por Alberto el 13/10/2026) NO se
// registra todavía. PENDIENTE: runner tipado por ramo — hoy el registro y el runner solo conocen el riesgo de Comunidades
// (`validarRiesgoComunidad`); registrarlo exigiría forzar el tipo y un trabajo de Moto caería como `datos`. Cuando el runner
// valide `FormularioAuto`, se registra aquí con `if (MOTO_ACTIVO)`. Turismos (`allianzAuto`, AUTO_ACTIVO) tampoco.
