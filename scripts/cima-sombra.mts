#!/usr/bin/env node
// CIMA fase 4 — comparador en SOMBRA, SOLO LECTURA (spec docs/superpowers/specs/2026-11-02-unificar-ingesta-cima.md).
//
// Repite los ficheros crudos que el CRM guardó (`seguros.cima_cuarentena_crudo`) por el pipeline de central
// (`packages/module-cima`) con un `db` GRABADOR (las escrituras se graban, NUNCA se ejecutan; no se confirma nada
// en TIREA) y compara lo que central escribiría con lo que el CRM dejó en pólizas/recibos/siniestros/CEF.
//
//   node scripts/cima-sombra.mts [salida.json]        (por defecto ./cima-sombra-informe.json)
//
// Entorno: CIMA_SOMBRA_DATABASE_URL (rol de SOLO LECTURA; directa o pooler en modo sesión), PII_ENCRYPTION_KEY,
// PII_LOOKUP_KEY. Opcionales: CIMA_SOMBRA_LIMITE (nº de crudos), CIMA_SOMBRA_SCHEMA (def. seguros),
// CIMA_INGESTA_CORREDURIA_ID (solo si hay crudos de varias corredurías).
// 🚨 Con CIMA_ESCRITOR=central ABORTA (código 2) antes de conectar. El informe no lleva PII en claro.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { CimaSombraEscritorCentralError } from "../packages/module-cima/src/sombra/comparar.ts";
import { ejecutarSombra, prepararEntornoSombra } from "../packages/module-cima/src/sombra/ejecutar.ts";

try {
  // Primero de todo: ni se lee la URL si el escritor real es central.
  prepararEntornoSombra(process.env);
} catch (e) {
  if (e instanceof CimaSombraEscritorCentralError) {
    console.error(e.message);
    process.exit(2);
  }
  throw e;
}

const salida = resolve(process.argv[2] ?? "cima-sombra-informe.json");
const limite = Number.parseInt(process.env.CIMA_SOMBRA_LIMITE ?? "", 10);

try {
  const informe = await ejecutarSombra({ limite: Number.isFinite(limite) && limite > 0 ? limite : undefined });
  writeFileSync(salida, JSON.stringify(informe, null, 2) + "\n");
  const r = informe.resumen;
  console.log(
    JSON.stringify({
      crudos: informe.crudos.total,
      crudosIlegibles: informe.crudosIlegibles,
      iguales: r.iguales,
      difieren: r.difieren,
      soloCentral: r.soloCentral,
      soloCrm: r.soloCrm,
      escriturasGrabadas: informe.sentencias.escriturasGrabadas,
      lecturasFallidas: informe.lecturasFallidas,
      informe: salida,
    }),
  );
} catch (e) {
  // Solo el código del error: un mensaje de driver podría traer datos.
  const msg = e instanceof Error ? e.message : String(e);
  const codigo = msg.match(/^(?:cima_[a-z0-9_:]+|[A-Z][A-Z0-9_]+ no configurado)/)?.[0];
  console.error(codigo ?? `cima_sombra_fallo:${e instanceof Error ? e.name : "desconocido"}`);
  process.exit(1);
}
