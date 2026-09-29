// GET /api?type=… 디스패치 — .gs doGet 이식 (health_checks·voc_reports 포함, + teams_test 추가)
import { Router } from 'express';
import { handleAvailability } from '../handlers/availability.js';
import { handleGetBookings } from '../handlers/bookings.js';
import { handleGetRoiSnapshots } from '../handlers/roi.js';
import { handleGetSlotBlocks } from '../handlers/slotBlocks.js';
import { handleGetAppliances } from '../handlers/appliances.js';
import {
  handleAuthRequest, handleAuthVerify, handleAdminAuthRequest, handleAdminAuthVerify,
} from '../handlers/auth.js';
import { handleMonthlyReportPreview, handleMonthlyReportSend } from '../handlers/report.js';
import {
  handleMailStatus, handleMailTest, handleTelegramTest, handleTeamsTest, handleCalendarTest, handleEgressCheck, handleEnvKeys, handleDbProbe,
} from '../handlers/diagnostics.js';
import { handleGetSurveyData } from '../handlers/survey.js';
import { renderImportPage } from '../handlers/importPage.js';
import { handleGetHealthChecks } from '../handlers/health.js';
import { handleGetVocReports } from '../handlers/voc.js';
import { runEdgeSyncJob } from '../jobs/edgeSync.js';
import { peekCode } from '../auth/codes.js';
import { verifyAdminToken } from '../auth/token.js';
import { config } from '../config.js';
import { kvStatus } from '../lib/kvcache.js';
import os from 'node:os';

export function createGetRouter(store) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const q = req.query;
      const type = q.type;

      switch (type) {
        case 'availability':
          return res.json(await handleAvailability(store, q.date));
        case 'bookings':
          return res.json(await handleGetBookings(store, q.token));
        case 'roi_snapshots':
          return res.json(await handleGetRoiSnapshots(store));
        case 'appliances':
          return res.json(handleGetAppliances());
        case 'mail_status':
          return res.json(handleMailStatus());
        case 'mail_test': // 실발송 환경은 관리자 토큰 필수, to= 단일 주소 옵션 (2026-09-27)
          return res.json(await handleMailTest(q));
        case 'monthly_report_preview': {
          // 현행과 동일하게 HTML 본문을 브라우저에 그대로 렌더 (유일한 non-JSON 응답)
          const r = await handleMonthlyReportPreview(store, q);
          return res.type('html').send(r.html);
        }
        case 'monthly_report_send': {
          // §8-6 2단계 발송 — 확인 화면/결과 화면을 HTML로 반환 (레거시 confirm=YES 폐기)
          const r = await handleMonthlyReportSend(store, q);
          return res.type('html').send(r.html);
        }
        case 'auth_request':
          return res.json(await handleAuthRequest(q.email));
        case 'auth_verify':
          return res.json(await handleAuthVerify(q.email, q.code));
        case 'admin_auth_request':
          return res.json(await handleAdminAuthRequest(q.email));
        case 'admin_auth_verify':
          return res.json(await handleAdminAuthVerify(q.email, q.code));
        case 'slot_blocks':
          return res.json(await handleGetSlotBlocks(store, q.date));
        case 'telegram_test':
          return res.json(await handleTelegramTest());
        case 'teams_test': // 신규 (Teams 웹훅 연동 점검 — 계약에 additive)
          return res.json(await handleTeamsTest());
        case 'calendar_test':
          return res.json(await handleCalendarTest());
        case 'egress_check': // 사내 pod → 인터넷(현행 Apps Script) 아웃바운드 진단 (관리자 토큰)
          return res.json(await handleEgressCheck(q.token));
        case 'env_keys': // pod에 주입된 env 이름만(값 없음) — 어느 configmap/secret이 도달했는지 판별 (OP 토큰 필수, 2026-09-28)
          return res.json(handleEnvKeys(q.token));
        case 'admin_import_page': // 관리자 「데이터 이행」 패널 (컨테이너 전용 HTML — 라이브 admin HTML 무수정, §8-17). SSO 뒤, 동작은 /api/import 토큰 게이트
          return res.type('html').send(renderImportPage());
        case 'db_probe': // pod → RDS·valkey TCP 도달(SG 허용) 진단 — host&port 지정(amazonaws.com만) 또는 env 대상 (OP 토큰 필수, 키트 v4.12)
          return res.json(await handleDbProbe(q));
        case 'auth_code_peek': { // ST/QA 전용 — 메일이 억제된 환경에서 UAT용 인증 코드 확인. OP에서는 존재하지 않는 type처럼 동작
          if (!config.outboundSuppressed) return res.status(404).json({ error: 'not_found' });
          const email = String(q.email || '').trim().toLowerCase();
          const kind = q.kind === 'admin' ? 'admin' : 'auth';
          const code = email ? await peekCode(email, kind) : null;
          // pod·kv 동봉 — 어느 레플리카가 어떤 캐시 모드로 답했는지 (코드 불일치 진단, 2026-09-22)
          const diag = { pod: os.hostname(), kv: kvStatus() };
          return res.json(code ? { ok: true, email, kind, code, ...diag } : { ok: false, error: 'no_pending_code', ...diag });
        }
        case 'edge_sync_now': { // 하이브리드 에지 동기화 즉시 실행 (ST/QA 토큰 생략 허용, OP 관리자 토큰)
          if (!config.outboundSuppressed) {
            const admin = verifyAdminToken(q.token);
            if (!admin.ok) return res.json({ error: 'unauthorized', reason: admin.reason || 'invalid_token' });
          }
          return res.json(await runEdgeSyncJob(store));
        }
        case 'survey_data': // 설문·대장·이슈·방문자·큐레이션 통합 조회 (관리자 토큰 필수 — 핸들러 내부 검증)
          return res.json(await handleGetSurveyData(store, q.token));
        case 'health_checks': // FieldCheck 점검 이력 (무인증 조회 — 비민감 점검 결과)
          return res.json(await handleGetHealthChecks(store, q.days));
        case 'voc_reports': // 방문객 발화 인용 포함 — health_checks와 달리 관리자 토큰 필수
          return res.json(await handleGetVocReports(store, q.token, q.days));
        default:
          return res.json({ error: 'Unknown type' });
      }
    } catch (e) {
      next(e);
    }
  });

  return router;
}
