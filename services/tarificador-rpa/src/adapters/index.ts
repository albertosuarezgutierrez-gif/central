import { crearRegistro } from '@central/module-tarificacion'
import type { AdaptadorRegistrado } from '../ramo.ts'
import { allianzComunidades } from './allianz/comunidades.ts'
import { allianzMoto, MOTO_ACTIVO } from './allianz/auto.ts'

/** Los adaptadores que trae compilados esta imagen (de cualquier ramo: el runner valida el riesgo con el del ramo, ramo.ts). */
export const adaptadores = crearRegistro<AdaptadorRegistrado>()
adaptadores.registrar(allianzComunidades)
// Allianz MOTO (avance de pestaña autorizado por Alberto el 13/10/2026): se registra SOLO con su flag `MOTO_ACTIVO`
// (allianz/auto.ts, apagado; lo enciende Alberto). Apagado, un trabajo de Moto cae como `datos` («sin adaptador») sin abrir
// el navegador. Turismos (`allianzAuto`, AUTO_ACTIVO) sigue sin registrarse.
if (MOTO_ACTIVO) adaptadores.registrar(allianzMoto)
