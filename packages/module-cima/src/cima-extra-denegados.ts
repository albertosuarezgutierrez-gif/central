/**
 * LISTA DE EXCLUSIÓN de `cimaExtra` (03/10/2026, Alberto: «todo campo que manda
 * CIMA se guarda y se enseña, salvo una lista explícita de sensibles»).
 *
 * `cimaExtra` (ver `cima-extra.ts`) guarda EN CLARO, en un jsonb que pinta la ficha,
 * toda hoja del EIAC que ningún extractor específico ha leído. Lo que esté aquí
 * NO entra nunca, ni tapado: datos bancarios, direcciones, contacto, documentos de
 * identidad, datos personales (nacimiento, estado civil, sexo…), nombres de
 * TERCEROS (contrarios, figuras, beneficiarios, conductores, receptores de pago…)
 * y el ruido técnico de la cabecera del lote.
 *
 * Regla de casado: por SEGMENTO de ruta (nombre exacto, prefijo o «contiene»), en
 * cualquier profundidad: denegar un contenedor (p. ej. `Domicilio`, `Tomador`)
 * deniega TODO su subárbol. Revisión adversarial 03/10/2026: los bloques de
 * PERSONA se niegan enteros (no campo a campo): una lista de campos personales
 * siempre deja fuera alguno (Profesion del Tomador en REC/CEF, `Nombre` del 2.º
 * elemento de una lista que el extractor lee solo en [0], bloques no previstos
 * como `ConductorHabitual` o `AcreedorHipotecario`).
 * En la duda se deniega: un dato que falta se ve («excluido a propósito» en el
 * medidor); uno sensible guardado en claro no se ve nunca.
 *
 * REGLA DEL 04/10/2026 (Alberto) — qué pasa con los datos de PERSONA:
 *  - SE GUARDAN, con estructura y la PII CIFRADA, fuera de `cimaExtra`: las figuras
 *    de la póliza (`datos_especificos.figuras`: tomador, asegurado, conductores,
 *    pagador, beneficiario… con domicilio, teléfono y email), la persona asegurada
 *    de vida/decesos (`datos_especificos.vida|decesos.persona`) y los terceros del
 *    siniestro (`siniestros.cima_extra.terceros`). Ver `figuras-cima.ts`. Por eso los
 *    bloques de persona SIGUEN denegados AQUÍ: `cimaExtra` va EN CLARO, y lo que el
 *    extractor de figuras no lee de una persona no debe colarse por la puerta de atrás.
 *  - IBAN/BIC: solo `ibanUltimos4` en claro (el IBAN, cifrado en su clave).
 *  - DNI/NIF: solo cifrado (`documentoCifrado`), nunca en claro.
 *  - SIGUEN FUERA EN TODAS PARTES (`siempreFuera`, gana sobre cualquier otro motivo,
 *    también dentro de un bloque de persona): sexo, estado civil, profesión, idioma
 *    y consentimientos. Ningún extractor los lee.
 *
 * PURO, sin dependencias: lo usan el recolector (`cima-extra.ts`) y el medidor de
 * cobertura (`field-coverage.ts`) para decir POR QUÉ una ruta no se lee.
 */
export const CIMA_EXTRA_DENEGADOS = {
  /**
   * 04/10/2026 — categorías que NO se guardan nunca, ni en claro ni cifradas ni en
   * figuras. Segmento con nombre EXACTO (los de la norma V07.1: `tipo_personafisica`
   * y `tipo_contacto`/13.95; por prefijo se llevaría `Profesional*`). Se miran ANTES
   * que el resto: `Tomador.PersonaFisica.Sexo` dice «sexo», no «persona».
   */
  siempreFuera: {
    Sexo: "excluido siempre (sexo)",
    EstadoCivil: "excluido siempre (estado civil)",
    Profesion: "excluido siempre (profesión)",
    Idioma: "excluido siempre (idioma)",
    Consentimientos: "excluido siempre (consentimientos)",
    Consentimiento: "excluido siempre (consentimientos)",
  } as Readonly<Record<string, string>>,
  /** Segmento con este nombre EXACTO → fuera, con su subárbol. */
  segmentos: {
    // Bancario.
    IBAN: "dato bancario",
    BIC: "dato bancario",
    CuentaCorriente: "dato bancario",
    DatosCuentaCorriente: "dato bancario",
    TitularCuenta: "dato bancario",
    // Direcciones (cualquier bloque de domicilio o lugar).
    Domicilio: "dirección",
    DatosDomicilio: "dirección",
    Direccion: "dirección",
    SituacionRiesgo: "dirección (situación del riesgo)",
    LugarSiniestro: "dirección (lugar del siniestro)",
    // Contacto.
    DatosContacto: "contacto",
    PersonaContacto: "contacto",
    // Bloques de PERSONA (subárbol entero).
    PersonaFisica: "persona",
    PersonaJuridica: "persona",
    Persona: "persona",
    DatosConductor: "persona",
    DatosBeneficiario: "persona",
    DatosFigura: "persona",
    Tomador: "persona",
    Pagador: "persona",
    Propietario: "persona",
    ReceptoresPago: "persona",
    ReceptorPago: "persona",
    OtrasFiguras: "persona",
    // Salud (Art. 9 RGPD): el riesgo de salud entero fuera.
    RiesgoSalud: "salud (Art. 9)",
    // 04/10/2026 — misma forma que RiesgoSalud (EIAC V07.1, 13.48): es salud.
    RiesgoAsistenciaSanitaria: "salud (Art. 9)",
    // Identidad.
    NIF: "documento de identidad",
    DocumentoIdentificacion: "documento de identidad",
    IdPersona: "documento de identidad",
    IdCliente: "identificador de persona",
    NumeroDocumento: "documento de identidad",
    TipoIdentificacion: "documento de identidad",
    // Revisión 03/10/2026 (LOO-806): más nombres de documento que mandan las compañías.
    CIF: "documento de identidad",
    Cif: "documento de identidad",
    // Bancario con otro nombre (pago de un siniestro, cargo).
    NumeroCuenta: "dato bancario",
    CuentaPago: "dato bancario",
    // Datos personales sueltos.
    FechaNacimiento: "dato personal",
    Nacionalidad: "dato personal",
    Observaciones: "texto libre de persona",
    RazonSocial: "nombre",
    // Vehículo identificable.
    Bastidor: "identificador del vehículo",
    // Ruido técnico: cabecera / lote / emisor / orden de lista.
    Cabecera: "cabecera técnica",
    DatosLote: "cabecera técnica",
    Lote: "cabecera técnica",
    Emisor: "cabecera técnica",
    Receptor: "cabecera técnica",
    NumeroOrden: "orden técnico de lista",
    CP: "dirección",
  } as Readonly<Record<string, string>>,
  /** Segmento que EMPIEZA por esto → fuera, con su subárbol. */
  prefijos: {
    DatosPersona: "persona",
    Asegurado: "persona",
    Conductor: "persona",
    Beneficiario: "persona",
    Acreedor: "persona",
    Contrario: "persona",
    Figura: "persona",
    Perjudicado: "persona",
    Lesionado: "persona",
    Testigo: "persona",
    // Re-revisión 03/10/2026: más bloques de persona que la compañía puede mandar.
    Perito: "persona",
    Abogado: "persona",
    Taller: "persona",
    Usuario: "persona",
    Titular: "persona",
    Interviniente: "persona",
    Representante: "persona",
    Reclamante: "persona",
    Arrendatario: "persona",
    Inquilino: "persona",
    Victima: "persona",
    Herido: "persona",
    Tramitador: "persona",
    // Revisión 03/10/2026 (LOO-806).
    DNI: "documento de identidad",
    Dni: "documento de identidad",
    NIF: "documento de identidad",
    Nif: "documento de identidad",
    // `Matricula*` suelta: identifica a una persona vía DGT. La del propio riesgo ya
    // la lee su extractor (consumida, no llega a `cimaExtra`).
    Matricula: "identificador del vehículo",
    VehiculoContrario: "persona (vehículo del contrario)",
    Perceptor: "persona",
    Implicado: "persona",
    Fallecido: "persona",
    Razon: "nombre",
    Nombre: "nombre",
    Apellido: "nombre",
  } as Readonly<Record<string, string>>,
  /** Segmento que CONTIENE esto (sin distinguir mayúsculas) → fuera. */
  contiene: {
    telefono: "contacto",
    tlf: "contacto",
    correo: "contacto",
    email: "contacto",
    movil: "contacto",
    fax: "contacto",
    // `siempreFuera` casa nombres exactos; las variantes (`ConsentimientoLOPD`,
    // `ConsentimientoComercial`…) se paran aquí.
    consentimiento: "excluido siempre (consentimientos)",
    // Direcciones en bloques no previstos (`RiesgoHogar.Ubicacion`, taller, perito…).
    calle: "dirección",
    postal: "dirección",
    poblacion: "dirección",
    localidad: "dirección",
    municipio: "dirección",
    provincia: "dirección",
    catastr: "dirección",
    ubicacion: "dirección",
    domicilio: "dirección",
    direccion: "dirección",
    // Nombres en bloques no previstos.
    firma: "nombre",
    denominacion: "nombre",
    // Salud (Art. 9) en cualquier bloque (vida/decesos traen cuestionario).
    fumador: "salud (Art. 9)",
    peso: "salud (Art. 9)",
    altura: "salud (Art. 9)",
    estatura: "salud (Art. 9)",
    enfermedad: "salud (Art. 9)",
    salud: "salud (Art. 9)",
    medic: "salud (Art. 9)",
    // Lesiones (Art. 9) en cualquier bloque: `Lesiones`, `DescripcionLesion`…
    lesion: "salud (Art. 9)",
    fallec: "dato personal (fallecimiento)",
  } as Readonly<Record<string, string>>,
  /**
   * Excepciones EXPLÍCITAS a `Nombre*` (cada una justificada):
   *  - `NombreMediador`: el mediador es la propia correduría o un colaborador
   *    inscrito en el registro público de la DGSFP; `mapMediador` ya lo guarda en
   *    claro. Hace falta en `DatosPolizaReemplazada.DatosMediador` (hueco #11).
   */
  nombresPermitidos: ["NombreMediador"] as readonly string[],
  /**
   * `OtrosDatos.Dato.Valor`/`Descripcion*`: el extractor específico filtra los
   * personales con `esOtroDatoPersonal` y no lee su valor; el recolector no debe
   * rescatarlo por la puerta de atrás.
   */
  otrosDatos: {
    contexto: "OtrosDatos",
    prefijos: ["Valor", "Descripcion"] as readonly string[],
    motivo: "otro dato (lo filtra esOtroDatoPersonal)",
  },
} as const;

const PERMITIDOS = new Set(CIMA_EXTRA_DENEGADOS.nombresPermitidos);

/**
 * Vía de una dirección: `Via`, `ClaseVia`, `NombreVia`, `TipoVia`, `ViaPublica`…
 * NO por «contiene»: `Vial`, `Envia`, `ReenviarAviso` no son direcciones.
 */
const SEGMENTO_VIA = /^(?:Clase|Nombre|Tipo|Numero|OtrosDatos)?Via(?:[A-Z0-9_].*)?$/;

function motivoSegmento(seg: string): string | null {
  if (PERMITIDOS.has(seg)) return null;
  const exacto = CIMA_EXTRA_DENEGADOS.segmentos[seg];
  if (exacto) return exacto;
  if (SEGMENTO_VIA.test(seg)) return "dirección";
  for (const [p, m] of Object.entries(CIMA_EXTRA_DENEGADOS.prefijos)) {
    if (seg.startsWith(p)) return m;
  }
  const bajo = seg.toLowerCase();
  for (const [c, m] of Object.entries(CIMA_EXTRA_DENEGADOS.contiene)) {
    if (bajo.includes(c)) return m;
  }
  return null;
}

/**
 * PURA. ¿Por qué esta ruta EIAC no puede ir a `cimaExtra`? Devuelve el motivo
 * legible (`«dato bancario»`, `«persona»`…) o `null` si se permite.
 * Acepta rutas con o sin `ProcesosEIAC.`/`Objetos.` y con o sin índices numéricos.
 */
export function motivoExclusionCima(ruta: string): string | null {
  const segs = ruta.split(".").filter((s) => s !== "" && !/^\d+$/.test(s));
  for (const seg of segs) {
    const m = CIMA_EXTRA_DENEGADOS.siempreFuera[seg];
    if (m) return m;
  }
  let enOtrosDatos = false;
  for (const seg of segs) {
    const m = motivoSegmento(seg);
    if (m) return m;
    if (enOtrosDatos && CIMA_EXTRA_DENEGADOS.otrosDatos.prefijos.some((p) => seg.startsWith(p))) {
      return CIMA_EXTRA_DENEGADOS.otrosDatos.motivo;
    }
    if (seg === CIMA_EXTRA_DENEGADOS.otrosDatos.contexto) enOtrosDatos = true;
  }
  return null;
}
