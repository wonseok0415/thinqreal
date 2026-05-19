# ThinQ Real

마곡 LG사이언스파크 W6동 1층, 30평형 AI홈 연구·쇼룸의 운영관리 웹사이트.

- **라이브**: https://thinqreal.com
- **호스팅**: GitHub Pages (이 리포 루트 = 사이트 루트)
- **백엔드**: Google Apps Script + Google Sheets

## 디렉터리 구조

```
/
├── thinqreal.html              # 메인 사이트 (홈/공간소개/예약/이용안내)
├── thinqreal_admin.html        # 관리자 대시보드 (8개 탭)
├── ThinQReal_AppScript.gs      # Google Apps Script 소스 (실배포는 script.google.com)
├── ThinQ_Real_ROI_Tool.html    # ROI 분석 시뮬레이션 (관리자 ROI 탭에서 iframe 임베드)
├── images/                     # 모든 이미지 (상대경로 참조)
├── CNAME                       # GitHub Pages 커스텀 도메인 (thinqreal.com)
├── .nojekyll                   # Jekyll 처리 비활성화
├── CLAUDE.md                   # 프로젝트 컨텍스트 (Claude/사람 모두 읽음)
└── README.md
```

## 백엔드 연결

Apps Script가 예약 저장 / 가용 슬롯 / ROI 스냅샷 / 구비 가전 목록 / 메일 발송을 처리한다. 엔드포인트 URL, Sheets ID, 담당자 메일, 슬롯 시간표 등 운영 상수는 모두 [`CLAUDE.md`](./CLAUDE.md) 참조.

## 개발·배포 흐름

`main`에 push → GitHub Pages가 리포 루트를 자동 서빙 → `thinqreal.com`으로 반영.

이미지는 항상 `images/{파일명}` 상대경로로 참조하고, base64 인라인 삽입은 금지 (`CLAUDE.md` 참조).
