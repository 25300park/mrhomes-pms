-- ============================================================
-- mrhomes PMS — 001_schema.sql
-- Supabase 공유 DB 스키마
-- CRM(admin/agent) + PMS(tenant/landlord) 공용
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── ENUM types ───────────────────────────────────────────────
create type user_role as enum ('admin', 'agent', 'landlord', 'tenant');
create type payment_type as enum ('PDC', 'FULL_ADVANCE', 'HALF_ADVANCE', 'MONTHLY_TRANSFER');
create type payment_status as enum ('PENDING', 'AWAITING_APPROVAL', 'PAID', 'OVERDUE');
create type care_service_type as enum ('AIRCON', 'CLEANING', 'REPAIR', 'HANDYMAN');
create type care_status as enum ('PENDING', 'SCHEDULED', 'COMPLETED', 'CANCELLED');
create type contract_status as enum ('ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'TERMINATED');

-- ── profiles ─────────────────────────────────────────────────
-- Supabase Auth uid 와 1:1 매핑
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          user_role not null default 'tenant',
  full_name     text not null,
  email         text not null,
  phone         text,
  viber_id      text,                        -- 알림용 Viber ID
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── condo_masters ────────────────────────────────────────────
create table condo_masters (
  id                              serial primary key,
  condo_name                      text not null,
  address                         text,
  default_bill_notification_day   int not null default 1,  -- 매월 고지 기준일
  created_at                      timestamptz not null default now()
);

-- ── properties ───────────────────────────────────────────────
create table properties (
  id            uuid primary key default uuid_generate_v4(),
  condo_id      int references condo_masters(id),
  landlord_id   uuid not null references profiles(id),
  unit_number   text not null,              -- e.g. "31F-A"
  floor_area_sqm numeric(6,2),
  bedrooms      int,
  bathrooms     int,
  monthly_price numeric(12,2),             -- 기본 희망 임대료
  is_listed     boolean not null default false,  -- rbs-homes 퍼블릭 노출 여부
  listed_at     timestamptz,
  created_at    timestamptz not null default now()
);

-- ── lease_contracts ──────────────────────────────────────────
create table lease_contracts (
  id              uuid primary key default uuid_generate_v4(),
  property_id     uuid not null references properties(id),
  landlord_id     uuid not null references profiles(id),
  tenant_id       uuid not null references profiles(id),
  condo_id        int references condo_masters(id),
  start_date      date not null,
  end_date        date not null,
  monthly_rent    numeric(12,2) not null,
  payment_type    payment_type not null default 'MONTHLY_TRANSFER',
  status          contract_status not null default 'ACTIVE',
  notes           text,
  created_by      uuid references profiles(id),  -- CRM agent who created
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── payment_schedules ────────────────────────────────────────
create table payment_schedules (
  id                uuid primary key default uuid_generate_v4(),
  contract_id       uuid not null references lease_contracts(id) on delete cascade,
  due_date          date not null,
  amount_due        numeric(12,2) not null,
  status            payment_status not null default 'PENDING',
  pdc_number        text,                        -- PDC 수표 번호
  receipt_image_url text,                        -- Supabase Storage URL
  receipt_notes     text,                        -- 임차인 메모
  verified_at       timestamptz,
  verified_by       uuid references profiles(id), -- CRM admin who approved
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── care_service_requests ────────────────────────────────────
create table care_service_requests (
  id                uuid primary key default uuid_generate_v4(),
  contract_id       uuid not null references lease_contracts(id) on delete cascade,
  service_type      care_service_type not null,
  preferred_date    timestamptz not null,
  status            care_status not null default 'PENDING',
  price             numeric(10,2),
  description       text,
  report_image_url  text,                        -- 완료 후 결과 사진
  scheduled_at      timestamptz,                 -- CRM에서 확정한 방문 일시
  completed_at      timestamptz,
  assigned_to       text,                        -- 담당 기사 이름
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── community_posts ──────────────────────────────────────────
create table community_posts (
  id            uuid primary key default uuid_generate_v4(),
  condo_id      int not null references condo_masters(id),
  author_id     uuid not null references profiles(id),
  is_notice     boolean not null default false,  -- 관리자 공지 여부
  title         text not null,
  body          text not null,
  created_at    timestamptz not null default now()
);

-- ── notifications ────────────────────────────────────────────
create table notifications (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references profiles(id) on delete cascade,
  title         text not null,
  body          text not null,
  is_read       boolean not null default false,
  related_type  text,                            -- 'payment' | 'care' | 'community'
  related_id    uuid,
  created_at    timestamptz not null default now()
);

-- ── updated_at 자동 갱신 트리거 ──────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create trigger trg_contracts_updated_at
  before update on lease_contracts
  for each row execute function set_updated_at();

create trigger trg_payments_updated_at
  before update on payment_schedules
  for each row execute function set_updated_at();

create trigger trg_care_updated_at
  before update on care_service_requests
  for each row execute function set_updated_at();

-- ── 계약 만료 임박 자동 상태 갱신 ───────────────────────────
-- (Supabase pg_cron 또는 Edge Function에서 매일 실행)
create or replace function refresh_contract_status()
returns void language plpgsql as $$
begin
  update lease_contracts
  set status = 'EXPIRING_SOON'
  where status = 'ACTIVE'
    and end_date between current_date and current_date + interval '60 days';

  update lease_contracts
  set status = 'EXPIRED'
  where status in ('ACTIVE','EXPIRING_SOON')
    and end_date < current_date;
end;
$$;

-- ── 연체 자동 처리 ───────────────────────────────────────────
create or replace function mark_overdue_payments()
returns void language plpgsql as $$
begin
  update payment_schedules
  set status = 'OVERDUE'
  where status = 'PENDING'
    and due_date < current_date;
end;
$$;
