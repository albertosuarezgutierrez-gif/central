import type { Cifra } from '../cifras'
import type { Centimos, Ppm } from '../dinero'

/** Tramo de la escala de retenciones (art. 85.1 RIRPF): `hasta` = límite superior del tramo (null = sin límite). */
export interface TramoEscalaIrpf {
  hasta: Cifra<Centimos> | null
  tipo: Cifra<Ppm>
}

/**
 * Cifras del ALGORITMO de retenciones de la AEAT de UN año (Reglamento IRPF arts. 80-89; Ley IRPF arts. 19, 20, 57-61).
 * Todo en céntimos y ppm. Una cifra sin contrastar con el BOE/AEAT va como PENDIENTE_VERIFICAR (cifras.ts):
 * `valor: null` = «no se sabe» (no hay candidato; NO se arrastra el de otro año).
 */
export interface TablaIrpf {
  año: number
  /** Escala general de retención (art. 85.1 RIRPF). */
  escala: TramoEscalaIrpf[]
  /** Tipo aplicado cuando no hay modelo 145 (regla del spec de nóminas; ver irpf.ts). */
  tipoMaximo: Cifra<Ppm>
  /** Tipo mínimo en contratos/relaciones de duración inferior al año (art. 86.2 RIRPF). */
  tipoMinimoContratoCorto: Cifra<Ppm>
  /** Gastos deducibles del art. 19.2 LIRPF (además de las cotizaciones del trabajador). */
  gastos: { otros: Cifra<Centimos>; discapacidad33: Cifra<Centimos>; discapacidad65: Cifra<Centimos> }
  /** Reducción por obtención de rendimientos del trabajo (art. 20 LIRPF). */
  reduccionTrabajo: {
    umbral1: Cifra<Centimos>
    reduccionMax: Cifra<Centimos>
    umbral2: Cifra<Centimos>
    factor1: Cifra<Ppm> // 1,75 → 1_750_000
    reduccionUmbral2: Cifra<Centimos>
    umbral3: Cifra<Centimos>
    factor2: Cifra<Ppm> // 1,14 → 1_140_000
  }
  /** Mínimo personal y familiar (arts. 57-61 LIRPF, aplicado por art. 84 RIRPF). */
  minimos: {
    personal: Cifra<Centimos>
    mayor65: Cifra<Centimos>
    mayor75: Cifra<Centimos>
    discapacidad33: Cifra<Centimos>
    discapacidad65: Cifra<Centimos>
    asistencia: Cifra<Centimos>
    /** 1.º, 2.º, 3.º y 4.º y siguientes. */
    descendientes: [Cifra<Centimos>, Cifra<Centimos>, Cifra<Centimos>, Cifra<Centimos>]
    descendienteMenor3: Cifra<Centimos>
    ascendiente: Cifra<Centimos>
    ascendienteMayor75: Cifra<Centimos>
  }
  /** Préstamo de vivienda habitual anterior a 2013 con derecho a deducción: el tipo baja X puntos si la retribución no excede el límite. */
  hipotecaAnterior2013: { reduccionTipo: Cifra<Ppm>; limiteRetribucion: Cifra<Centimos> }
  /** Art. 85.3 RIRPF: la cuota de retención no excede `porcentaje` × (retribución − mínimo personal y familiar). */
  limite853: { porcentaje: Cifra<Ppm> }
  /** Límite excluyente de retener (art. 81.1 RIRPF), clave `${situacion}:${hijos}` (hijos 0, 1 ó 2 = «2 o más»). Combinación ausente = no aplica. */
  exento: Partial<Record<string, Cifra<Centimos>>>
  /** Deducción para rentas ≤ SMI (2026): solo se detecta el supuesto, no se calcula (regla pendiente). */
  deduccionSmi: { importeMaximo: Cifra<Centimos>; retribucionHasta: Cifra<Centimos> }
}
