import { cifra, PENDIENTE_VERIFICAR } from '../cifras'
import type { TablaIrpf } from './irpf-tipo'

/*
 * IRPF — algoritmo de retenciones 2026 (AEAT «ALGORITMO_2026.pdf»; Reglamento IRPF RD 439/2007 arts. 80-89).
 * 🚨 Desde el contenedor NO se llega al BOE ni a sede.agenciatributaria.gob.es: NINGUNA cifra está contrastada contra la
 * fuente primaria. `probable` = la recuerdo de la norma estable (Ley/Reglamento sin cambio conocido) y el estudio
 * (docs/superpowers/specs/2026-11-05-modulo-nominas.md §3) dice «escala sin cambios estatales».
 * `PENDIENTE_VERIFICAR` = cifra o regla dudosa o que cambia en 2026: el modo «calculo» LANZA, la «simulacion» la lista.
 * Al verificar: cambia la certeza, cita el artículo y actualiza `regression-irpf-aeat.test.ts`.
 */
const RIRPF = 'RIRPF (RD 439/2007)'
const LIRPF = 'LIRPF (Ley 35/2006)'
const SIN_BOE = 'sin contrastar con BOE/AEAT desde el contenedor'
const P = PENDIENTE_VERIFICAR

export const TABLA_IRPF_2026: TablaIrpf = {
  año: 2026,
  escala: [
    { hasta: cifra('irpf_escala_1_hasta', 1_245_000, 'probable', `${RIRPF} art. 85.1: hasta 12.450 € [${SIN_BOE}]`), tipo: cifra('irpf_escala_1_tipo', 190_000, 'probable', `${RIRPF} art. 85.1: 19 %`) },
    { hasta: cifra('irpf_escala_2_hasta', 2_020_000, 'probable', `${RIRPF} art. 85.1: hasta 20.200 €`), tipo: cifra('irpf_escala_2_tipo', 240_000, 'probable', `${RIRPF} art. 85.1: 24 %`) },
    { hasta: cifra('irpf_escala_3_hasta', 3_520_000, 'probable', `${RIRPF} art. 85.1: hasta 35.200 €`), tipo: cifra('irpf_escala_3_tipo', 300_000, 'probable', `${RIRPF} art. 85.1: 30 %`) },
    { hasta: cifra('irpf_escala_4_hasta', 6_000_000, 'probable', `${RIRPF} art. 85.1: hasta 60.000 €`), tipo: cifra('irpf_escala_4_tipo', 370_000, 'probable', `${RIRPF} art. 85.1: 37 %`) },
    { hasta: cifra('irpf_escala_5_hasta', 30_000_000, 'probable', `${RIRPF} art. 85.1: hasta 300.000 €`), tipo: cifra('irpf_escala_5_tipo', 450_000, 'probable', `${RIRPF} art. 85.1: 45 %`) },
    { hasta: null, tipo: cifra('irpf_escala_6_tipo', 470_000, 'probable', `${RIRPF} art. 85.1: 47 % (resto)`) },
  ],
  tipoMaximo: cifra('irpf_tipo_maximo', 470_000, 'probable', `Spec nóminas §3: sin modelo 145 se aplica el tipo máximo = último tramo de la escala (47 %) [Probable: bolsamania.com]. ${SIN_BOE}`),
  tipoMinimoContratoCorto: cifra('irpf_tipo_min_contrato_corto', 20_000, 'probable', `${RIRPF} art. 86.2: 2 % mínimo en contratos de duración inferior a un año [${SIN_BOE}]`),
  gastos: {
    otros: cifra('irpf_gastos_otros', 200_000, 'probable', `${LIRPF} art. 19.2.f): otros gastos 2.000 €`),
    discapacidad33: cifra('irpf_gastos_disc33', 350_000, 'probable', `${LIRPF} art. 19.2.f): +3.500 € trabajador con discapacidad ≥ 33 %`),
    discapacidad65: cifra('irpf_gastos_disc65', 775_000, 'probable', `${LIRPF} art. 19.2.f): +7.750 € discapacidad ≥ 65 % o necesidad de asistencia`),
  },
  reduccionTrabajo: {
    umbral1: cifra('irpf_red20_umbral1', 1_485_200, 'probable', `${LIRPF} art. 20.1 (redacción Ley 31/2022): rendimiento neto ≤ 14.852 €`),
    reduccionMax: cifra('irpf_red20_max', 730_200, 'probable', `${LIRPF} art. 20.1: 7.302 €`),
    umbral2: cifra('irpf_red20_umbral2', 1_767_352, 'probable', `${LIRPF} art. 20.1: 17.673,52 €`),
    factor1: cifra('irpf_red20_factor1', 1_750_000, 'probable', `${LIRPF} art. 20.1: 7.302 − 1,75 × (RN − 14.852)`),
    reduccionUmbral2: cifra('irpf_red20_en_umbral2', 236_434, 'probable', `${LIRPF} art. 20.1: 2.364,34 € (continuidad: 7.302 − 1,75 × 2.821,52)`),
    umbral3: cifra('irpf_red20_umbral3', 1_974_750, 'probable', `${LIRPF} art. 20.1: 19.747,50 €`),
    factor2: cifra('irpf_red20_factor2', 1_140_000, 'probable', `${LIRPF} art. 20.1: 2.364,34 − 1,14 × (RN − 17.673,52)`),
  },
  minimos: {
    personal: cifra('irpf_min_personal', 555_000, 'probable', `${LIRPF} art. 57: 5.550 €`),
    mayor65: cifra('irpf_min_mayor65', 115_000, 'probable', `${LIRPF} art. 57: +1.150 € (> 65 años a 31-12)`),
    mayor75: cifra('irpf_min_mayor75', 140_000, 'probable', `${LIRPF} art. 57: +1.400 € (> 75 años)`),
    discapacidad33: cifra('irpf_min_disc33', 300_000, 'probable', `${LIRPF} art. 60: 3.000 € (≥ 33 % y < 65 %)`),
    discapacidad65: cifra('irpf_min_disc65', 900_000, 'probable', `${LIRPF} art. 60: 9.000 € (≥ 65 %)`),
    asistencia: cifra('irpf_min_asistencia', 300_000, 'probable', `${LIRPF} art. 60: +3.000 € necesidad de ayuda de terceros`),
    descendientes: [
      cifra('irpf_min_desc_1', 240_000, 'probable', `${LIRPF} art. 58: 2.400 € primero`),
      cifra('irpf_min_desc_2', 270_000, 'probable', `${LIRPF} art. 58: 2.700 € segundo`),
      cifra('irpf_min_desc_3', 400_000, 'probable', `${LIRPF} art. 58: 4.000 € tercero`),
      cifra('irpf_min_desc_4', 450_000, 'probable', `${LIRPF} art. 58: 4.500 € cuarto y siguientes`),
    ],
    descendienteMenor3: cifra('irpf_min_desc_menor3', 280_000, 'probable', `${LIRPF} art. 58: +2.800 € menor de 3 años`),
    ascendiente: cifra('irpf_min_asc', 115_000, 'probable', `${LIRPF} art. 59: 1.150 € (> 65 años o discapacitado)`),
    ascendienteMayor75: cifra('irpf_min_asc_mayor75', 140_000, 'probable', `${LIRPF} art. 59: +1.400 € (> 75 años)`),
  },
  hipotecaAnterior2013: {
    reduccionTipo: cifra('irpf_hipoteca_reduccion_tipo', 20_000, 'probable', `${RIRPF} art. 86.2: el tipo se reduce 2 puntos [${SIN_BOE}]`),
    limiteRetribucion: cifra('irpf_hipoteca_limite', 3_300_720, 'probable', `${RIRPF} art. 86.2: retribuciones ≤ 33.007,20 € [${SIN_BOE}]`),
  },
  limite853: {
    porcentaje: cifra('irpf_limite_853_pct', 430_000, P, `${RIRPF} art. 85.3: 43 % — la BASE sobre la que se aplica (aquí: retribución − mínimo personal y familiar) NO está contrastada; verificar en el BOE`),
  },
  // Límite excluyente art. 81.1 RIRPF: la tabla 2026 cambia con la medida del SMI (17.094 €) y no hay cifra fiable. null = «no se sabe».
  exento: Object.fromEntries(
    ['1:1', '1:2', '2:0', '2:1', '2:2', '3:0'].map(k => [k, cifra<number>(`irpf_exento_${k.replace(':', '_')}`, null, P, `${RIRPF} art. 81.1 (tabla 2026): sin cifra verificada — NO se arrastra la de 2025`)]),
  ),
  deduccionSmi: {
    importeMaximo: cifra('irpf_deduccion_smi_max', 59_089, P, 'Estudio nóminas §3: deducción de hasta 590,89 € para rentas ≤ SMI [Probable: idealista.com/news/node/885453] — norma sin identificar'),
    retribucionHasta: cifra('irpf_deduccion_smi_hasta', 2_004_800, P, 'Estudio nóminas §3: decreciente hasta ≈ 20.048 € — verificar'),
  },
}
