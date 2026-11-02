import assert from "node:assert/strict";
import test from "node:test";

import {
  asArray,
  classifyClaseFigura,
  classifyFraccionPago,
  classifyTipoSeguro,
  extractCoberturas,
  extractDatosEspecificos,
  extractDatosPoliza,
  extractInmuebleExtra,
  extractEmbarcacion,
  anioDeAntiguedad,
  taparNumerosLargos,
  extractIntervinientes,
  extractSituacionRiesgo,
  mapEiacPol,
  toDecimalString,
  toIsoDate,
  unrecognizedRiesgoBlocks,
  type ParsedEiacPol,
  type ParsedPoliza,
  type ParsedRiesgo,
  mapSituacionPoliza,
  estadoPolizaDesdeEiac,
  describeRiesgoShape,
} from "./eiac-pol-mapper.ts";

/**
 * 28/09/2026 — claves de `datos_especificos` añadidas al cerrar los huecos de la
 * auditoría (contrato, cobro, lista de riesgos…). Los tests anteriores fijan las
 * claves PLANAS del primer riesgo — que se mantienen a propósito, las lee central
 * — así que comparan sin las nuevas; las nuevas tienen sus propios tests abajo.
 */
const CLAVES_28_09 = new Set([
  "gestionCobro", "formaPago", "iban", "ibanUltimos4", "bic", "titularCuentaDistinto",
  "duracion", "clasePoliza", "mediador", "producto", "desglosePrima", "capitalAgregado",
  "comisionAnual", "comisiones", "comercializacion", "origenContratacion", "regularizable",
  "suspensiones", "moneda", "riesgos", "beneficiarios", "idClienteCompania",
  "primaAnualDudosa", "primaTotalFichero",
  // 03/10/2026 — el «resto» de CIMA (`cima-extra.ts`); sus tests en `cima-extra.test.ts`.
  "cimaExtra", "cimaExtraTruncado",
  // 04/10/2026 — figuras con estructura (`figuras-cima.ts`); sus tests en `figuras-cima.test.ts`.
  "figuras",
]);
function planas(d: Record<string, unknown> | null): Record<string, unknown> | null {
  if (d === null) return null;
  return Object.fromEntries(Object.entries(d).filter(([k]) => !CLAVES_28_09.has(k)));
}

// --- helpers de fixture (datos SINTÉTICOS, nunca PII real). Nombres de nodos
// anclados a Intelligence/ecosystem/cima-eiac-fields.md (EIAC 6.0 homologación). ---
function baseAutoPol(
  overrides: Partial<Record<string, unknown>> = {},
): ParsedEiacPol {
  return {
    Objetos: {
      Poliza: {
        DatosPoliza: {
          IdPoliza: "P01",
          CodigoEntidad: { CodigoDGS: "C0058" },
          DatosRamo: { RamoDGS: "241", DescripcionRamo: "ALLIANZ AUTO" },
        },
        SituacionPoliza: "EV",
        Fechas: {
          FechaEfectoInicial: "2020-02-01T00:00:00",
          FechaVencimiento: "2021-02-01T00:00:00",
        },
        DatosRiesgos: {
          Riesgo: {
            RiesgoAutos: {
              Vehiculo: {
                Matricula: "AV0001A",
                ClaseVehiculo: "AU",
                Marca: "SEAT",
                Modelo: "Ibiza",
              },
            },
          },
        },
        Tomador: {
          PersonaFisica: {
            TipoIdentificacion: "NI",
            IdPersona: "00000001R",
            Nombre: "Nombre",
            Apellido1: "Apellido",
          },
        },
        ...overrides,
      },
    },
  };
}

// --- asArray ---
test("asArray: objeto único → [obj]; array → array; null/undefined → []", () => {
  assert.deepEqual(asArray({ a: 1 }), [{ a: 1 }]);
  assert.deepEqual(asArray([{ a: 1 }, { a: 2 }]), [{ a: 1 }, { a: 2 }]);
  assert.deepEqual(asArray(null), []);
  assert.deepEqual(asArray(undefined), []);
});

// --- toIsoDate ---
test("toIsoDate: dateTime EIAC → YYYY-MM-DD", () => {
  assert.equal(toIsoDate("2020-02-01T00:00:00"), "2020-02-01");
});
test("toIsoDate: basura/vacío/no-string → null (nunca throw)", () => {
  assert.equal(toIsoDate(""), null);
  assert.equal(toIsoDate("no-fecha"), null);
  assert.equal(toIsoDate(null), null);
  assert.equal(toIsoDate(undefined), null);
  assert.equal(toIsoDate("2020-13-40T00:00:00"), null); // mes/día inválido
});

// --- classifyTipoSeguro: producto por bloque, NO por ramo ---
test("classifyTipoSeguro: RiesgoAutos AU → auto; MO → moto", () => {
  assert.equal(
    classifyTipoSeguro({ RiesgoAutos: { Vehiculo: { ClaseVehiculo: "AU" } } }),
    "auto",
  );
  assert.equal(
    classifyTipoSeguro({ RiesgoAutos: { Vehiculo: { ClaseVehiculo: "MO" } } }),
    "moto",
  );
  // sin ClaseVehiculo → auto por defecto
  assert.equal(classifyTipoSeguro({ RiesgoAutos: {} }), "auto");
});
test("classifyTipoSeguro: Hogar → hogar; RC → responsabilidad_civil; Salud → salud", () => {
  assert.equal(classifyTipoSeguro({ RiesgoHogar: {} }), "hogar");
  assert.equal(classifyTipoSeguro({ RiesgoRC: {} }), "responsabilidad_civil");
  assert.equal(classifyTipoSeguro({ RiesgoSalud: {} }), "salud");
});
test("classifyTipoSeguro: sin bloque conocido → null", () => {
  assert.equal(classifyTipoSeguro({}), null);
  assert.equal(classifyTipoSeguro(undefined), null);
});

// --- LOO-807 — comercio: Occident (C0468) emite el bloque en PLURAL (`RiesgoComercios`,
// medido en prod: fichero POL 2026-08-01 → review [tipo_seguro_no_clasificable,
// riesgo_no_reconocido:RiesgoComercios]). La spec EIAC no fija nombre canónico para
// comercios → se aceptan AMBOS nombres (el singular queda como defensivo). ---
test("classifyTipoSeguro: RiesgoComercio (singular) → comercio", () => {
  assert.equal(classifyTipoSeguro({ RiesgoComercio: {} }), "comercio");
});

test("classifyTipoSeguro: RiesgoComercios (plural, Occident C0468) → comercio", () => {
  assert.equal(classifyTipoSeguro({ RiesgoComercios: {} }), "comercio");
});

test("classifyTipoSeguro: ambos bloques comercio presentes → comercio", () => {
  assert.equal(
    classifyTipoSeguro({ RiesgoComercio: {}, RiesgoComercios: {} }),
    "comercio",
  );
});

// --- BIDV004566 — Occident (C0468) emite ramo DGS 211 (Accidentes convenios/
// colectivo) bajo `RiesgoAccidentes` (confirmado contra el XML EIAC real del
// fichero POL_132 en homologación; antes caía en `tipo_seguro_no_clasificable`
// con `riesgo_no_reconocido:RiesgoAccidentes`, dejando la póliza sin coberturas
// ni tipo, y su reconcile de recibos también atascado). ---
test("classifyTipoSeguro: RiesgoAccidentes → accidentes", () => {
  assert.equal(classifyTipoSeguro({ RiesgoAccidentes: {} }), "accidentes");
});

test("unrecognizedRiesgoBlocks: RiesgoAccidentes reconocido → vacío", () => {
  assert.deepEqual(unrecognizedRiesgoBlocks({ RiesgoAccidentes: {} }), []);
});

test("mapEiacPol: RiesgoAccidentes → ok, accidentes, sin review de mapper", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosRiesgos: {
        Riesgo: { RiesgoAccidentes: { IdAplicacion: "1", Convenio: "4100244501198" } },
      },
    }),
  );
  assert.equal(r.outcome, "ok");
  assert.equal(r.tipoSeguro, "accidentes");
  assert.ok(!r.reviewReasons.includes("tipo_seguro_no_clasificable"));
  assert.ok(!r.reviewReasons.some((x) => x.startsWith("riesgo_no_reconocido")));
});

// --- happy path POL auto ---
test("mapEiacPol: POL auto válido → outcome ok, campos mapeados", () => {
  const r = mapEiacPol(baseAutoPol());
  assert.equal(r.outcome, "ok");
  assert.deepEqual(r.reviewReasons, []);
  assert.equal(r.idPolizaEntidad, "P01");
  assert.equal(r.codigoEntidadDgs, "C0058");
  assert.equal(r.ramoDgs, "241");
  assert.equal(r.tipoSeguro, "auto"); // por RiesgoAutos, NO por ramo 241
  assert.equal(r.fechaEfectoInicial, "2020-02-01");
  assert.equal(r.fechaVencimiento, "2021-02-01");
  // LOO-828 — la aseguradora sale del catálogo DGS→nombre (C0058 = Mapfre), NO
  // de DescripcionRamo (que describe el PRODUCTO, "ALLIANZ AUTO", no la entidad).
  assert.equal(r.aseguradora, "Mapfre");
  assert.equal(r.tomador?.tipoPersona, "fisica");
  assert.equal(r.tomador?.idPersona, "00000001R");
  // Vehículo no-PII → datos_especificos (matrícula/marca/modelo).
  assert.deepEqual(planas(r.datosEspecificos), {
    matricula: "AV0001A",
    marca: "SEAT",
    modelo: "Ibiza",
    claseVehiculo: "AU",
    anulacion: null,
  });
});

// --- LOO-828: aseguradora por código DGS (catálogo) con fallback ---
test("mapEiacPol: DGS mapeado → nombre de compañía del catálogo (no DescripcionRamo)", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosPoliza: {
        IdPoliza: "P02",
        CodigoEntidad: { CodigoDGS: "C0109" },
        DatosRamo: { RamoDGS: "241", DescripcionRamo: "AUTOMOVILES FLOTA" },
      },
    }),
  );
  assert.equal(r.codigoEntidadDgs, "C0109");
  assert.equal(r.aseguradora, "Allianz");
});
test("mapEiacPol: DGS NO mapeado → fallback a DescripcionRamo (comportamiento anterior)", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosPoliza: {
        IdPoliza: "P03",
        CodigoEntidad: { CodigoDGS: "C9999" },
        DatosRamo: { RamoDGS: "241", DescripcionRamo: "AUTOS DESCONOCIDA" },
      },
    }),
  );
  assert.equal(r.aseguradora, "AUTOS DESCONOCIDA");
});
test("mapEiacPol: DGS NO mapeado y sin DescripcionRamo → código DGS crudo", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosPoliza: {
        IdPoliza: "P04",
        CodigoEntidad: { CodigoDGS: "C9999" },
        DatosRamo: { RamoDGS: "241" },
      },
    }),
  );
  assert.equal(r.aseguradora, "C9999");
});

// --- extractDatosEspecificos: vehículo no-PII ---
test("extractDatosEspecificos: RiesgoAutos completo → matricula/marca/modelo", () => {
  assert.deepEqual(
    extractDatosEspecificos({
      RiesgoAutos: {
        Vehiculo: {
          Matricula: "1234ABC",
          ClaseVehiculo: "AU",
          Marca: "Toyota",
          Modelo: "Yaris",
        },
      },
    }),
    {
      matricula: "1234ABC",
      marca: "Toyota",
      modelo: "Yaris",
      claseVehiculo: "AU",
    },
  );
});
test("extractDatosEspecificos: guarda en crudo clase, categoría, Base7 y cilindrada del vehículo", () => {
  assert.deepEqual(
    extractDatosEspecificos({
      RiesgoAutos: {
        Vehiculo: {
          Matricula: "4897FTM",
          ClaseVehiculo: "XX",
          CategoriaVehiculo: "L3",
          BaseSIETe: "02360100002",
          Cilindrada: "680",
          Marca: "HONDA",
          Modelo: "NTV 700",
        },
      },
    }),
    {
      matricula: "4897FTM",
      marca: "HONDA",
      modelo: "NTV 700",
      claseVehiculo: "XX",
      categoriaVehiculo: "L3",
      baseSiete: "02360100002",
      cilindrada: "680",
    },
  );
});
test("extractDatosEspecificos: solo claves con valor (omite vacíos/ausentes)", () => {
  assert.deepEqual(
    extractDatosEspecificos({
      RiesgoAutos: { Vehiculo: { Matricula: "1234ABC", Marca: "  " } },
    }),
    { matricula: "1234ABC" },
  );
});
test("extractDatosEspecificos: RiesgoAutos sin Vehiculo → null", () => {
  assert.equal(extractDatosEspecificos({ RiesgoAutos: {} }), null);
});
test("extractDatosEspecificos: hogar SIN SituacionRiesgo → null (nada que guardar)", () => {
  assert.equal(extractDatosEspecificos({ RiesgoHogar: {} }), null);
});
test("extractDatosEspecificos: riesgo undefined → null (nunca throw)", () => {
  assert.equal(extractDatosEspecificos(undefined), null);
});

// --- extractSituacionRiesgo: dirección del RIESGO (hogar/comercio/comunidades) ---
//
// Fixture calcado de la FORMA real del feed (medida el 20/09/2026 en
// `seguros.cima_cobertura_campos`, POL de Occident C0468 y Generali C0072:
// SituacionRiesgo = NombreVia + OtrosDatosVia + CodigoPostal + Poblacion +
// Provincia + Pais). Los VALORES son sintéticos — nunca PII real.
function riesgoHogarOccident(
  situacion: Record<string, unknown> = {
    NombreVia: "CL EJEMPLO 1",
    OtrosDatosVia: "ESC 2 3 B",
    CodigoPostal: "41003",
    Poblacion: "SEVILLA",
    Provincia: "SEVILLA",
    Pais: "ES",
  },
): ParsedRiesgo {
  return {
    RiesgoHogar: {
      ClaseInmueble: "01",
      UsoInmueble: "H",
      SuperficieConstruida: "120",
      SituacionRiesgo: situacion,
    },
  };
}

const DIRECCION_HOGAR = {
  direccion: "CL EJEMPLO 1 ESC 2 3 B",
  direccionOrigen: "cima",
  cp: "41003",
  localidad: "SEVILLA",
  provincia: "SEVILLA",
};

// `riesgoHogarOccident()` trae `SuperficieConstruida: "120"` en el bloque
// (fixture calcada del feed real), así que `extractDatosEspecificos`/`mapEiacPol`
// —que SÍ leen todo el riesgo, a diferencia de `extractSituacionRiesgo`— la
// devuelven también.
// Clase y uso del inmueble viajan crudos desde el 24/09/2026 (extractInmuebleExtra).
const DIRECCION_Y_SUPERFICIE_HOGAR = { ...DIRECCION_HOGAR, metrosCuadrados: "120", claseInmueble: "01", usoInmueble: "H" };

test("extractSituacionRiesgo: hogar Occident → direccion + cp + localidad + provincia", () => {
  assert.deepEqual(extractSituacionRiesgo(riesgoHogarOccident()), DIRECCION_HOGAR);
});

test("extractSituacionRiesgo: sin OtrosDatosVia → direccion solo con NombreVia", () => {
  assert.deepEqual(
    extractSituacionRiesgo(
      riesgoHogarOccident({ NombreVia: "CL EJEMPLO 1", Poblacion: "SEVILLA" }),
    ),
    { direccion: "CL EJEMPLO 1", direccionOrigen: "cima", localidad: "SEVILLA" },
  );
});

test("extractSituacionRiesgo: sin vía pero con CP → NO se inventa direccion ni origen", () => {
  // Media dirección es media dirección: lo que hay se guarda, y lo que no hay no
  // se rotula como procedente de CIMA (el rótulo describiría un dato inexistente).
  assert.deepEqual(
    extractSituacionRiesgo(riesgoHogarOccident({ CodigoPostal: "41003" })),
    { cp: "41003" },
  );
});

test("extractSituacionRiesgo: SituacionRiesgo vacía o ausente → null", () => {
  assert.equal(extractSituacionRiesgo(riesgoHogarOccident({})), null);
  assert.equal(
    extractSituacionRiesgo({ RiesgoHogar: { ClaseInmueble: "01" } }),
    null,
  );
  assert.equal(extractSituacionRiesgo({ RiesgoHogar: {} }), null);
  assert.equal(extractSituacionRiesgo(undefined), null);
});

test("extractSituacionRiesgo: mismo helper para comercios y comunidades (forma idéntica)", () => {
  const sit = { NombreVia: "AV EJEMPLO 9", CodigoPostal: "41010", Poblacion: "SEVILLA" };
  const esperado = {
    direccion: "AV EJEMPLO 9",
    direccionOrigen: "cima",
    cp: "41010",
    localidad: "SEVILLA",
  };
  assert.deepEqual(
    extractSituacionRiesgo({ RiesgoComercios: { SituacionRiesgo: sit } }),
    esperado,
  );
  assert.deepEqual(
    extractSituacionRiesgo({ RiesgoComunidades: { SituacionRiesgo: sit } }),
    esperado,
  );
  // Singular defensivo (la spec EIAC no fija nombre canónico).
  assert.deepEqual(
    extractSituacionRiesgo({ RiesgoComercio: { SituacionRiesgo: sit } }),
    esperado,
  );
});

test("extractSituacionRiesgo: RiesgoAutos no está en la lista (el riesgo es el coche)", () => {
  assert.equal(
    extractSituacionRiesgo({
      RiesgoAutos: {
        Vehiculo: { Matricula: "1234ABC" },
        SituacionRiesgo: { NombreVia: "CL EJEMPLO 1" },
      },
    } as ParsedRiesgo),
    null,
  );
});

test("extractDatosEspecificos: hogar con SituacionRiesgo → dirección + superficie del riesgo", () => {
  assert.deepEqual(extractDatosEspecificos(riesgoHogarOccident()), DIRECCION_Y_SUPERFICIE_HOGAR);
});

test("mapEiacPol: hogar con SituacionRiesgo → datosEspecificos con dirección + superficie, outcome ok", () => {
  const r = mapEiacPol(
    baseAutoPol({ DatosRiesgos: { Riesgo: riesgoHogarOccident() } }),
  );
  assert.equal(r.tipoSeguro, "hogar");
  assert.equal(r.outcome, "ok");
  assert.deepEqual(planas(r.datosEspecificos), { ...DIRECCION_Y_SUPERFICIE_HOGAR, anulacion: null });
  // `riesgoShape` existía SOLO para aprender la forma del bloque de hogar
  // mientras no se leía; ya hay extractor, así que calla.
  assert.deepEqual(r.riesgoShape, []);
});

test("mapEiacPol: multi-riesgo → la dirección sale del riesgo que clasificó el producto", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosRiesgos: {
        Riesgo: [{ RiesgoDesconocido: {} }, riesgoHogarOccident()],
      },
    }),
  );
  assert.equal(r.tipoSeguro, "hogar");
  assert.deepEqual(planas(r.datosEspecificos), { ...DIRECCION_Y_SUPERFICIE_HOGAR, anulacion: null });
});

// --- extractSuperficieYViviendas: metros y nº viviendas (hogar/comunidades) ---

test("extractDatosEspecificos: hogar solo con SuperficieConstruida (sin SituacionRiesgo) → metrosCuadrados", () => {
  assert.deepEqual(
    extractDatosEspecificos({ RiesgoHogar: { SuperficieConstruida: "85" } }),
    { metrosCuadrados: "85" },
  );
});

test("extractDatosEspecificos: hogar sin SuperficieConstruida cae a SuperficieTotal", () => {
  assert.deepEqual(
    extractDatosEspecificos({ RiesgoHogar: { SuperficieTotal: "95" } }),
    { metrosCuadrados: "95", superficieTotal: "95" },
  );
});

test("extractDatosEspecificos: comunidades → metrosCuadrados + nViviendas", () => {
  assert.deepEqual(
    extractDatosEspecificos({
      RiesgoComunidades: { SuperficieConstruida: "1200", NumeroViviendas: "24" },
    }),
    { metrosCuadrados: "1200", nViviendas: "24" },
  );
});

test("extractDatosEspecificos: hogar no tiene nViviendas (una casa no es una comunidad)", () => {
  const r = extractDatosEspecificos({
    RiesgoHogar: { SuperficieConstruida: "85", NumeroViviendas: "24" },
  }) as Record<string, unknown>;
  assert.equal(r.metrosCuadrados, "85");
  assert.equal("nViviendas" in r, false);
});

test("extractDatosEspecificos: Antiguedad NO se mapea a anioConstruccion (unidades distintas: edad vs año)", () => {
  const r = extractDatosEspecificos({
    RiesgoHogar: { SuperficieConstruida: "85", Antiguedad: "12" },
  }) as Record<string, unknown>;
  assert.equal("anioConstruccion" in r, false);
  assert.equal("antiguedad" in r, false);
});

// --- mapEiacPol: datosEspecificos null cuando no hay vehículo ---
test("mapEiacPol: hogar sin datos del bien → ninguna clave del bien (ni lista de riesgos vacía)", () => {
  const r = mapEiacPol(
    baseAutoPol({ DatosRiesgos: { Riesgo: { RiesgoHogar: {} } } }),
  );
  assert.equal(r.tipoSeguro, "hogar");
  // Desde el 28/09/2026 la póliza trae datos de CONTRATO (producto…) aunque el
  // bien venga vacío; lo que se fija es que no se inventan claves del bien.
  assert.deepEqual(planas(r.datosEspecificos), { anulacion: null });
  assert.equal(r.datosEspecificos?.riesgos, undefined);
});
test("mapEiacPol: moto solo con ClaseVehiculo → datosEspecificos guarda solo la clase", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosRiesgos: {
        Riesgo: { RiesgoAutos: { Vehiculo: { ClaseVehiculo: "MO" } } },
      },
    }),
  );
  assert.equal(r.tipoSeguro, "moto");
  assert.deepEqual(planas(r.datosEspecificos), { claseVehiculo: "MO", anulacion: null });
});

// --- RamoDGS 241 NO es salud (regresión del doc antiguo) ---
test("mapEiacPol: ramo 241 + RiesgoAutos NO va a review_salud", () => {
  const r = mapEiacPol(baseAutoPol());
  assert.notEqual(r.outcome, "review_salud");
  assert.ok(!r.reviewReasons.includes("salud_riesgo_art9"));
});

// --- moto por ClaseVehiculo ---
test("mapEiacPol: RiesgoAutos ClaseVehiculo MO → tipoSeguro moto", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosRiesgos: {
        Riesgo: { RiesgoAutos: { Vehiculo: { ClaseVehiculo: "MO" } } },
      },
    }),
  );
  assert.equal(r.tipoSeguro, "moto");
  assert.equal(r.outcome, "ok");
});

// --- fechaVencimiento: fallback FechaFinSeguro ---
test("mapEiacPol: sin FechaVencimiento usa FechaFinSeguro", () => {
  const r = mapEiacPol(
    baseAutoPol({
      Fechas: {
        FechaEfectoInicial: "2020-02-01T00:00:00",
        FechaFinSeguro: "2022-02-01T00:00:00",
      },
    }),
  );
  assert.equal(r.fechaVencimiento, "2022-02-01");
  assert.equal(r.outcome, "ok");
});

// --- fechas faltantes → review (NO derivar inicio+1año) ---
test("mapEiacPol: sin vencimiento ni finSeguro → review + reason", () => {
  const r = mapEiacPol(
    baseAutoPol({ Fechas: { FechaEfectoInicial: "2020-02-01T00:00:00" } }),
  );
  assert.equal(r.fechaVencimiento, null);
  assert.equal(r.outcome, "review");
  assert.ok(r.reviewReasons.includes("falta_fecha_vencimiento"));
});
test("mapEiacPol: sin fechaEfectoInicial → review", () => {
  const r = mapEiacPol(
    baseAutoPol({ Fechas: { FechaVencimiento: "2021-02-01T00:00:00" } }),
  );
  assert.equal(r.outcome, "review");
  assert.ok(r.reviewReasons.includes("falta_fecha_efecto_inicial"));
});

// --- tipoSeguro no clasificable → null → review ---
test("mapEiacPol: riesgo desconocido → tipoSeguro null + review", () => {
  const r = mapEiacPol(
    baseAutoPol({ DatosRiesgos: { Riesgo: { RiesgoMisterioso: {} } } }),
  );
  assert.equal(r.tipoSeguro, null);
  assert.equal(r.outcome, "review");
  assert.ok(r.reviewReasons.includes("tipo_seguro_no_clasificable"));
  // LOO-806 — diagnóstico: el evento de review revela QUÉ bloque no se reconoció.
  assert.ok(r.reviewReasons.includes("riesgo_no_reconocido:RiesgoMisterioso"));
});

// --- LOO-806 — unrecognizedRiesgoBlocks: diagnóstico del ramo no clasificable ---
// Solo nombres de nodo XML (NO PII) → hace auto-diagnosticable qué ramo trae el carrier
// (p.ej. Occident M00171) sin re-inspeccionar el rawXml no persistido.
test("unrecognizedRiesgoBlocks: bloque Riesgo desconocido → lo lista", () => {
  assert.deepEqual(unrecognizedRiesgoBlocks({ RiesgoMisterioso: {} }), [
    "RiesgoMisterioso",
  ]);
});

test("unrecognizedRiesgoBlocks: bloque reconocido → no se lista (vacío)", () => {
  assert.deepEqual(unrecognizedRiesgoBlocks({ RiesgoHogar: {} }), []);
  assert.deepEqual(unrecognizedRiesgoBlocks({ RiesgoAutos: {} }), []);
});

test("unrecognizedRiesgoBlocks: mezcla → solo los Riesgo* NO reconocidos (ordenados)", () => {
  assert.deepEqual(
    unrecognizedRiesgoBlocks({ RiesgoMisterioso: {}, RiesgoMascotas: {} }),
    ["RiesgoMascotas", "RiesgoMisterioso"],
  );
});

test("unrecognizedRiesgoBlocks: ignora claves no-Riesgo (DatosCoberturas/OtrasFiguras)", () => {
  assert.deepEqual(unrecognizedRiesgoBlocks({ DatosCoberturas: {}, OtrasFiguras: {} }), []);
});

test("unrecognizedRiesgoBlocks: undefined → []", () => {
  assert.deepEqual(unrecognizedRiesgoBlocks(undefined), []);
});

// LOO-807 — el plural de Occident deja de ser "no reconocido": el review
// `riesgo_no_reconocido:RiesgoComercios` ya no puede emitirse.
test("unrecognizedRiesgoBlocks: RiesgoComercios (plural) reconocido → vacío", () => {
  assert.deepEqual(unrecognizedRiesgoBlocks({ RiesgoComercios: {} }), []);
});

// --- LOO-807 — POL comercio end-to-end (el caso Occident C0468 medido en prod) ---
test("mapEiacPol: RiesgoComercios (plural) → ok, comercio, sin review de mapper", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosRiesgos: { Riesgo: { RiesgoComercios: { Actividad: "0000" } } },
    }),
  );
  assert.equal(r.outcome, "ok");
  assert.equal(r.tipoSeguro, "comercio");
  assert.ok(!r.reviewReasons.includes("tipo_seguro_no_clasificable"));
  assert.ok(!r.reviewReasons.some((x) => x.startsWith("riesgo_no_reconocido")));
});

// LOO-807 + LOO-918 — la instrumentación de forma debe leer el bloque REALMENTE
// presente (plural o singular); si no, `cima_riesgo_shape` saldría vacío en silencio
// y perderíamos la telemetría necesaria para el futuro extractor de comercio.
test("mapEiacPol: comercio plural con contenido → riesgoShape con claves (no vacío)", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosRiesgos: {
        Riesgo: {
          RiesgoComercios: { Actividad: "0000", Situacion: { CodigoPostal: "11520" } },
        },
      },
    }),
  );
  assert.deepEqual(r.riesgoShape, ["Actividad", "Situacion", "Situacion.CodigoPostal"]);
});

test("mapEiacPol: comercio singular con contenido → riesgoShape con claves (regresión)", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosRiesgos: { Riesgo: { RiesgoComercio: { Actividad: "0000" } } },
    }),
  );
  assert.equal(r.tipoSeguro, "comercio");
  assert.deepEqual(r.riesgoShape, ["Actividad"]);
});

// Multi-riesgo (fast-xml-parser colapsa a array): clasifica por el primer riesgo
// del array que classifyTipoSeguro reconozca, sin importar la posición.
test("mapEiacPol: Riesgo array con RiesgoComercios primero → comercio", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosRiesgos: { Riesgo: [{ RiesgoComercios: {} }, { RiesgoHogar: {} }] },
    }),
  );
  assert.equal(r.tipoSeguro, "comercio");
});

// LOO-XXX — regresión: 2 POL de Occident seguían en review tras el fix LOO-807
// (que ya reconocía RiesgoComercios) porque ese bloque NO iba primero en el
// array de riesgos — classifyTipoSeguro(riesgos[0]) nunca llegaba a mirarlo.
test("mapEiacPol: Riesgo array con RiesgoComercios SEGUNDO → comercio (no solo riesgos[0])", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosRiesgos: {
        Riesgo: [{ RiesgoMascotas: {} }, { RiesgoComercios: {} }],
      },
    }),
  );
  assert.equal(r.tipoSeguro, "comercio");
  assert.equal(r.outcome, "ok");
});

// Si NINGÚN riesgo del array clasifica, el diagnóstico agrega los bloques
// desconocidos de TODOS, no solo del primero.
test("mapEiacPol: Riesgo array sin ningún bloque reconocido → agrega bloques de todos", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosRiesgos: {
        Riesgo: [{ RiesgoMisterioso: {} }, { RiesgoMascotas: {} }],
      },
    }),
  );
  assert.equal(r.tipoSeguro, null);
  assert.ok(
    r.reviewReasons.includes(
      "riesgo_no_reconocido:RiesgoMascotas,RiesgoMisterioso",
    ),
  );
});

// --- Comunidades / Embarcaciones — carga masiva 199 de Occident C0468 (15/09/2026):
// 4 de 44 pólizas (BIDP019061, BIDP023227, BIDQ020971 comunidades; BIDP036783
// embarcaciones) cayeron en review [tipo_seguro_no_clasificable,
// riesgo_no_reconocido:RiesgoComunidades|RiesgoEmbarcaciones]. El fichero se
// confirmó como parcial (40/44) → TIREA no lo re-entrega → las 4 se perdieron. ---
test("classifyTipoSeguro: RiesgoComunidades → comunidades", () => {
  assert.equal(classifyTipoSeguro({ RiesgoComunidades: {} }), "comunidades");
});

test("classifyTipoSeguro: RiesgoEmbarcaciones → otros (sin valor propio en tipo_seguro)", () => {
  assert.equal(classifyTipoSeguro({ RiesgoEmbarcaciones: {} }), "otros");
});

test("unrecognizedRiesgoBlocks: Comunidades y Embarcaciones reconocidos → vacío", () => {
  assert.deepEqual(unrecognizedRiesgoBlocks({ RiesgoComunidades: {} }), []);
  assert.deepEqual(unrecognizedRiesgoBlocks({ RiesgoEmbarcaciones: {} }), []);
});

test("mapEiacPol: RiesgoComunidades → ok, comunidades, sin review de mapper (BIDP023227)", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosRiesgos: {
        Riesgo: { RiesgoComunidades: { SituacionRiesgo: { CodigoPostal: "41003" } } },
      },
    }),
  );
  assert.equal(r.outcome, "ok");
  assert.equal(r.tipoSeguro, "comunidades");
  assert.ok(!r.reviewReasons.includes("tipo_seguro_no_clasificable"));
  assert.ok(!r.reviewReasons.some((x) => x.startsWith("riesgo_no_reconocido")));
  // Desde 20/09/2026 el CP de la situación del riesgo YA SE EXTRAE, así que la
  // instrumentación de forma (LOO-918) calla: solo habla cuando no se saca nada.
  assert.deepEqual(planas(r.datosEspecificos), { cp: "41003", anulacion: null });
  assert.deepEqual(r.riesgoShape, []);
});

test("mapEiacPol: RiesgoEmbarcaciones → ok, otros, sin review de mapper (BIDP036783)", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosRiesgos: { Riesgo: { RiesgoEmbarcaciones: { Matricula: "X" } } },
    }),
  );
  assert.equal(r.outcome, "ok");
  assert.equal(r.tipoSeguro, "otros");
  assert.ok(!r.reviewReasons.some((x) => x.startsWith("riesgo_no_reconocido")));
  assert.deepEqual(r.riesgoShape, ["Matricula"]);
});

// --- salud → review_salud ---
test("mapEiacPol: RiesgoSalud → review_salud (defensivo)", () => {
  const r = mapEiacPol(
    baseAutoPol({ DatosRiesgos: { Riesgo: { RiesgoSalud: {} } } }),
  );
  assert.equal(r.outcome, "review_salud");
  assert.equal(r.tipoSeguro, "salud");
  assert.ok(r.reviewReasons.includes("salud_riesgo_art9"));
});

// --- LOO-752 (D6): Asegurado distinto del Tomador → NO review; se EXTRAE como
// interviniente (rol asegurado). La PII se persiste cifrada (decisión LOPD D1=A);
// la regla `art14_asegurado_distinto` ya NO existe. ---
test("mapEiacPol: Asegurado != Tomador → ok (sin art14), asegurado como interviniente", () => {
  const r = mapEiacPol(
    baseAutoPol({
      Asegurado: {
        PersonaFisica: {
          TipoIdentificacion: "NI",
          IdPersona: "99999999Z",
          Nombre: "Otro",
          Apellido1: "Apellido",
        },
      },
    }),
  );
  assert.equal(r.outcome, "ok");
  assert.ok(!r.reviewReasons.includes("art14_asegurado_distinto"));
  // El Tomador sigue siendo el del fixture (única PII promovida a `clientes`).
  assert.equal(r.tomador?.idPersona, "00000001R");
  // El Asegurado se extrae como interviniente (rol asegurado), PII en claro en la
  // forma intermedia (el cifrado lo hace el persist).
  const aseg = r.intervinientes.find((i) => i.rol === "asegurado");
  assert.ok(aseg, "asegurado extraído como interviniente");
  assert.equal(aseg?.nif, "99999999Z");
  assert.equal(aseg?.nombre, "Otro");
  assert.equal(aseg?.apellidos, "Apellido");
});

// --- Asegurado == Tomador (mismo NIF) → ok y se guarda la FIGURA sin su contacto
// (28/09/2026: antes se omitía y el cliente no sabía que también es asegurado). ---
test("mapEiacPol: Asegurado mismo id que Tomador → ok, figura asegurado sin contacto", () => {
  const r = mapEiacPol(
    baseAutoPol({
      Asegurado: {
        PersonaFisica: {
          TipoIdentificacion: "NI",
          IdPersona: "00000001R", // == IdPersona del Tomador en baseAutoPol
          Nombre: "Nombre",
        },
      },
    }),
  );
  assert.equal(r.outcome, "ok");
  assert.ok(!r.reviewReasons.includes("art14_asegurado_distinto"));
  const aseg = r.intervinientes.find((i) => i.rol === "asegurado");
  assert.equal(aseg?.nif, "00000001R");
  assert.equal(aseg?.telefono, null);
  assert.equal(aseg?.email, null);
  assert.equal(aseg?.fechaNacimiento, null);
});

// --- LOO-752: sin bloque Asegurado → no se extrae interviniente asegurado, ok ---
test("mapEiacPol: sin Asegurado → ok, sin interviniente asegurado", () => {
  const r = mapEiacPol(baseAutoPol());
  assert.equal(r.outcome, "ok");
  assert.equal(
    r.intervinientes.find((i) => i.rol === "asegurado"),
    undefined,
  );
});

// --- Tomador persona jurídica ---
test("mapEiacPol: Tomador PersonaJuridica → tipoPersona juridica + razón social", () => {
  const r = mapEiacPol(
    baseAutoPol({
      Tomador: {
        PersonaJuridica: {
          TipoIdentificacion: "NI",
          IdPersona: "B00000001",
          RazonSocial: "Razon Social",
        },
      },
    }),
  );
  assert.equal(r.tomador?.tipoPersona, "juridica");
  assert.equal(r.tomador?.idPersona, "B00000001");
  assert.equal(r.tomador?.nombreCompleto, "Razon Social");
});

// --- Riesgo colapsado a array (fast-xml-parser multi-riesgo) ---
test("mapEiacPol: DatosRiesgos.Riesgo como array usa el primero", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosRiesgos: {
        Riesgo: [
          { RiesgoAutos: { Vehiculo: { ClaseVehiculo: "AU" } } },
          { RiesgoHogar: {} },
        ],
      },
    }),
  );
  assert.equal(r.tipoSeguro, "auto");
});

// --- Wrapper ProcesosEIAC presente (defensivo) ---
test("mapEiacPol: árbol con wrapper ProcesosEIAC se desenvuelve igual", () => {
  const base = baseAutoPol();
  const objetos = (base.Objetos as { Poliza: unknown }).Poliza;
  const r = mapEiacPol({ ProcesosEIAC: { Objetos: { Poliza: objetos as never } } });
  assert.equal(r.idPolizaEntidad, "P01");
  assert.equal(r.tipoSeguro, "auto");
  assert.equal(r.outcome, "ok");
});

// --- Objetos.Poliza como array (defensivo) ---
test("mapEiacPol: Objetos.Poliza array → usa la primera poliza", () => {
  const base = baseAutoPol();
  const polizaObj = (base.Objetos as { Poliza: unknown }).Poliza;
  const r = mapEiacPol({
    Objetos: { Poliza: [polizaObj as never, polizaObj as never] },
  });
  assert.equal(r.idPolizaEntidad, "P01");
});

// --- input vacío → review, nunca throw ---
test("mapEiacPol: input vacío {} → review, no throw", () => {
  const r = mapEiacPol({});
  assert.equal(r.outcome, "review");
  assert.ok(r.reviewReasons.includes("falta_tomador"));
  assert.ok(r.reviewReasons.includes("falta_fecha_efecto_inicial"));
});


// ── LOO-749 — primas + fraccionamiento ────────────────────────────────────
test("toDecimalString: decimal EIAC / number → '0.00' fixed; negativo/basura → null", () => {
  assert.equal(toDecimalString("1000.0"), "1000.00");
  assert.equal(toDecimalString("1234.5"), "1234.50");
  assert.equal(toDecimalString(900), "900.00");
  assert.equal(toDecimalString("0"), "0.00");
  assert.equal(toDecimalString("-5"), null); // negativo → dato malo
  assert.equal(toDecimalString("abc"), null);
  assert.equal(toDecimalString(""), null);
  assert.equal(toDecimalString(null), null);
  assert.equal(toDecimalString(undefined), null);
});

test("classifyFraccionPago: AN/SE/TR/ME → enum; otro/null → null", () => {
  assert.equal(classifyFraccionPago("AN"), "anual");
  assert.equal(classifyFraccionPago("se"), "semestral"); // case-insensitive
  assert.equal(classifyFraccionPago("TR"), "trimestral");
  assert.equal(classifyFraccionPago("ME"), "mensual");
  assert.equal(classifyFraccionPago("XX"), null);
  assert.equal(classifyFraccionPago(null), null);
});

test("LOO-749: DatosImportes (anualizadas) + FraccionPago → prima_bruta/anual/fraccionamiento", () => {
  const r = mapEiacPol(
    baseAutoPol({
      FraccionPago: "ME",
      DatosImportes: {
        ImportesDEC: { PrimaTotalAnualizada: "1200.50", PrimaNetaAnualizada: "1000.00" },
      },
    }),
  );
  assert.equal(r.outcome, "ok");
  assert.equal(r.primaBruta, "1200.50"); // anualizada con impuestos
  assert.equal(r.primaAnual, "1000.00"); // anualizada neta
  assert.equal(r.fraccionamiento, "mensual");
});

test("LOO-749: sin ImportesDEC y pago ANUAL → fallback a Importes del periodo (= anual)", () => {
  const r = mapEiacPol(
    baseAutoPol({
      FraccionPago: "AN",
      DatosImportes: { Importes: { PrimaTotal: "300.00", PrimaNeta: "250.00" } },
    }),
  );
  assert.equal(r.primaBruta, "300.00");
  assert.equal(r.primaAnual, "250.00");
  assert.equal(r.datosEspecificos?.primaAnualDudosa, false);
});

test("LOO-749: sin DatosImportes/FraccionPago → null, y NO manda a review", () => {
  const r = mapEiacPol(baseAutoPol());
  assert.equal(r.primaBruta, null);
  assert.equal(r.primaAnual, null);
  assert.equal(r.fraccionamiento, null);
  assert.equal(r.outcome, "ok"); // la ausencia de prima NO es motivo de review
});

// --- LOO-751: coberturas/garantías ---

test("LOO-751 extractCoberturas: Cobertura única (objeto) → 1 cobertura mapeada", () => {
  const riesgos: ParsedRiesgo[] = [
    {
      DatosCoberturas: {
        Cobertura: {
          NumeroOrden: "1",
          IdCobertura: "1",
          DescripcionCobertura: "BASICO",
          FechaInicio: "2026-02-01T00:00:00",
          FechaFin: "2027-02-01T00:00:00",
          CapitalAsegurado: "0",
          DescripcionCapitalAsegurado: "ILIMITADO",
          ModalidadValoracion: "VR",
        },
      },
    },
  ];
  const cobs = extractCoberturas(riesgos);
  assert.equal(cobs.length, 1);
  assert.deepEqual(cobs[0], {
    numeroOrden: 1,
    codigo: "1",
    descripcion: "BASICO",
    capitalAsegurado: "0",
    descripcionCapital: "ILIMITADO",
    franquicia: null,
    fechaInicio: "2026-02-01",
    fechaFin: "2027-02-01",
    modalidadValoracion: "VR",
    datosExtra: null,
  });
});

test("LOO-751 extractCoberturas: Cobertura[] (array) → N coberturas en orden", () => {
  const riesgos: ParsedRiesgo[] = [
    {
      DatosCoberturas: {
        Cobertura: [
          { NumeroOrden: "1", IdCobertura: "1", DescripcionCobertura: "RC Obligatoria" },
          { NumeroOrden: "2", IdCobertura: "2", DescripcionCobertura: "RC Voluntaria" },
          { NumeroOrden: "3", IdCobertura: "3", DescripcionCobertura: "Lunas" },
        ],
      },
    },
  ];
  const cobs = extractCoberturas(riesgos);
  assert.equal(cobs.length, 3);
  assert.deepEqual(
    cobs.map((c) => c.descripcion),
    ["RC Obligatoria", "RC Voluntaria", "Lunas"],
  );
  assert.equal(cobs[1].numeroOrden, 2);
});

test("LOO-751 extractCoberturas: agrega coberturas de TODOS los riesgos", () => {
  const riesgos: ParsedRiesgo[] = [
    { DatosCoberturas: { Cobertura: { IdCobertura: "1", DescripcionCobertura: "A" } } },
    {
      DatosCoberturas: {
        Cobertura: [
          { IdCobertura: "2", DescripcionCobertura: "B" },
          { IdCobertura: "3", DescripcionCobertura: "C" },
        ],
      },
    },
  ];
  const cobs = extractCoberturas(riesgos);
  assert.equal(cobs.length, 3);
  assert.deepEqual(
    cobs.map((c) => c.descripcion),
    ["A", "B", "C"],
  );
});

test("LOO-751 extractCoberturas: claves no mapeadas (Franquicia/Limite/Prima) → datosExtra", () => {
  const riesgos: ParsedRiesgo[] = [
    {
      DatosCoberturas: {
        Cobertura: {
          IdCobertura: "9",
          DescripcionCobertura: "Daños propios",
          Franquicia: "300",
          Limite: "50000",
          Prima: "120.5",
        },
      },
    },
  ];
  const [c] = extractCoberturas(riesgos);
  // Franquicia SÍ tiene columna tipada.
  assert.equal(c.franquicia, "300");
  // Limite/Prima no → datosExtra (cola heterogénea, sin perder dato).
  assert.deepEqual(c.datosExtra, { Limite: "50000", Prima: "120.5" });
});

test("LOO-751 extractCoberturas: sin DatosCoberturas → [] (no review)", () => {
  assert.deepEqual(extractCoberturas([{ RiesgoAutos: {} }]), []);
  assert.deepEqual(extractCoberturas([]), []);
  assert.deepEqual(extractCoberturas(undefined), []);
});

test("LOO-751 mapEiacPol: coberturas pobladas y NO mandan a review", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosRiesgos: {
        Riesgo: {
          RiesgoAutos: { Vehiculo: { ClaseVehiculo: "AU" } },
          DatosCoberturas: {
            Cobertura: { IdCobertura: "1", DescripcionCobertura: "BASICO" },
          },
        },
      },
    }),
  );
  assert.equal(r.outcome, "ok");
  assert.equal(r.coberturas.length, 1);
  assert.equal(r.coberturas[0].descripcion, "BASICO");
});

test("LOO-751 mapEiacPol: sin coberturas → [] y outcome sigue 'ok'", () => {
  const r = mapEiacPol(baseAutoPol());
  assert.deepEqual(r.coberturas, []);
  assert.equal(r.outcome, "ok");
});

// ============================================================
// LOO-752 — intervinientes (asegurado / propietario / conductor / figuras)
// ============================================================

// --- classifyClaseFigura ---
test("LOO-752 classifyClaseFigura: BE/BN → beneficiario; PA → pagador; resto → contacto", () => {
  assert.equal(classifyClaseFigura("BE"), "beneficiario");
  assert.equal(classifyClaseFigura("bn"), "beneficiario");
  // 28/09/2026 — rol propio (mig 0103); antes caía en `contacto`.
  assert.equal(classifyClaseFigura("PA"), "pagador");
  assert.equal(classifyClaseFigura("pa"), "pagador");
  assert.equal(classifyClaseFigura("XX"), "contacto");
  assert.equal(classifyClaseFigura(null), "contacto");
  assert.equal(classifyClaseFigura(undefined), "contacto");
});

// Fixture de un riesgo auto con propietario + conductor + otra figura.
function riesgoConIntervinientes(): ParsedRiesgo {
  return {
    RiesgoAutos: {
      Vehiculo: { ClaseVehiculo: "AU", Matricula: "1234ABC" },
      Propietario: {
        PersonaFisica: {
          TipoIdentificacion: "NI",
          IdPersona: "11111111H",
          Nombre: "Prop",
          Apellido1: "Uno",
          Apellido2: "Dos",
          FechaNacimiento: "1979-02-08T00:00:00",
          DatosContacto: {
            Telefonos: { Telefono: { Numero: "600111222" } },
            Emails: { Email: { Direccion: "prop@example.com" } },
          },
        },
      },
      Conductores: {
        Conductor: {
          NumeroOrden: "1",
          DatosConductor: {
            TipoIdentificacion: "NI",
            IdPersona: "22222222J",
            Nombre: "Cond",
            Apellido1: "Hab",
          },
          ClaseConductor: "HA",
          FechaPermiso: "2003-01-23T00:00:00",
        },
      },
    },
    OtrasFiguras: {
      Figura: {
        DatosFigura: {
          PersonaFisica: {
            TipoIdentificacion: "NI",
            IdPersona: "33333333P",
            Nombre: "Pagador",
            Apellido1: "Fig",
          },
        },
        ClaseFigura: "PA",
      },
    },
  };
}

test("LOO-752 extractIntervinientes: asegurado + propietario + conductor + figura", () => {
  const poliza: ParsedPoliza = {
    Asegurado: {
      PersonaFisica: {
        TipoIdentificacion: "NI",
        IdPersona: "99999999Z",
        Nombre: "Aseg",
        Apellido1: "Urado",
      },
    },
  };
  const out = extractIntervinientes(poliza, [riesgoConIntervinientes()]);
  assert.equal(out.length, 4);

  const aseg = out.find((i) => i.rol === "asegurado");
  assert.equal(aseg?.nif, "99999999Z");
  assert.equal(aseg?.nombre, "Aseg");
  assert.equal(aseg?.apellidos, "Urado");

  const prop = out.find((i) => i.rol === "propietario");
  assert.equal(prop?.nif, "11111111H");
  assert.equal(prop?.apellidos, "Uno Dos");
  assert.equal(prop?.fechaNacimiento, "1979-02-08");
  assert.equal(prop?.telefono, "600111222");
  assert.equal(prop?.email, "prop@example.com");

  const cond = out.find((i) => i.rol === "conductor_habitual");
  assert.equal(cond?.nif, "22222222J");
  assert.equal(cond?.fechaCarnet, "2003-01-23"); // de FechaPermiso

  const fig = out.find((i) => i.rol === "pagador");
  assert.equal(fig?.nif, "33333333P");
  assert.equal(fig?.claseFiguraRaw, "PA");
});

test("LOO-752 extractIntervinientes: ClaseConductor OC → conductor_ocasional", () => {
  const riesgo: ParsedRiesgo = {
    RiesgoAutos: {
      Conductores: {
        Conductor: {
          DatosConductor: { IdPersona: "44444444A", Nombre: "Ocas" },
          ClaseConductor: "OC",
        },
      },
    },
  };
  const out = extractIntervinientes(undefined, [riesgo]);
  assert.equal(out[0].rol, "conductor_ocasional");
});

test("LOO-752 extractIntervinientes: conductores como array → todos extraídos", () => {
  const riesgo: ParsedRiesgo = {
    RiesgoAutos: {
      Conductores: {
        Conductor: [
          { DatosConductor: { IdPersona: "55555555K", Nombre: "A" } },
          { DatosConductor: { IdPersona: "66666666L", Nombre: "B" } },
        ],
      },
    },
  };
  const out = extractIntervinientes(undefined, [riesgo]);
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((i) => i.nif),
    ["55555555K", "66666666L"],
  );
});

test("extractIntervinientes: PersonaJuridica propietario → se extrae con su razón social (caso Esquiansa)", () => {
  const riesgo: ParsedRiesgo = {
    RiesgoAutos: {
      Propietario: {
        PersonaJuridica: { IdPersona: "B00000001", RazonSocial: "Empresa SL" },
      },
    },
  };
  const out = extractIntervinientes(undefined, [riesgo]);
  assert.equal(out.length, 1);
  assert.equal(out[0].rol, "propietario");
  assert.equal(out[0].nif, "B00000001");
  assert.equal(out[0].nombre, "Empresa SL");
  assert.equal(out[0].apellidos, null);
});

test("LOO-752 extractIntervinientes: persona vacía (sin nif ni nombre) → descartada", () => {
  const riesgo: ParsedRiesgo = {
    RiesgoAutos: { Propietario: { PersonaFisica: {} } },
  };
  const out = extractIntervinientes(undefined, [riesgo]);
  assert.deepEqual(out, []);
});

test("LOO-752 extractIntervinientes: sin riesgos ni asegurado → []", () => {
  assert.deepEqual(extractIntervinientes(undefined, []), []);
  assert.deepEqual(extractIntervinientes({}, []), []);
});

// --- F2: dedup Asegurado == Tomador (mismo NIF) ---
test("extractIntervinientes: Asegurado con mismo NIF que Tomador → figura sin contacto", () => {
  const poliza: ParsedPoliza = {
    Asegurado: {
      PersonaFisica: {
        IdPersona: "00000001R",
        Nombre: "Tom",
        FechaNacimiento: "1980-01-01",
        DatosContacto: { Telefonos: { Telefono: { Numero: "600000000" } } },
      },
    },
  };
  // tomadorNif normaliza upper+trim → "00000001R" coincide aunque venga con espacios.
  const out = extractIntervinientes(poliza, [], " 00000001r ");
  assert.equal(out.length, 1);
  assert.equal(out[0].rol, "asegurado");
  assert.equal(out[0].nombre, "Tom");
  assert.equal(out[0].telefono, null);
  assert.equal(out[0].fechaNacimiento, null);
});

test("LOO-752 extractIntervinientes: Asegurado con NIF distinto al Tomador → se extrae", () => {
  const poliza: ParsedPoliza = {
    Asegurado: { PersonaFisica: { IdPersona: "99999999Z", Nombre: "Otro" } },
  };
  const out = extractIntervinientes(poliza, [], "00000001R");
  assert.equal(out.length, 1);
  assert.equal(out[0].rol, "asegurado");
  assert.equal(out[0].nif, "99999999Z");
});

test("LOO-752 extractIntervinientes: sin tomadorNif → no dedup (asegurado se extrae)", () => {
  const poliza: ParsedPoliza = {
    Asegurado: { PersonaFisica: { IdPersona: "00000001R", Nombre: "Tom" } },
  };
  assert.equal(extractIntervinientes(poliza, []).length, 1);
});

// --- F3: Asegurado como ARRAY (asArray) → todos los distintos al Tomador ---
test("extractIntervinientes: Asegurado array → extrae todos, también el == Tomador", () => {
  const poliza: ParsedPoliza = {
    Asegurado: [
      { PersonaFisica: { IdPersona: "00000001R", Nombre: "EsTomador" } },
      { PersonaFisica: { IdPersona: "11111111H", Nombre: "Aseg2" } },
      { PersonaFisica: { IdPersona: "22222222J", Nombre: "Aseg3" } },
    ],
  };
  const out = extractIntervinientes(poliza, [], "00000001R");
  assert.deepEqual(
    out.map((i) => i.nif),
    ["00000001R", "11111111H", "22222222J"],
  );
  assert.ok(out.every((i) => i.rol === "asegurado"));
});

test("LOO-752 mapEiacPol: intervinientes poblados NO mandan a review", () => {
  const r = mapEiacPol(
    baseAutoPol({ DatosRiesgos: { Riesgo: riesgoConIntervinientes() } }),
  );
  assert.equal(r.outcome, "ok");
  assert.ok(r.intervinientes.length >= 3);
});

// --- LOO-915: SituacionPoliza → estado ---
// Los códigos vienen de una medición sobre prod (2026-07-10): 50 EV, 41 AN, 9 ES.

test("mapSituacionPoliza traduce los códigos conocidos", () => {
  assert.deepEqual(mapSituacionPoliza("EV"), { estado: "activa", conocido: true });
  assert.deepEqual(mapSituacionPoliza("AN"), { estado: "cancelada", conocido: true });
  // Case-insensitive + trim, como el resto de mappers EIAC.
  assert.deepEqual(mapSituacionPoliza(" ev "), { estado: "activa", conocido: true });
  assert.deepEqual(mapSituacionPoliza("an"), { estado: "cancelada", conocido: true });
});

test("mapSituacionPoliza: PR (Propuesta) y ES (En Suspenso) son códigos oficiales EIAC, sin evento y sin tocar estado", () => {
  // Fuente: Documentos Estándar EIAC V07.1, 13.3.32 claves_situacionpoliza:
  // AN Anulada · ES En Suspenso · EV En Vigor · EX Extinguida · PR Propuesta.
  // `estado_poliza` no tiene valor propio para ellos → estado null (no se toca).
  assert.deepEqual(mapSituacionPoliza("PR"), { estado: null, conocido: true });
  assert.deepEqual(mapSituacionPoliza("ES"), { estado: null, conocido: true });
  assert.deepEqual(mapSituacionPoliza(" pr "), { estado: null, conocido: true });
});

test("mapSituacionPoliza NO adivina un código desconocido → cuarentena", () => {
  assert.deepEqual(mapSituacionPoliza("XX"), { estado: null, conocido: false });
  assert.deepEqual(mapSituacionPoliza("EX"), { estado: null, conocido: false });
});

test("mapSituacionPoliza: ausencia de código no es cuarentena", () => {
  // Sin SituacionPoliza no hay nada que traducir, pero tampoco un código raro
  // que señalar. `conocido: true` ⇒ no se emite evento.
  assert.deepEqual(mapSituacionPoliza(null), { estado: null, conocido: true });
  assert.deepEqual(mapSituacionPoliza(undefined), { estado: null, conocido: true });
  assert.deepEqual(mapSituacionPoliza("  "), { estado: null, conocido: true });
  assert.deepEqual(mapSituacionPoliza(42), { estado: null, conocido: true });
});

test("una póliza AN nunca queda como activa (el bug de LOO-915)", () => {
  const { estado } = mapSituacionPoliza("AN");
  assert.notEqual(estado, "activa");
  assert.equal(estado, "cancelada");
});

// --- LOO-918: describeRiesgoShape (instrumentación mapper hogar) ---

test("describeRiesgoShape devuelve claves anidadas, NUNCA valores", () => {
  // Forma inventada A PROPÓSITO: el test fija el contrato (solo nombres), no la
  // estructura real del EIAC —que es justo lo que este código va a descubrir—.
  const riesgo = {
    RiesgoHogar: {
      Situacion: { Direccion: "CALLE FALSA 123", CodigoPostal: "11520" },
      Continente: "105000",
      MetrosCuadrados: "110",
    },
  } as unknown as Parameters<typeof describeRiesgoShape>[0];
  const shape = describeRiesgoShape(riesgo, "RiesgoHogar");

  // Están los nombres de clave, anidados a 2 niveles.
  assert.deepEqual(shape, [
    "Continente",
    "MetrosCuadrados",
    "Situacion",
    "Situacion.CodigoPostal",
    "Situacion.Direccion",
  ]);
  // NINGÚN valor se filtra (la dirección es PII).
  const joined = shape.join("|");
  assert.ok(!joined.includes("CALLE FALSA"), "no debe contener el valor de Direccion");
  assert.ok(!joined.includes("11520"), "no debe contener el valor del CP");
});

test("describeRiesgoShape: bloque ausente o vacío → []", () => {
  assert.deepEqual(describeRiesgoShape(undefined, "RiesgoHogar"), []);
  assert.deepEqual(describeRiesgoShape({} as never, "RiesgoHogar"), []);
  assert.deepEqual(
    describeRiesgoShape({ RiesgoHogar: null } as never, "RiesgoHogar"),
    [],
  );
});

test("describeRiesgoShape: solo mira el bloque pedido", () => {
  const riesgo = {
    RiesgoAutos: { Vehiculo: { Matricula: "1234ABC" } },
    RiesgoHogar: { Continente: "1" },
  } as unknown as Parameters<typeof describeRiesgoShape>[0];
  // Pedimos hogar → no aparece nada de autos.
  assert.deepEqual(describeRiesgoShape(riesgo, "RiesgoHogar"), ["Continente"]);
});

// LOO-807 — el plural de Occident es un bloque describible más (mismo contrato:
// claves anidadas a 2 niveles, NUNCA valores).
test("describeRiesgoShape: bloque RiesgoComercios (plural) → claves, nunca valores", () => {
  const riesgo = {
    RiesgoComercios: {
      Actividad: "0000",
      Situacion: { Direccion: "CALLE FALSA 123", CodigoPostal: "11520" },
    },
  } as unknown as Parameters<typeof describeRiesgoShape>[0];
  const shape = describeRiesgoShape(riesgo, "RiesgoComercios");
  assert.deepEqual(shape, [
    "Actividad",
    "Situacion",
    "Situacion.CodigoPostal",
    "Situacion.Direccion",
  ]);
  const joined = shape.join("|");
  assert.ok(!joined.includes("CALLE FALSA"), "no debe contener el valor de Direccion");
  assert.ok(!joined.includes("11520"), "no debe contener el valor del CP");
});

// --- extractAnimalRC: el animal de una RC de mascotas ---

test("extractDatosEspecificos: RC con Animal → animalRaza + animalFechaNacimiento", () => {
  assert.deepEqual(
    extractDatosEspecificos({
      RiesgoRC: {
        Animal: {
          ClaseAnimal: "CAN",
          RazaAnimal: "Labrador Retriever",
          FechaNacimiento: "2022-03-15",
          UsoAnimal: "01",
          IdAnimal: "1",
        },
      },
    }),
    {
      animalRaza: "Labrador Retriever",
      animalFechaNacimiento: "2022-03-15",
      // L5 (28/09/2026): se leen ya — el feed real manda texto legible.
      animalClase: "CAN",
      animalUso: "01",
      animalId: "1",
    },
  );
});

test("extractDatosEspecificos: RC con Animal sin raza → solo fecha de nacimiento", () => {
  assert.deepEqual(
    extractDatosEspecificos({
      RiesgoRC: { Animal: { FechaNacimiento: "2020-01-01" } },
    }),
    { animalFechaNacimiento: "2020-01-01" },
  );
});

test("extractDatosEspecificos: RC sin Animal → solo la actividad asegurada (L4)", () => {
  assert.deepEqual(
    extractDatosEspecificos({
      RiesgoRC: { Actividad: { DescripcionActividad: "Fontaneria", IdActividad: "4322" } },
    }),
    { actividad: "Fontaneria", idActividad: "4322" },
  );
});

test("extractDatosEspecificos: ClaseAnimal/UsoAnimal/IdAnimal se leen (L5); «SIN INFORMAR» es relleno", () => {
  const r = extractDatosEspecificos({
    RiesgoRC: {
      Animal: {
        ClaseAnimal: "Caballo",
        RazaAnimal: "Bulldog",
        UsoAnimal: "SIN INFORMAR",
        IdAnimal: "7",
      },
    },
  }) as Record<string, unknown>;
  assert.equal(r.animalClase, "Caballo");
  assert.equal("animalUso" in r, false);
  assert.equal(r.animalId, "7");
});

test("mapEiacPol: RC con Animal → datosEspecificos con la raza, outcome ok", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosRiesgos: {
        Riesgo: {
          RiesgoRC: { Animal: { RazaAnimal: "Bóxer", FechaNacimiento: "2021-06-01" } },
        },
      },
    }),
  );
  assert.equal(r.tipoSeguro, "responsabilidad_civil");
  assert.equal(r.outcome, "ok");
  assert.deepEqual(planas(r.datosEspecificos), {
    animalRaza: "Bóxer",
    animalFechaNacimiento: "2021-06-01",
    anulacion: null,
  });
});

// --- extractCapitales: desglose de Riesgo.Capitales.Capital[] ---

test("extractDatosEspecificos: hogar con Capitales (array) → bien + importe por partida", () => {
  assert.deepEqual(
    extractDatosEspecificos({
      RiesgoHogar: {
        Capitales: {
          Capital: [
            { Bien: "Continente", Importe: "150000.00", ModalidadValoracion: "RV" },
            { Bien: "Contenido", Importe: "30000.50" },
          ],
        },
      },
    }),
    {
      capitales: [
        // `modalidad` cruda desde el 28/09/2026 (antes se tiraba).
        { bien: "Continente", importe: "150000.00", modalidad: "RV" },
        { bien: "Contenido", importe: "30000.50" },
      ],
    },
  );
});

test("extractDatosEspecificos: hogar con UN solo Capital (fast-xml-parser lo colapsa a objeto)", () => {
  assert.deepEqual(
    extractDatosEspecificos({
      RiesgoHogar: { Capitales: { Capital: { Bien: "Continente", Importe: "150000.00" } } },
    }),
    { capitales: [{ bien: "Continente", importe: "150000.00" }] },
  );
});

test("extractDatosEspecificos: RC con Capitales (gastos veterinarios) → se mapea igual que hogar", () => {
  assert.deepEqual(
    extractDatosEspecificos({
      RiesgoRC: { Capitales: { Capital: { Descripcion: "Gastos veterinarios", Importe: "3000.00" } } },
    }),
    { capitales: [{ descripcion: "Gastos veterinarios", importe: "3000.00" }] },
  );
});

test("extractDatosEspecificos: ModalidadValoracion NUNCA se mapea (código sin catálogo)", () => {
  const r = extractDatosEspecificos({
    RiesgoHogar: { Capitales: { Capital: { Bien: "Continente", Importe: "1", ModalidadValoracion: "RV" } } },
  }) as { capitales: Array<Record<string, unknown>> };
  assert.equal("modalidadValoracion" in r.capitales[0], false);
});

test("extractDatosEspecificos: un Capital sin Bien/Descripcion/Importe se descarta (no ensucia el array)", () => {
  assert.equal(
    extractDatosEspecificos({
      RiesgoHogar: { Capitales: { Capital: { ModalidadValoracion: "RV" } } },
    }),
    null,
  );
});

test("extractDatosEspecificos: sin Capitales → sin la clave (no un array vacío)", () => {
  assert.equal(extractDatosEspecificos({ RiesgoHogar: { Pais: "ESP" } }), null);
});

test("mapEiacPol: hogar con SituacionRiesgo + Capitales → los dos conviven en datosEspecificos", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosRiesgos: {
        Riesgo: {
          RiesgoHogar: {
            SituacionRiesgo: { NombreVia: "CL EJEMPLO 1", Poblacion: "SEVILLA" },
            Capitales: { Capital: { Bien: "Continente", Importe: "150000.00" } },
          },
        },
      },
    }),
  );
  assert.deepEqual(planas(r.datosEspecificos), {
    direccion: "CL EJEMPLO 1",
    direccionOrigen: "cima",
    localidad: "SEVILLA",
    capitales: [{ bien: "Continente", importe: "150000.00" }],
    anulacion: null,
  });
});

// --- 24/09/2026: lo que CIMA manda y el mapper descartaba. Formas copiadas de
// los ficheros POL reales del Portal CIMA (Mapfre, Allianz, Occident, Generali,
// Reale), con los valores personales quitados.

test("extractDatosPoliza: anulación (Mapfre) → fecha, motivo y detalle", () => {
  const r = extractDatosPoliza({
    DatosAnulacion: {
      FechaAnulacion: "2024-06-22T14:03:00",
      MotivoAnulacion: "IM",
      DetalleAnulacion: "0014-IMPAGO DEL RECIBO-INCORRIENTE",
    },
  });
  assert.deepEqual(r?.anulacion, { fecha: "2024-06-22", motivo: "IM", detalle: "0014-IMPAGO DEL RECIBO-INCORRIENTE" });
});

test("extractDatosPoliza: póliza reemplazada (Occident) → número, compañía y ramo", () => {
  const r = extractDatosPoliza({
    DatosPolizaReemplazada: {
      IdPoliza: "GPAED1700425",
      CodigoEntidad: { CodigoInterno: "5", CodigoDGS: "C0468" },
      DatosRamo: { RamoDGS: 241, RamoEntidad: 21, DescripcionRamo: "AUTOMATIC PLUS" },
    },
  });
  assert.deepEqual(r?.polizaReemplazada, {
    numero: "GPAED1700425",
    codigoDgs: "C0468",
    ramoDgs: "241",
    descripcionRamo: "AUTOMATIC PLUS",
    ramoEntidad: "21",
  });
});

test("extractDatosPoliza: suplementos (uno u varios) con fechas y clase", () => {
  const uno = {
    IdSuplemento: "10",
    Detalle: "Renovación Cartera",
    Fechas: { FechaEfectoActual: "2026-09-19T00:00:00", FechaEmision: "2026-08-01T00:00:00", FechaVencimiento: "2027-09-19T00:00:00" },
    Situacion: "AC",
    ClaseSuplemento: "RP",
    DescripcionClaseSuplemento: "Renovación Cartera",
  };
  const r = extractDatosPoliza({ Suplementos: { Suplemento: uno } });
  assert.deepEqual(r?.suplementos, [
    { id: "10", detalle: "Renovación Cartera", clase: "RP", descripcionClase: "Renovación Cartera", situacion: "AC", fechaEfecto: "2026-09-19", fechaEmision: "2026-08-01", fechaVencimiento: "2027-09-19" },
  ]);
  const dos = extractDatosPoliza({ Suplementos: { Suplemento: [uno, { ...uno, IdSuplemento: "11" }] } });
  assert.equal((dos?.suplementos as unknown[]).length, 2);
});

test("extractDatosPoliza: el detalle de un suplemento NO deja pasar una cuenta bancaria", () => {
  const r = extractDatosPoliza({
    Suplementos: { Suplemento: { IdSuplemento: "1", Detalle: "Se ha modificado la cuenta bancaria: Antigua cuenta ES12 3456 7890 1234 5678 9012 nueva 0049 1234 56 1234567890" } },
  });
  const detalle = (r?.suplementos as Array<{ detalle: string }>)[0].detalle;
  assert.ok(!/\d{5,}/.test(detalle.replace(/\s/g, "")), detalle);
  assert.match(detalle, /Se ha modificado la cuenta bancaria/);
});

test("extractDatosPoliza: otros datos de la póliza y de sus riesgos, sin repetir", () => {
  const dato = { IdDato: "Bonus-Malus R.C", DescripcionDato: "Nivel Bonus-Malus R.C", IdSubdato: "VALOR", ValorSubdato: 9 };
  const r = extractDatosPoliza(
    { OtrosDatos: { Dato: { IdDato: "MCA_REVOCACION", DescripcionDato: "REVOCACION CESION DE DATOS", ValorSubdato: "N" } } },
    [{ OtrosDatos: { Dato: [dato, dato] } }],
  );
  assert.deepEqual(r?.otrosDatos, [
    { id: "MCA_REVOCACION", descripcion: "REVOCACION CESION DE DATOS", valor: "N" },
    { id: "Bonus-Malus R.C", descripcion: "Nivel Bonus-Malus R.C", valor: "9" },
  ]);
});

test("extractDatosPoliza: póliza sin nada de esto → null", () => {
  assert.equal(extractDatosPoliza({ DatosPoliza: { IdPoliza: "X" } }), null);
  assert.equal(extractDatosPoliza(undefined), null);
});

test("anioDeAntiguedad: año suelto sí; fecha, edad o basura no", () => {
  const hoy = new Date("2026-09-24T00:00:00Z");
  assert.equal(anioDeAntiguedad("1930", hoy), 1930);
  assert.equal(anioDeAntiguedad(1994, hoy), 1994);
  assert.equal(anioDeAntiguedad("2018-02-01T00:00:00", hoy), null);
  assert.equal(anioDeAntiguedad("35", hoy), null);
  assert.equal(anioDeAntiguedad("9999", hoy), null);
  assert.equal(anioDeAntiguedad(undefined, hoy), null);
});

test("extractInmuebleExtra: comercio de Occident → año, clase, zona, actividad y protecciones", () => {
  const r = extractInmuebleExtra({
    RiesgoComercios: {
      SituacionRiesgo: { NombreVia: "x" },
      Antiguedad: 1930,
      Zona: "PO",
      Actividad: { DescripcionActividad: "Local alquilado para comercio de alimentación" },
      MedidasProteccion: { Proteccion: [{ DescripcionMedida: "Ventanas", ValorSubmedida: "Persianas" }, { NumeroOrden: "01", DescripcionMedida: "NO HAY ALARMA INSTALADA" }] },
    },
  });
  assert.deepEqual(r, {
    antiguedadCima: "1930",
    anioConstruccionCima: 1930,
    zona: "PO",
    actividad: "Local alquilado para comercio de alimentación",
    medidasProteccion: [{ medida: "Ventanas", valor: "Persianas" }, { medida: "NO HAY ALARMA INSTALADA" }],
  });
});

test("extractInmuebleExtra: hogar con fecha en Antiguedad → crudo sí, año no", () => {
  const r = extractInmuebleExtra({ RiesgoHogar: { Antiguedad: "2018-02-01T00:00:00", ClaseInmueble: "PP", UsoInmueble: "HA" } });
  assert.deepEqual(r, { antiguedadCima: "2018-02-01T00:00:00", claseInmueble: "PP", usoInmueble: "HA" });
});

test("extractEmbarcacion: quita el relleno de la compañía («.», 9999)", () => {
  const r = extractEmbarcacion({
    RiesgoEmbarcaciones: {
      Embarcacion: { Nombre: "Barco", Matricula: "7ª-XX", Marca: "Marca", Modelo: ".", AnyoConstruccion: 9999, Eslora: "9.00", PotenciaMotores: 158, PlazasAutorizadas: 5, PuertoBase: "Puerto" },
    },
  });
  assert.deepEqual(r, { embarcacion: { nombre: "Barco", matricula: "7ª-XX", marca: "Marca", eslora: "9.00", potencia: "158", plazas: "5", puertoBase: "Puerto" } });
});

test("taparNumerosLargos: tapa IBAN y tiradas de 8+ dígitos, deja fechas y números cortos", () => {
  assert.equal(taparNumerosLargos("Cuenta ES1234567890123456789012 ok"), "Cuenta [cuenta] ok");
  assert.equal(taparNumerosLargos("Nº 0014 del 2026"), "Nº 0014 del 2026");
  assert.match(taparNumerosLargos("cc 0049 1234 56 1234567890"), /^cc \[…\]$/);
});

test("mapEiacPol: la anulación y el año del inmueble llegan a datosEspecificos", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosAnulacion: { FechaAnulacion: "2026-04-30T00:00:00", MotivoAnulacion: "EX", DetalleAnulacion: "Anulación por vencimiento" },
      DatosRiesgos: { Riesgo: { RiesgoHogar: { Antiguedad: "1994", SuperficieConstruida: "76" } } },
    }),
  );
  assert.deepEqual(r.datosEspecificos?.anulacion, { fecha: "2026-04-30", motivo: "EX", detalle: "Anulación por vencimiento" });
  assert.equal(r.datosEspecificos?.anioConstruccionCima, 1994);
  assert.equal(r.datosEspecificos?.anioConstruccion, undefined);
  assert.equal(r.datosEspecificos?.metrosCuadrados, "76");
});

test("extractDatosPoliza: los «otros datos» de una persona no entran (documento, NIF, beneficiarios, hipoteca)", () => {
  const d = (IdDato: string, DescripcionDato: string) => ({ IdDato, DescripcionDato, ValorSubdato: "X" });
  const r = extractDatosPoliza({
    OtrosDatos: {
      Dato: [
        d("DOCUMENTO_TOMADOR", "DOCUMENTO TOMADOR"),
        d("NIF 2Aseg", "NIF 2ndo Asegurado"),
        d("Benef. Falle.", "Beneficiario Fallecimiento"),
        d("Ref_hipoteca", "Referencia de la hipoteca"),
        d("Anualidades", "Anualidades"),
      ],
    },
  });
  assert.deepEqual(r?.otrosDatos, [{ id: "Anualidades", descripcion: "Anualidades", valor: "X" }]);
});

test("taparNumerosLargos: documentos con puntos, NIE, teléfonos y correos", () => {
  const t = taparNumerosLargos("DNI 12.345.678-Z, NIE X1234567L, tlf 954.12.34.56, (954) 123 456, +34 600 11 22 33, a.b@c.es");
  assert.doesNotMatch(t, /12\.345|X1234567L|954|600 11|a\.b@c\.es/, t);
  assert.equal(taparNumerosLargos("Renovación anual 2026, 5 plazas"), "Renovación anual 2026, 5 plazas");
});

test("extractDatosPoliza: «TELÉFONO» con tilde no se cuela y BONIFICACIÓN sí entra (NIF con límites de palabra)", () => {
  const r = extractDatosPoliza({
    OtrosDatos: { Dato: [
      { IdDato: "TLF", DescripcionDato: "TELÉFONO CONTACTO", ValorSubdato: "x" },
      { IdDato: "BONIF", DescripcionDato: "BONIFICACIÓN", ValorSubdato: "10" },
    ] },
  });
  assert.deepEqual(r?.otrosDatos, [{ id: "BONIF", descripcion: "BONIFICACIÓN", valor: "10" }]);
});

test("extractDatosPoliza: en vida/decesos/salud/accidentes no se lee ningún «otro dato»", () => {
  const r = extractDatosPoliza(
    { OtrosDatos: { Dato: { IdDato: "Anualidades", DescripcionDato: "Anualidades", ValorSubdato: "3" } } },
    [{ RiesgoVida: {}, OtrosDatos: { Dato: { IdDato: "Fumador", DescripcionDato: "Fumador", ValorSubdato: "S" } } }],
  );
  assert.equal(r, null);
});

test("mapEiacPol: póliza en vigor sin DatosAnulacion manda anulacion:null (borra una anulación vieja)", () => {
  const r = mapEiacPol(baseAutoPol());
  assert.ok(r.datosEspecificos && "anulacion" in r.datosEspecificos);
  assert.equal(r.datosEspecificos?.anulacion, null);
});

// ── estadoPolizaDesdeEiac (26/09/2026: ES vencidas contaban como en vigor) ──
const HOY = "2026-09-26";

test("estadoPolizaDesdeEiac: código conocido manda (AN con vencimiento futuro sigue cancelada)", () => {
  assert.equal(estadoPolizaDesdeEiac({ estado: "cancelada", situacionConocida: true, fechaVencimiento: "2027-01-01", hoy: HOY }), "cancelada");
  assert.equal(estadoPolizaDesdeEiac({ estado: "activa", situacionConocida: true, fechaVencimiento: "2026-01-01", hoy: HOY }), "activa");
});

test("estadoPolizaDesdeEiac: código desconocido + vencimiento pasado → vencida (LOO-915)", () => {
  assert.equal(estadoPolizaDesdeEiac({ estado: null, situacionConocida: false, fechaVencimiento: "2013-01-27", hoy: HOY }), "vencida");
});

test("estadoPolizaDesdeEiac: ES + vencimiento pasado → vencida; futuro → null", () => {
  assert.equal(estadoPolizaDesdeEiac({ estado: null, situacionConocida: true, situacion: "ES", fechaVencimiento: "2013-01-27", hoy: HOY }), "vencida");
  assert.equal(estadoPolizaDesdeEiac({ estado: null, situacionConocida: true, situacion: "ES", fechaVencimiento: "2027-01-01", hoy: HOY }), null);
});

test("estadoPolizaDesdeEiac: PR (propuesta) con vencimiento pasado → NO vencida", () => {
  assert.equal(estadoPolizaDesdeEiac({ estado: null, situacionConocida: true, situacion: "PR", fechaVencimiento: "2013-01-27", hoy: HOY }), null);
});

test("estadoPolizaDesdeEiac: código desconocido + vence hoy o futuro → no toca", () => {
  assert.equal(estadoPolizaDesdeEiac({ estado: null, situacionConocida: false, fechaVencimiento: HOY, hoy: HOY }), null);
  assert.equal(estadoPolizaDesdeEiac({ estado: null, situacionConocida: false, fechaVencimiento: "2027-05-01", hoy: HOY }), null);
  assert.equal(estadoPolizaDesdeEiac({ estado: null, situacionConocida: false, fechaVencimiento: null, hoy: HOY }), null);
});

test("estadoPolizaDesdeEiac: SituacionPoliza vacía (conocida) + vencida → no toca", () => {
  assert.equal(estadoPolizaDesdeEiac({ estado: null, situacionConocida: true, fechaVencimiento: "2020-01-01", hoy: HOY }), null);
});

// ============================================================================
// 28/09/2026 — huecos de la auditoría de CIMA (póliza). Fixtures SINTÉTICOS:
// ningún valor de persona sale de un fichero real.
// ============================================================================

function datosDe(overrides: Partial<Record<string, unknown>>): Record<string, unknown> {
  return (mapEiacPol(baseAutoPol(overrides)).datosEspecificos ?? {}) as Record<string, unknown>;
}

test("cobro: gestión, forma de pago, IBAN (+4 últimos), BIC y titular distinto SIN la persona", () => {
  const d = datosDe({
    GestionCobro: {
      ClaseGestion: "CO",
      DatosFormaPago: {
        ClaseFormaPago: "CC",
        DatosCuentaCorriente: {
          IBAN: "ES00 0000 0000 0000 0000 1234",
          BIC: "XXXXESMMXXX",
          Titular: { PersonaFisica: { IdPersona: "99999999Z", Nombre: "TITULAR-FALSO" } },
        },
      },
    },
  });
  assert.equal(d.gestionCobro, "CO");
  assert.equal(d.formaPago, "CC");
  assert.equal(d.iban, "ES0000000000000000001234"); // en claro aquí; lo cifra el persist
  assert.equal(d.ibanUltimos4, "1234");
  assert.equal(d.bic, "XXXXESMMXXX");
  assert.equal(d.titularCuentaDistinto, true);
  // Del titular NO se guarda nada de la persona.
  const json = JSON.stringify(d);
  assert.ok(!json.includes("TITULAR-FALSO"));
  assert.ok(!json.includes("99999999Z"));
});

test("cobro: titular == tomador → titularCuentaDistinto false; sin NIF de titular → la clave no se escribe", () => {
  const igual = datosDe({
    GestionCobro: { DatosFormaPago: { DatosCuentaCorriente: { Titular: { PersonaFisica: { IdPersona: "00000001r" } } } } },
  });
  assert.equal(igual.titularCuentaDistinto, false);
  const sinNif = datosDe({
    GestionCobro: { DatosFormaPago: { DatosCuentaCorriente: { IBAN: "ES0000000000000000000000" } } },
  });
  assert.equal("titularCuentaDistinto" in sinNif, false);
});

test("fechas nuevas → fechasExtra; fechaEfectoInicial sigue siendo FechaEfectoInicial", () => {
  const r = mapEiacPol(
    baseAutoPol({
      Fechas: {
        FechaEfectoInicial: "2020-02-01T00:00:00",
        FechaVencimiento: "2027-02-01T00:00:00",
        FechaEmision: "2020-01-15T10:00:00",
        FechaEfectoActual: "2026-02-01T00:00:00",
        FechaSituacion: "2026-01-20T00:00:00",
        FechaSolicitud: "2020-01-10T00:00:00",
      },
    }),
  );
  assert.equal(r.fechaEfectoInicial, "2020-02-01");
  assert.deepEqual(r.fechasExtra, {
    emision: "2020-01-15",
    efectoActual: "2026-02-01",
    situacion: "2026-01-20",
    solicitud: "2020-01-10",
  });
});

test("contrato: duración, clase, mediador, producto, desglose, capital, comisiones", () => {
  const d = datosDe({
    DuracionPoliza: "RE",
    ClasePoliza: "CA",
    DatosPoliza: {
      IdPoliza: "P01",
      CodigoEntidad: { CodigoDGS: "C0058" },
      DatosRamo: {
        RamoDGS: "241",
        DescripcionRamo: "AUTOS",
        RamoEntidad: "200",
        ModalidadRamo: "M1",
        DescripcionModalidad: "TERCEROS AMPLIADO",
      },
      DatosMediador: { ClaseMediador: "CO", NombreMediador: "MEDIADOR X", IdMediador: { CodigoInterno: "M001" } },
    },
    DatosImportes: {
      Importes: {
        DatosCargos: { Cargo: [{ ClaseCargo: "IP", DescripcionCargo: "Impuesto", Importe: "10.50" }, { ClaseCargo: "CL", Importe: "1.20" }] },
      },
      ImportesDEC: { CapitalAseguradoAgregado: "0.00", ComisionAnualizada: "12.00" },
    },
    DatosComisiones: { Comision: { ClaseComision: "ME", ComisionBruta: "13.44" } },
  });
  assert.equal(d.duracion, "RE");
  assert.equal(d.clasePoliza, "CA");
  assert.deepEqual(d.mediador, { clase: "CO", codigoInterno: "M001", nombre: "MEDIADOR X" });
  assert.deepEqual(d.producto, {
    modalidad: "M1",
    descripcion: "TERCEROS AMPLIADO",
    ramoEntidad: "200",
    descripcionRamo: "AUTOS",
  });
  assert.deepEqual(d.desglosePrima, [
    { clase: "IP", descripcion: "Impuesto", importe: "10.50" },
    { clase: "CL", importe: "1.20" },
  ]);
  assert.equal(d.capitalAgregado, "0.00");
  assert.equal(d.comisionAnual, "12.00");
  assert.deepEqual(d.comisiones, [{ clase: "ME", bruta: "13.44" }]);
});

test("contrato: comercialización, origen, regularizable, suspensiones", () => {
  const d = datosDe({
    DatosComercializacion: { Comercializacion: { IdComercializacion: "PRO001", Clase: "CA", Descripcion: "Descuento" } },
    OrigenesContratacion: {
      OrigenContratacion: { NumeroOrden: "1", ClaseContratacion: "EM", DescripcionClase: "EMPLEADO", CodigoCentro: "C01" },
    },
    DatosRegularizacion: { PolizaRegularizable: "true" },
    DatosSuspensiones: { Suspension: [{ NumeroOrden: "1", FechaSuspension: "2019-07-17T00:00:00" }] },
  });
  assert.deepEqual(d.comercializacion, [{ id: "PRO001", clase: "CA", descripcion: "Descuento" }]);
  assert.deepEqual(d.origenContratacion, [
    { numeroOrden: "1", clase: "EM", descripcionClase: "EMPLEADO", codigoCentro: "C01" },
  ]);
  assert.equal(d.regularizable, true);
  assert.deepEqual(d.suspensiones, [{ numeroOrden: "1", fecha: "2019-07-17" }]);
});

test("moneda: EUR no se guarda; otra divisa → clave + review (no se leen dólares como euros)", () => {
  const eur = mapEiacPol(baseAutoPol({ DatosImportes: { Importes: { DatosMoneda: { Moneda: "EUR" } } } }));
  assert.equal(eur.outcome, "ok");
  assert.equal(eur.datosEspecificos?.moneda, undefined);
  const usd = mapEiacPol(baseAutoPol({ DatosImportes: { Importes: { DatosMoneda: { Moneda: "USD" } } } }));
  assert.equal(usd.outcome, "review");
  assert.ok(usd.reviewReasons.includes("moneda_no_eur:USD"));
  assert.equal(usd.datosEspecificos?.moneda, "USD");
});

test("L10: Occident trimestral SIN anualizada → prima null + primaAnualDudosa (NO ×4)", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosPoliza: { IdPoliza: "P01", CodigoEntidad: { CodigoDGS: "C0468" }, DatosRamo: { RamoDGS: "241" } },
      FraccionPago: "TR",
      DatosImportes: { Importes: { PrimaTotal: "190.29", PrimaNeta: "169.82" } },
    }),
  );
  assert.equal(r.primaBruta, null);
  assert.equal(r.primaAnual, null);
  assert.equal(r.datosEspecificos?.primaAnualDudosa, true);
  assert.equal(r.datosEspecificos?.primaTotalFichero, "190.29");
});

test("L10: Occident trimestral CON anualizada → la anualizada; pago único → la del periodo", () => {
  const tr = mapEiacPol(
    baseAutoPol({
      FraccionPago: "TR",
      DatosImportes: {
        Importes: { PrimaTotal: "190.29", PrimaNeta: "169.82" },
        ImportesDEC: { PrimaTotalAnualizada: "761.17", PrimaNetaAnualizada: "679.31" },
      },
    }),
  );
  assert.equal(tr.primaBruta, "761.17");
  assert.equal(tr.primaAnual, "679.31");
  assert.equal(tr.datosEspecificos?.primaAnualDudosa, false);
  const un = mapEiacPol(
    baseAutoPol({
      // Occident (fuera de la lista medida): solo vale la del periodo por ser pago ÚNICO.
      DatosPoliza: { IdPoliza: "P01", CodigoEntidad: { CodigoDGS: "C0468" }, DatosRamo: { RamoDGS: "241" } },
      FraccionPago: "UN",
      DatosImportes: { Importes: { PrimaTotal: "137.90", PrimaNeta: "127.51" } },
    }),
  );
  assert.equal(un.primaBruta, "137.90");
  assert.equal(un.primaAnual, "127.51");
});

test("L1: TODOS los riesgos en `riesgos[]`, claves planas del primero intactas; descripción sin dirección", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosRiesgos: {
        Riesgo: [
          {
            IdRiesgo: "R1",
            NumeroOrden: "1",
            DescripcionRiesgo: "Piso-CL CALLE FALSA, 1, 2º-41003-SEVILLA",
            FechaInicio: "2026-01-01T00:00:00",
            RiesgoHogar: { SituacionRiesgo: { NombreVia: "CALLE FALSA 1", CodigoPostal: "41003" } },
          },
          {
            NumeroOrden: "2",
            DescripcionRiesgo: "CL OTRA CALLE 5 SEVILLA",
            RiesgoHogar: { SituacionRiesgo: { NombreVia: "OTRA CALLE 5", CodigoPostal: "41004" } },
            Beneficiarios: { Beneficiario: { Orden: "1", DescripcionBeneficiario: "1", Prestamo: { DescripcionPrestamo: "HIPOTECARIO" } } },
          },
        ],
      },
    }),
  );
  const d = r.datosEspecificos as Record<string, unknown>;
  // Planas = primer riesgo (compatibilidad con central).
  assert.equal(d.cp, "41003");
  assert.equal(d.direccion, "CALLE FALSA 1");
  const riesgos = d.riesgos as Array<Record<string, unknown>>;
  assert.equal(riesgos.length, 2);
  assert.equal(riesgos[0].id, "R1");
  assert.equal(riesgos[0].inicio, "2026-01-01");
  assert.equal(riesgos[0].descripcion, "Piso"); // la calle NO
  assert.equal(riesgos[1].cp, "41004");
  assert.equal(riesgos[1].direccion, "OTRA CALLE 5"); // en claro aquí; la cifra el persist
  assert.equal("descripcion" in riesgos[1], false); // «CL …» sin tipo delante → fuera
  assert.deepEqual(d.beneficiarios, [{ orden: "1", descripcion: "1", prestamo: "HIPOTECARIO" }]);
});

test("L1: la descripción de una RC con la dirección metida se corta en el tipo de vía", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosRiesgos: {
        Riesgo: {
          DescripcionRiesgo: "Caseta de feria temporal-C/ Calle Falsa, 12 ,  -41007-Sevilla",
          RiesgoRC: { Actividad: { DescripcionActividad: "Casetas" } },
        },
      },
    }),
  );
  const riesgos = r.datosEspecificos?.riesgos as Array<Record<string, unknown>>;
  assert.equal(riesgos[0].descripcion, "Caseta de feria temporal");
});

test("L9: vehículo completo (bastidor, versión, potencia… remolque booleano)", () => {
  const d = datosDe({
    DatosRiesgos: {
      Riesgo: {
        RiesgoAutos: {
          Vehiculo: {
            Matricula: "0000AAA",
            Bastidor: "VINFALSO000000001",
            Version: "1.0 TSI",
            Potencia: "95",
            Combustible: "GA",
            FechaMatriculacion: "2018-02-01T00:00:00",
            Plazas: "5",
            PMA: "1500",
            UsoVehiculo: "PA",
            Valor: "18000",
            Antiguedad: "2018-02-01T00:00:00",
            Remolque: "false",
          },
        },
      },
    },
  });
  assert.equal(d.bastidor, "VINFALSO000000001");
  assert.equal(d.version, "1.0 TSI");
  assert.equal(d.potencia, "95");
  assert.equal(d.combustible, "GA");
  assert.equal(d.fechaMatriculacion, "2018-02-01");
  assert.equal(d.plazas, "5");
  assert.equal(d.pma, "1500");
  assert.equal(d.usoVehiculo, "PA");
  assert.equal(d.valorVehiculo, "18000");
  assert.equal(d.antiguedad, "2018-02-01T00:00:00");
  assert.equal(d.remolque, false);
});

test("L3/L10: comercio → metrosCuadrados; embarcación → lista; accidentes → convenio", () => {
  assert.equal(
    (extractDatosEspecificos({ RiesgoComercios: { SuperficieConstruida: "147.00" } }) as Record<string, unknown>)
      .metrosCuadrados,
    "147.00",
  );
  assert.deepEqual(
    extractEmbarcacion({ RiesgoEmbarcaciones: { Embarcacion: { Matricula: "7AM", ListaMatricula: "7" } } }),
    { embarcacion: { matricula: "7AM", lista: "7" } },
  );
  // El código del convenio es una tirada larga de dígitos: NO se tapa (no es una cuenta).
  assert.equal(
    (extractDatosEspecificos({ RiesgoAccidentes: { Convenio: "4100000000000" } }) as Record<string, unknown>).convenio,
    "4100000000000",
  );
});

test("L6: RiesgoVida/RiesgoDecesos.Persona → interviniente asegurado", () => {
  const out = extractIntervinientes(
    undefined,
    [
      { RiesgoVida: { Persona: { TipoIdentificacion: "NI", IdPersona: "12345678Z", Nombre: "VIDA", Apellido1: "UNO" } } },
      { RiesgoDecesos: { Persona: [{ IdPersona: "87654321X", Nombre: "DECE" }] } },
    ],
    "00000001R",
  );
  assert.deepEqual(
    out.map((i) => [i.rol, i.nif]),
    [
      ["asegurado", "12345678Z"],
      ["asegurado", "87654321X"],
    ],
  );
});

test("beneficiario PERSONA → interviniente beneficiario (y su descripción no va en claro)", () => {
  const riesgo: ParsedRiesgo = {
    RiesgoVida: {},
    Beneficiarios: {
      Beneficiario: {
        Orden: "1",
        DescripcionBeneficiario: "NOMBRE-FALSO",
        PersonaFisica: { IdPersona: "11111111H", Nombre: "BENE" },
      },
    },
  };
  const out = extractIntervinientes(undefined, [riesgo]);
  assert.equal(out.find((i) => i.rol === "beneficiario")?.nif, "11111111H");
  const r = mapEiacPol(baseAutoPol({ DatosRiesgos: { Riesgo: riesgo } }));
  assert.ok(!JSON.stringify(r.datosEspecificos).includes("NOMBRE-FALSO"));
});

test("L14: contacto del tomador (física) → tomadorContacto; idCliente → datos_especificos", () => {
  const r = mapEiacPol(
    baseAutoPol({
      Tomador: {
        PersonaFisica: {
          TipoIdentificacion: "NI",
          IdPersona: "00000001R",
          Nombre: "Nombre",
          Apellido1: "Apellido",
          IdCliente: "C-777",
          FechaNacimiento: "1980-05-01T00:00:00",
          EstadoCivil: "CA",
          Profesion: { Descripcion: "NO DISPONIBLE" },
          Domicilio: { NombreVia: "CALLE FALSA 1", OtrosDatosVia: "2B", CodigoPostal: "41003", Poblacion: "SEVILLA", Provincia: "41" },
          DatosContacto: {
            Telefonos: { Telefono: { Numero: "600000000" } },
            Emails: { Email: [{ Direccion: "falso@example.com" }] },
          },
        },
      },
    }),
  );
  assert.deepEqual(r.tomadorContacto, {
    direccion: "CALLE FALSA 1 2B",
    codigoPostal: "41003",
    ciudad: "SEVILLA",
    provincia: "Sevilla",
    telefono: "600000000",
    email: "falso@example.com",
    fechaNacimiento: "1980-05-01",
    estadoCivil: "Casado/a",
    ocupacion: null, // «NO DISPONIBLE» es relleno
    sector: null,
  });
  assert.equal(r.datosEspecificos?.idClienteCompania, "C-777");
  // 04/10/2026 — el contacto va SOLO en `figuras` (que el persist cifra), en ninguna
  // otra clave del jsonb. Cifrado: figuras-cima.test.ts.
  const { figuras, ...resto } = r.datosEspecificos ?? {};
  assert.ok(!JSON.stringify(resto).includes("falso@example.com"));
  assert.ok(JSON.stringify(figuras).includes("falso@example.com"));
});

test("L14: tomador jurídico → sector (Actividad) y sin fecha de nacimiento", () => {
  const r = mapEiacPol(
    baseAutoPol({
      Tomador: {
        PersonaJuridica: {
          IdPersona: "B00000000",
          RazonSocial: "EMPRESA FALSA SL",
          Actividad: { DescripcionActividad: "Comercio al por mayor" },
          Domicilio: { CodigoPostal: "08001", Provincia: "8" },
        },
      },
    }),
  );
  assert.equal(r.tomadorContacto?.sector, "Comercio al por mayor");
  assert.equal(r.tomadorContacto?.fechaNacimiento, null);
  assert.equal(r.tomadorContacto?.provincia, "Barcelona");
});

test("L2: franquicia desde DatosFranquicias.Franquicia[] (la primera); el resto sigue en datosExtra", () => {
  const [c] = extractCoberturas([
    {
      DatosCoberturas: {
        Cobertura: {
          IdCobertura: "X",
          DatosFranquicias: {
            Franquicia: [
              { NumeroOrden: "1", ClaseFranquicia: "PS", ValorExacto: "300.00" },
              { NumeroOrden: "2", ClaseFranquicia: "PS", Porcentaje: "10", ValorMinimo: "150", ValorMaximo: "600" },
            ],
          },
        },
      },
    },
  ]);
  assert.equal(c.franquicia, "300.00");
  assert.ok(c.datosExtra?.DatosFranquicias);
  const [p] = extractCoberturas([
    { DatosCoberturas: { Cobertura: { DatosFranquicias: { Franquicia: { Porcentaje: "10", ValorMinimo: "150", ValorMaximo: "600" } } } } },
  ]);
  assert.equal(p.franquicia, "10% (mín. 150, máx. 600)");
});

test("L10: Mapfre (C0058) fraccionada sin anualizada → PrimaTotal ES la anual (medido con recibos)", () => {
  const r = mapEiacPol(
    baseAutoPol({
      FraccionPago: "SE",
      DatosImportes: { Importes: { PrimaTotal: "593.80", PrimaNeta: "539.24" } },
    }),
  );
  assert.equal(r.codigoEntidadDgs, "C0058");
  assert.equal(r.primaBruta, "593.80");
  assert.equal(r.primaAnual, "539.24");
  assert.equal(r.datosEspecificos?.primaAnualDudosa, false);
  assert.equal(r.datosEspecificos?.primaTotalFichero, undefined);
});

test("L10: Generali (C0072) trimestral sin anualizada → PrimaTotal ES la anual", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosPoliza: { IdPoliza: "P01", CodigoEntidad: { CodigoDGS: "C0072" }, DatosRamo: { RamoDGS: "241" } },
      FraccionPago: "TR",
      DatosImportes: { Importes: { PrimaTotal: "912.24", PrimaNeta: "787.44" } },
    }),
  );
  assert.equal(r.primaBruta, "912.24");
  assert.equal(r.datosEspecificos?.primaAnualDudosa, false);
});

// --- 30/09/2026 — OtrosRiesgos (bloque genérico EIAC; Allianz C0109, POL 131) ---
// Antes: tipo_seguro_no_clasificable + riesgo_sin_bloque → fichero entero en cuarentena.
function polAllianzOtrosRiesgos(riesgo: Record<string, unknown>): ParsedEiacPol {
  return baseAutoPol({
    DatosPoliza: {
      IdPoliza: "P01",
      CodigoEntidad: { CodigoDGS: "C0109" },
      DatosRamo: { RamoDGS: "241", DescripcionRamo: "ALLIANZ" },
    },
    DatosRiesgos: { Riesgo: riesgo },
  });
}

test("mapEiacPol: Riesgo solo con OtrosRiesgos (Allianz C0109) → otros, sin review", () => {
  const r = mapEiacPol(
    polAllianzOtrosRiesgos({
      NumeroOrden: "1",
      OtrosRiesgos: { NombreRiesgo: "Otros", DescripcionRiesgo: "Riesgo genérico" },
    }),
  );
  assert.equal(r.tipoSeguro, "auto"); // ramo 241 (03/10/2026)
  assert.deepEqual(
    r.reviewReasons.filter((x) => x === "tipo_seguro_no_clasificable" || x.startsWith("riesgo_")),
    [],
  );
  assert.equal(r.outcome, "ok");
});

test("mapEiacPol: OtrosRiesgos conserva nombre/descripción en datos_especificos", () => {
  const d = extractDatosEspecificos({
    OtrosRiesgos: { NombreRiesgo: "Otros", DescripcionRiesgo: "Riesgo genérico" },
  });
  assert.equal(d?.nombreRiesgo, "Otros");
  assert.equal(d?.descripcionRiesgo, "Riesgo genérico");
});

test("mapEiacPol: hijo-objeto desconocido de <Riesgo> → riesgo_no_reconocido:<Nombre>", () => {
  const r = mapEiacPol(polAllianzOtrosRiesgos({ NumeroOrden: "1", BloqueRaro: { x: 1 } }));
  assert.ok(r.reviewReasons.includes("tipo_seguro_no_clasificable"));
  assert.ok(r.reviewReasons.includes("riesgo_no_reconocido:BloqueRaro"));
  assert.ok(!r.reviewReasons.includes("riesgo_sin_bloque"));
});

test("mapEiacPol: Riesgo sin ningún hijo-objeto → riesgo_sin_bloque (y no inventa bloque)", () => {
  const r = mapEiacPol(
    polAllianzOtrosRiesgos({ NumeroOrden: "1", DescripcionRiesgo: "x", OtrasFiguras: {} }),
  );
  assert.ok(r.reviewReasons.includes("riesgo_sin_bloque"));
});

test("classifyTipoSeguro: RiesgoAutos gana a OtrosRiesgos si vienen ambos", () => {
  assert.equal(
    classifyTipoSeguro({
      OtrosRiesgos: { NombreRiesgo: "Otros" },
      RiesgoAutos: { Vehiculo: { ClaseVehiculo: "AU" } },
    }),
    "auto",
  );
});

// Generali (C0072) manda `OtrosDatos` (metadatos) como hijo-objeto de <Riesgo>:
// no es un bloque de riesgo y no debe nombrarse como no reconocido.
test("OtrosDatos (Generali C0072) junto a RiesgoHogar → hogar, sin riesgo_no_reconocido", () => {
  const riesgo = { RiesgoHogar: { Situacion: {} }, OtrosDatos: { Dato: "x" } };
  assert.deepEqual(unrecognizedRiesgoBlocks(riesgo), []);
  assert.deepEqual(unrecognizedRiesgoBlocks({ OtrosDatos: { Dato: "x" } }), []);
  const r = mapEiacPol(baseAutoPol({ DatosRiesgos: { Riesgo: riesgo } }));
  assert.equal(r.tipoSeguro, "hogar");
  assert.ok(!r.reviewReasons.some((x) => x.startsWith("riesgo_no_reconocido")));
});

test("OtrosRiesgos: DescripcionRiesgo enmascara números largos y corta en la vía", () => {
  const d = extractDatosEspecificos({
    OtrosRiesgos: {
      NombreRiesgo: "Otros 612345678",
      DescripcionRiesgo: "Local 612345678 NIF 12345678Z CL Mayor 3",
    },
  });
  const t = `${d?.nombreRiesgo} ${d?.descripcionRiesgo}`;
  assert.ok(!/\d{8}/.test(t), t);
  assert.ok(!/Mayor/.test(t), t);
  assert.ok(String(d?.descripcionRiesgo).startsWith("Local"));
});

// --- 03/10/2026 — fechas de cajón → null ---
test("toIsoDate: 1900-01-01 y 9999-12-31 son relleno → null", () => {
  assert.equal(toIsoDate("1900-01-01T00:00:00"), null);
  assert.equal(toIsoDate("9999-12-31T00:00:00"), null);
  assert.equal(toIsoDate("2026-09-29T00:00:00"), "2026-09-29");
});

test("mapEiacPol: FechaVencimiento 2000-01-01 (cajón) → fechaVencimiento null + review", () => {
  const r = mapEiacPol(baseAutoPol({ Fechas: { FechaEfectoInicial: "2026-09-29T00:00:00", FechaVencimiento: "2000-01-01T00:00:00" } }));
  assert.equal(r.fechaVencimiento, null);
  assert.ok(r.reviewReasons.includes("falta_fecha_vencimiento"));
});

// --- 03/10/2026 — OtrosRiesgos + ramo DGS ---
test("OtrosRiesgos + ramo 241 → auto; 2151 hogar; 282 RC; 2171 comercio; 211 accidentes; 2161 comunidades", () => {
  const otros = { NumeroOrden: "1", OtrosRiesgos: { NombreRiesgo: "Otros" } };
  const casos: Array<[string, string]> = [["241", "auto"], ["2151", "hogar"], ["282", "responsabilidad_civil"], ["2171", "comercio"], ["211", "accidentes"], ["2161", "comunidades"]];
  for (const [ramo, esperado] of casos) {
    assert.equal(classifyTipoSeguro(otros as ParsedRiesgo, ramo), esperado, ramo);
  }
});

test("OtrosRiesgos + ramo desconocido/ausente → otros; bloque específico gana al ramo", () => {
  const otros = { NumeroOrden: "1", OtrosRiesgos: { NombreRiesgo: "Otros" } } as ParsedRiesgo;
  assert.equal(classifyTipoSeguro(otros, "9999"), "otros");
  assert.equal(classifyTipoSeguro(otros, null), "otros");
  assert.equal(classifyTipoSeguro({ RiesgoHogar: {}, OtrosRiesgos: {} } as ParsedRiesgo, "241"), "hogar");
});

test("mapEiacPol: Allianz OtrosRiesgos con RamoDGS 241 → tipoSeguro auto", () => {
  const r = mapEiacPol(polAllianzOtrosRiesgos({ NumeroOrden: "1", OtrosRiesgos: { NombreRiesgo: "Otros" } }));
  assert.equal(r.tipoSeguro, "auto");
});

test("mapEiacPol: PR + vencimiento 2000-01-01 → sin review, vencimiento null", () => {
  const r = mapEiacPol(baseAutoPol({ SituacionPoliza: "PR", Fechas: { FechaEfectoInicial: "2026-09-29T00:00:00", FechaVencimiento: "2000-01-01T00:00:00" } }));
  assert.equal(r.fechaVencimiento, null);
  assert.ok(!r.reviewReasons.includes("falta_fecha_vencimiento"));
  assert.equal(r.estado, null);
});

// --- 03/10/2026: huecos del lote 3 (suplemento, reemplazada, permiso, superficie, actividad, moneda) ---

test("lote 3 POL: suplemento guarda fechaEfectoInicial, fechaSituacion y numeroSuplemento; placeholders → omitidos", () => {
  const r = extractDatosPoliza({
    Suplementos: {
      Suplemento: [
        {
          IdSuplemento: "10",
          NumeroSuplemento: "3",
          Fechas: { FechaEfectoInicial: "2024-03-01T00:00:00", FechaSituacion: "2024-03-02T00:00:00" },
        },
        { IdSuplemento: "11", Fechas: { FechaEfectoInicial: "1900-01-01T00:00:00", FechaSituacion: "9999-12-31T00:00:00" } },
      ],
    },
  });
  const [uno, dos] = r?.suplementos as Array<Record<string, string>>;
  assert.equal(uno.fechaEfectoInicial, "2024-03-01");
  assert.equal(uno.fechaSituacion, "2024-03-02");
  assert.equal(uno.numeroSuplemento, "3");
  assert.deepEqual(dos, { id: "11" }, "placeholders y ausentes → clave omitida, nunca ''");
});

test("lote 3 POL: póliza reemplazada guarda ramo/modalidad de la entidad, suplemento y mediador", () => {
  const r = extractDatosPoliza({
    DatosPolizaReemplazada: {
      IdPoliza: "REEMP-1",
      NumeroSuplemento: "2",
      CodigoEntidad: { CodigoDGS: "C0468" },
      DatosRamo: { RamoDGS: "241", RamoEntidad: "21", ModalidadRamo: "M7", DescripcionModalidad: "TODO RIESGO" },
      DatosMediador: { ClaseMediador: "CO", NombreMediador: "CORREDURIA X", IdMediador: { CodigoDGS: "J0001", CodigoInterno: "77" } },
    },
  });
  assert.deepEqual(r?.polizaReemplazada, {
    numero: "REEMP-1",
    codigoDgs: "C0468",
    ramoDgs: "241",
    ramoEntidad: "21",
    modalidad: "M7",
    descripcionModalidad: "TODO RIESGO",
    numeroSuplemento: "2",
    mediador: { clase: "CO", codigoDgs: "J0001", codigoInterno: "77" },
  });
});

test("lote 3 POL: NumeroSuplemento de la póliza y DatosMoneda (tipoCambio/fechaCambio) en el contrato", () => {
  const r = mapEiacPol(
    baseAutoPol({
      DatosPoliza: {
        IdPoliza: "P01",
        NumeroSuplemento: "4",
        CodigoEntidad: { CodigoDGS: "C0058" },
        DatosRamo: { RamoDGS: "241" },
      },
      DatosImportes: {
        Importes: { PrimaTotal: "100.00", DatosMoneda: { Moneda: "USD", TipoCambio: "1.0856", FechaCambio: "2024-05-01T00:00:00" } },
      },
    }),
  );
  assert.equal(r.datosEspecificos?.numeroSuplemento, "4");
  assert.equal(r.datosEspecificos?.moneda, "USD");
  assert.equal(r.datosEspecificos?.tipoCambio, "1.0856", "ratio sin redondear a 2 decimales");
  assert.equal(r.datosEspecificos?.fechaCambio, "2024-05-01");
});

test("lote 3 POL: sin NumeroSuplemento ni DatosMoneda → claves omitidas; TipoCambio basura no se guarda", () => {
  const r = mapEiacPol(baseAutoPol());
  assert.ok(r.datosEspecificos == null || !("numeroSuplemento" in r.datosEspecificos));
  assert.ok(r.datosEspecificos == null || !("tipoCambio" in r.datosEspecificos));
  const basura = mapEiacPol(
    baseAutoPol({
      DatosImportes: { Importes: { DatosMoneda: { Moneda: "EUR", TipoCambio: "abc", FechaCambio: "1900-01-01T00:00:00" } } },
    }),
  );
  assert.ok(basura.datosEspecificos == null || !("tipoCambio" in basura.datosEspecificos));
  assert.ok(basura.datosEspecificos == null || !("fechaCambio" in basura.datosEspecificos));
});

test("lote 3 POL: Conductor.TipoPermiso → datos_especificos.conductores[] (sin persona ni fecha)", () => {
  const r = extractDatosEspecificos({
    RiesgoAutos: {
      Vehiculo: { Matricula: "0000AAA" },
      Conductores: {
        Conductor: [
          { ClaseConductor: "OC", TipoPermiso: "A2", FechaPermiso: "2001-01-01T00:00:00", DatosConductor: { Nombre: "Fulano" } },
          { TipoPermiso: "B" },
          { DatosConductor: { Nombre: "Sin permiso" } },
        ],
      },
    },
  });
  assert.deepEqual(r?.conductores, [
    { clase: "OC", tipoPermiso: "A2" },
    { clase: "HA", tipoPermiso: "B" },
  ]);
  assert.ok(!JSON.stringify(r).includes("Fulano") && !JSON.stringify(r).includes("2001-01-01"));
});

test("lote 3 POL: SuperficieTotal en hogar, comercios y comunidades (aparte de metrosCuadrados)", () => {
  for (const bloque of ["RiesgoHogar", "RiesgoComercios", "RiesgoComunidades"] as const) {
    const r = extractDatosEspecificos({ [bloque]: { SuperficieConstruida: "80", SuperficieTotal: "250" } });
    assert.equal(r?.metrosCuadrados, "80", bloque);
    assert.equal(r?.superficieTotal, "250", bloque);
  }
  const sin = extractDatosEspecificos({ RiesgoHogar: { SuperficieConstruida: "80" } });
  assert.ok(!("superficieTotal" in (sin ?? {})), "ausente → clave omitida");
});

test("lote 3 POL: Tomador.PersonaJuridica.Actividad.IdActividad → idActividadTomador; sin él, omitida", () => {
  const con = mapEiacPol(
    baseAutoPol({
      Tomador: {
        PersonaJuridica: { TipoIdentificacion: "CI", IdPersona: "B00000000", RazonSocial: "EMPRESA SA", Actividad: { IdActividad: "4711" } },
      },
    }),
  );
  assert.equal(con.datosEspecificos?.idActividadTomador, "4711");
  const sin = mapEiacPol(
    baseAutoPol({
      Tomador: { PersonaJuridica: { TipoIdentificacion: "CI", IdPersona: "B00000000", RazonSocial: "EMPRESA SA" } },
    }),
  );
  assert.ok(sin.datosEspecificos == null || !("idActividadTomador" in sin.datosEspecificos));
});
