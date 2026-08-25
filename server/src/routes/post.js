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
  handleSurveyDelete, handleLedgerDelete, handleIssueDelete,
} from '../handlers/survey.js';
import { handleVisitorSubmit, handleVisitorDelete } from '../handlers/visitors.js';
import { handleNewHealthCheck } from '../handlers/health.js';
import { handleNewVocReport } from '../handlers/voc.js';
import {
  handleInsightAdd, handleInsightDelete, handleInsightMove,
  handleArticleAdd, handleArticleDelete, handleArticleMove,
} from '../handlers/curation.js';
import { handleExportLog } from '../handlers/exportLog.js';
import { handleBestReviewerSend } from '../handlers/best.js';
import { handleRoiReportPin } from '../handlers/roi.js';

const ADMIN_TYPES = new Set([
  'update', 'booking_delete', 'slot_block', 'slot_unblock',
  'admin_booking_create', 'admin_booking_edit',
  'survey_update', 'survey_delete', 'ledger_update', 'ledger_delete',
  'issue_update', 'issue_delete', 'visitor_delete', 'export_log',
  'insight_add', 'insight_delete', 'insight_move',
  'article_add', 'article_delete', 'article_move',
  'best_reviewer_send', 'roi_report_pin',
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
      // 방문자 현장 설문 (익명·공개, §8-5)
      if (data.type === 'visitor_submit') return res.json(await handleVisitorSubmit(store, data));
      // health_check는 점검 장비(무인 기기)가 호출 — 관리자 토큰 대신 FC_API_KEY로 인증 (fail-closed)
      if (data.type === 'health_check') return res.json(await handleNewHealthCheck(store, data));
      // voc_report는 FieldVoice 파이프라인(현장 노트북)이 호출 — FV_API_KEY로 인증 (fail-closed)
      if (data.type === 'voc_report') return res.json(await handleNewVocReport(store, data));
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
        if (data.type === 'survey_delete') return res.json(await handleSurveyDelete(store, data));
        if (data.type === 'ledger_update') return res.json(await handleLedgerUpdate(store, data));
        if (data.type === 'ledger_delete') return res.json(await handleLedgerDelete(store, data));
        if (data.type === 'issue_update') return res.json(await handleIssueUpdate(store, data));
        if (data.type === 'issue_delete') return res.json(await handleIssueDelete(store, data));
        if (data.type === 'visitor_delete') return res.json(await handleVisitorDelete(store, data));
        if (data.type === 'export_log') return res.json(await handleExportLog(store, data, admin.email));
        if (data.type === 'insight_add') return res.json(await handleInsightAdd(store, data));
        if (data.type === 'insight_delete') return res.json(await handleInsightDelete(store, data));
        if (data.type === 'insight_move') return res.json(await handleInsightMove(store, data));
        if (data.type === 'article_add') return res.json(await handleArticleAdd(store, data));
        if (data.type === 'article_delete') return res.json(await handleArticleDelete(store, data));
        if (data.type === 'article_move') return res.json(await handleArticleMove(store, data));
        if (data.type === 'best_reviewer_send') return res.json(await handleBestReviewerSend(store, data, admin.email));
        if (data.type === 'roi_report_pin') return res.json(await handleRoiReportPin(store, data));
      }

      return res.json({ error: 'Unknown type' });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
