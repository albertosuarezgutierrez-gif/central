/**
 * Coberturas que aparecen en MÁS DE UNA póliza de la misma persona.
 *
 * Puro: recibe las pólizas con su lista de coberturas (texto, tal como las
 * informa la compañía por CIMA) y devuelve las familias que se repiten.
 *
 * 🚨 Lo que esto ES y lo que NO es:
 *
 * - ES un aviso INFORMATIVO: «esta cobertura está en dos pólizas». Es un hecho
 *   que se lee de las coberturas informadas, y por eso se puede decir.
 * - NO es un juicio sobre si sobra una, ni sobre cuál, ni sobre lo que se
 *   paga. La defensa jurídica del auto y la del hogar defienden asuntos
 *   distintos y las dos pueden hacer falta; decidirlo exige mirar los
 *   condicionados, y eso ya es asesoramiento (RDL 3/2020). Por eso el texto
 *   que sale de aquí dice «compruébalo», no «te sobra».
 * - Solo se miran pólizas de la MISMA persona (las propias): que mi padre y yo
 *   tengamos defensa jurídica no es un solapamiento de nadie.
 *
 * Las familias son POCAS y conocidas a propósito. Una lista larga de patrones
 * sueltos produce falsos positivos («asistencia» casa con media póliza), y un
 * aviso que se dispara por todo es uno que nadie lee.
 */

export type PolizaConCoberturas = {
  id: string
  /** Cómo se llama la póliza delante del cliente («Mapfre · Auto»). */
  titulo: string
  /** Las coberturas informadas, texto libre. `[]` = ninguna informada. */
  coberturas: readonly string[]
}

export type FamiliaSolapamiento = 'defensa_juridica' | 'asistencia_viaje' | 'rc_familiar'

export const FAMILIAS_SOLAPAMIENTO: readonly {
  id: FamiliaSolapamiento
  etiqueta: string
  patron: RegExp
  /** Por qué NO es automáticamente un duplicado: lo que la pantalla le dice. */
  matiz: string
}[] = [
  {
    id: 'defensa_juridica',
    etiqueta: 'Defensa jurídica',
    patron: /defensa\s+jur[ií]dica|reclamaci[oó]n\s+de\s+da[ñn]os/i,
    matiz: 'Cada póliza suele defender solo los asuntos de su ramo (el coche en una, la vivienda en otra). Comprueba en las condiciones qué asuntos cubre cada una y con qué límite.',
  },
  {
    id: 'asistencia_viaje',
    etiqueta: 'Asistencia en viaje',
    patron: /asistencia\s+en\s+viaje/i,
    matiz: 'La del auto suele cubrir el vehículo y sus ocupantes; otra puede cubrir a las personas sin vehículo. Comprueba desde qué kilómetro actúa cada una y a quién cubre.',
  },
  {
    id: 'rc_familiar',
    etiqueta: 'Responsabilidad civil familiar',
    patron: /responsabilidad\s+civil\s+(familiar|privada)/i,
    matiz: 'Puede aparecer en el hogar y en otra póliza. Comprueba los límites y si alguna excluye lo que la otra cubre (animales, actividades, hijos).',
  },
] as const

export type Solapamiento = {
  familia: FamiliaSolapamiento
  etiqueta: string
  matiz: string
  /** Una entrada por póliza afectada, con el texto EXACTO de la cobertura que casó. */
  polizas: { id: string; titulo: string; cobertura: string }[]
}

/**
 * Devuelve solo las familias presentes en DOS O MÁS pólizas distintas. Una
 * póliza con dos coberturas que casan (p. ej. «Defensa jurídica» y
 * «Reclamación de daños») cuenta UNA vez: el solapamiento es entre pólizas,
 * no dentro de una.
 */
export function detectarSolapamientos(polizas: readonly PolizaConCoberturas[]): Solapamiento[] {
  const salida: Solapamiento[] = []
  for (const familia of FAMILIAS_SOLAPAMIENTO) {
    const afectadas: Solapamiento['polizas'] = []
    for (const p of polizas) {
      // La misma póliza repetida en la entrada (dos vínculos a la misma ficha,
      // una fusión a medias) cuenta UNA vez: «dos pólizas» son dos ids.
      if (afectadas.some((a) => a.id === p.id)) continue
      const cobertura = p.coberturas.find((c) => familia.patron.test(c))
      if (cobertura) afectadas.push({ id: p.id, titulo: p.titulo, cobertura: cobertura.trim() })
    }
    if (afectadas.length >= 2) {
      salida.push({ familia: familia.id, etiqueta: familia.etiqueta, matiz: familia.matiz, polizas: afectadas })
    }
  }
  return salida
}
