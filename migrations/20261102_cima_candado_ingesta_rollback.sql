-- 20261102_cima_candado_ingesta_rollback.sql
--
-- Deshace 20261102_cima_candado_ingesta.sql. Inocuo para la ingesta: sin la tabla,
-- `ingesta-candado.ts` (CRM) degrada a «sin candado» (42P01 → aviso en log) y el
-- pull corre como antes del 02/11/2026. Si en ese momento hay un pull con el
-- candado, su DELETE de liberación falla y se registra como `candado_liberar_fallo`
-- sin afectar al resultado.

DROP TABLE IF EXISTS seguros.ingesta_candado;
