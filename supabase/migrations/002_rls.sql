-- ============================================================
-- mrhomes PMS — 002_rls.sql
-- Row Level Security 정책
-- CRM: admin / agent 역할 → 전체 접근
-- PMS: tenant / landlord → 본인 데이터만 접근
-- ============================================================

-- ── RLS 활성화 ───────────────────────────────────────────────
alter table profiles                  enable row level security;
alter table properties                enable row level security;
alter table lease_contracts           enable row level security;
alter table payment_schedules         enable row level security;
alter table care_service_requests     enable row level security;
alter table community_posts           enable row level security;
alter table notifications             enable row level security;

-- ── 헬퍼 함수 ────────────────────────────────────────────────
-- 현재 로그인 유저의 role 반환
create or replace function get_my_role()
returns user_role language sql stable as $$
  select role from profiles where id = auth.uid();
$$;

-- CRM 사용자 여부 (admin 또는 agent)
create or replace function is_crm_user()
returns boolean language sql stable as $$
  select get_my_role() in ('admin', 'agent');
$$;

-- ── profiles ─────────────────────────────────────────────────
-- 본인 프로필 조회
create policy "profiles: self read"
  on profiles for select
  using (id = auth.uid() or is_crm_user());

-- 본인 프로필 수정
create policy "profiles: self update"
  on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- admin/agent는 모든 프로필 수정 가능
create policy "profiles: crm full update"
  on profiles for update
  using (is_crm_user());

-- 신규 프로필 생성은 본인만
create policy "profiles: insert own"
  on profiles for insert
  with check (id = auth.uid());

-- ── properties ───────────────────────────────────────────────
-- landlord: 본인 매물만 조회
-- tenant: 본인 계약 연결된 매물만 조회
-- crm: 전체 조회
create policy "properties: landlord read own"
  on properties for select
  using (
    landlord_id = auth.uid()
    or is_crm_user()
    or exists (
      select 1 from lease_contracts lc
      where lc.property_id = properties.id
        and lc.tenant_id = auth.uid()
        and lc.status in ('ACTIVE','EXPIRING_SOON')
    )
  );

-- landlord: 본인 매물 수정
create policy "properties: landlord update own"
  on properties for update
  using (landlord_id = auth.uid() or is_crm_user());

-- crm만 매물 생성
create policy "properties: crm insert"
  on properties for insert
  with check (is_crm_user() or landlord_id = auth.uid());

-- ── lease_contracts ──────────────────────────────────────────
-- tenant: 본인 계약 조회
-- landlord: 본인 매물 계약 조회
-- crm: 전체
create policy "contracts: tenant read own"
  on lease_contracts for select
  using (
    tenant_id = auth.uid()
    or landlord_id = auth.uid()
    or is_crm_user()
  );

-- 계약 생성/수정은 CRM만
create policy "contracts: crm write"
  on lease_contracts for insert
  with check (is_crm_user());

create policy "contracts: crm update"
  on lease_contracts for update
  using (is_crm_user());

-- ── payment_schedules ────────────────────────────────────────
-- 계약 기준으로 접근 제어
create policy "payments: read via contract"
  on payment_schedules for select
  using (
    is_crm_user()
    or exists (
      select 1 from lease_contracts lc
      where lc.id = payment_schedules.contract_id
        and (lc.tenant_id = auth.uid() or lc.landlord_id = auth.uid())
    )
  );

-- tenant: 영수증 업로드 (status = PENDING 인 경우만)
create policy "payments: tenant upload receipt"
  on payment_schedules for update
  using (
    status = 'PENDING'
    and exists (
      select 1 from lease_contracts lc
      where lc.id = payment_schedules.contract_id
        and lc.tenant_id = auth.uid()
    )
  )
  with check (
    -- tenant는 status를 AWAITING_APPROVAL로만 변경 가능
    status = 'AWAITING_APPROVAL'
  );

-- CRM: 상태 변경 전체 가능 (PAID, OVERDUE 등)
create policy "payments: crm full update"
  on payment_schedules for update
  using (is_crm_user());

-- CRM: 스케줄 생성
create policy "payments: crm insert"
  on payment_schedules for insert
  with check (is_crm_user());

-- ── care_service_requests ────────────────────────────────────
-- tenant: 본인 계약 케어 신청 조회
-- landlord: 본인 매물 케어 현황 조회
-- crm: 전체
create policy "care: read via contract"
  on care_service_requests for select
  using (
    is_crm_user()
    or exists (
      select 1 from lease_contracts lc
      where lc.id = care_service_requests.contract_id
        and (lc.tenant_id = auth.uid() or lc.landlord_id = auth.uid())
    )
  );

-- tenant: 케어 서비스 신청 (PENDING 상태로만 생성)
create policy "care: tenant insert"
  on care_service_requests for insert
  with check (
    exists (
      select 1 from lease_contracts lc
      where lc.id = care_service_requests.contract_id
        and lc.tenant_id = auth.uid()
        and lc.status in ('ACTIVE','EXPIRING_SOON')
    )
  );

-- tenant: 본인 신청 취소 (PENDING 상태만)
create policy "care: tenant cancel"
  on care_service_requests for update
  using (
    status = 'PENDING'
    and exists (
      select 1 from lease_contracts lc
      where lc.id = care_service_requests.contract_id
        and lc.tenant_id = auth.uid()
    )
  )
  with check (status = 'CANCELLED');

-- CRM: 스케줄·완료 처리 전체
create policy "care: crm full update"
  on care_service_requests for update
  using (is_crm_user());

-- ── community_posts ──────────────────────────────────────────
-- 같은 condo 입주민만 조회
create policy "community: read same condo"
  on community_posts for select
  using (
    is_crm_user()
    or exists (
      select 1 from lease_contracts lc
      join properties p on p.id = lc.property_id
      where lc.tenant_id = auth.uid()
        and p.condo_id = community_posts.condo_id
        and lc.status in ('ACTIVE','EXPIRING_SOON')
    )
  );

-- 입주민 / CRM 모두 게시 가능 (공지는 CRM만)
create policy "community: tenant post"
  on community_posts for insert
  with check (
    author_id = auth.uid()
    and (is_notice = false or is_crm_user())
  );

-- 본인 게시글 수정
create policy "community: edit own"
  on community_posts for update
  using (author_id = auth.uid() or is_crm_user());

-- ── notifications ────────────────────────────────────────────
-- 본인 알림만 조회
create policy "notifications: read own"
  on notifications for select
  using (user_id = auth.uid() or is_crm_user());

-- 읽음 처리: 본인만
create policy "notifications: mark read"
  on notifications for update
  using (user_id = auth.uid())
  with check (is_read = true);

-- 알림 생성: CRM 또는 시스템(service_role)
create policy "notifications: crm insert"
  on notifications for insert
  with check (is_crm_user());
