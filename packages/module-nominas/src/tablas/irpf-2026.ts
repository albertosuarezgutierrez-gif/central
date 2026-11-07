import { cifra } from '../cifras'
import type { TablaIrpf } from './irpf-tipo'

/*
 * IRPF — retenciones 2026. FUENTE PRIMARIA contrastada el 07/11/2026 contra los textos CONSOLIDADOS del BOE
 * (última actualización de ambos: 07/10/2026):
 *   RIRPF = RD 439/2007 (BOE-A-2007-6820): arts. 81, 83, 85 y 86 sin cambios en 2026 (últimas redacciones: RD 142/2024,
 *           RD 1039/2022, RD 31/2023). Ninguna norma de 2026 toca los arts. 80-89.
 *   LIRPF = Ley 35/2006 (BOE-A-2006-20764): arts. 19, 20, 57-60 y DA 61.ª (redacción RDL 5/2026, BOE-A-2026-3810).
 * El PDF del algoritmo de la AEAT 2026 NO se pudo descargar desde el contenedor (sede.agenciatributaria.gob.es corta la
 * conexión): las cifras van con la norma, no con el PDF. Al cambiar una cifra: cita y actualiza `regression-irpf-aeat.test.ts`.
 */
const RIRPF = 'RIRPF (RD 439/2007, BOE-A-2007-6820, consolidado 07/10/2026)'
const LIRPF = 'LIRPF (Ley 35/2006, BOE-A-2006-20764, consolidado 07/10/2026)'

export const TABLA_IRPF_2026: TablaIrpf = {
  año: 2026,
  escala: [
    { hasta: cifra('irpf_escala_1_hasta', 1_245_000, 'seguro', `${RIRPF} art. 85.1.1.º: hasta 12.450 €`), tipo: cifra('irpf_escala_1_tipo', 190_000, 'seguro', `${RIRPF} art. 85.1.1.º: 19 %`) },
    { hasta: cifra('irpf_escala_2_hasta', 2_020_000, 'seguro', `${RIRPF} art. 85.1.1.º: hasta 20.200 €`), tipo: cifra('irpf_escala_2_tipo', 240_000, 'seguro', `${RIRPF} art. 85.1.1.º: 24 %`) },
    { hasta: cifra('irpf_escala_3_hasta', 3_520_000, 'seguro', `${RIRPF} art. 85.1.1.º: hasta 35.200 €`), tipo: cifra('irpf_escala_3_tipo', 300_000, 'seguro', `${RIRPF} art. 85.1.1.º: 30 %`) },
    { hasta: cifra('irpf_escala_4_hasta', 6_000_000, 'seguro', `${RIRPF} art. 85.1.1.º: hasta 60.000 €`), tipo: cifra('irpf_escala_4_tipo', 370_000, 'seguro', `${RIRPF} art. 85.1.1.º: 37 %`) },
    { hasta: cifra('irpf_escala_5_hasta', 30_000_000, 'seguro', `${RIRPF} art. 85.1.1.º: hasta 300.000 €`), tipo: cifra('irpf_escala_5_tipo', 450_000, 'seguro', `${RIRPF} art. 85.1.1.º: 45 %`) },
    { hasta: null, tipo: cifra('irpf_escala_6_tipo', 470_000, 'seguro', `${RIRPF} art. 85.1.1.º: 47 % (en adelante)`) },
  ],
  tipoMinimoContratoCorto: cifra('irpf_tipo_min_contrato_corto', 20_000, 'seguro', `${RIRPF} art. 86.2: mínimo 2 % en contratos o relaciones de duración inferior al año`),
  gastos: {
    otros: cifra('irpf_gastos_otros', 200_000, 'seguro', `${LIRPF} art. 19.2.f) y ${RIRPF} art. 83.3.c): otros gastos 2.000 €`),
    discapacidad33: cifra('irpf_gastos_disc33', 350_000, 'seguro', `${LIRPF} art. 19.2.f): +3.500 € trabajador activo con discapacidad`),
    discapacidad65: cifra('irpf_gastos_disc65', 775_000, 'seguro', `${LIRPF} art. 19.2.f): +7.750 € con ayuda de terceros, movilidad reducida o ≥ 65 %`),
  },
  reduccionMasDeDosDescendientes: cifra('irpf_reduccion_mas_2_desc', 60_000, 'seguro', `${RIRPF} art. 83.3.e): 600 € si más de dos descendientes con derecho a mínimo`),
  reduccionTrabajo: {
    umbral1: cifra('irpf_red20_umbral1', 1_485_200, 'seguro', `${RIRPF} art. 83.3.d).1.º y ${LIRPF} art. 20.a): rendimiento neto ≤ 14.852 €`),
    reduccionMax: cifra('irpf_red20_max', 730_200, 'seguro', `${RIRPF} art. 83.3.d).1.º: 7.302 €`),
    umbral2: cifra('irpf_red20_umbral2', 1_767_352, 'seguro', `${RIRPF} art. 83.3.d).2.º: 17.673,52 €`),
    factor1: cifra('irpf_red20_factor1', 1_750_000, 'seguro', `${RIRPF} art. 83.3.d).2.º: 7.302 − 1,75 × (RN − 14.852)`),
    reduccionUmbral2: cifra('irpf_red20_en_umbral2', 236_434, 'seguro', `${RIRPF} art. 83.3.d).3.º: 2.364,34 €`),
    umbral3: cifra('irpf_red20_umbral3', 1_974_750, 'seguro', `${RIRPF} art. 83.3.d): inferior a 19.747,5 €`),
    factor2: cifra('irpf_red20_factor2', 1_140_000, 'seguro', `${RIRPF} art. 83.3.d).3.º: 2.364,34 − 1,14 × (RN − 17.673,52)`),
  },
  minimos: {
    personal: cifra('irpf_min_personal', 555_000, 'seguro', `${LIRPF} art. 57.1: 5.550 €`),
    mayor65: cifra('irpf_min_mayor65', 115_000, 'seguro', `${LIRPF} art. 57.2: +1.150 € (> 65 años)`),
    mayor75: cifra('irpf_min_mayor75', 140_000, 'seguro', `${LIRPF} art. 57.2: +1.400 € adicionales (> 75 años)`),
    discapacidad33: cifra('irpf_min_disc33', 300_000, 'seguro', `${LIRPF} art. 60.1-2: 3.000 € (discapacidad ≥ 33 %)`),
    discapacidad65: cifra('irpf_min_disc65', 900_000, 'seguro', `${LIRPF} art. 60.1-2: 9.000 € (≥ 65 %)`),
    asistencia: cifra('irpf_min_asistencia', 300_000, 'seguro', `${LIRPF} art. 60.1-2: +3.000 € gastos de asistencia (ayuda de terceros, movilidad reducida o ≥ 65 %)`),
    descendientes: [
      cifra('irpf_min_desc_1', 240_000, 'seguro', `${LIRPF} art. 58.1: 2.400 € el primero`),
      cifra('irpf_min_desc_2', 270_000, 'seguro', `${LIRPF} art. 58.1: 2.700 € el segundo`),
      cifra('irpf_min_desc_3', 400_000, 'seguro', `${LIRPF} art. 58.1: 4.000 € el tercero`),
      cifra('irpf_min_desc_4', 450_000, 'seguro', `${LIRPF} art. 58.1: 4.500 € el cuarto y siguientes`),
    ],
    descendienteMenor3: cifra('irpf_min_desc_menor3', 280_000, 'seguro', `${LIRPF} art. 58.2: +2.800 € menor de tres años`),
    ascendiente: cifra('irpf_min_asc', 115_000, 'seguro', `${LIRPF} art. 59.1: 1.150 € (> 65 años o con discapacidad)`),
    ascendienteMayor75: cifra('irpf_min_asc_mayor75', 140_000, 'seguro', `${LIRPF} art. 59.2: +1.400 € (> 75 años)`),
  },
  hipotecaAnterior2013: {
    reduccionTipo: cifra('irpf_hipoteca_reduccion_tipo', 20_000, 'seguro', `${RIRPF} art. 86.1 párr. 3.º: el tipo se reduce en dos enteros`),
    limiteRetribucion: cifra('irpf_hipoteca_limite', 3_300_720, 'seguro', `${RIRPF} art. 86.1 párr. 3.º: retribución INFERIOR a 33.007,2 €`),
  },
  limite853: {
    porcentaje: cifra('irpf_limite_853_pct', 430_000, 'seguro', `${RIRPF} art. 85.3: 43 % de (retribución − límite excluyente del art. 81 según situación)`),
    retribucionHasta: cifra('irpf_limite_853_hasta', 3_520_000, 'seguro', `${RIRPF} art. 85.3: solo si la retribución no supera 35.200 €`),
  },
  anualidadesIncrementoMinimo: cifra('irpf_anualidades_incremento_minimo', 198_000, 'seguro', `${RIRPF} art. 85.2.2.º: mínimo personal y familiar + 1.980 €`),
  // Art. 81.1 (redacción RD 142/2024, vigente en 2026). Situación 1.ª sin descendientes no existe («–»).
  exento: {
    '1:1': cifra('irpf_exento_1_1', 1_764_400, 'seguro', `${RIRPF} art. 81.1: situación 1.ª, 1 descendiente: 17.644 €`),
    '1:2': cifra('irpf_exento_1_2', 1_869_400, 'seguro', `${RIRPF} art. 81.1: situación 1.ª, 2 o más: 18.694 €`),
    '2:0': cifra('irpf_exento_2_0', 1_719_700, 'seguro', `${RIRPF} art. 81.1: situación 2.ª, sin descendientes: 17.197 €`),
    '2:1': cifra('irpf_exento_2_1', 1_813_000, 'seguro', `${RIRPF} art. 81.1: situación 2.ª, 1 descendiente: 18.130 €`),
    '2:2': cifra('irpf_exento_2_2', 1_926_200, 'seguro', `${RIRPF} art. 81.1: situación 2.ª, 2 o más: 19.262 €`),
    '3:0': cifra('irpf_exento_3_0', 1_587_600, 'seguro', `${RIRPF} art. 81.1: situación 3.ª, sin descendientes: 15.876 €`),
    '3:1': cifra('irpf_exento_3_1', 1_634_200, 'seguro', `${RIRPF} art. 81.1: situación 3.ª, 1 descendiente: 16.342 €`),
    '3:2': cifra('irpf_exento_3_2', 1_686_700, 'seguro', `${RIRPF} art. 81.1: situación 3.ª, 2 o más: 16.867 €`),
  },
  deduccionSmi: {
    importeMaximo: cifra('irpf_deduccion_smi_max', 59_089, 'seguro', `${LIRPF} DA 61.ª.1 (RDL 5/2026): 590,89 € — en la declaración, no en la retención`),
    retribucionPlena: cifra('irpf_deduccion_smi_plena', 1_709_400, 'seguro', `${LIRPF} DA 61.ª.1.a): íntegros ≤ 17.094 €`),
    retribucionHasta: cifra('irpf_deduccion_smi_hasta', 2_004_845, 'seguro', `${LIRPF} DA 61.ª.1: íntegros inferiores a 20.048,45 € (590,89 − 0,2 × exceso sobre 17.094)`),
  },
}
