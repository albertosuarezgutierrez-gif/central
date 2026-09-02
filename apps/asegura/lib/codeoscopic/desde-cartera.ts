// De una póliza de la CARTERA a una precalificación de auto lista para cotizar.
// PURO: entran los datos ya leídos y descifrados, sale qué se va a mandar, qué
// se ha SUPUESTO y qué falta. Sin red, sin BD, sin Prisma.
//
// ─── Por qué existe, y por qué separa «supuesto» de «dato» ──────────────────
// El objetivo de Alberto es que retarificar una póliza de un cliente que ya
// tenemos sea UN BOTÓN. Para eso hay que rellenar solo los huecos que la ficha
// no trae, y ahí está la trampa: un valor por defecto es indistinguible de un
// dato real en cuanto se escribe en el formulario.
//
// La regla de `CLAUDE.md` («dato que NO hay ≠ dato que NO se ha mirado») aplicada
// aquí significa que un supuesto tiene que VERSE. Por eso esto no devuelve unos
// datos y ya: devuelve TRES cosas —lo que va, lo que se ha dado por bueno y por
// qué, y lo que sigue faltando— y la pantalla enseña la segunda antes de que
// nadie pulse nada. Un precio de precalificación calculado sobre «15.000 km/año
// que nadie ha dicho» es legítimo; presentarlo como si el cliente los hubiera
// declarado, no.
//
// ─── Y por qué los supuestos tiran a la baja, salvo uno ─────────────────────
// Cuando hay que elegir, se elige el supuesto que da el precio MÁS CARO (menos
// años asegurado, menos antigüedad en la compañía). Así la precalificación no
// promete una prima que luego suba al verificar: si el dato real aparece, el
// precio solo puede mejorar.
//
// La excepción es la siniestralidad, y es una decisión de negocio de Alberto
// (01/09/2026): se presume que NO ha habido siniestros, porque un cliente que
// pide precio de calle parte de ahí. Va marcado como supuesto y bien visible,
// porque cero filas en la tabla de siniestros NO prueba que no los haya —
// prueba que no están registrados, que es otra cosa.

import {
  revisarDatosAuto,
  type DatosAuto,
  type Reparo,
} from './peticion-auto.ts'

/** Un valor que NO venía en la ficha y se ha dado por bueno para poder cotizar. */
export type Supuesto = {
  campo: keyof DatosAuto
  valor: unknown
  /** En castellano y para leer en pantalla: por qué se ha supuesto ESTO. */
  porque: string
  /** `true` cuando el supuesto puede ABARATAR el precio respecto de la realidad. */
  optimista?: boolean
}

export type Precalificacion = {
  datos: Partial<DatosAuto>
  supuestos: Supuesto[]
  /** Lo que ni con supuestos se puede rellenar. Vacío = se puede cotizar. */
  faltan: Reparo[]
}

/** El tomador, ya descifrado por quien lee la BD (aquí no se descifra nada). */
export type ClienteCartera = {
  nombre: string | null
  apellidos: string | null
  /** Descifrado. `null` = no se sabe (o no se ha podido descifrar). */
  dni: string | null
  telefono: string | null
  /** aaaa-mm-dd, ya descifrado. */
  fechaNacimiento: string | null
  /** Texto libre del CRM: «Casado», «Soltero»… No es el id del vendor. */
  estadoCivil: string | null
  /** Código de tratamiento del CRM: '1' = Sr., '2' = Sra. (medido 01/09/2026). */
  saludo: string | null
  codigoPostal: string | null
  /** Fecha del carnet B, de `cliente_carnets_conducir`. */
  fechaCarnet: string | null
}

export type PolizaCartera = {
  /** Número de la póliza actual: pasa a ser la ANTERIOR de la cotización. */
  numeroPoliza: string | null
  /** Código DGS de la compañía actual (lo trae EIAC). */
  codigoEntidadDgs: string | null
  matricula: string | null
  /** aaaa-mm-dd. La más antigua que se conozca de la relación con la compañía. */
  fechaEfectoInicial: string | null
  fechaVencimiento: string | null
  /**
   * Siniestros REGISTRADOS en el CRM para esta póliza.
   *
   * 🚨 `0` aquí significa «no hay ninguno anotado», NO «no ha habido ninguno».
   * La diferencia se propaga: con 0 el supuesto de siniestralidad se marca como
   * optimista; con >0 deja de ser supuesto y pasa a ser dato.
   */
  siniestrosRegistrados: number
}

/**
 * Lo que hay que resolver ANTES de llamar aquí, porque exige red:
 * el municipio del CP (catálogo del vendor), la fecha de matriculación de la
 * matrícula, el id de estado civil del catálogo, el garaje y la versión del
 * vehículo. Todos pueden venir a `null`: eso es «no resuelto», y sale como falta.
 */
export type Resueltos = {
  municipioId: number | null
  estadoCivilId: string | null
  fechaMatriculacion: string | null
  /** Código Base7 de la VERSIÓN. Sin él no hay cotización posible. */
  codigoVehiculo: string | null
  /** Id del catálogo `car/garage-types`. */
  garaje: string | null
  garajeEsSupuesto?: boolean
}

/** Kilómetros al año cuando nadie lo ha dicho. Media española declarada. */
export const KM_ANUALES_POR_DEFECTO = 15000

/** Años asegurado que se presumen cuando no consta el inicio de la relación. */
const ANIOS_ASEGURADO_MINIMOS = 1

/**
 * Nombres de pila que el CRM escribe cuando NO hay nombre. Son centinelas
 * («un no lo sé disfrazado de dato»): 20.860 fichas se llaman literalmente
 * «Lead» (medido 01/09/2026). Tratarlos como nombre mandaría «Lead» al vendor.
 */
const NOMBRES_CENTINELA = new Set(['lead', 'cliente', 'sin nombre', 'desconocido', 'n/a', '-'])

function limpio(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

function nombreUtil(v: string | null): string | null {
  const t = limpio(v)
  if (t === null) return null
  return NOMBRES_CENTINELA.has(t.toLowerCase()) ? null : t
}

/** «Pérez García» → ['Pérez', 'García']. El vendor quiere los dos por separado. */
export function partirApellidos(apellidos: string | null): { primero: string | null; segundo: string | null } {
  const t = nombreUtil(apellidos)
  if (t === null) return { primero: null, segundo: null }
  const partes = t.split(/\s+/)
  if (partes.length === 1) return { primero: partes[0], segundo: null }
  // Con tres o más palabras el corte no es adivinable («de la Torre Ruiz»).
  // Se parte por la mitad conservadora: la ÚLTIMA palabra es el segundo apellido.
  return { primero: partes.slice(0, -1).join(' '), segundo: partes[partes.length - 1] }
}

/**
 * Sexo a partir del tratamiento del CRM. Medido el 01/09/2026 sobre las 32.600
 * fichas: con `saludo='1'` los nombres de pila más frecuentes son Jose, Juan,
 * Antonio, Francisco y Manuel; con `'2'`, María. El '3' (634 fichas) no se
 * traduce: no se sabe qué es, y suponerlo sería inventar.
 */
export function sexoDeSaludo(saludo: string | null): 'hombre' | 'mujer' | null {
  switch (limpio(saludo)) {
    case '1':
      return 'hombre'
    case '2':
      return 'mujer'
    default:
      return null
  }
}

/** Años completos entre dos fechas aaaa-mm-dd. `null` si alguna no es fecha. */
export function aniosEntre(desde: string | null, hasta: string): number | null {
  if (!desde || !/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return null
  const a = Date.parse(`${desde}T00:00:00Z`)
  const b = Date.parse(`${hasta}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null
  return Math.floor((b - a) / (365.2425 * 24 * 3600 * 1000))
}

/** El día siguiente a una fecha aaaa-mm-dd. */
export function diaSiguiente(f: string): string {
  const d = new Date(`${f}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Construye la precalificación.
 *
 * `hoy` entra por parámetro para que la función sea pura y los tests no
 * dependan del calendario.
 */
export function precalificarAuto(
  cliente: ClienteCartera,
  poliza: PolizaCartera,
  resueltos: Resueltos,
  hoy: string,
): Precalificacion {
  const supuestos: Supuesto[] = []
  const suponer = (campo: keyof DatosAuto, valor: unknown, porque: string, optimista = false) => {
    supuestos.push({ campo, valor, porque, optimista })
    return valor
  }

  const { primero, segundo } = partirApellidos(cliente.apellidos)

  // ── Fecha de efecto: el día después de que venza la póliza actual ──────────
  // Es lo que de verdad quiere el cliente («cuánto me costaría al renovar»), y
  // si la póliza no tiene vencimiento se cotiza para mañana.
  const vencimiento = limpio(poliza.fechaVencimiento)
  const fechaEfecto =
    vencimiento && vencimiento >= hoy
      ? (suponer(
          'fechaEfecto',
          diaSiguiente(vencimiento),
          `el día siguiente al vencimiento de la póliza actual (${vencimiento})`,
        ) as string)
      : (suponer(
          'fechaEfecto',
          diaSiguiente(hoy),
          vencimiento
            ? `la póliza actual venció el ${vencimiento}, así que se pide precio para mañana`
            : 'la póliza actual no tiene fecha de vencimiento en la ficha, así que se pide precio para mañana',
        ) as string)

  // ── Historial: la póliza que estamos retarificando ES la anterior ──────────
  // Esto no es un supuesto: es el motivo por el que se pulsa el botón.
  const aniosReales = aniosEntre(limpio(poliza.fechaEfectoInicial), hoy)
  const aniosAsegurado =
    aniosReales !== null && aniosReales > 0
      ? aniosReales
      : (suponer(
          'aniosAsegurado',
          ANIOS_ASEGURADO_MINIMOS,
          'no consta desde cuándo está asegurado, así que se cuenta solo un año — ' +
            'si el dato real aparece, el precio solo puede mejorar',
        ) as number)

  // Siniestralidad: decisión de negocio de Alberto. Ver cabecera del fichero.
  const huboSiniestros = poliza.siniestrosRegistrados > 0
  const aniosSinSiniestros = huboSiniestros
    ? 0
    : (suponer(
        'aniosSinSiniestros',
        aniosAsegurado,
        `no consta ningún siniestro en la ficha, así que se pide precio como si no ` +
          `hubiera habido ninguno en los ${aniosAsegurado} año(s). Ojo: que no haya ` +
          `siniestros anotados no prueba que no los haya`,
        true,
      ) as number)

  const datos: Partial<DatosAuto> = {
    // ── Persona ──
    dni: limpio(cliente.dni) ?? undefined,
    nombre: nombreUtil(cliente.nombre) ?? undefined,
    apellido1: primero ?? undefined,
    apellido2: segundo,
    fechaNacimiento: limpio(cliente.fechaNacimiento) ?? undefined,
    sexo: sexoDeSaludo(cliente.saludo) ?? undefined,
    estadoCivil: limpio(resueltos.estadoCivilId) ?? undefined,
    telefono: limpio(cliente.telefono)?.replace(/\s/g, '') ?? undefined,
    fechaCarnet: limpio(cliente.fechaCarnet) ?? undefined,
    cpResidencia: limpio(cliente.codigoPostal),
    municipioResidenciaId: resueltos.municipioId,

    // ── Vehículo ──
    codigoVehiculo: limpio(resueltos.codigoVehiculo) ?? undefined,
    matricula: limpio(poliza.matricula) ?? undefined,
    fechaMatriculacion: limpio(resueltos.fechaMatriculacion) ?? undefined,
    kmAnuales: suponer(
      'kmAnuales',
      KM_ANUALES_POR_DEFECTO,
      'la ficha no recoge los kilómetros al año; se usa la media declarada habitual',
    ) as number,

    // ── Circulación: se supone que el coche duerme donde vive el tomador ──
    cpCirculacion: limpio(cliente.codigoPostal) ?? undefined,
    municipioCirculacionId: resueltos.municipioId ?? undefined,
    garaje: limpio(resueltos.garaje) ?? undefined,

    // ── Historial ──
    aseguradoAntes: true,
    companiaAnteriorCodigo: limpio(poliza.codigoEntidadDgs),
    polizaAnterior: limpio(poliza.numeroPoliza),
    aniosAsegurado,
    aniosEnCompania: aniosAsegurado,
    aniosSinSiniestros,
    siniestrosUltimos5: huboSiniestros ? poliza.siniestrosRegistrados : 0,

    fechaEfecto,
  }

  if (limpio(cliente.codigoPostal) !== null) {
    supuestos.push({
      campo: 'cpCirculacion',
      valor: limpio(cliente.codigoPostal),
      porque: 'se supone que el coche circula y aparca donde vive el tomador',
    })
  }
  if (resueltos.garajeEsSupuesto && limpio(resueltos.garaje) !== null) {
    supuestos.push({
      campo: 'garaje',
      valor: resueltos.garaje,
      porque: 'la ficha no dice dónde duerme el coche; se usa el tipo de garaje por defecto',
    })
  }

  return { datos, supuestos, faltan: revisarDatosAuto(datos) }
}

/**
 * ¿Se puede cotizar ya? Azúcar para la pantalla y para el puerto, que tienen que
 * decidir lo mismo y no deben hacerlo cada uno a su manera.
 */
export function sePuedeCotizar(p: Precalificacion): boolean {
  return p.faltan.length === 0
}

/**
 * Los supuestos que cambian el precio a mejor. La pantalla los enseña aparte
 * porque son los que pueden decepcionar luego: si el cliente sí tuvo siniestros,
 * la prima real sube respecto a lo que se le ha enseñado.
 */
export function supuestosOptimistas(p: Precalificacion): Supuesto[] {
  return p.supuestos.filter((s) => s.optimista === true)
}
