-- ============================================================
-- mrhomes PMS — 003_seed.sql
-- 개발/테스트용 초기 데이터
-- !! 프로덕션에서 실행 금지 !!
-- ============================================================

-- ── condo_masters ────────────────────────────────────────────
insert into condo_masters (condo_name, address, default_bill_notification_day) values
  ('Serendra BGC',       'Serendra, Taguig, Metro Manila',      1),
  ('One Uptown Residences', 'BGC, Taguig, Metro Manila',        1),
  ('Avida Towers Verte', 'Taguig, Metro Manila',                5);

-- ── Supabase Auth 유저는 대시보드에서 직접 생성 후 아래 profiles insert ──
-- 예시 UUID는 실제 Auth 유저 ID로 교체 필요

-- insert into profiles (id, role, full_name, email, phone) values
--   ('00000000-0000-0000-0000-000000000001', 'admin',    'Admin User',    'admin@mrhomes.ph',    '+639001111111'),
--   ('00000000-0000-0000-0000-000000000002', 'agent',    'Agent Maria',   'maria@mrhomes.ph',    '+639002222222'),
--   ('00000000-0000-0000-0000-000000000003', 'landlord', 'Landlord Kim',  'kim@example.com',     '+639003333333'),
--   ('00000000-0000-0000-0000-000000000004', 'tenant',   'John Park',     'john@example.com',    '+639004444444');
