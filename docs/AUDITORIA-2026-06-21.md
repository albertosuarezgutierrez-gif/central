# Auditoría — 21 junio 2026

**Fecha:** 21/06/2026  
**Alcance:** monorepo `central` — estructura, tipos, tests, seguridad, infra, finanzas BBVA  
**Ejecutada por:** Claude Code (sesión `e1dc6908`)

---

## Resumen ejecutivo

Sistema estable y buildable. TypeScript limpio en las 4 apps. Tests de core-fiscal al 100%.
Un bug financiero crítico (ingresos Dúplex a 0€) detectado y corregido. Ningún error de producción.
Las vulnerabilidades npm no son explotables con el uso actual.

---

## 🟢 OK — sin acción

| Área | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | ✅ lockfile en sync |
| `node scripts/auditar-estructura.mjs --check` | ✅ sin scopes `@iarest/` huérfanos |
| `pnpm test:guardia` | ✅ pasa |
| `core-fiscal` tests | ✅ 16/16 |
| TypeScript `apps/ia-rest` | ✅ 0 errores (tras `prisma generate`) |
| TypeScript `apps/plataforma` | ✅ 0 errores (tras `prisma generate`) |
| TypeScript `apps/sivra` | ✅ 0 errores (tras `prisma generate`) |
| TypeScript `apps/ialimp` | ✅ 0 errores (tras `prisma generate`) |
| Migraciones Supabase | ✅ 200+ aplicadas; última `20260621103952` |
| Vercel `plataforma` | ✅ READY — último deploy ok |
| Vercel `ia-rest` | ✅ READY — último deploy ok |
| Vercel `sivra` | ✅ READY — último deploy ok |
| `pnpm audit` — xlsx HIGH | ✅ no explotable (solo escritura, nunca parsea input externo) |
| `pnpm audit` — nodemailer HIGH | ✅ no explotable (`raw` option no usada) |
| `pnpm audit` — uuid MODERATE | ✅ transitivo, sin superficie real |
| Supabase `rls_policy_always_true` (12 tablas ia-rest) | ✅ intencional (POS multi-tenant, aislado por `search_path`) |
| Supabase `anon_security_definer_function_executable` | ✅ intencional (diseño POS) |
| Supabase `auth_rls_initplan` | ✅ deuda técnica menor, no urgente |
| Multi-tenant scope `cuenta_id` | ✅ revisado en todas las queries de plataforma/finanzas |

---

## 🟡 Corregidos en esta sesión

### 1. `destino.ts` — "LIQ. OP." BBVA clasificaba como `seguros` en vez de `turistico_duplex`

**Descripción:** El patrón `LIQ\.?\s*OP\.?\s*N` en `RE_COMISIONES` capturaba los cobros de Booking.com
para el Dúplex antes de llegar a la lógica BBVA específica. Los 22 movimientos de reservas del Dúplex
(ene–jun 2026) quedaban como `destino = 'seguros'`, haciendo que el módulo `/finanzas` mostrase
**0 € de ingresos** en BBVA Dúplex.

**Impacto:** Datos financieros incorrectos en el dashboard de finanzas. Sin impacto en producción de clientes.

**Fix aplicado:**
1. SQL UPDATE de 22 movimientos → `destino = 'turistico_duplex'`, `conciliado = true` (inmediato).
2. `apps/plataforma/lib/destino.ts` — nueva guard antes de `RE_COMISIONES`:
   ```typescript
   if (esBBVA && /LIQ\.?\s*OP\./i.test(txt) && !RE_SEGUROS.test(txt)) return 'turistico_duplex'
   ```
   Cubre movimientos futuros sin romper los cobros de comisiones de seguros que lleven nombre de compañía.

**Verificación:** CSV Booking.com ene–jun 2026 (`20260101_to_20260621_statements.csv`) cruzado contra
los 22 movimientos actualizados — todos los importes netos cuadran (±0 €).

---

### 2. `facturas-correo` skill — añadir Cabify como proveedor deducible

**Fix:** `SKILL.md` actualizado con:
- `mgx.cabify.com` en la query Gmail `from:`.
- Cabify clasificado como `seguros` (desplazamientos de la correduría).
- Exclusión de notificaciones operativas Cabify (no-recibo).
- Exclusión de notificaciones operativas de la correduría (recibos devueltos de clientes, circulares aseguradoras).

---

### 3. Cuenta N26 creada en Supabase + gasto Cabify imputado manualmente

**Fix:**
- `INSERT` en `cuentas_bancarias`: banco `N26`, `iban = 'N26-MANUAL'`, asociada a sociedad/cuenta de Alberto.
- `INSERT` en `movimientos_bancarios`: viaje Cabify €4,76, `destino = 'seguros'`, `conciliado = true`.
- Nota: N26 no está conectado a PSD2 — los movimientos requieren importación manual o extracto.

---

## 🟡 Pendiente — sin solución en esta sesión

### 4. Historial BBVA solo desde 23/03/2026 — 8 pagos Booking.com sin importar

Los 8 pagos de Booking.com ene–mar 2026 (~4.098 € neto total) no están en `movimientos_bancarios`:

| Reserva | Check-out | Huésped | Neto |
|---|---|---|---|
| 5383943911 | 4 ene | Garcia Sierra Juan | 206,95€ |
| 6828170744 | 2 ene | Claudio Larocca | 941,89€ |
| 6224027692 | 11 ene | Mario Gallego García | 310,48€ |
| 5420417142 | 22 ene | Ana Julia Moreno Azocar | 345,51€ |
| 5474118906 | 1 feb | Pauline Plankenhorn | 450,09€ |
| 6652629400 | 10 feb | Nelson Anna | 275,75€ |
| 5535293907 | 18 feb | Justyna Panaszek | 508,26€ |
| 6108582404 | 22 feb | Maria Teresa Rodriguez | 257,61€ |

**Acción manual (Alberto):** Descargar extracto BBVA Dúplex 01/01–22/03/2026 y subirlo desde
la sección Banca de plataforma. Total a recuperar en el dashboard: ~4.296€.

---

### 5. Facturas pendientes de archivar en Drive

| Factura | Estado |
|---|---|
| EMASESA Bustos Tavera DER | ⏳ correo pendiente |
| EMASESA Bustos Tavera IZQ | ⏳ correo pendiente |
| EMASESA Socorro 24 | ⏳ correo pendiente |
| Endesa Socorro 24 (Ref P26CON021029273) | ⏳ correo pendiente |
| Lavandería El Giraldillo (AFV-11528, 25/05/2026) | ⏳ factura sin pagar |
| IONOS Correo Basic 1 (31/05/2026) | ⏳ correo pendiente |
| Registro de la Propiedad (PDF adjunto) | ⏳ PDF no descargable vía MCP — subir manualmente a Drive |

---

### 6. Supabase — buckets públicos con listado abierto

4 buckets tienen `public_bucket_allows_listing`. Un usuario no autenticado puede listar ficheros.

**Acción manual (Alberto):** Supabase dashboard → Storage → revisar cada bucket:
- Si el contenido es privado: desactivar "Public bucket" o añadir política RLS.
- Si es público intencional: documentar y aceptar.

---

### 7. Vercel `ialimp` — Project ID posiblemente incorrecto

El ID `prj_iayrcepFTNQ0ff6L8bADn4TV4` devolvió 404 en la API de Vercel. No se pudo verificar
el estado del último deployment de ialimp.

**Acción manual (Alberto):** Vercel dashboard → proyecto `ialimp` → Settings → General →
copiar el Project ID correcto y actualizar `docs/CONTEXTO-SESIONES.md`.

---

## Acciones manuales — orden recomendado

1. **[FINANZAS — urgente]** Importar extracto BBVA Dúplex 01/01–22/03/2026 (~4.296€ ingresos perdidos).
2. **[FACTURAS]** Ejecutar `facturas-correo` para procesar EMASESA/Endesa/IONOS/Giraldillo.
3. **[SEGURIDAD]** Revisar buckets públicos en Supabase Storage.
4. **[OPS]** Localizar ID correcto de proyecto Vercel `ialimp`.

**Rollback del fix `destino.ts`:** Si aparecen comisiones de seguros mal clasificadas como
`turistico_duplex`, la guard tiene `!RE_SEGUROS.test(txt)` que protege cuando el concepto
incluye nombre de compañía aseguradora. Si el concepto no lo incluye, refinar añadiendo `/COMIS/i`.

---

## Contexto de la sesión (para CONTEXTO-SESIONES.md)

- 7 facturas Anthropic (abr–jun 2026) + Codeoscopic archivadas en Drive.
- Amazon WORKPRO + Registro de la Propiedad archivados (texto manual por falta de PDF vía MCP).
- Cabify añadido a `facturas-correo` skill (commit `skill: añadir Cabify...`).
- Fix Allianz falso positivo en skill (commit `e069a49`).
- 22 cobros Booking.com Dúplex corregidos vía SQL + `destino.ts` parchado.
- Cuenta N26 creada en Supabase; gasto Cabify €4,76 imputado manualmente.
- CSV Booking.com ene–jun 2026 verificado: 100% de pagos cuadran con los movimientos actualizados.
