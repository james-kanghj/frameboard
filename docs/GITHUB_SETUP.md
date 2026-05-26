# GitHub 셋업 가이드

이 가이드는 로컬 코드를 GitHub에 올리고, Projects 보드까지 세팅하는 전체 흐름입니다.

## 1. GitHub 레포 생성

1. https://github.com/new 접속
2. 다음 값으로 생성:
   - **Repository name**: `frameboard`
   - **Description**: `An open-source workspace for product teams to run RICE, ICE, MoSCoW, and Value × Effort prioritization.`
   - **Visibility**: **Public** ✅ (Claude OSS 심사 필수 조건)
   - **Initialize this repository** - 전부 체크 해제 (이미 로컬에 파일 있음)
3. Create repository

## 2. 로컬 → GitHub 푸시

```bash
cd /path/to/frameboard

# Git 초기화
git init
git branch -M main

# 첫 커밋
git add .
git commit -m "feat: initial Frameboard monorepo scaffolding

- Next.js 15 frontend (apps/web)
- FastAPI backend with RICE/ICE scoring (apps/api)
- pnpm workspaces + Turborepo monorepo
- CI pipeline, contributor docs, MIT license"

# 원격 연결 (james-kanghj 본인 계정 기준)
git remote add origin https://github.com/james-kanghj/frameboard.git
git push -u origin main
```

## 3. 레포 설정 (Settings)

GitHub 레포 페이지에서:

### About 섹션 (우측 상단 ⚙️)
- **Description**: `An open-source workspace for product teams to run RICE, ICE, MoSCoW, and Value × Effort prioritization.`
- **Website**: (배포 후 추가)
- **Topics**:
  - `product-management`
  - `prioritization`
  - `rice-framework`
  - `ice-framework`
  - `moscow`
  - `value-effort`
  - `nextjs`
  - `fastapi`
  - `typescript`
  - `python`
  - `monorepo`
  - `open-source`

### General → Features
- ✅ Issues
- ✅ Discussions (커뮤니티 만들기에 유리)
- ✅ Projects
- ✅ Preserve this repository

### Branches → Branch protection rules
- `main` 보호:
  - Require pull request before merging
  - Require status checks (CI 통과)

## 4. 첫 릴리즈 태그

```bash
git tag -a v0.1.0 -m "v0.1.0 - Initial scaffolding"
git push origin v0.1.0
```

그 다음 GitHub UI에서 Releases → Create release from tag → 노트 작성:

```
## v0.1.0 - Initial scaffolding

First public release. Sets up the monorepo, basic scoring API, and contributor docs.

### Included
- Next.js 15 frontend with landing page
- FastAPI backend with RICE and ICE scoring endpoints
- Test suite for scoring logic
- CI pipeline (typecheck, lint, build, test)
- MIT license, contributing guide, issue/PR templates

### Next
- Backlog UI for managing items
- Collaborative scoring with multi-user support
- First export integration (CSV)
```

## 5. GitHub Projects 보드

1. 레포 페이지 → Projects 탭 → New project
2. Template: **Board**
3. Name: `Frameboard Roadmap`
4. Visibility: Public

### 컬럼 구성 (제안)
- **📥 Inbox** - 새로 들어온 아이디어
- **🔍 Discovery** - 더 알아봐야 함
- **📐 Spec** - 작성 중인 스펙
- **🛠 In Progress** - 개발 중
- **🧪 In Review** - PR 또는 QA
- **✅ Done** - 머지/릴리즈됨

### 초기 이슈 (Projects에 자동 추가)

다음 이슈를 만들고 보드에 추가하세요. 모두 영문으로:

```
1. [Feature] Backlog UI - list, create, edit items
2. [Feature] RICE scoring board with drag-to-reorder
3. [Feature] ICE scoring board
4. [Feature] Collaborative scoring (multi-user with disagreement viz)
5. [Feature] CSV export
6. [Feature] Jira export integration
7. [Feature] Linear export integration
8. [Feature] Notion export integration
9. [Infra] Auth with GitHub/Google OAuth
10. [Infra] Self-host Docker image
11. [Docs] Public docs site (docs.frameboard.app)
12. [Community] Set up GitHub Discussions categories
```

각 이슈는 `Feature`, `Infra`, `Docs`, `Community` 라벨로 분류하면 신청 심사관이 봤을 때 "PM 사고방식으로 일하는 사람" 인상 줄 수 있음.

## 6. README 뱃지 활성화 (자동)

CI가 한 번 돌면 자동으로 동작합니다. 푸시 후 5분쯤 기다린 뒤 Actions 탭 확인.

## 7. (선택) 도메인 / 배포

- Vercel에 `apps/web` 연결 → `frameboard.app` 또는 `frameboard.vercel.app`
- Railway 또는 Fly.io에 `apps/api` 배포
- README에 라이브 데모 링크 추가

여기까지 하면 Claude for OSS 신청 직전 상태로 완성.
