-- Trading-analista (IBKR) · Fase 1 — siembra de la watchlist inicial (capas A/B/C).
-- ⚠️ NO aplicado por la sesión Claude: Alberto lo lanza a mano tras crear las tablas
-- (ver trading_fase1.sql). La cantera de descubrimiento (capa C) la va rellenando el agente.
insert into trading_watchlist (simbolo, capa) values
 ('SPY','A'),('QQQ','A'),('IWM','A'),
 ('NVO','B'),('NVDA','B'),('META','B'),('MSFT','B'),('NFLX','B'),
 ('SPOT','B'),('RBLX','B'),('PLTR','B'),('LLY','B'),('CVX','B')
on conflict (simbolo) do nothing;
