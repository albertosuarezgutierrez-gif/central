/**
 * Cobertura de campos medida contra el MAPPER REAL (`mapEiacPolAll`), no contra
 * un mapper de juguete. Es la mitad que importa del cepo: lo que protege esto es
 * que la medición siga pegada al mapper de verdad — una lista escrita a mano
 * pasaría este test hoy y mentiría el día que alguien tocara el mapper.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { mapEiacPolAll, type ParsedEiacPol } from "./eiac-pol-mapper.ts";
import { medirCoberturaCampos } from "./field-coverage.ts";

/** Fixture sintético (NUNCA PII real) con la forma del EIAC 6.0 POL. */
function polComunidades(): ParsedEiacPol {
  return {
    Objetos: {
      Poliza: {
        DatosPoliza: {
          IdPoliza: "P01",
          CodigoEntidad: { CodigoDGS: "C0468" },
          DatosRamo: { RamoDGS: "2161", DescripcionRamo: "COMUNIDADES" },
        },
        SituacionPoliza: "EV",
        Fechas: {
          FechaEfectoInicial: "2025-02-01T00:00:00",
          FechaVencimiento: "2026-02-01T00:00:00",
        },
        DatosRiesgos: {
          Riesgo: {
            RiesgoComunidades: {
              // Campos que el mapper de hoy NO lee: el caso del encargo.
              NumeroViviendas: "12",
              Ascensores: "1",
              AnioConstruccion: "1998",
            },
          },
        },
        Tomador: {
          PersonaFisica: {
            TipoIdentificacion: "NI",
            IdPersona: "00000001R",
            Nombre: "VALOR-NOMBRE",
            Apellido1: "VALOR-APELLIDO",
          },
        },
      },
    },
  } as ParsedEiacPol;
}

test("mapper REAL: los campos que el mapper SÍ usa salen como leídos", () => {
  const c = medirCoberturaCampos(polComunidades(), (d) =>
    mapEiacPolAll(d as ParsedEiacPol),
  );
  assert.equal(c.mapperFallo, false);
  const por = new Map(c.rutas.map((r) => [r.ruta, r.leido]));
  for (const ruta of [
    "Objetos.Poliza.DatosPoliza.IdPoliza",
    "Objetos.Poliza.DatosPoliza.CodigoEntidad.CodigoDGS",
    "Objetos.Poliza.Fechas.FechaEfectoInicial",
    "Objetos.Poliza.Fechas.FechaVencimiento",
    "Objetos.Poliza.SituacionPoliza",
  ]) {
    assert.equal(por.get(ruta), true, `${ruta} debería constar como leída`);
  }
});

test("mapper REAL: Ascensores/AnioConstruccion de RiesgoComunidades ya NO se pierden: van al «resto» (cimaExtra)", () => {
  // Hasta el 03/10/2026 salían como NO leídas: no hay dónde pintarlos en
  // `objetoInmueble()` de `@central/module-seguros` (y `AnioConstruccion` tiene el
  // problema de unidades de `Antiguedad`). Desde entonces el recolector genérico
  // (`cima-extra.ts`) los guarda CRUDOS en `datos_especificos.cimaExtra` y el
  // medidor los cuenta como leídos — porque se guardan, no porque se interpreten.
  // Lo que sigue sin leer es solo lo de la lista de exclusión (con motivo).
  const c = medirCoberturaCampos(polComunidades(), (d) =>
    mapEiacPolAll(d as ParsedEiacPol),
  );
  const por = new Map(c.rutas.map((r) => [r.ruta, r]));
  for (const ruta of [
    "Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.Ascensores",
    "Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.AnioConstruccion",
  ]) {
    assert.equal(por.get(ruta)?.leido, true, `${ruta} debería constar como leída (guardada en cimaExtra)`);
  }
  const [m] = mapEiacPolAll(polComunidades());
  const extra = (m.datosEspecificos?.cimaExtra ?? []) as Array<{ ruta: string; valor: string }>;
  assert.deepEqual(
    extra.filter((e) => e.ruta.includes("RiesgoComunidades")),
    [
      { ruta: "Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.Ascensores", valor: "1" },
      { ruta: "Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.AnioConstruccion", valor: "1998" },
    ],
  );
  // Lo no leído = solo lo excluido a propósito (aquí, el tipo de documento del tomador).
  const sinMotivo = c.rutas.filter((r) => r.hoja && !r.leido && !r.excluido).map((r) => r.ruta);
  assert.deepEqual(sinMotivo, []);
});

test("mapper REAL: NumeroViviendas de RiesgoComunidades YA se lee (el agujero cerrado el 20/09/2026)", () => {
  // Hasta esa fecha `NumeroViviendas` salía con `veces_leido = 0` en
  // `seguros.cima_cobertura_campos` (POL de Occident C0468): el fichero se
  // confirmaba a TIREA y el nº de viviendas se perdía sin dejar error ni review.
  const c = medirCoberturaCampos(polComunidades(), (d) =>
    mapEiacPolAll(d as ParsedEiacPol),
  );
  const por = new Map(c.rutas.map((r) => [r.ruta, r.leido]));
  assert.equal(
    por.get("Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.NumeroViviendas"),
    true,
    "NumeroViviendas debería constar LEÍDA",
  );
});

test("mapper REAL: la SituacionRiesgo YA se lee (el agujero medido el 20/09/2026)", () => {
  // Hasta esa fecha estas seis rutas salían con `veces_leido = 0` en
  // `seguros.cima_cobertura_campos` (POL de Occident C0468 y Generali C0072): el
  // fichero se confirmaba a TIREA y la dirección del riesgo se perdía sin dejar
  // error ni review. Este cepo mide contra el mapper REAL que ya no se pierde.
  const arbol = polComunidades();
  const riesgo = (
    arbol as unknown as {
      Objetos: {
        Poliza: { DatosRiesgos: { Riesgo: Record<string, Record<string, unknown>> } };
      };
    }
  ).Objetos.Poliza.DatosRiesgos.Riesgo;
  riesgo.RiesgoComunidades.SituacionRiesgo = {
    NombreVia: "VALOR-VIA",
    OtrosDatosVia: "VALOR-OTROS",
    CodigoPostal: "41003",
    Poblacion: "VALOR-POBLACION",
    Provincia: "VALOR-PROVINCIA",
    Pais: "ES",
  };
  const c = medirCoberturaCampos(arbol, (d) => mapEiacPolAll(d as ParsedEiacPol));
  const por = new Map(c.rutas.map((r) => [r.ruta, r.leido]));
  const base = "Objetos.Poliza.DatosRiesgos.Riesgo.RiesgoComunidades.SituacionRiesgo";
  for (const hoja of [
    "NombreVia",
    "OtrosDatosVia",
    "CodigoPostal",
    "Poblacion",
    "Provincia",
  ]) {
    assert.equal(por.get(`${base}.${hoja}`), true, `${hoja} debería constar LEÍDA`);
  }
  // `Pais` sigue sin leerse A PROPÓSITO (no hay dónde pintarlo y en el feed
  // medido es siempre el mismo). Se deja visible como hueco conocido en vez de
  // fingir cobertura total.
  assert.equal(por.get(`${base}.Pais`), false);
});

test("mapper REAL: la medición no emite un solo valor del árbol", () => {
  const c = medirCoberturaCampos(polComunidades(), (d) =>
    mapEiacPolAll(d as ParsedEiacPol),
  );
  const texto = JSON.stringify(c);
  for (const valor of ["00000001R", "VALOR-NOMBRE", "VALOR-APELLIDO", "1998", "COMUNIDADES"]) {
    assert.ok(!texto.includes(valor), `se ha colado el valor ${valor}`);
  }
});

test("mapper REAL: medir NO cambia lo que el mapper produce sobre el árbol original", () => {
  const arbol = polComunidades();
  const antes = JSON.stringify(mapEiacPolAll(arbol));
  medirCoberturaCampos(arbol, (d) => mapEiacPolAll(d as ParsedEiacPol));
  const despues = JSON.stringify(mapEiacPolAll(arbol));
  assert.equal(despues, antes);
});

test("28/09/2026: las hojas de DatosFranquicias/DatosLimitesAsegurados/DatosImportes de la Cobertura cuentan como leídas", () => {
  const pol = polComunidades() as { Objetos: { Poliza: Record<string, unknown> } };
  (pol.Objetos.Poliza.DatosRiesgos as { Riesgo: Record<string, unknown> }).Riesgo.DatosCoberturas = {
    Cobertura: {
      IdCobertura: "C1",
      DatosFranquicias: { Franquicia: { ClaseFranquicia: "PS", ValorExacto: "300.00" } },
      DatosLimitesAsegurados: { Limite: { ClaseLimite: "NI", LimiteMaximo: "1000" } },
      DatosImportes: { PrimaNeta: "10.00" },
    },
  };
  const c = medirCoberturaCampos(pol, (d) => mapEiacPolAll(d as ParsedEiacPol));
  const por = new Map(c.rutas.map((r) => [r.ruta, r.leido]));
  const base = "Objetos.Poliza.DatosRiesgos.Riesgo.DatosCoberturas.Cobertura";
  for (const ruta of [
    `${base}.DatosFranquicias.Franquicia.ValorExacto`,
    `${base}.DatosFranquicias.Franquicia.ClaseFranquicia`,
    `${base}.DatosLimitesAsegurados.Limite.LimiteMaximo`,
    `${base}.DatosImportes.PrimaNeta`,
  ]) {
    assert.equal(por.get(ruta), true, `${ruta} debería contar como leída`);
  }
});

test("28/09/2026: el envoltorio ProcesosEIAC no parte la medición en dos rutas", () => {
  const conWrapper = { ProcesosEIAC: polComunidades() };
  const c = medirCoberturaCampos(conWrapper, (d) => mapEiacPolAll(d as ParsedEiacPol));
  assert.ok(c.rutas.every((r) => !r.ruta.startsWith("ProcesosEIAC")));
  const por = new Map(c.rutas.map((r) => [r.ruta, r.leido]));
  assert.equal(por.get("Objetos.Poliza.DatosPoliza.IdPoliza"), true);
});
