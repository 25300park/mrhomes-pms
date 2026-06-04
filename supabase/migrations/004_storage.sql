-- ============================================================
-- mrhomes PMS — 004_storage.sql
-- Supabase Storage 버킷 및 정책 설정
-- Supabase 대시보드 > Storage > SQL Editor 에서 실행
-- ============================================================

-- ── 버킷 생성 ────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values
  ('payment-receipts', 'payment-receipts', true),
  ('care-reports',     'care-reports',     true)
on conflict (id) do nothing;

-- ── payment-receipts 정책 ────────────────────────────────────
-- 인증된 사용자만 업로드 가능 (본인 폴더만)
create policy "receipts: tenant upload own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 공개 읽기 (URL로 직접 접근 가능)
create policy "receipts: public read"
  on storage.objects for select
  to public
  using (bucket_id = 'payment-receipts');

-- 본인 파일 삭제
create policy "receipts: tenant delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── care-reports 정책 ─────────────────────────────────────────
-- CRM(service_role)만 업로드 가능 (완료 사진)
create policy "care-reports: service role upload"
  on storage.objects for insert
  to service_role
  with check (bucket_id = 'care-reports');

-- 공개 읽기
create policy "care-reports: public read"
  on storage.objects for select
  to public
  using (bucket_id = 'care-reports');
