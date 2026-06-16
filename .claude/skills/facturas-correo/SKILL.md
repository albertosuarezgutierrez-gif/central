---
name: facturas-correo
description: Agente PROGRAMADO que revisa el Gmail de Alberto buscando facturas/justificantes de gasto, los clasifica (personal vs negocio deducible), archiva en Google Drive los deducibles y los concilia con los movimientos bancarios de plataforma. Úsala cuando Alberto pida "revisa mis correos/facturas", o cuando la dispare el trigger diario de Claude Code web. NO es un proceso 24/7: se despierta, hace una pasada sobre lo nuevo y deja un resumen.
---

# Agente de facturas por correo — casa de marcas (Alberto)

Revisa el buzón, separa lo que es **gasto de negocio deducible** de lo **personal**,
archiva los justificantes deducibles en Drive y los cruza con el banco. Entorno **efímero**:
cada ejecución es una pasada completa e idempotente (se apoya en una etiqueta de Gmail para no
reprocesar). Pensada para correr 1×/día por un trigger de Claude Code web, o a petición.

## Contexto de negocio (crítico para clasificar)

### Identidad del cliente
- **Desde nov 2025**: facturas a **Alberto Suarez Gutierrez** (DNI 28823484E) — forma actual
- **Hasta oct 2025**: facturas a **Punto y Coma Gestión SL** (NIF B90446683) — empresa cerrada a finales 2025
- Ambas identidades son válidas como receptor; las antiguas a Punto y Coma siguen siendo deducibles
- Si llega una factura nueva (2026+) a Punto y Coma → anomalía, marcar "para revisar"

### Inmuebles y estructura
| Inmueble | Alias | Dirección | Banco | Notas |
|---|---|---|---|---|
| Casa Socorro | socorro | CL SOCORRO 24 | Kutxabank | Propiedad |
| Luxury | luxury | CL BUSTOS TAVERA 22, Bajo DER | Kutxabank | Alquilado a Gutierrez Alcala |
| Bustos Reforma | bustos | CL BUSTOS TAVERA 22, Bajo IZQ | Kutxabank | Alquilado a Gutierrez Alcala |
| Dúplex | duplex | PASAJE FRANCISCO MOLINA 4 | BBVA | Propiedad |

Luxury y Bustos Reforma comparten edificio (Bustos Tavera 22) y línea DIGI de internet.

### Cuentas bancarias
- **Kutxabank** (****0855): pisos turísticos + tarjeta ****0300
- **BBVA** (****1175): dúplex (Pasaje Francisco) + correduría (Generali)

## Proveedores conocidos y clasificación

### turistico_pisos (deducible — Kutxabank)
| Proveedor | Frecuencia | Importe aprox. | Notas |
|---|---|---|---|
| Si Que Brilla SL (`limpiezascruzz@gmail.com`) | Mensual fin de mes | 800-1.440€ | Banco: "TRANSF. 2100 LIMPIEZA APARTAMENTOS" |
| El Giraldillo (`administracion@lavanderiaelgiraldillo.es`) | Mensual | 400-600€ | Banco: "TRANSF. 0049 LAVANDERIA" o "ABONO FACTURA LAVANDERIA XXXXX". Sin desglose por piso → reparto ÷4 |
| ENDESA pisos (3 contratos Kutxabank) | Mensual | 38-134€ c/u | Contratos: 130139486193 / 130139685932 / 130139655504 |
| EMASESA Socorro (contrato 0104785292) | Bimestral (ene/mar/may/jul/sep/nov) | 84-166€ | |
| EMASESA Bustos Reforma (contrato 0105185751) | Bimestral | 33-57€ | Tarifa Doméstico |
| EMASESA Luxury (contrato 0105137440) | Bimestral | 59-91€ | Tarifa Turístico |
| DIGI (2/3 de la factura) | Mensual | ~76€ total → 50,67€ negocio | 3 líneas: Socorro + Luxury/Bustos + Monte Carmelo(personal). Solo 2/3 deducible |
| PriceLabs (`support@pricelabs.co`) | Mensual (~día 8) | ~55-65 USD | Tarjeta Kutxabank. Sin desglose → reparto ÷4 |
| Smoobu | Anual (marzo) | ~1.018€ | Tarjeta Kutxabank. Sin desglose → reparto ÷4 |
| BOOKING.COM (comisiones/facturas) | Mensual | Variable | Facturas Invoice XXXXXXX vía noreply@booking.com |
| Chekin Soluciones Digitales SL (`invoice+statements@stripe.com` de Chekin) | Mensual | ~variable | Check-in digital para pisos turísticos. Deducible. |
| IONOS (`noreply@ionos.es`) | Mensual | Variable | **PERSONAL** — informática a nombre personal. NO archivar como deducible |
| Vercel (`invoice+statements@vercel.com`) | Mensual | Variable | **PERSONAL** — informática junto con IONOS. NO archivar como deducible |
| Renta Gutierrez Alcala — Luxury (Bajo DER) | Mensual (~día 8) | ~309€ | Banco: "RECIBO GUTIERREZ ALCALA BAJO DERECHA BUSTOS TAVERA 22". Alquiler del piso para subarrendar turístico. Deducible. |
| Renta Gutierrez Alcala — Bustos (Bajo IZQ) | Mensual (~día 8) | ~259€ | Banco: "RECIBO GUTIERREZ ALCALA BAJO IZQUIERDA BUSTOS TAVERA 22". Alquiler del piso para subarrendar turístico. Deducible. |
| IKEA/LEROY/BRICO (mobiliario pisos) | Esporádico | Variable | Deducible si es para pisos turísticos |
| D CULTO (comida empresa) | Esporádico | Variable | Deducible |

### turistico_duplex (deducible — BBVA)
| Proveedor | Frecuencia | Importe aprox. | Notas |
|---|---|---|---|
| ENDESA dúplex (contrato CPVR, BBVA) | Mensual | 63-79€ | Banco: "ADEUDO DE ENDESA ENERGIA S.A. CPVR" |
| Comunidad Pasaje Francisco Molina 4 | Mensual (~días 2-13) | 76,18€ fijos | Banco: "COMU. DE PROP.PASAJE FRANCISCO MOLINA 4" |

### seguros (correduría — BBVA o Kutxabank)
| Proveedor | Frecuencia | Notas |
|---|---|---|
| Generali, Allianz, Mapfre, Caser… | Variable | Primas de seguros. Ingresos de Generali en BBVA = liquidaciones correduría (traspaso_interno o seguros) |

### personal (NO deducible)
| Proveedor | Notas |
|---|---|
| IONOS | Informática personal |
| DIGI (1/3 de la factura) | Línea Monte Carmelo |
| Comunidad Monte Carmelo (Kutxabank) | 110€/mes. Banco: "RECIBO D - MONTECARMELO" |
| IBI Monte Carmelo | 2×171,55€ semestrales. Banco: "RECIBO EXCMO. AYUNTAMIEN IBI" |
| Círculo Mercantil / natación / gimnasio | |
| Colegio / escuela infantil (Clickedu, Estrella Polar) | |
| Anthropic/Claude subscriptions | |
| TUTROCITO, compras familia | |

### Proveedores a verificar / ignorar
| Proveedor | Estado |
|---|---|
| TotalEnergies | Dado de baja. Emails residuales — ignorar, no archivar. |
| BSH Electrodomésticos | Servicio técnico ~50€. Alberto no lo pagará — ignorar. |
| Petroprix (gasolina) | Pendiente confirmar si deducible como desplazamiento de negocio. |
| IBI Socorro | No visto en 2026. Cuando llegue → `turistico_pisos`. |

## Errores históricos de clasificación en banco (ya detectados)
Estos movimientos están mal clasificados en `movimientos_bancarios`. Corregir si se encuentran:
- **Si Que Brilla** (TRANSF. 2100 LIMPIEZA APARTAMENTOS): `personal` → `turistico_pisos`
- **El Giraldillo** (TRANSF. 0049 LAVANDERIA): `personal` → `turistico_pisos`
- **IONOS** (COMPRA EN PAYPAL *IONOS CLOUD): `turistico_pisos` → `personal`
- **Renta Gutierrez Alcala** (RECIBO GUTIERREZ ALCALA BUSTOS TAVERA): pendiente confirmar con Alberto

## Herramientas (MCP de la sesión)
- **Gmail**: `search_threads`, `get_thread` (FULL_CONTENT), `list_labels`, `create_label`, `label_message`
- **Google Drive**: `search_files`, `create_file`, `get_file_metadata`, `download_file_content`
- **Supabase** (`wswbehlcuxqxyinousql`): `execute_sql` para conciliar contra `movimientos_bancarios`

## Estado / idempotencia (clave — NO reprocesar)
- Etiqueta de Gmail **`Facturas/Procesado`**. Al terminar con un correo, etiquétalo.
- La query de entrada SIEMPRE excluye `-label:Facturas/Procesado`. Si la etiqueta no existe, créala en la primera ejecución.

## Paso 0 — Control de recurrentes del mes (NUEVO)
Antes de buscar candidatos, verifica que los gastos fijos del mes en curso ya han llegado.
Mes actual = DATE_TRUNC('month', CURRENT_DATE).

**Recurrentes mensuales** (avisar si no aparecen antes del día 10 del mes siguiente):
- Si Que Brilla (limpieza) — TRANSF. 2100 LIMPIEZA
- El Giraldillo (lavandería) — TRANSF. 0049 LAVANDERIA
- ENDESA dúplex — BBVA
- ENDESA pisos ×3 — Kutxabank
- DIGI — Kutxabank
- Comunidad Pasaje Francisco — BBVA
- Comunidad Monte Carmelo — Kutxabank (personal)
- PriceLabs — tarjeta Kutxabank (día ~8)
- Chekin Soluciones — Kutxabank
- Renta Gutierrez Alcala ×2 — Kutxabank (día ~8)

**Recurrentes bimestrales** (ene/mar/may/jul/sep/nov):
- EMASESA ×3 (Socorro + Bustos Reforma + Luxury)

**Recurrentes anuales**:
- Smoobu (marzo) — tarjeta Kutxabank
- IBI Socorro (pendiente confirmar fecha) — `turistico_pisos`
- IBI Monte Carmelo (semestral, jun) — `personal`

Si falta alguno: incluirlo en el bloque "Para tu decisión" del resumen.

## Paso 1 — Localizar candidatos (Gmail)
Query base (ventana corta para la pasada diaria; amplía a `newer_than:30d` en la primera):

```
newer_than:2d -label:Facturas/Procesado -in:draft
( subject:(factura OR justificante OR recibo OR invoice OR receipt OR pedido OR ticket)
  OR has:attachment filename:pdf
  OR from:(pricelabs.co OR ionos OR booking OR smoobu OR stripe OR endesa OR emasesa OR digi
          OR giraldillo OR totalenergies OR vercel OR chekin OR bsh OR petroprix OR generali
          OR allianz OR mapfre OR caser) )
```
Incluye también los **reenvíos de `pilar.pina.franco@gmail.com`** que sean justificantes de compra.
Descarta newsletters, mensajes de huéspedes Booking, citas de calendario y promociones de correduría.

Para cada candidato: `get_thread` FULL_CONTENT → extrae **emisor, fecha, importe(s), concepto,
a nombre de quién, método de pago** del cuerpo o del PDF adjunto.

## Paso 2 — Clasificar
`destino` ∈ { turistico_pisos, turistico_duplex, seguros, personal }

Usa la tabla de proveedores conocidos de arriba. Reglas adicionales:
- **DIGI**: un solo recibo cubre 3 líneas → 2/3 `turistico_pisos`, 1/3 `personal`
- **PriceLabs / Smoobu / El Giraldillo**: sin desglose por piso → imputar ÷4 apartamentos, destino `turistico_pisos`
- **IONOS**: siempre `personal`
- **Facturas antiguas a Punto y Coma SL** (hasta oct 2025): válidas, clasificar normalmente
- **Ante la duda** → `personal` y marcar "para revisar con Alberto"

## Paso 3 — Archivar en Drive (solo deducibles)
Estructura: **`Facturas / <año> / <negocio>`**

| destino | Carpeta Drive |
|---|---|
| turistico_pisos | `Facturas/2026/Pisos turísticos` |
| turistico_duplex | `Facturas/2026/Duplex` |
| seguros | `Facturas/2026/Seguros` |

- `search_files` para encontrar/crear la carpeta (créala con `create_file` tipo carpeta si falta).
- Nombre del fichero: `YYYY-MM-DD_emisor_importe.pdf` (ej. `2026-06-08_pricelabs_64.96USD.pdf`).
- Si el correo trae **PDF adjunto** → descárgalo con `download_file_content` y súbelo con `create_file`.
- Si el justificante es solo **cuerpo HTML** → guarda el cuerpo como documento con el mismo nombre.
- Los **personales NO se archivan**.

Facturas de Si Que Brilla ya están en Drive en carpetas mensuales — verificar con `search_files` antes de subir duplicados.

## Paso 4 — Conciliar con el banco (Supabase)
Por cada factura, busca su cargo. SIEMPRE scope por `cuenta_bancaria_id`:
```sql
SELECT mb.id, mb.fecha_operacion, mb.importe, mb.concepto, mb.destino
FROM movimientos_bancarios mb
JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
WHERE abs(mb.importe + <importe_factura>) < 0.02
  AND mb.fecha_operacion BETWEEN <fecha_factura>::date - 14 AND <fecha_factura>::date + 14
  AND cb.banco ILIKE '%<banco_esperado>%'
ORDER BY abs(mb.fecha_operacion - <fecha_factura>::date) LIMIT 3;
```
- **Encontrado + destino incorrecto** → propón UPDATE del `destino` (especialmente los errores históricos listados arriba).
- **No encontrado** → "pendiente de que entre el movimiento / extracto sin subir".

## Paso 5 — Etiquetar, resumir y notificar
- `label_message` con `Facturas/Procesado` en cada correo tratado.
- Resumen en tres bloques:
  1. **Deducibles archivados** — emisor · importe · negocio · enlace Drive · conciliación (✅/⏳)
  2. **Personales** — emisor · importe (no archivado)
  3. **Para tu decisión** — ambiguos + recurrentes que faltan este mes
- **Notificación**: crea un draft en Gmail con `create_draft` dirigido a
  `alberto.suarez.gutierrez@gmail.com` con el resumen completo. Asunto:
  `🧾 Facturas [YYYY-MM-DD] — X deducibles, Y pendientes de decisión`.
  Aparece en la carpeta Borradores de Gmail. Si no hay nada relevante
  (ningún deducible nuevo ni recurrente que falte), NO crear draft.

## Trigger (paso MANUAL de Alberto, 1 sola vez)
Claude Code web → crear **trigger programado diario** que lance una sesión con el prompt:
«Ejecuta la skill `facturas-correo`». El entorno debe tener conectados los MCP de Gmail, Google
Drive y Supabase. Sin el trigger, la skill solo corre cuando Alberto la pide.

## Límites v1
- Entorno efímero → pasadas idempotentes, no vigilancia continua.
- OCR de PDF: si el importe no está en el cuerpo, intenta `download_file_content`; si no se puede leer → "para tu decisión".
- Multi-tenant: toda query de banco SIEMPRE scoped por banco/cuenta.
