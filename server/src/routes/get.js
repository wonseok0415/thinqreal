// GET /api?type=… 디스패치 — .gs doGet 이식 (계약: api-contract.md GET 15종 + teams_test 추가)
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
  handleMailStatus, handleMailTest, handleTelegramTest, handleTeamsTest, handleCalendarTest,
} from '../handlers/diagnostics.js';
import { handleGetSurveyData } from '../handlers/survey.js';

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
        case 'mail_test':
          return res.json(await handleMailTest());
        case 'monthly_report_preview': {
          // 현행과 동일하게 HTML 본문을 브라우저에 그대로 렌더 (유일한 non-JSON 응답)
          const r = await handleMonthlyReportPreview(store, q);
          return res.type('html').send(r.html);
        }
        case 'monthly_report_send':
          return res.json(await handleMonthlyReportSend(store, q));
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
        case 'survey_data': // 설문·대장·이슈 통합 조회 (관리자 토큰 필수 — 핸들러 내부 검증)
          return res.json(await handleGetSurveyData(store, q.token));
        default:
          return res.json({ error: 'Unknown type' });
      }
    } catch (e) {
      next(e);
    }
  });

  return router;
}
