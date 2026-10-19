// Preguntas CONCRETAS de la repregunta de un lead (19/10/2026, F3b de la correduría). PURO: ni red, ni BD, ni env.
//
// La repregunta normal (F2) vuelve a hacer la pregunta general del contrato («Si ahora tiene seguro: con qué compañía, el
// número de póliza, cuántos años…»). Cuando el cliente YA contestó pero su texto no se lee sin adivinar (dos compañías, un
// parte sin decir cuándo, «Honda PCX» sin cilindrada, «mi hijo» sin sus datos), se le pregunta SOLO lo que no se entiende.
// asegura decide (al revisar los bots) y devuelve CÓDIGOS de esta lista cerrada; plataforma los convierte en el texto del
// borrador. Ni un valor del cliente viaja ni se repite en la pregunta: solo el código y la pregunta fija.

export const PREGUNTAS_CONCRETAS = {
  moto_vehiculo: {
    clave: 'codigoVehiculo',
    pregunta: 'La marca y el modelo exactos de la moto, tal como vienen en la ficha técnica o en el permiso de circulación, y su cilindrada en cc.',
  },
  moto_cilindrada: { clave: 'codigoVehiculo', pregunta: 'La cilindrada exacta de la moto en cc (viene en la ficha técnica).' },
  conductor_datos: {
    clave: 'conductor',
    pregunta: 'Del conductor habitual que me indicas: su nombre y sus dos apellidos, su DNI o NIE, su fecha de nacimiento y la fecha de su carné.',
  },
  propietario_datos: { clave: 'propietario', pregunta: 'Del titular del vehículo que me indicas: su nombre y sus dos apellidos y su DNI o NIE.' },
  seguro_anterior_compania: { clave: 'aseguradoAntes', pregunta: 'Con qué compañía tienes el seguro ahora mismo (solo una).' },
  seguro_anterior_anios: { clave: 'aseguradoAntes', pregunta: 'Cuántos años seguidos llevas asegurado, sin cortes (con esta compañía o con las anteriores).' },
  seguro_anterior_siniestros: {
    clave: 'aseguradoAntes',
    pregunta: 'Cuántos partes con culpa has dado en los últimos 5 años (si no has dado ninguno, dime «ninguno»).',
  },
  garaje: { clave: 'garaje', pregunta: 'Dónde duerme normalmente por la noche: en un garaje individual (cerrado y solo tuyo), en un garaje comunitario o en la calle.' },
  comunidad_viviendas: { clave: 'numViviendasYLocales', pregunta: 'Cuántas viviendas y cuántos locales hay en total en la comunidad (los dos números; si no hay locales, «ninguno»).' },
} as const satisfies Record<string, { clave: string; pregunta: string }>

export type CodigoConcreto = keyof typeof PREGUNTAS_CONCRETAS

export function esCodigoConcreto(v: unknown): v is CodigoConcreto {
  return typeof v === 'string' && Object.hasOwn(PREGUNTAS_CONCRETAS, v)
}

/** Códigos → `{ clave, pregunta }` sin repetir, en el orden recibido; lo desconocido se ignora. PURA. */
export function preguntasConcretas(codigos: readonly unknown[]): { clave: string; pregunta: string }[] {
  const out: { clave: string; pregunta: string }[] = []
  const vistos = new Set<string>()
  for (const c of codigos) {
    if (!esCodigoConcreto(c) || vistos.has(c)) continue
    vistos.add(c)
    out.push({ ...PREGUNTAS_CONCRETAS[c] })
  }
  return out
}
