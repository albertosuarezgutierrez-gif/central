# Spec — Consolidación bancaria inteligente (`apps/plataforma`)

Fecha: 2026-06-14 · Estado: en implementación · Rama: `claude/consolidacion-bancaria-y1fssi`

## Problema
El dueño de la casa de marcas ve en `plataforma` ingresos/gastos por negocio, pero **no el dinero
real del banco**. Quiere consolidar el saldo y los movimientos de todas sus sociedades en un sitio
y que, **al subir el extracto, un agente analice los datos** (categorizar, conciliar, prever).

## Decisiones
- **Entrada de datos = Norma 43 (Cuaderno 43, AEB-43)**: fichero descargable de cualquier banco
  español. Coste 0, sin licencia ni agregador. El conector automático PSD2 (GoCardless/Nordigen)
  es una capa posterior sobre el mismo modelo.
- **IA gratis**: se reutiliza `@central/core-ai` (NVIDIA NIM gratis → Claude Haiku fallback), ya
  declarado como dependencia de `apps/plataforma`.
- **Multi-tenant**: todo scopeado por `cuenta_id` (y `sociedad_id`), patrón vigente del repo.
- **Aditivo**: tablas nuevas en `public`, no se toca lo existente.

## Modelo de datos (BD compartida `wswbehlcuxqxyinousql`, schema `public`)
- `cuentas_bancarias(id, cuenta_id, sociedad_id, banco, iban, iban_mascara, alias, divisa,
  saldo_actual, saldo_fecha, created_at)`, `unique(sociedad_id, iban)`.
- `movimientos_bancarios(id, cuenta_bancaria_id, fecha_operacion, fecha_valor, importe,
  saldo_posterior, concepto, contraparte, referencia, origen, dedupe_hash, created_at)` +
  columnas para fases siguientes (nullable): `concepto_normalizado, categoria, categoria_pgc,
  conciliado, factura_ref, analizado_at`. `unique(cuenta_bancaria_id, dedupe_hash)` → dedupe.

## Componentes (Fase 1)
- `lib/norma43.ts` (+ `.test.ts`): parser puro AEB-43 (registros 11/22/23/33/88) → `ExtractoN43[]`.
- `lib/banca.ts`: `importarExtracto`, `getSaldoConsolidado`, `listarMovimientos` (`$queryRaw` scopeado).
- `app/api/banca/importar/route.ts`: `POST` (sesión + zod) sube `.n43` de una sociedad propia.
- UI: KPI "Saldo del grupo" en el dashboard + página `/banca` (cuentas, importar, movimientos).

## Roadmap
F1 base · F2 auto-categorización IA · F3 conciliación banco↔facturas · F4 OCR facturas ·
F5 previsión + alertas · F6 conector PSD2. Detalle vivo en el plan de la sesión.

## Verificación
`node --test` del parser; `list_tables`/`execute_sql` (Supabase MCP) para la migración y el import;
reimportar el mismo fichero → 0 insertados (dedupe); KPI de saldo = suma de `saldo_actual`.
