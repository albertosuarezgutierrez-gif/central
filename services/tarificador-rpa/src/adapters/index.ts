import { crearRegistro } from '@central/module-tarificacion'
import type { AdaptadorRegistrado } from '../ramo.ts'
import { allianzComunidades } from './allianz/comunidades.ts'
import { allianzAuto, allianzMoto, AUTO_ACTIVO, MOTO_ACTIVO } from './allianz/auto.ts'
import { mapfreAuto, mapfreMoto } from './mapfre/auto.ts'
import { ALLIANZ_HOGAR_ACTIVO, allianzHogar } from './allianz/hogar.ts'
import { GENERALI_AUTO_ACTIVO, generaliAuto } from './generali/auto.ts'

/** Los adaptadores que trae compilados esta imagen (de cualquier ramo: el runner valida el riesgo con el del ramo, ramo.ts). */
export const adaptadores = crearRegistro<AdaptadorRegistrado>()
adaptadores.registrar(allianzComunidades)
// Allianz MOTO (avance de pestaña autorizado por Alberto el 13/10/2026): se registra SOLO con su flag `MOTO_ACTIVO`
// (allianz/auto.ts, apagado; lo enciende Alberto). Apagado, un trabajo de Moto cae como `datos` («sin adaptador») sin abrir
// el navegador.
if (MOTO_ACTIVO) adaptadores.registrar(allianzMoto)
// Allianz TURISMOS (15/10/2026, encendido para explorar; Alberto): sin mapa, cae en ErrorMapaIncompleto + inventario antes de rellenar.
if (AUTO_ACTIVO) adaptadores.registrar(allianzAuto)
// Mapfre wmediadores · NSEI (coche y moto). Registrado SIEMPRE (Alberto, 14/10/2026: el worker de Fly no puede recibir un
// secreto nuevo). La PUERTA REAL es la fila `seguros.companias_integracion` mapfre/<ramo> ACTIVA y `rpa_autorizada`: sin ella
// asegura no encola (`encolarTrabajo`), no reclama ni lanza máquina (`reclamarSiguiente`) y no sirve el trabajo al worker
// (solo `en_curso`, que únicamente pone el reclamo). Lo vigila test/regression-tarificador-rpa.test.ts (raíz).
adaptadores.registrar(mapfreAuto)
adaptadores.registrar(mapfreMoto)
// Allianz HOGAR (14/10/2026): pantalla 1 «Vivienda» mapeada de las exploraciones IA; lo que sigue (valoración, precio) es hueco
// con inventario. Se registra SOLO con su flag (allianz/hogar.ts, APAGADO; lo enciende Alberto). Apagado, un trabajo de hogar
// cae como `datos` («sin adaptador») sin abrir el navegador. Además asegura no acepta aún trabajos de hogar (validarEntradaRamo).
if (ALLIANZ_HOGAR_ACTIVO) adaptadores.registrar(allianzHogar)
// Generali TURISMOS (18/10/2026, v0.1.0): mapa de 6 capturas hasta «Datos de Valoración»; lo que sigue (modelo/versión del
// selector, tomador, antecedentes y PRECIO) es hueco con inventario. Se registra SOLO con su flag (generali/auto.ts, ENCENDIDO por
// Alberto el 18/10/2026). La fila `seguros.companias_integracion` generali/auto sigue siendo la puerta de BD: sin ella no corre nada.
if (GENERALI_AUTO_ACTIVO) adaptadores.registrar(generaliAuto)
