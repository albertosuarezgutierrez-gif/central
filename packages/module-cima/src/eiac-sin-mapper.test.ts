import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyClaseFigura,
  mapEiacSinAll,
  mapSiniestroEstado,
  type ParsedEiacSin,
  type ParsedFigura,
} from "./eiac-sin-mapper.ts";

// --- fixtures (datos SINTÉTICOS, nunca PII real). Estructura anclada al probe
//     real LOO-750 (Objetos.Siniestro, EIAC 6.0 Allianz C0109). ---
function figura(over: Partial<ParsedFigura> = {}): ParsedFigura {
  return {
    NumeroOrden: "1",
    ClaseFigura: "AD",
    DatosFigura: {
      PersonaFisica: {
        Nombre: "Nombre",
        Apellido1: "Apellido",
        Telefono: "600000000",
      },
    },
    ...over,
  };
}

function baseSin(
  dsOver: Record<string, unknown> = {},
  figuras: ParsedFigura | ParsedFigura[] = figura(),
): ParsedEiacSin {
  return {
    Objetos: {
      Siniestro: {
        DatosPoliza: {
          IdPoliza: "POL123456",
          CodigoEntidad: { CodigoDGS: "C0109" },
        },
        DatosSiniestro: {
          IdSiniestroEntidad: "SIN000001",
          FechaOcurrencia: "2026-03-01T00:00:00",
          PosicionSiniestro: "IN",
          SituacionesSiniestro: {
            Situacion: { SituacionSiniestro: "AP", DescripcionSituacion: "Aperturado" },
          },
          DescripcionSiniestro: "Colisión por alcance",
          TipologiaSiniestro: "17",
          LugarSiniestro: {
            NombreVia: "Calle Falsa",
            CodigoPostal: "41701",
            Poblacion: "Dos Hermanas",
            Provincia: "41",
            Pais: "ESP",
          },
          FigurasSiniestro: { Figura: figuras },
          ...dsOver,
        },
      },
    },
  };
}

// --- cabecera + mapeo básico ---
test("mapEiacSinAll: cabecera real → campos mapeados, outcome ok", () => {
  const [m] = mapEiacSinAll(baseSin());
  assert.equal(m.outcome, "ok");
  assert.equal(m.idSiniestroEntidad, "SIN000001");
  assert.equal(m.codigoEntidadDgs, "C0109");
  assert.equal(m.idPolizaEntidad, "POL123456");
  assert.equal(m.fechaOcurrencia, "2026-03-01");
  assert.equal(m.estado, "abierto"); // SituacionSiniestro AP → abierto
  assert.equal(m.tipo, "17");
  assert.equal(m.lugarDireccion, "Calle Falsa");
  assert.equal(m.lugarCp, "41701");
  assert.equal(m.comentario, "Colisión por alcance");
  assert.equal(m.figuras.length, 1);
  assert.equal(m.figuras[0].kind, "contrario"); // AD
  assert.equal(m.figuras[0].nombre, "Nombre Apellido");
  assert.equal(m.figuras[0].telefono, "600000000");
});

// --- gating: sin FechaOcurrencia → review (D8) ---
test("mapEiacSinAll: sin FechaOcurrencia → review + razón", () => {
  const [m] = mapEiacSinAll(baseSin({ FechaOcurrencia: undefined }));
  assert.equal(m.outcome, "review");
  assert.ok(m.reviewReasons.includes("falta_fecha_ocurrencia"));
  assert.equal(m.fechaOcurrencia, null);
});

// --- multi-figura: contrario + testigo + lesionado ---
test("mapEiacSinAll: multi-figura clasificada por ClaseFigura", () => {
  const [m] = mapEiacSinAll(
    baseSin({}, [
      figura({ ClaseFigura: "AD" }),
      figura({
        ClaseFigura: "TE",
        DatosFigura: { PersonaFisica: { Nombre: "Testigo", Telefono: "611111111" } },
      }),
      figura({
        ClaseFigura: "LE",
        IbaEnVehiculoAsegurado: "S",
        DatosFigura: { PersonaFisica: { Nombre: "Lesionado" } },
      }),
    ]),
  );
  assert.equal(m.outcome, "ok");
  assert.equal(m.figuras.length, 3);
  assert.deepEqual(
    m.figuras.map((f) => f.kind),
    ["contrario", "testigo", "lesionado"],
  );
  const lesionado = m.figuras[2];
  assert.equal(lesionado.ibaEnCocheCliente, true);
});

// --- contrario con vehículo: matricula(PII) + marcaModelo claro ---
test("mapEiacSinAll: contrario con vehículo → matricula + marcaModelo + esConductor", () => {
  const [m] = mapEiacSinAll(
    baseSin({}, [
      figura({
        ClaseFigura: "AD",
        EsConductor: "S",
        DatosFigura: {
          PersonaFisica: { Nombre: "Contrario" },
          Vehiculo: { Matricula: "1234ABC", Marca: "SEAT", Modelo: "Ibiza" },
        },
      }),
    ]),
  );
  const c = m.figuras[0];
  assert.equal(c.kind, "contrario");
  assert.equal(c.matricula, "1234ABC");
  assert.equal(c.marcaModelo, "SEAT Ibiza");
  // La compañía/póliza NO viven en la Figura (auditoría 28/09): ver Contrarios.
  assert.equal(c.compania, null);
  assert.equal(c.numeroPoliza, null);
  assert.equal(c.esConductor, true);
});

// --- ClaseFigura desconocido → contrario genérico + review ---
test("mapEiacSinAll: ClaseFigura desconocido → contrario + review", () => {
  const [m] = mapEiacSinAll(
    baseSin({}, [figura({ ClaseFigura: "XX" })]),
  );
  assert.equal(m.figuras[0].kind, "contrario");
  assert.equal(m.figuras[0].claseFiguraRaw, "XX");
  assert.equal(m.outcome, "review");
  assert.ok(m.reviewReasons.includes("clase_figura_desconocida"));
});

// --- Art.9: lesionado con DETALLE de persona → review_salud (precedencia) ---
test("mapEiacSinAll: Asegurado.Lesionados con detalle persona → review_salud", () => {
  const [m] = mapEiacSinAll(
    baseSin({
      Asegurado: {
        Lesionados: {
          Numero: "1",
          Lesionado: { Nombre: "Herido", GradoLesion: "leve" },
        },
      },
    }),
  );
  assert.equal(m.outcome, "review_salud");
  assert.ok(m.reviewReasons.includes("lesionado_detalle_art9"));
});

// --- Art.9: solo conteo Numero (sin detalle) → NO es salud, pero se preserva (M1) ---
test("mapEiacSinAll: Asegurado.Lesionados solo Numero (conteo) → no review_salud, numeroLesionados capturado", () => {
  const [m] = mapEiacSinAll(baseSin({ Asegurado: { Lesionados: { Numero: "2" } } }));
  assert.equal(m.outcome, "ok");
  assert.ok(!m.reviewReasons.includes("lesionado_detalle_art9"));
  assert.equal(m.numeroLesionados, 2); // M1: señal preservada
});

// --- M1: numeroLesionados suma sobre bloques; 0 si no hay ---
test("mapEiacSinAll: numeroLesionados suma bloques Lesionados; default 0", () => {
  const [sin] = mapEiacSinAll(baseSin());
  assert.equal(sin.numeroLesionados, 0); // baseSin no trae lesionados
  const [multi] = mapEiacSinAll(
    baseSin({
      Asegurado: { Lesionados: [{ Numero: "1" }, { Numero: "3" }] },
    }),
  );
  assert.equal(multi.numeroLesionados, 4);
});

// --- daños (20/09/2026): DanosSiniestro/DanoSiniestro, sin catálogo que traducir ---
test("mapEiacSinAll: sin ImplicadoDiversos → danos vacío", () => {
  const [m] = mapEiacSinAll(baseSin());
  assert.deepEqual(m.danos, []);
});

test("mapEiacSinAll: un daño → descripcion + valor decimal", () => {
  const [m] = mapEiacSinAll(
    baseSin({
      Asegurado: {
        ImplicadoDiversos: {
          DanosSiniestro: {
            DanoSiniestro: {
              NumeroOrden: "1",
              DescripcionDano: "Rotura de parachoques delantero",
              ValorDano: "450.00",
            },
          },
        },
      },
    }),
  );
  assert.deepEqual(m.danos, [{ descripcion: "Rotura de parachoques delantero", valor: "450.00" }]);
});

test("mapEiacSinAll: varios daños en un implicado y varios implicados → todos los daños", () => {
  const [m] = mapEiacSinAll(
    baseSin({
      Asegurado: {
        ImplicadoDiversos: [
          {
            DanosSiniestro: {
              DanoSiniestro: [
                { DescripcionDano: "Cristal roto", ValorDano: "120.50" },
                { DescripcionDano: "Rayón en el capó", ValorDano: "80.00" },
              ],
            },
          },
          { DanosSiniestro: { DanoSiniestro: { DescripcionDano: "Espejo retrovisor", ValorDano: "60.00" } } },
        ],
      },
    }),
  );
  assert.deepEqual(m.danos, [
    { descripcion: "Cristal roto", valor: "120.50" },
    { descripcion: "Rayón en el capó", valor: "80.00" },
    { descripcion: "Espejo retrovisor", valor: "60.00" },
  ]);
});

test("mapEiacSinAll: daño con solo descripcion o solo valor no se descarta; vacío se ignora", () => {
  const [m] = mapEiacSinAll(
    baseSin({
      Asegurado: {
        ImplicadoDiversos: {
          DanosSiniestro: {
            DanoSiniestro: [
              { DescripcionDano: "Sin importe informado" },
              { ValorDano: "30.00" },
              {},
            ],
          },
        },
      },
    }),
  );
  assert.deepEqual(m.danos, [
    { descripcion: "Sin importe informado", valor: null },
    { descripcion: null, valor: "30.00" },
  ]);
});

// --- M3: estado con código no verificado → review (no 'abierto' silencioso) ---
test("mapEiacSinAll: estado con código desconocido → review estado_siniestro_desconocido", () => {
  const [m] = mapEiacSinAll(
    baseSin({
      PosicionSiniestro: "ZZ",
      SituacionesSiniestro: { Situacion: { SituacionSiniestro: "ZZ" } },
    }),
  );
  assert.equal(m.estado, "abierto"); // persiste igual (default)
  assert.equal(m.outcome, "review");
  assert.ok(m.reviewReasons.includes("estado_siniestro_desconocido"));
});

// --- M3: sin ningún valor de estado → NO review por estado (no había código) ---
test("mapEiacSinAll: sin PosicionSiniestro ni SituacionSiniestro → no estado_siniestro_desconocido", () => {
  const [m] = mapEiacSinAll(
    baseSin({ PosicionSiniestro: undefined, SituacionesSiniestro: undefined }),
  );
  assert.equal(m.estado, "abierto");
  assert.ok(!m.reviewReasons.includes("estado_siniestro_desconocido"));
  assert.equal(m.outcome, "ok"); // baseSin trae fecha+id → sin otros blockers
});

// --- M4: situaciones en orden inverso → estado de la MÁS reciente (NumeroOrden) ---
test("mapEiacSinAll: situaciones desordenadas → estado de la más reciente por NumeroOrden", () => {
  const [m] = mapEiacSinAll(
    baseSin({
      SituacionesSiniestro: {
        Situacion: [
          // Array en orden inverso: la "Cerrado" (orden 2) es la final.
          { NumeroOrden: "2", FechaSituacion: "2026-03-10", SituacionSiniestro: "CE" },
          { NumeroOrden: "1", FechaSituacion: "2026-03-01", SituacionSiniestro: "AP" },
        ],
      },
    }),
  );
  // Sin ordenar habría tomado la última del array (AP→abierto); ordenado → CE→cerrado.
  assert.equal(m.estado, "cerrado");
});

// --- M4: empate/ausencia de NumeroOrden → desempata por FechaSituacion ---
test("mapEiacSinAll: sin NumeroOrden → desempata por FechaSituacion descendente", () => {
  const [m] = mapEiacSinAll(
    baseSin({
      SituacionesSiniestro: {
        Situacion: [
          { FechaSituacion: "2026-03-01", SituacionSiniestro: "AP" },
          { FechaSituacion: "2026-03-15", SituacionSiniestro: "CE" },
        ],
      },
    }),
  );
  assert.equal(m.estado, "cerrado"); // 2026-03-15 es más reciente → CE
});

// --- N5: falta FechaOcurrencia pero hay FechaDeclaracion → fallback, NO review ---
test("mapEiacSinAll: sin FechaOcurrencia con FechaDeclaracion → fallback, outcome ok", () => {
  const [m] = mapEiacSinAll(
    baseSin({ FechaOcurrencia: undefined, FechaDeclaracion: "2026-02-20T00:00:00" }),
  );
  assert.equal(m.fechaOcurrencia, "2026-02-20"); // usa la declaración
  assert.equal(m.outcome, "ok"); // NO va a review
  assert.ok(!m.reviewReasons.includes("falta_fecha_ocurrencia"));
  assert.ok(m.reviewReasons.includes("fecha_ocurrencia_fallback_declaracion")); // nota
});

// --- N5: faltan AMBAS fechas → review por falta_fecha_ocurrencia ---
test("mapEiacSinAll: sin FechaOcurrencia ni FechaDeclaracion → review", () => {
  const [m] = mapEiacSinAll(
    baseSin({ FechaOcurrencia: undefined, FechaDeclaracion: undefined }),
  );
  assert.equal(m.fechaOcurrencia, null);
  assert.equal(m.outcome, "review");
  assert.ok(m.reviewReasons.includes("falta_fecha_ocurrencia"));
  assert.ok(!m.reviewReasons.includes("fecha_ocurrencia_fallback_declaracion"));
});

// --- classifyClaseFigura dict ---
test("classifyClaseFigura: AD→contrario, TE/TG→testigo, LE/PE→lesionado, ?→null", () => {
  assert.equal(classifyClaseFigura("AD"), "contrario");
  assert.equal(classifyClaseFigura("te"), "testigo");
  assert.equal(classifyClaseFigura("TG"), "testigo");
  assert.equal(classifyClaseFigura("LE"), "lesionado");
  assert.equal(classifyClaseFigura("PE"), "lesionado");
  assert.equal(classifyClaseFigura("ZZ"), null);
  assert.equal(classifyClaseFigura(null), null);
});

// --- mapSiniestroEstado: solo claves oficiales de SITUACIÓN (devuelve {estado, conocido} — M3) ---
test("mapSiniestroEstado: claves oficiales AP/RA/CE/RC; lo demás no se adivina", () => {
  assert.deepEqual(mapSiniestroEstado("AP"), { estado: "abierto", conocido: true });
  assert.deepEqual(mapSiniestroEstado("ra"), { estado: "abierto", conocido: true });
  assert.deepEqual(mapSiniestroEstado("CE"), { estado: "cerrado", conocido: true });
  assert.deepEqual(mapSiniestroEstado("RC"), { estado: "rechazado", conocido: true });
  assert.deepEqual(mapSiniestroEstado("MO"), { estado: "abierto", conocido: false });
  assert.deepEqual(mapSiniestroEstado(undefined), { estado: "abierto", conocido: false });
});

// --- PosicionSiniestro es CULPA, no estado: IN = Indeterminado ---
test("mapEiacSinAll: PosicionSiniestro no decide el estado (IN = culpa indeterminada)", () => {
  const cerrado = mapEiacSinAll(
    baseSin({ PosicionSiniestro: "IN", SituacionesSiniestro: { Situacion: { SituacionSiniestro: "CE" } } }),
  )[0];
  assert.equal(cerrado.estado, "cerrado");
  assert.equal(cerrado.posicion, "IN");
  const sinSituacion = mapEiacSinAll(baseSin({ PosicionSiniestro: "IN", SituacionesSiniestro: undefined }))[0];
  assert.notEqual(sinSituacion.estado, "en_tramitacion");
  assert.ok(!sinSituacion.reviewReasons.includes("estado_siniestro_desconocido"));
});

// --- array de siniestros + fichero vacío ---
test("mapEiacSinAll: Siniestro como array → N entradas", () => {
  const parsed: ParsedEiacSin = {
    Objetos: {
      Siniestro: [
        baseSin().Objetos!.Siniestro as never,
        baseSin({ IdSiniestroEntidad: "SIN000002" }).Objetos!.Siniestro as never,
      ],
    },
  };
  const list = mapEiacSinAll(parsed);
  assert.equal(list.length, 2);
});

test("mapEiacSinAll: sin Siniestro → un único review (no se pierde el fichero)", () => {
  const list = mapEiacSinAll({ Objetos: {} });
  assert.equal(list.length, 1);
  assert.equal(list[0].outcome, "review");
});

// ─── 28/09/2026 — huecos de la auditoría de cobertura del SIN ───────────────
// Rutas ancladas a los SIN REALES de producción (estructura, nunca valores: todo
// lo de abajo es inventado).

test("Contrarios/Contrario → contrario con compañía, DGS, póliza, responsabilidad, lesionados y contacto", () => {
  const [m] = mapEiacSinAll(
    baseSin({
      Contrarios: {
        Contrario: {
          DatosPoliza: {
            CodigoEntidad: { CodigoDGS: "m0083", CodigoInterno: "X" },
            NombreEntidad: "ASEGURADORA INVENTADA SA",
            IdPoliza: "7654321",
          },
          Responsabilidad: "causante",
          Lesionados: { Numero: "2" },
          PersonaContacto: {
            Persona: {
              IdPersona: "00000000T",
              Nombre: "Fulano",
              Apellido1: "Ficticio",
              Sexo: "V",
              DatosContacto: { Telefonos: { Telefono: { Clase: "MV", Numero: "699000111" } } },
            },
          },
        },
      },
    }, []),
  );
  const c = m.figuras.find((f) => f.claseFiguraRaw === null);
  assert.ok(c, "el contrario de Contrarios/Contrario debe salir");
  assert.equal(c!.kind, "contrario");
  assert.equal(c!.compania, "ASEGURADORA INVENTADA SA");
  assert.equal(c!.codigoEntidadDgs, "M0083");
  assert.equal(c!.numeroPoliza, "7654321");
  assert.equal(c!.responsabilidad, "CAUSANTE");
  assert.equal(c!.numeroLesionados, 2);
  assert.equal(c!.nombre, "Fulano Ficticio");
  assert.equal(c!.telefono, "699000111");
  // IdPersona: solo en `terceros` (el persist lo cifra a `documentoCifrado`), en
  // ninguna otra parte de la salida.
  const { terceros, ...resto } = m;
  assert.doesNotMatch(JSON.stringify(resto), /00000000T/);
  assert.equal(terceros?.[0]?.documento, "00000000T");
});

test("figuraTelefono: lee DatosContacto/Telefonos/Telefono[]/Numero (ruta real)", () => {
  const [m] = mapEiacSinAll(
    baseSin({}, figura({
      DatosFigura: {
        PersonaFisica: {
          Nombre: "Testigo",
          DatosContacto: { Telefonos: { Telefono: [{ Clase: "FI" }, { Clase: "MV", Numero: "611222333" }] } },
        },
      },
    })),
  );
  assert.equal(m.figuras[0].telefono, "611222333");
});

test("cabecera nueva: FechaDeclaracion, DAA, Responsabilidad, TotalRecobros, ref mediador", () => {
  const [m] = mapEiacSinAll(
    baseSin({
      FechaDeclaracion: "2026-03-04T00:00:00",
      DAA: "true",
      TotalRecobros: "120.5",
      IdSiniestroMediador: "MED-77",
      Asegurado: { Responsabilidad: "PERJUDICADO" },
    }),
  );
  assert.equal(m.fechaDeclaracion, "2026-03-04");
  assert.equal(m.fechaOcurrencia, "2026-03-01", "la ocurrencia sigue siendo la suya");
  assert.equal(m.daa, true);
  assert.equal(m.responsabilidad, "PERJUDICADO");
  assert.equal(m.posicion, "IN", "responsabilidad ≠ posición");
  assert.equal(m.totalRecobros, "120.50");
  assert.equal(m.refMediador, "MED-77");
});

test("ref mediador: sin IdSiniestroMediador → null (IdSolicitudMediador es de la PÓLIZA); DAA false ≠ null", () => {
  const base = baseSin({ DAA: "false" });
  (base.Objetos!.Siniestro as { DatosPoliza: Record<string, unknown> }).DatosPoliza.IdSolicitudMediador = "SOL-9";
  const [m] = mapEiacSinAll(base);
  assert.equal(m.refMediador, null);
  assert.equal(m.daa, false);
  const [vacio] = mapEiacSinAll(baseSin());
  assert.equal(vacio.daa, null, "no vino ≠ false");
  assert.equal(vacio.fechaDeclaracion, null);
});

test("DescripcionReserva → reservaDesglose con pares cobertura-importe y texto crudo", () => {
  const [m] = mapEiacSinAll(baseSin({ DescripcionReserva: "RESERVA POR COBERTURAS=16-400.00/43-78.5" }));
  assert.deepEqual(m.reservaDesglose, {
    descripcion: "RESERVA POR COBERTURAS=16-400.00/43-78.5",
    coberturas: [
      { cobertura: "16", importe: "400.00" },
      { cobertura: "43", importe: "78.50" },
    ],
  });
  const [raro] = mapEiacSinAll(baseSin({ DescripcionReserva: "texto libre" }));
  assert.deepEqual(raro.reservaDesglose, { descripcion: "texto libre", coberturas: [] });
});

test("Convenios y Expedientes → códigos CRUDOS y expediente completo", () => {
  const [m] = mapEiacSinAll(
    baseSin({
      Convenios: { Convenio: [{ NumeroOrden: "1", ConvenioSiniestro: "SC" }, { NumeroOrden: "2", ConvenioSiniestro: "as" }] },
      Expedientes: {
        Expediente: {
          NumeroOrden: "1",
          NumeroExpediente: "EXP1",
          ClaseExpediente: "DP",
          EstadoExpediente: "PE",
          FechaInicio: "2026-03-02",
          ImporteReserva: "300",
          TotalPagos: "0",
          TotalRecobros: "10",
          Cobertura: { Cobertura: { NumeroOrden: "1", IdCobertura: "55", DescripcionCobertura: "DAÑOS PROPIOS", CapitalAsegurado: "0", FechaInicio: "2026-01-01" } },
        },
      },
    }),
  );
  assert.deepEqual(m.convenios, ["SC", "AS"]);
  assert.equal(m.expedientes!.length, 1);
  const e = m.expedientes![0];
  assert.equal(e.numero, "EXP1");
  assert.equal(e.clase, "DP");
  assert.equal(e.estado, "PE");
  assert.equal(e.importeReserva, "300.00");
  assert.equal(e.totalRecobros, "10.00");
  assert.deepEqual(e.coberturas, [{ id: "55", descripcion: "DAÑOS PROPIOS", capital: "0.00", fechaInicio: "2026-01-01", fechaFin: null }]);
});

test("Riesgo afectado: Asegurado/IdRiesgo elige entre varios RiesgoRecSin; varios sin IdRiesgo → null", () => {
  const riesgos = {
    RiesgoRecSin: [
      { IdRiesgo: "1", DescripcionRiesgo: "RIESGO UNO" },
      {
        IdRiesgo: "2",
        DescripcionRiesgo: "RIESGO DOS",
        DatosCoberturas: { Cobertura: [{ IdCobertura: "9", DescripcionCobertura: "RC", CapitalAsegurado: "1000", DatosImportes: { PrimaNeta: "1" } }] },
      },
    ],
  };
  const [m] = mapEiacSinAll(baseSin({ RiesgosSiniestro: riesgos, Asegurado: { IdRiesgo: "2" } }));
  assert.deepEqual(m.riesgo, { id: "2", descripcion: "RIESGO DOS", coberturas: [{ id: "9", descripcion: "RC", capital: "1000.00", primaNeta: "1.00" }] });
  const [sinId] = mapEiacSinAll(baseSin({ RiesgosSiniestro: riesgos }));
  assert.equal(sinId.riesgo, null, "con varios riesgos y sin IdRiesgo no se adivina");
  const [uno] = mapEiacSinAll(baseSin({ RiesgosSiniestro: { RiesgoRecSin: riesgos.RiesgoRecSin[0] } }));
  assert.equal(uno.riesgo?.descripcion, "RIESGO UNO");
});

test("Asegurado: PersonaContacto (nombre+tel), ImplicadoAutos (vehículo+conductor+daños), domicilio y fecha de nacimiento SOLO en terceros", () => {
  const [m] = mapEiacSinAll(
    baseSin({
      Asegurado: {
        PersonaContacto: {
          Persona: {
            Nombre: "Mengana",
            Apellido1: "Inventada",
            Domicilio: { NombreVia: "VIA SECRETA", CodigoPostal: "00000" },
            DatosContacto: { Telefonos: { Telefono: { Clase: "MV", Numero: "622333444" } } },
          },
        },
        ImplicadoAutos: {
          Vehiculo: { Matricula: "0000XXX", Marca: "MARCA", Modelo: "MODELO", Bastidor: "B1" },
          Conductor: { Nombre: "Zutano", Apellido1: "Falso", FechaNacimiento: "1970-01-01", Sexo: "V" },
          DanosSiniestro: { DanoSiniestro: { NumeroOrden: "1", DescripcionDano: "Paragolpes", ValorDano: "250" } },
        },
      },
    }),
  );
  assert.equal(m.contactoNombre, "Mengana Inventada");
  assert.equal(m.contactoTelefono, "622333444");
  assert.deepEqual(m.vehiculo, { matricula: "0000XXX", marca: "MARCA", modelo: "MODELO", conductorNombre: "Zutano Falso" });
  assert.deepEqual(m.danos, [{ descripcion: "Paragolpes", valor: "250.00" }], "L12: daños de ImplicadoAutos");
  // 20/10/2026 — domicilio y nacimiento van SOLO a `terceros` (el persist los cifra),
  // en ninguna otra parte de la salida; el bastidor y el sexo, en ninguna.
  const { terceros, ...resto } = m;
  const todo = JSON.stringify(resto);
  assert.doesNotMatch(todo, /VIA SECRETA/);
  assert.doesNotMatch(todo, /1970-01-01/);
  assert.equal(terceros?.find((t) => t.papel === "contacto_asegurado")?.domicilio?.direccion, "VIA SECRETA");
  assert.equal(terceros?.find((t) => t.papel === "conductor_asegurado")?.fechaNacimiento, "1970-01-01");
  assert.doesNotMatch(JSON.stringify(m), /"B1"/);
});

test("OtrosDatos CONT_* → vehiculoContrario (aparte del vehículo del asegurado)", () => {
  const [m] = mapEiacSinAll(
    baseSin({
      OtrosDatos: {
        Dato: [
          { NumeroOrden: "1", IdDato: "CONT_CONDUCTOR_NOM", DescripcionDato: "Nombre del conductor", IdSubdato: "Valor", ValorSubdato: "Perengano" },
          { NumeroOrden: "2", IdDato: "CONT_VEHICULO_MARCA", DescripcionDato: "Marca y Modelo", IdSubdato: "Valor", ValorSubdato: "MARCA X" },
          { NumeroOrden: "3", IdDato: "CONT_VEHICULO_MAT", DescripcionDato: "Matrícula", IdSubdato: "Valor", ValorSubdato: "1111YYY" },
          { NumeroOrden: "4", IdDato: "OTRO_RARO", DescripcionDato: "Algo", IdSubdato: "Valor", ValorSubdato: "v" },
        ],
      },
    }),
  );
  assert.deepEqual(m.vehiculoContrario, {
    matricula: "1111YYY",
    marcaModelo: "MARCA X",
    conductorNombre: "Perengano",
    otros: [{ idDato: "OTRO_RARO", descripcion: "Algo", valor: "v" }],
  });
  assert.equal(m.vehiculo, null, "no se mezcla con el vehículo del asegurado");
});

test("Asistencias: empresa → razonSocial; persona física → nombre; clase cruda", () => {
  const [m] = mapEiacSinAll(
    baseSin({
      Asegurado: {
        Asistencias: {
          Asistencia: [
            { Descripcion: "Honorarios Perito", Asistente: { NumeroOrden: "1", ClaseFigura: "PE", DatosFigura: { PersonaJuridica: { RazonSocial: "PERITOS INVENTADOS SL", IdPersona: "B00000000" } } } },
            { Descripcion: "Reparación", Asistente: { NumeroOrden: "2", ClaseFigura: "RE", DatosFigura: { PersonaFisica: { Nombre: "Reparador", Apellido1: "Ficticio", FechaNacimiento: "1980-02-02" } } } },
          ],
        },
      },
    }),
  );
  assert.deepEqual(m.asistencias, [
    { clase: "PE", razonSocial: "PERITOS INVENTADOS SL", nombre: null, descripcion: "Honorarios Perito" },
    { clase: "RE", razonSocial: null, nombre: "Reparador Ficticio", descripcion: "Reparación" },
  ]);
  // 20/10/2026 — documento y nacimiento del asistente: SOLO en `terceros` (cifrados al persistir).
  const { terceros: tercerosAsist, ...restoAsist } = m;
  assert.doesNotMatch(JSON.stringify(restoAsist), /B00000000|1980-02-02/);
  assert.ok(tercerosAsist?.some((t) => t.papel === "asistente"));
});

test("Acciones: figurasDetalle con nombre; figuras sigue siendo string[] de códigos", () => {
  const [m] = mapEiacSinAll(
    baseSin({
      AccionesSiniestro: {
        Accion: {
          AccionSiniestro: "EP",
          FechaAccion: "2026-03-05",
          SituacionAccion: "EC",
          FigurasAccion: { FiguraAccion: { NumeroOrden: "1", ClaseFigura: "PE", DatosFigura: { PersonaJuridica: { RazonSocial: "GABINETE INVENTADO SA" } } } },
        },
      },
    }),
  );
  assert.deepEqual(m.acciones[0].figuras, ["PE"]);
  assert.deepEqual(m.acciones[0].figurasDetalle, [{ clase: "PE", razonSocial: "GABINETE INVENTADO SA", nombre: null }]);
});

test("Pagos: coberturas indemnizadas, FechaLiquidacion y clase de FormaPago; el IBAN NUNCA", () => {
  const [m] = mapEiacSinAll(
    baseSin({
      PagosSiniestro: {
        PagoSiniestro: {
          FechaPago: "2026-04-01",
          FechaLiquidacion: "2026-03-30",
          ImportePago: "80",
          FormaPago: { ClaseFormaPago: "CC", DatosCuentaCorriente: { IBAN: "ES0000000000000000000000" } },
          CoberturasIndemnizadas: { Cobertura: { NumeroOrden: "1", IdCobertura: "16", DescripcionCobertura: "16 - Cristales", ModalidadValoracion: "PR" } },
        },
      },
    }),
  );
  const p = m.pagos[0];
  assert.equal(p.fechaLiquidacion, "2026-03-30");
  assert.equal(p.formaPago, "CC");
  assert.deepEqual(p.coberturas, [{ id: "16", descripcion: "16 - Cristales", modalidad: "PR" }]);
  assert.doesNotMatch(JSON.stringify(m), /ES0000000000000000000000/);
});

test("Contrario con Lesionados/Lesionado con detalle → review_salud (Art.9)", () => {
  const [m] = mapEiacSinAll(
    baseSin({ Contrarios: { Contrario: { Responsabilidad: "PERJUDICADO", Lesionados: { Numero: "1", Lesionado: { Nombre: "X" } } } } }),
  );
  assert.equal(m.outcome, "review_salud");
});

test("ImplicadoDiversos/Descripcion → descripcion con números largos tapados; varios implicados se unen", () => {
  const [m] = mapEiacSinAll(
    baseSin({
      Asegurado: {
        ImplicadoDiversos: [
          { Descripcion: "Fuga en baño, llamar al 600112233" },
          { Descripcion: "Mancha en techo del vecino" },
        ],
      },
    }),
  );
  assert.ok(m.descripcion, "la descripción del siniestro debe salir");
  assert.match(m.descripcion!, /^Fuga en baño/);
  assert.match(m.descripcion!, / · Mancha en techo del vecino$/);
  assert.doesNotMatch(m.descripcion!, /600112233/, "teléfono tapado");
  const [vacio] = mapEiacSinAll(baseSin());
  assert.equal(vacio.descripcion, null);
});

test("PersonaContacto/Observaciones → contactoObservaciones (en claro en el mapper; lo cifra el persist)", () => {
  const [m] = mapEiacSinAll(
    baseSin({ Asegurado: { PersonaContacto: { Observaciones: "Llamar por la tarde", Persona: { Nombre: "X" } } } }),
  );
  assert.equal(m.contactoObservaciones, "Llamar por la tarde");
});

// --- 03/10/2026: huecos del lote 3 (SIN) ---

test("lote 3 SIN: cobertura del riesgo guarda primaNeta, primaTotal, fechaInicio y descripcionCapital; ausentes omitidas", () => {
  const riesgos = {
    RiesgoRecSin: {
      IdRiesgo: "1",
      DatosCoberturas: {
        Cobertura: [
          {
            IdCobertura: "5",
            DescripcionCobertura: "INCENDIO",
            CapitalAsegurado: "50000",
            DescripcionCapitalAsegurado: "CAPITAL TOTAL CL MAYOR 12345678",
            FechaInicio: "2024-01-01T00:00:00",
            DatosImportes: { PrimaNeta: "10.5", PrimaTotal: "12.34" },
          },
          { IdCobertura: "6", DescripcionCobertura: "RC", DatosImportes: { PrimaNeta: "abc" }, FechaInicio: "1900-01-01T00:00:00" },
        ],
      },
    },
  };
  const [m] = mapEiacSinAll(baseSin({ RiesgosSiniestro: riesgos }));
  const [a, b] = m.riesgo!.coberturas;
  assert.equal(a.primaNeta, "10.50");
  assert.equal(a.primaTotal, "12.34");
  assert.equal(a.fechaInicio, "2024-01-01");
  assert.equal(a.descripcionCapital, "CAPITAL TOTAL", "corta en el tipo de vía");
  assert.deepEqual(Object.keys(b).sort(), ["capital", "descripcion", "id"], "ausentes/placeholders → sin clave");
});

test("lote 3 SIN: DanoSiniestro pasa la descripción por el filtro PII (vía + números largos) y recoge los de contrarios", () => {
  const [m] = mapEiacSinAll(
    baseSin({
      Asegurado: {
        ImplicadoDiversos: {
          DanosSiniestro: { DanoSiniestro: { DescripcionDano: "Rotura de ventana CL FALSA 5, 3B", ValorDano: "300" } },
        },
      },
      Contrarios: {
        Contrario: {
          Responsabilidad: "CAUSANTE",
          ImplicadoDiversos: {
            DanosSiniestro: { DanoSiniestro: [{ DescripcionDano: "Valla ref 12345678901", ValorDano: "90.5" }, { DescripcionDano: "Solo texto" }] },
          },
        },
      },
    }),
  );
  assert.deepEqual(m.danos, [
    { descripcion: "Rotura de ventana", valor: "300.00" },
    { descripcion: "Valla ref […]", valor: "90.50", contrario: true },
    { descripcion: "Solo texto", valor: null, contrario: true },
  ]);
});

test("lote 3 SIN: receptor del pago → solo razón social de PERSONA JURÍDICA; persona física e IBAN no se guardan", () => {
  const [m] = mapEiacSinAll(
    baseSin({
      PagosSiniestro: {
        PagoSiniestro: [
          {
            FechaPago: "2024-02-01T00:00:00",
            ImportePago: "100",
            ReceptoresPago: {
              Figura: { ClaseFigura: "TA", DatosFigura: { PersonaJuridica: { RazonSocial: "TALLER EJEMPLO SL", IdPersona: "B00000000" } } },
            },
            FormaPago: { ClaseFormaPago: "CC", DatosCuentaCorriente: { IBAN: "ES9121000418450200051332" } },
          },
          {
            FechaPago: "2024-02-02T00:00:00",
            ImportePago: "50",
            ReceptoresPago: { Figura: { ClaseFigura: "PE", DatosFigura: { PersonaFisica: { Nombre: "Persona", Apellido1: "Fisica" } } } },
          },
        ],
      },
    }),
  );
  assert.equal(m.pagos[0].receptorRazonSocial, "TALLER EJEMPLO SL");
  assert.ok(!("receptorRazonSocial" in m.pagos[1]));
  const json = JSON.stringify(m.pagos);
  assert.ok(!json.includes("ES91") && !json.includes("Persona") && !json.includes("B00000000"));
});

test("lote 3 SIN: vehículo del asegurado guarda clase, categoría, combustible, uso, valor, potencia, cilindrada, plazas y fecha; nunca bastidor", () => {
  const [m] = mapEiacSinAll(
    baseSin({
      Asegurado: {
        ImplicadoAutos: {
          Vehiculo: {
            Marca: "MARCA",
            Modelo: "MODELO",
            ClaseVehiculo: "TU",
            CategoriaVehiculo: "TU",
            Combustible: "GA",
            UsoVehiculo: "PA",
            Valor: "15000",
            Potencia: "110",
            Cilindrada: "1600",
            Plazas: "5",
            FechaMatriculacion: "2019-06-15T00:00:00",
            Bastidor: "VF1AAAAAAAAAAAAAA",
          },
        },
      },
    }),
  );
  assert.deepEqual(m.vehiculo, {
    matricula: null,
    marca: "MARCA",
    modelo: "MODELO",
    conductorNombre: null,
    clase: "TU",
    categoria: "TU",
    combustible: "GA",
    uso: "PA",
    valor: "15000.00",
    potencia: "110",
    cilindrada: "1600",
    plazas: "5",
    fechaMatriculacion: "2019-06-15",
  });
  assert.ok(!JSON.stringify(m.vehiculo).includes("VF1"));
});
