<!-- verificado: 2026-07-16 -->
# Estructura de Google Drive — `CENTRAL/` (fuente de verdad)

> **Para qué.** Mapa único de la organización del Drive de Alberto: qué sección contiene qué,
> el `fileId` de cada carpeta, las reglas para que **siga** ordenado, y qué automatismos
> escriben en Drive. Lo consultan tanto Claude (en sesión) como los agentes programados
> (`facturas-correo`) para **no volver a inventarse rutas**.
>
> **Cómo se mantiene.** Si creas/renombras/mueves una carpeta de `CENTRAL`, actualiza su fila aquí.
> La auditoría diaria (`/auditoria-diaria`) reconcilia este doc contra el Drive real.

## Principio clave — los IDs NO cambian al mover

En Google Drive, **mover o renombrar una carpeta conserva su `fileId`**. Los agentes y los
Apps Scripts referencian las carpetas por **ID, no por ruta**. Consecuencia práctica:

- **Reorganizar = anidar las carpetas buenas que ya existen bajo `CENTRAL`.** No hay que
  reconstruir nada ni cambiar los IDs cableados en las skills. El pipeline de contabilidad
  sigue funcionando sin tocar una línea de código.
- Lo único que cambia son las **rutas legibles por humanos** (y este doc). Los `factura_ref`
  de `movimientos_bancarios` (que guardan `fileId` de Drive) **siguen válidos**.
- Por eso la mudanza usa **mover** (preserva ID), nunca copiar (crea un ID nuevo y rompe enlaces).

## El árbol y sus IDs

Raíz: **`CENTRAL/`** → `1won_FB5-36IPLa81WFdTm_SqYvO4enhs`

| Sección | Subcarpeta | `fileId` | Qué va aquí |
|---|---|---|---|
| **01 · PROGRAMA** | — | `1zgcf3hlfisn3ltUJVxq6Mnkafw_8TWoZ` | lo que uso con la IA para el código |
| | `ia.rest` | `1yTVnTSW5JFFrZ3494a2OJigrKyGBKzCw` | material del vertical ia.rest |
| | `plataforma-y-verticales` | `1uKoDyMr9296E5-9WdBdcBG_w0LG1zjaP` | resto de verticales |
| | `documentacion` | `1SEWt-CfE-pbo7KHJFzySXyeJcOK-oP8I` | manuales, `.md`, referencias técnicas |
| | `_archivo` | `1OfGvr-pQ6BXeN-dyP_1-T7fKbjtS5tB_` | zips, `.sql`, backups (NO el `.git`) |
| **02 · CONTABILIDAD** | — | `18SOMzexkKpI0XYB6rwgPDDjeJCq71jeh` | fiscal y financiero |
| | `renta-irpf` | `1i15-L38NvjRIBQF2CN-ztAeEXBUGKAIP` | declaraciones, cuestionarios de renta |
| | `ingresos` | `1xBi1Ew4l8qnB8R-dPg-38fINKTzlAFeI` | INGRESOS, resúmenes de ingresos |
| | `bancos` | `1NK__SD71IWDumj3PdvwW50oNOkR6buF1` | certificados y extractos bancarios |
| | `informes` | `1l2OLodxPuL07tKykZKtBV382w6yRMQQA` | DAC7, resúmenes de pisos, viabilidad |
| **03 · FACTURAS Y GASTOS** | — | `1qHEoG_6KkELi9Jo-F5eohObZUd8k0_MW` | justificantes de gasto |
| | `apartamentos` | *= la existente `FACTURAS Apartamentos`* `10fj31nrvi4b4Q7X-PDKdxhkGunRPlWNo` | **pipeline vivo** (ver abajo) |
| | `suministros` | `1OjVK9nCL2BP1Ll8yYvYFyicxNcj_A7i1` | luz, agua, telefonía |
| | `personal` | `1q-fMhtRXDHEsCGEQiVge80DikoUUmokG` | facturas personales no deducibles |
| | `correduria` | `1VZeuICm8z2E7MC6nTjTQ5dhVuwI6hw5d` | gastos de la correduría |
| | `_buzon` | `1GoXZSURP4-r1GiAT3OacPoF1jQmuMFU3` | entra sin clasificar → se reparte |
| **04 · CLIENTES** | — | `1Kn8U9CB9Za1odex9TWsfq4fnTnj1s39Z` | conversaciones y comercial |
| | `grabaciones-y-transcripciones` | `1khOZcr9Me9avm4TSPpN5CHODEJB_F-y7` | `.txt`/audio de llamadas y reuniones |
| | `reuniones` | `1Eapg4Mh1Db1H5gezn1xKCRZfsK1pkcnO` | actas y notas de reuniones |
| | `leads` | `1KMZKGEMlGiDhvwL89T9GCT3p0K76Nn8Y` | prospección |
| | `por-cliente` | `10iEFYxLlZmd2AQTvaU3B4v9lBRgMDrYk` | carpeta por cliente (Joaquín Jaén…) |
| **05 · PERSONAL** | — | `1l_d0bxjZfvFc5kD6HCJBlV_jTroPNeSk` | fuera del flujo de la IA |
| | `seguros` | `196TRg3vFz6a3dCGoBMEP08ck6lfbUS0O` | pólizas y correduría personal |
| | `pisos` | `1gQ8BTB_a4VyjW16Bb5gcOxeGGdQvr_BF` | contratos, llaves, fotos de pisos |
| | `catering-historico` | `1EaL3EAEypYuK_UzRM29fNnu0L79DWk_6` | TRIUNFO y negocio anterior |
| | `salud-y-varios` | `18uY0jfkwB9jW5eX8Vru1Is5l-6wjmuoH` | salud, misceláneo personal |

## Quién ESCRIBE en Drive (repuntar = solo documentación, los IDs no cambian)

- **Agente `facturas-correo`** (`.claude/skills/facturas-correo/SKILL.md`). Archiva justificantes
  deducibles y mantiene la papelera de duplicados. Referencia por `fileId` → **no hay que cambiarle
  los IDs**; al anidar `FACTURAS Apartamentos` bajo `03`, sigue funcionando. IDs vivos de su pipeline:
  - `FACTURAS Apartamentos` = `03/apartamentos` → `10fj31nrvi4b4Q7X-PDKdxhkGunRPlWNo`
  - `… / 2026` (raíz del año) → `1M7PwjU3MSJ7zb83rhlXzTx1O2RlTad3O`
  - `_buzon_pdf` (destino del Apps Script) → `1lQXsajYn-7zkupIpEwvA_Sdr2BI95pbh`
  - `_DUPLICADOS_BORRAR` → `1Au-_pFEPqvwZN_a7xKNZzVZOWGMAAO7Z`
  - `_subir_aqui` (subidas manuales) → `1JlK9JXIpqlbDlOawtAFlk4_X7bn0Onjf`
- **Apps Script `Facturas a Drive`** (proyecto en el Drive de Alberto, trigger horario). Copia los
  PDF de Gmail a `_buzon_pdf` por `fileId` → **no le afecta la mudanza**.
- **`correo-triaje`** NO escribe en Drive (solo etiqueta Gmail); no requiere cambios.

## Reglas para que SIGA ordenado

1. **Nunca se escribe en la raíz de «Mi unidad».** Todo lo que entra sin clasificar cae en un único
   **`_buzon`** (`03/_buzon` para facturas; el agente/vigilante lo reparte).
2. **Nombres en minúscula y sin acentos** en las subcarpetas nuevas (evita atragantar scripts/URLs).
   Las secciones raíz usan `NN · NOMBRE` (el `·` es cosmético, se referencian por ID).
3. **El desglose por año va DESPUÉS del tema** (`suministros/luz/2025/`), nunca al revés.
4. **Mover, no copiar** (preserva `fileId` y no rompe los `factura_ref` del banco).
5. **El código no vive en Drive.** El volcado del repo con su `.git` (carpeta `Mi portátil / Cloude`)
   se saca a `_REVISAR_BORRAR` para borrarlo; el código versionado vive en GitHub.

## Mudanza (Paso 2) y vigilante (Paso 4)

- Script de mudanza (one-shot, lo ejecuta Alberto): `scripts/drive/reorganizar-drive.gs`. Mueve las
  carpetas buenas bajo `CENTRAL`, reparte los sueltos de la raíz y aparta la basura a
  `_REVISAR_BORRAR`. Trae `DRY_RUN` (por defecto **true**): primero enseña el plan, no toca nada.
- Vigilante semanal (Paso 4, pendiente de instalar): Apps Script con disparador de tiempo que barre
  `_buzon` y la raíz, reparte, marca duplicados y avisa por Telegram. Claude supervisa y reporta.
