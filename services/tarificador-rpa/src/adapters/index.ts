import { crearRegistro } from '@central/module-tarificacion'
import type { AdaptadorRegistrado } from '../ramo.ts'
import { allianzComunidades } from './allianz/comunidades.ts'
import { allianzMoto, MOTO_ACTIVO } from './allianz/auto.ts'
import { mapfreAuto, mapfreMoto } from './mapfre/auto.ts'

/** Los adaptadores que trae compilados esta imagen (de cualquier ramo: el runner valida el riesgo con el del ramo, ramo.ts). */
export const adaptadores = crearRegistro<AdaptadorRegistrado>()
adaptadores.registrar(allianzComunidades)
// Allianz MOTO (avance de pestaña autorizado por Alberto el 13/10/2026): se registra SOLO con su flag `MOTO_ACTIVO`
// (allianz/auto.ts, apagado; lo enciende Alberto). Apagado, un trabajo de Moto cae como `datos` («sin adaptador») sin abrir
// el navegador. Turismos (`allianzAuto`, AUTO_ACTIVO) sigue sin registrarse.
if (MOTO_ACTIVO) adaptadores.registrar(allianzMoto)
// Mapfre wmediadores · NSEI (coche y moto). Registrado SIEMPRE (Alberto, 14/10/2026: el worker de Fly no puede recibir un
// secreto nuevo). La PUERTA REAL es la fila `seguros.companias_integracion` mapfre/<ramo> ACTIVA y `rpa_autorizada`: sin ella
// asegura no encola (`encolarTrabajo`), no reclama ni lanza máquina (`reclamarSiguiente`) y no sirve el trabajo al worker
// (solo `en_curso`, que únicamente pone el reclamo). Lo vigila test/regression-tarificador-rpa.test.ts (raíz).
adaptadores.registrar(mapfreAuto)
adaptadores.registrar(mapfreMoto)
