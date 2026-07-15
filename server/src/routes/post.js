// POST /api 디스패치 — .gs doPost 이식.
// 파괴적/운영 작업(update·booking_delete·slot_*·admin_booking_*)은 관리자 토큰 게이트 필수 —
// 클라이언트 화면을 우회해도 백엔드가 거부한다 (진짜 방어선, 임의로 약화하지 말 것).
import { Router } from 'express';
import express from 'express';
import { verifyAdminToken } from '../auth/token.js';
import {
  handleNewBooking, handleUpdateStatus, handleDeleteBooking,
  handleAdminCreateBooking, handleAdminEditBooking,
} from '../handlers/bookings.js';
import { handleNewRoiSnapshot, handleDeleteRoiSnapshot } from '../handlers/roi.js';
import { handleSlotBlock, handleSlotUnblock } from '../handlers/slotBlocks.js';
import {
  handleSurveySubmit, handleSurveyUpdate, handleLedgerUpdate, handleIssueUpdate,
} from '../handlers/survey.js';

const ADMIN_TYPES = new Set([
  'update', 'booking_delete', 'slot_block', 'slot_unblock',
  'admin_booking_create', 'admin_booking_edit',
  'survey_update', 'ledger_update', 'issue_update',
]);

export function createPostRouter(store) {
  const router = Router();

  // 프론트가 mode:'no-cors'로 보내는 POST는 Content-Type이 text/plain으로 강제되므로
  // 타입 무관 raw로 받아 JSON.parse (Apps Script doPost(e.postData.contents)와 동일 동작)
  router.post('/', express.text({ type: '*/*', limit: '1mb' }), async (req, res, next) => {
    try {
      let data;
      try {
        data = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '');
      } catch {
        return res.json({ error: 'Invalid JSON' });
      }

      if (data.type === 'booking') return res.json(await handleNewBooking(store, data));
      // 설문 제출 — 공개 경로 (booking과 동일, 응답자는 토큰이 없음 — 게이트에 넣지 말 것)
      if (data.type === 'survey_submit') return res.json(await handleSurveySubmit(store, data));
      if (data.type === 'roi_snapshot') return res.json(await handleNewRoiSnapshot(store, data));
      // roi_delete는 ROI 툴(별창 포함)에서 호출돼 토큰 경로가 없어 게이트하지 않음 (현행 계약 유지)
      if (data.type === 'roi_delete') return res.json(await handleDeleteRoiSnapshot(store, data));

      if (ADMIN_TYPES.has(data.type)) {
        const admin = verifyAdminToken(data.token);
        if (!admin.ok) {
          return res.json({ error: 'unauthorized', reason: admin.reason || 'invalid_token' });
        }
        if (data.type === 'update') return res.json(await handleUpdateStatus(store, data));
        if (data.type === 'booking_delete') return res.json(await handleDeleteBooking(store, data, admin.email));
        if (data.type === 'slot_block') return res.json(await handleSlotBlock(store, data, admin.email));
        if (data.type === 'slot_unblock') return res.json(await handleSlotUnblock(store, data));
        if (data.type === 'admin_booking_create') return res.json(await handleAdminCreateBooking(store, data, admin.email));
        if (data.type === 'admin_booking_edit') return res.json(await handleAdminEditBooking(store, data, admin.email));
        if (data.type === 'survey_update') return res.json(await handleSurveyUpdate(store, data));
        if (data.type === 'ledger_update') return res.json(await handleLedgerUpdate(store, data));
        if (data.type === 'issue_update') return res.json(await handleIssueUpdate(store, data));
      }

      return res.json({ error: 'Unknown type' });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
