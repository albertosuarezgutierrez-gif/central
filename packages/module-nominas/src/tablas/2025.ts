import { cifra, PENDIENTE_VERIFICAR } from '../cifras'
import type { TablaAnual } from './tipo'

/*
 * TABLAS 2025. Hasta el 05/11/2026 estos valores vivían en `tablas-2026.ts` con el nombre de 2026 (engañoso: el motor
 * calculaba 2026 con cifras de 2025… y ni siquiera todas eran de 2025). Se conservan como 2025, pero los MÍNIMOS por grupo
 * heredados (1.847,40 / 1.531,80 / 1.332,90 / 1.184,10 / 39,47 €) NO casan con la Orden de 2025: 1.847,40 es el mínimo
 * del grupo 1 de 2024. Quedan como candidatos PENDIENTE_VERIFICAR; los valores 2025 probables (de memoria, SIN contrastar:
 * grupo 1 1.929,00 · grupo 2 1.599,60 · grupo 3 1.391,70 · grupos 4-11 1.381,20 / 46,04 €/día) se confirman en la
 * Orden PJC/178/2025 antes de usar 2025 en modo «cálculo».
 */
const ORDEN = 'Orden PJC/178/2025 (cotización 2025)'
const HEREDADO = 'valor heredado de tablas-2026.ts (sin fuente); probablemente de 2024 — verificar en BOE'
const BASE_MAX = cifra('base_max_mensual', 490_950, 'probable', `${ORDEN}: 4.909,50 €/mes [Probable]`)
const BASE_MAX_DIA = cifra('base_max_diaria', 16_365, 'probable', `${ORDEN}: 163,65 €/día [Probable]`)
const MIN_4_7 = cifra('base_min_grupos_4_7', 118_410, PENDIENTE_VERIFICAR, `${ORDEN}: ${HEREDADO} (probable 1.381,20)`)
const MIN_DIA = cifra('base_min_diaria_grupos_8_11', 3_947, PENDIENTE_VERIFICAR, `${ORDEN}: ${HEREDADO} (probable 46,04)`)

export const TABLA_2025: TablaAnual = {
  año: 2025,
  basesMensuales: {
    1: { min: cifra('base_min_grupo_1', 184_740, PENDIENTE_VERIFICAR, `${ORDEN}: ${HEREDADO} (probable 1.929,00)`), max: BASE_MAX },
    2: { min: cifra('base_min_grupo_2', 153_180, PENDIENTE_VERIFICAR, `${ORDEN}: ${HEREDADO} (probable 1.599,60)`), max: BASE_MAX },
    3: { min: cifra('base_min_grupo_3', 133_290, PENDIENTE_VERIFICAR, `${ORDEN}: ${HEREDADO} (probable 1.391,70)`), max: BASE_MAX },
    4: { min: MIN_4_7, max: BASE_MAX },
    5: { min: MIN_4_7, max: BASE_MAX },
    6: { min: MIN_4_7, max: BASE_MAX },
    7: { min: MIN_4_7, max: BASE_MAX },
  },
  basesDiarias: {
    8: { min: MIN_DIA, max: BASE_MAX_DIA },
    9: { min: MIN_DIA, max: BASE_MAX_DIA },
    10: { min: MIN_DIA, max: BASE_MAX_DIA },
    11: { min: MIN_DIA, max: BASE_MAX_DIA },
  },
  smi: {
    // El heredado era 1.184,10 (= mínimo grupos 4-7 heredado). SMI 2025 = 1.184 €/mes × 14.
    mensual: cifra('smi_mensual', 118_400, 'probable', 'RD 87/2025: 1.184 €/mes en 14 pagas [Probable]'),
    anual: cifra('smi_anual', 1_657_600, 'probable', 'RD 87/2025: 16.576 €/año [Probable]'),
  },
  tipos: {
    contingenciasComunes: {
      empresa: cifra('cc_empresa', 236_000, 'seguro', `${ORDEN}: 23,60 % [Seguro]`),
      trabajador: cifra('cc_trabajador', 47_000, 'seguro', `${ORDEN}: 4,70 % [Seguro]`),
    },
    desempleoIndefinido: {
      empresa: cifra('desempleo_indef_empresa', 55_000, 'seguro', `${ORDEN}: 5,50 % [Seguro]`),
      trabajador: cifra('desempleo_indef_trabajador', 15_500, 'seguro', `${ORDEN}: 1,55 % [Seguro]`),
    },
    desempleoTemporal: {
      empresa: cifra('desempleo_temp_empresa', 67_000, 'seguro', `${ORDEN}: 6,70 % [Seguro]`),
      trabajador: cifra('desempleo_temp_trabajador', 16_000, 'seguro', `${ORDEN}: 1,60 % [Seguro]`),
    },
    fogasa: cifra('fogasa_empresa', 2_000, 'seguro', `${ORDEN}: 0,20 % [Seguro]`),
    fp: {
      empresa: cifra('fp_empresa', 6_000, 'seguro', `${ORDEN}: 0,60 % [Seguro]`),
      trabajador: cifra('fp_trabajador', 1_000, 'seguro', `${ORDEN}: 0,10 % [Seguro]`),
    },
    mei: {
      total: cifra('mei_total', 8_000, 'probable', 'LGSS art. 127 bis (RDL 2/2023): 0,80 % en 2025 [Probable]'),
      empresa: cifra('mei_empresa', 6_700, PENDIENTE_VERIFICAR, 'LGSS art. 127 bis: reparto empresa 0,67 % — verificar'),
      trabajador: cifra('mei_trabajador', 1_300, PENDIENTE_VERIFICAR, 'LGSS art. 127 bis: reparto trabajador 0,13 % — verificar'),
    },
  },
  solidaridad: {
    tramos: [
      { hastaPctSobreMax: 10, tipo: cifra('solidaridad_tramo_1', 9_200, PENDIENTE_VERIFICAR, 'LGSS art. 19 bis + DT RDL 2/2023: 0,92 % (2025) — verificar') },
      { hastaPctSobreMax: 50, tipo: cifra('solidaridad_tramo_2', 10_000, PENDIENTE_VERIFICAR, 'LGSS art. 19 bis + DT RDL 2/2023: 1,00 % (2025) — verificar') },
      { hastaPctSobreMax: null, tipo: cifra('solidaridad_tramo_3', 11_700, PENDIENTE_VERIFICAR, 'LGSS art. 19 bis + DT RDL 2/2023: 1,17 % (2025) — verificar') },
    ],
    repartoComoCC: cifra('solidaridad_reparto', true, PENDIENTE_VERIFICAR, 'LGSS art. 19 bis: reparto como contingencias comunes — verificar'),
  },
}
