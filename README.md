# mrhomes PMS

필리핀 임대 관리 웹앱 — 임차인(Tenant) + 임대인(Landlord) 포털

## 시스템 구성

```
mrhomes 생태계
├── CRM          → Admin/Agent 전용 (기존 시스템, Supabase 공유)
├── PMS 웹앱     → Tenant/Landlord 전용 (이 프로젝트)
└── rbs-homes    → 퍼블릭 매물 채널 (계약 만료 시 연결)
```

## 주요 기능

**임차인 앱 (`/tenant`)**
- 이번 달 임대료 납부 현황 + 영수증 업로드 (Supabase Storage)
- 납부 상태 실시간 반영 (Supabase Realtime)
- 홈케어 서비스 신청 (에어컨·청소·잔수리·핸디맨)
- 콘도 입주민 커뮤니티 게시판
- 계약 만료 60일 이내 → rbs-homes.com 락인 배너 자동 노출

**임대인 포털 (`/landlord`)**
- 보유 유닛 전체 현황 요약 카드
- 유닛별 납부 이력 + 영수증 이미지 확인
- 케어 서비스 진행 상태 추적
- 계약 만료 임박 알림

**공통**
- Supabase Auth 로그인 → 역할 자동 라우팅
- 미들웨어 역할 접근 제어 (tenant ↔ landlord 크로스 접근 차단)
- CRM(admin/agent) 접속 시 CRM URL로 리다이렉트

## 시작하기

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경변수 설정
```bash
cp .env.example .env.local
# .env.local 파일을 열어 Supabase URL, Anon Key 입력
```

### 3. Supabase 마이그레이션 실행
Supabase 대시보드 > SQL Editor에서 순서대로 실행:
```
supabase/migrations/001_schema.sql   # 테이블 생성
supabase/migrations/002_rls.sql      # RLS 정책
supabase/migrations/003_seed.sql     # 초기 데이터 (개발용)
supabase/migrations/004_storage.sql  # Storage 버킷 정책
```

### 4. Supabase Storage 버킷 확인
대시보드 > Storage 에서 아래 버킷이 생성되었는지 확인:
- `payment-receipts` (public)
- `care-reports` (public)

### 5. 개발 서버 실행
```bash
npm run dev
```

## 프로젝트 구조

```
src/
├── app/
│   ├── layout.tsx          # 루트 레이아웃
│   ├── page.tsx            # 역할별 리다이렉트
│   ├── login/page.tsx      # 로그인 페이지
│   ├── tenant/page.tsx     # 임차인 대시보드
│   └── landlord/page.tsx   # 임대인 포털
├── lib/
│   ├── supabase.ts         # 브라우저 클라이언트
│   └── supabase-server.ts  # 서버 컴포넌트 클라이언트
└── types/
    └── database.types.ts   # DB 스키마 TypeScript 타입
middleware.ts               # 인증 보호 + 역할 라우팅
```

## CRM 연동

CRM과 이 PMS 웹앱은 **동일한 Supabase 프로젝트**를 공유합니다.

| 작업 | 담당 시스템 |
|------|------------|
| 계약 생성·수정 | CRM |
| 납부 스케줄 생성 | CRM |
| 영수증 승인 (PAID 처리) | CRM |
| 케어 서비스 일정 확정 | CRM |
| 영수증 업로드 | PMS (임차인) |
| 케어 서비스 신청 | PMS (임차인) |
| 납부·케어 현황 조회 | PMS (임대인) |

## 배포

Vercel 권장:
```bash
vercel --prod
```
환경변수는 Vercel 대시보드 > Settings > Environment Variables 에서 설정.

## 기술 스택

- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind CSS v4
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Realtime)
- **인증**: Supabase Auth (이메일/비밀번호)
- **파일 저장**: Supabase Storage
