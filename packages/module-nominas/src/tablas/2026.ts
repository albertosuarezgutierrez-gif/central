import { cifra, PENDIENTE_VERIFICAR } from '../cifras'
import type { TablaAnual } from './tipo'

/*
 * TABLAS 2026 — Seguridad Social y SMI.
 * Normas: RDL 3/2026 (prórroga de bases), Orden PJC/297/2026 (orden de cotización 2026), RD 126/2026 (SMI 2026),
 * LGSS art. 19 bis (solidaridad) y art. 127 bis (MEI) en la redacción del RDL 2/2023.
 * 🚨 Desde el contenedor NO se llega al BOE (estudio docs/superpowers/specs/2026-11-05-modulo-nominas.md): las
 * certezas son las del estudio (fuentes secundarias). Al confirmar una cifra contra el BOE: cambia `certeza`, cita el
 * artículo y actualiza el guardián `tablas.test.ts` (que falla a propósito si una cifra cambia sin tocarlo).
 */
const ORDEN = 'Orden PJC/297/2026 (cotización 2026)'
const SEC_BASES = 'secundarias: grupo2000.es, laboral-social.com/node/30379, iberley (Boletín RED 5/2026), garrigues.com'
const BASE_MAX = cifra(
  'base_max_mensual', 510_120, 'seguro',
  `RDL 3/2026 + ${ORDEN}: base máxima 5.101,20 €/mes [Seguro según estudio; ${SEC_BASES}]`,
)
const BASE_MAX_DIA = cifra('base_max_diaria', 17_004, 'seguro', `RDL 3/2026 + ${ORDEN}: 170,04 €/día [Seguro según estudio]`)
// Grupos 4-7: el estudio duda 10 céntimos entre fuentes (1.424,40 vs 1.424,50 = SMI 1.221 × 14 / 12). Candidato 1.424,40.
const MIN_4_7 = cifra(
  'base_min_grupos_4_7', 142_440, PENDIENTE_VERIFICAR,
  `${ORDEN}, art. de bases mínimas por grupo: ≈1.424,40 €/mes (10 céntimos de duda entre fuentes) — verificar en BOE`,
)
const MIN_DIARIA_8_11 = cifra(
  'base_min_diaria_grupos_8_11', 4_748, 'probable',
  `${ORDEN}: 47,48 €/día [Probable según estudio; = 1.424,40/30 y = 1.424,50/30 redondeado: no le afecta la duda de 4-7]`,
)

export const TABLA_2026: TablaAnual = {
  año: 2026,
  basesMensuales: {
    1: { min: cifra('base_min_grupo_1', 198_930, 'probable', `${ORDEN}: 1.989,30 €/mes [Probable según estudio]`), max: BASE_MAX },
    // Grupos 2 y 3: el estudio no da cifra 2026. Sin candidato: null = «no se sabe» (NO se arrastra la de 2025).
    2: { min: cifra<number>('base_min_grupo_2', null, PENDIENTE_VERIFICAR, `${ORDEN}, bases mínimas grupo 2 — sin cifra en el estudio`), max: BASE_MAX },
    3: { min: cifra<number>('base_min_grupo_3', null, PENDIENTE_VERIFICAR, `${ORDEN}, bases mínimas grupo 3 — sin cifra en el estudio`), max: BASE_MAX },
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
  tipos: {
    contingenciasComunes: {
      empresa: cifra('cc_empresa', 236_000, 'seguro', `${ORDEN}: 23,60 % [Seguro: estudio + sin cambios desde LPGE]`),
      trabajador: cifra('cc_trabajador', 47_000, 'seguro', `${ORDEN}: 4,70 % [Seguro]`),
    },
    desempleoIndefinido: {
      empresa: cifra('desempleo_indef_empresa', 55_000, 'seguro', `${ORDEN}: 5,50 % (contrato indefinido, incl. parcial y fijo discontinuo) [Seguro]`),
      trabajador: cifra('desempleo_indef_trabajador', 15_500, 'seguro', `${ORDEN}: 1,55 % [Seguro]`),
    },
    desempleoTemporal: {
      empresa: cifra('desempleo_temp_empresa', 67_000, 'seguro', `${ORDEN}: 6,70 % (duración determinada) [Seguro]`),
      trabajador: cifra('desempleo_temp_trabajador', 16_000, 'seguro', `${ORDEN}: 1,60 % [Seguro]`),
    },
    fogasa: cifra('fogasa_empresa', 2_000, 'seguro', `${ORDEN}: FOGASA 0,20 % empresa [Seguro]`),
    fp: {
      empresa: cifra('fp_empresa', 6_000, 'seguro', `${ORDEN}: formación profesional 0,60 % [Seguro]`),
      trabajador: cifra('fp_trabajador', 1_000, 'seguro', `${ORDEN}: 0,10 % [Seguro]`),
    },
    mei: {
      total: cifra('mei_total', 9_000, 'probable', 'LGSS art. 127 bis (RDL 2/2023, calendario 2023-2029): 0,90 % en 2026 [Probable: 2 fuentes]'),
      // Reparto 5:1 → 0,75 / 0,15 según el estudio, pero no contrastado: PENDIENTE.
      empresa: cifra('mei_empresa', 7_500, PENDIENTE_VERIFICAR, 'LGSS art. 127 bis: reparto empresa 0,75 % — verificar en Orden PJC/297/2026'),
      trabajador: cifra('mei_trabajador', 1_500, PENDIENTE_VERIFICAR, 'LGSS art. 127 bis: reparto trabajador 0,15 % — verificar en Orden PJC/297/2026'),
    },
  },
  solidaridad: {
    // Límites de tramo (10 % y 50 % sobre la base máxima): LGSS art. 19 bis [Seguro: es la estructura legal].
    // Tipos 2026: candidatos del calendario del RDL 2/2023 (2025: 0,92/1,00/1,17 → 2026 ≈ 1,15/1,25/1,46). PENDIENTES.
    tramos: [
      { hastaPctSobreMax: 10, tipo: cifra('solidaridad_tramo_1', 11_500, PENDIENTE_VERIFICAR, 'LGSS art. 19 bis + DT RDL 2/2023: tramo 1 (≤10 % sobre base máx.) ≈1,15 % — verificar en Orden PJC/297/2026') },
      { hastaPctSobreMax: 50, tipo: cifra('solidaridad_tramo_2', 12_500, PENDIENTE_VERIFICAR, 'LGSS art. 19 bis + DT RDL 2/2023: tramo 2 (10-50 %) ≈1,25 % — verificar') },
      { hastaPctSobreMax: null, tipo: cifra('solidaridad_tramo_3', 14_600, PENDIENTE_VERIFICAR, 'LGSS art. 19 bis + DT RDL 2/2023: tramo 3 (>50 %) ≈1,46 % — verificar') },
    ],
    repartoComoCC: cifra('solidaridad_reparto', true, PENDIENTE_VERIFICAR, 'LGSS art. 19 bis: reparto en la proporción de contingencias comunes (23,60/4,70) — verificar'),
  },
}
