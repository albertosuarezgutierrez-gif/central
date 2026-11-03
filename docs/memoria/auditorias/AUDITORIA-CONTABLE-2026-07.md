# 🔍 Auditoría contable completa — 14/07/2026

Auditoría de **datos** de la contabilidad de Alberto (cuenta `4fdc993a…`) contra la BD real
(Supabase `wswbehlcuxqxyinousql`, siempre filtrando por `cuenta_id`). Objetivo pedido por Alberto:
**asegurar que no se ha perdido ningún gasto** y que todo cuadra.

**Veredicto: la contabilidad está sana.** Un hallazgo material (gasto real oculto) corregido, y
limpieza de residuos. Todos los arreglos aplicados por SQL (MCP).

## ✅ Cobertura y frescura (nada desincronizado)
- **BBVA** (`ES34…331175`) y **Kutxabank** (`ES90…550855`) corrientes completas **ene-2025 → 13-jul-2026**
  (ayer). El sync PSD2 está al día.
- Tarjetas **0300** (unificada) y **0302 Pilar** hasta jul-2026. N26 hasta jul-2026.
- Ingresos de pisos (**`incomes`**): 1.974 filas, con reservas hasta abr-2027. Frescos y poblados.

## 🔴 Hallazgo material — gasto real oculto, RECUPERADO (~406€)
Movimientos **reales del feed del banco (PSD2)** que habían quedado `duplicado_estado='ignorado'`
**sin ninguna copia activa** → estaban desaparecidos del P&L:
- **IBI del Ayuntamiento ×2** (EXPTE 37442 y 37441, **171,55€ c/u = 343,10€**): 2 recibos reales,
  cada uno duplicado (Excel+PSD2); el dedupe ignoró las 4 copias → 0 activas. **Restaurados** los 2 PSD2.
- **Kutxabank Seguro de Vida 25,63€** (PSD2): ignorado sin copia activa. **Restaurado.**
- **11 compras de tarjeta** (panadería/pequeñas, **37,20€**, <5€ c/u) sin copia activa → **restauradas**
  y confirmadas como personal.
- **Causa raíz (landmine):** el dedupe cross-origen (`lib/banca.ts::importarExtracto` guarda Excel↔PSD2)
  se pasó de frenada cuando había **2 movimientos legítimos del mismo importe el mismo día** (2 IBI de
  171,55€): ignoró también las copias PSD2 buenas. A vigilar / posible fix de código futuro.

## 🟢 Comprobaciones que salieron limpias
- **Cuenta fantasma BBVA** (`cdb981d3…`, 75 movimientos TODOS ignorados): verificado que los 75 tienen
  gemelo **activo** en el BBVA real → duplicados legítimos cross-account, **cero pérdida**. Queda oculta.
- **Sin reglas aprendidas genéricas peligrosas** en `banca_destino_reglas` (guarda `claveReglaValida` OK).
- **Correduría 2026** ingresa **7.236€** (gasto 6.103€ → **+1.133€**): NO está en el landmine del "0€ por
  regla secuestrada".
- **Traspasos internos netean a 0** (14.798,40 / 14.798,40) → las liquidaciones de tarjeta cuadran.
- **Ningún movimiento de 2026 sin `destino`.**
- **P&L 2026 por destino:** pisos +38.211€ · Dúplex +7.412€ · correduría +1.133€ · personal −19.645€ neto.

## 🧹 Limpieza aplicada
- **9 facturas más mal archivadas en el tenant DEMO** (`Holding Joaquín Jaén [seed-demo]`, 5.263€):
  todas reales de Alberto (Allianz, Booking×3, ASECON gestoría, IONOS, Petroprix, fal.ai, y una
  liquidación de tarjeta `PAGO RECIBO` mal parseada como factura). **Borradas del demo** (sus justificantes
  siguen en Gmail y los cargos ya están en el banco). El bug de raíz que las metía ahí se arregló en el
  **PR #896** (`facturas-scan` ahora escanea el Gmail solo para la cuenta dueña del buzón).

## 🟡 Backlog operativo (NO es pérdida — para revisar en la app)
- **3 facturas pendientes** en la cuenta de Alberto: 2 facturas de venta de Socorro (608,03€ + 504,57€) +
  **ASECON gestoría 1.210€**.
- **~38 cargos sin confirmar + ~70 abonos «por revisar»** en las corrientes (bandejas de `/finanzas` y
  `/banca`). Clasificación pendiente, no datos perdidos.
- **IONOS (177€) / gasolina (190€)** de la sesión previa: siguen como personal (conservador) a la espera de
  que Alberto confirme si alguno es de negocio (deducible).

## Contexto de la misma sesión (previo a la auditoría)
Limpieza de tarjetas: ~492€ sacados de `seguros` que no eran correduría (IONOS/gasolineras/clínica), 2 reglas
malas borradas, 11 devoluciones resueltas, tarjeta 0300 unificada. Fase 3 del extracto de tarjeta (#888) y
fix del cron de facturas (#896) mergeados.
