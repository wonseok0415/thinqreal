// 알림 오케스트레이션 — 텔레그램(과도기) + Teams(이관 후 메인) 병존.
// 각 채널은 env 미설정 시 silent skip, 실패 격리 — 예약 저장·메일과 독립.
import {
  sendTelegramMessage, buildNewBookingMessage, buildStatusChangeMessage, buildSurveyMessage,
} from './telegram.js';
import { sendTeamsNewBooking, sendTeamsStatusChange, sendTeamsSurvey } from './teams.js';

export async function notifyNewBooking(data, id) {
  await Promise.allSettled([
    sendTelegramMessage(buildNewBookingMessage(data, id)),
    sendTeamsNewBooking(data),
  ]);
}

export async function notifyStatusChange(booking, status) {
  await Promise.allSettled([
    sendTelegramMessage(buildStatusChangeMessage(booking, status)),
    sendTeamsStatusChange(booking, status),
  ]);
}

export async function notifySurvey(data, track, ledgerCount, issueCount) {
  await Promise.allSettled([
    sendTelegramMessage(buildSurveyMessage(data, track, ledgerCount, issueCount)),
    sendTeamsSurvey(data, track, ledgerCount, issueCount),
  ]);
}
