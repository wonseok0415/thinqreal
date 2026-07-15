// MS Teams 워크플로 웹훅 — 이관 후 메인 알림 채널 (decisions §2-⑦).
// 워크플로(Power Automate) "웹훅 요청이 수신되면 채널에 게시" 패턴의 Adaptive Card 페이로드.
// env 미설정 시 silent skip. 실제 URL·카드 스키마는 김건우 TL 설정 화면 공유 후 조정 (액션 #6).
import { config } from '../config.js';

export function teamsConfigured() {
  return !!config.teamsWebhookUrl;
}

async function postCard(card) {
  try {
    if (!teamsConfigured()) {
      console.log('[teams] skip — TEAMS_WEBHOOK_URL not set');
      return { ok: false, reason: 'not_configured' };
    }
    const res = await fetch(config.teamsWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: card,
        }],
      }),
    });
    if (res.ok || res.status === 202) return { ok: true };
    const body = await res.text();
    console.warn(`[teams] HTTP ${res.status} ${body.slice(0, 300)}`);
    return { ok: false, reason: 'http_' + res.status };
  } catch (e) {
    console.warn('[teams] error ' + e.message);
    return { ok: false, reason: 'exception' };
  }
}

function baseCard(title, facts, actionTitle) {
  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.4',
    body: [
      { type: 'TextBlock', text: title, weight: 'Bolder', size: 'Medium', wrap: true },
      { type: 'FactSet', facts: facts.filter((f) => f.value) },
    ],
    actions: [{ type: 'Action.OpenUrl', title: actionTitle, url: config.adminPageUrl }],
  };
}

export async function sendTeamsNewBooking(data) {
  const belong = [data.division, data.department].filter(Boolean).join(' · ');
  return postCard(baseCard('🆕 새 예약 신청', [
    { title: '일정', value: `${data.date} ${data.slotLabel || ''}`.trim() },
    { title: '목적', value: String(data.purpose || '') },
    { title: '주제', value: String(data.subject || data.org || '') },
    { title: '고객사', value: String(data.clientCompany || '') },
    { title: '책임자', value: String(data.name || '') + (data.count ? ` · 총 ${data.count}명` : '') },
    { title: '소속', value: belong },
    { title: '연락처', value: String(data.phone || '') },
  ], '관리자 페이지에서 승인/거절'));
}

export async function sendTeamsStatusChange(booking, status) {
  const title = status === '확정' ? '✅ 예약 확정' : status === '거절' ? '❌ 예약 거절' : `ℹ️ 상태 변경 — ${status}`;
  return postCard(baseCard(title, [
    { title: '일정', value: `${booking.date} ${booking.slotLabel || ''}`.trim() },
    { title: '목적', value: String(booking.purpose || '') },
    { title: '주제', value: String(booking.subject || booking.org || '') },
    { title: '책임자', value: String(booking.name || '') },
  ], '관리자 페이지 열기'));
}

// 설문 접수 — Teams는 이관 후 메인 채널이므로 설문 알림도 카드로 (텔레그램 메시지와 동일 정보)
export async function sendTeamsSurvey(data, track, ledgerCount, issueCount) {
  const trackLabel = { sales: 'B2B 영업', media: '콘텐츠·홍보', etc: 'R&D·내부·기타' }[track] || track;
  return postCard(baseCard(`📝 설문 접수 [${trackLabel}]`, [
    { title: '방문일', value: `${data.visit_date || '-'}${data.visit_count ? ' · ' + data.visit_count : ''}` },
    { title: '응답자', value: `${data.name || '-'} (${data.dept || '-'})` },
    { title: '만족도', value: String(data.satisfaction || '') },
    { title: '성과 대장', value: ledgerCount ? `+${ledgerCount}건 (후보)` : '' },
    { title: 'IoT 이슈', value: issueCount ? `+${issueCount}건` : '' },
  ], '관리자 페이지 열기'));
}

export async function sendTeamsTest() {
  if (!teamsConfigured()) return { ok: false, reason: 'not_configured', hint: 'env TEAMS_WEBHOOK_URL 확인' };
  return postCard(baseCard('🧪 ThinQ Real Teams 연동 테스트', [
    { title: '시각', value: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) },
  ], '관리자 페이지 열기'));
}
