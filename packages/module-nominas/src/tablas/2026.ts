import { cifra } from '../cifras'
import type { TablaAnual } from './tipo'

/*
 * TABLAS 2026 — Seguridad Social y SMI.
 * FUENTE PRIMARIA (contrastada el 07/11/2026 contra el BOE): Orden PJC/297/2026, de 30 de marzo (BOE núm. 79, de
 * 31/03/2026, BOE-A-2026-7296), que desarrolla el RDL 3/2026 (art. 3). Cada cifra cita su artículo de la Orden.
 * SMI: RD 126/2026 (citado por la Orden; el RD en sí no se ha descargado: certeza del estudio).
 * Al cambiar una cifra: cita el artículo y actualiza el guardián `tablas.test.ts` (falla a propósito si no).
 */
const ORDEN = 'Orden PJC/297/2026 (BOE-A-2026-7296)'
const BASE_MAX = cifra('base_max_mensual', 510_120, 'seguro', `${ORDEN} arts. 2.1 y 3: tope y base máxima 5.101,20 €/mes`)
const BASE_MAX_DIA = cifra('base_max_diaria', 17_004, 'seguro', `${ORDEN} art. 3: base máxima grupos 8-11 170,04 €/día`)
const MIN_4_7 = cifra('base_min_grupos_4_7', 142_440, 'seguro', `${ORDEN} art. 3: base mínima grupos 4-7 1.424,40 €/mes`)
const MIN_DIARIA_8_11 = cifra('base_min_diaria_grupos_8_11', 4_748, 'seguro', `${ORDEN} art. 3: base mínima grupos 8-11 47,48 €/día`)
const HORA_4_11 = cifra('base_min_hora_grupos_4_11', 858, 'seguro', `${ORDEN} art. 39.1: tiempo parcial, base mínima CC grupos 4-11 8,58 €/hora`)

export const TABLA_2026: TablaAnual = {
  año: 2026,
  basesMensuales: {
    1: { min: cifra('base_min_grupo_1', 198_930, 'seguro', `${ORDEN} art. 3: base mínima grupo 1 1.989,30 €/mes`), max: BASE_MAX },
    2: { min: cifra('base_min_grupo_2', 164_970, 'seguro', `${ORDEN} art. 3: base mínima grupo 2 1.649,70 €/mes`), max: BASE_MAX },
    3: { min: cifra('base_min_grupo_3', 143_520, 'seguro', `${ORDEN} art. 3: base mínima grupo 3 1.435,20 €/mes`), max: BASE_MAX },
    4: { min: MIN_4_7, max: BASE_MAX },
    5: { min: MIN_4_7, max: BASE_MAX },
    6: { min: MIN_4_7, max: BASE_MAX },
    7: { min: MIN_4_7, max: BASE_MAX },
  },
  basesDiarias: {
    8: { min: MIN_DIARIA_8_11, max: BASE_MAX_DIA },
    9: { min: MIN_DIARIA_8_11, max: BASE_MAX_DIA },
    10: { min: MIN_DIARIA_8_11, max: BASE_MAX_DIA },
    11: { min: MIN_DIARIA_8_11, max: BASE_MAX_DIA },
  },
  smi: {
    mensual: cifra('smi_mensual', 122_100, 'seguro', 'RD 126/2026: 1.221 €/mes en 14 pagas, efectos 1-ene-2026 [Seguro según estudio; cuestioneslaborales.es, taxdown.es]'),
    anual: cifra('smi_anual', 1_709_400, 'seguro', 'RD 126/2026: 17.094 €/año [Seguro según estudio]'),
  },
  topeMinimoCP: cifra('tope_min_cp', 142_440, 'seguro', `${ORDEN} arts. 1.2, 2.2 y 33.1: tope mínimo AT/EP (base de desempleo, FOGASA y FP) 1.424,40 €/mes`),
  parcial: {
    minimoHoraCC: {
      1: cifra('base_min_hora_grupo_1', 1_198, 'seguro', `${ORDEN} art. 39.1: tiempo parcial, base mínima CC grupo 1 11,98 €/hora`),
      2: cifra('base_min_hora_grupo_2', 994, 'seguro', `${ORDEN} art. 39.1: grupo 2 9,94 €/hora`),
      3: cifra('base_min_hora_grupo_3', 865, 'seguro', `${ORDEN} art. 39.1: grupo 3 8,65 €/hora`),
      4: HORA_4_11, 5: HORA_4_11, 6: HORA_4_11, 7: HORA_4_11, 8: HORA_4_11, 9: HORA_4_11, 10: HORA_4_11, 11: HORA_4_11,
    },
    minimoHoraCP: cifra('base_min_hora_cp', 858, 'seguro', `${ORDEN} art. 38.3: tiempo parcial, base AT/EP-desempleo-FOGASA-FP no inferior a 8,58 €/hora trabajada`),
  },
  tipos: {
    contingenciasComunes: {
      empresa: cifra('cc_empresa', 236_000, 'seguro', `${ORDEN} art. 4.a): 23,60 %`),
      trabajador: cifra('cc_trabajador', 47_000, 'seguro', `${ORDEN} art. 4.a): 4,70 %`),
    },
    desempleoIndefinido: {
      empresa: cifra('desempleo_indef_empresa', 55_000, 'seguro', `${ORDEN} art. 33.2.a).1.º: 5,50 % (indefinido, incl. parcial y fijo discontinuo)`),
      trabajador: cifra('desempleo_indef_trabajador', 15_500, 'seguro', `${ORDEN} art. 33.2.a).1.º: 1,55 %`),
    },
    desempleoTemporal: {
      empresa: cifra('desempleo_temp_empresa', 67_000, 'seguro', `${ORDEN} art. 33.2.a).2.º: 6,70 % (duración determinada)`),
      trabajador: cifra('desempleo_temp_trabajador', 16_000, 'seguro', `${ORDEN} art. 33.2.a).2.º: 1,60 %`),
    },
    fogasa: cifra('fogasa_empresa', 2_000, 'seguro', `${ORDEN} art. 33.2.b): FOGASA 0,20 % empresa`),
    fp: {
      empresa: cifra('fp_empresa', 6_000, 'seguro', `${ORDEN} art. 33.2.c): formación profesional 0,60 %`),
      trabajador: cifra('fp_trabajador', 1_000, 'seguro', `${ORDEN} art. 33.2.c): 0,10 %`),
    },
    mei: {
      total: cifra('mei_total', 9_000, 'seguro', `${ORDEN} art. 16: MEI 0,90 % sobre la base de contingencias comunes`),
      empresa: cifra('mei_empresa', 7_500, 'seguro', `${ORDEN} art. 16: 0,75 % a cargo del empleador`),
      trabajador: cifra('mei_trabajador', 1_500, 'seguro', `${ORDEN} art. 16: 0,15 % a cargo de la persona trabajadora`),
    },
  },
  solidaridad: {
    // Art. 17.1: tramo 1 de 5.101,21 a 5.611,32 € (= base máx. +10 %), tramo 2 hasta 7.651,80 € (= +50 %), tramo 3 el resto.
    // El reparto lo FIJA la Orden por tramo (no es exactamente la proporción de CC): se aplica tal cual.
    tramos: [
      { hastaPctSobreMax: 10, tipo: cifra('solidaridad_tramo_1', 11_500, 'seguro', `${ORDEN} art. 17.1.a): 1,15 % (5.101,21-5.611,32 €)`),
        reparto: { empresa: cifra('solidaridad_tramo_1_empresa', 9_600, 'seguro', `${ORDEN} art. 17.1.a): 0,96 % empresa`), trabajador: cifra('solidaridad_tramo_1_trabajador', 1_900, 'seguro', `${ORDEN} art. 17.1.a): 0,19 % trabajador`) } },
      { hastaPctSobreMax: 50, tipo: cifra('solidaridad_tramo_2', 12_500, 'seguro', `${ORDEN} art. 17.1.b): 1,25 % (5.611,33-7.651,80 €)`),
        reparto: { empresa: cifra('solidaridad_tramo_2_empresa', 10_400, 'seguro', `${ORDEN} art. 17.1.b): 1,04 % empresa`), trabajador: cifra('solidaridad_tramo_2_trabajador', 2_100, 'seguro', `${ORDEN} art. 17.1.b): 0,21 % trabajador`) } },
      { hastaPctSobreMax: null, tipo: cifra('solidaridad_tramo_3', 14_600, 'seguro', `${ORDEN} art. 17.1.c): 1,46 % (> 7.651,80 €)`),
        reparto: { empresa: cifra('solidaridad_tramo_3_empresa', 12_200, 'seguro', `${ORDEN} art. 17.1.c): 1,22 % empresa`), trabajador: cifra('solidaridad_tramo_3_trabajador', 2_400, 'seguro', `${ORDEN} art. 17.1.c): 0,24 % trabajador`) } },
    ],
  },
}
