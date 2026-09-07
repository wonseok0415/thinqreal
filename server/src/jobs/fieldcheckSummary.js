// FieldCheck 일일 요약 메일 — .gs sendFieldCheckDailySummary 이식.
// K8s CronJob: 매일 07:40 KST (`40 7 * * *`, TZ=Asia/Seoul)
//   command: ["node", "src/jobs/fieldcheckSummary.js"]
//   (07:00 점검 종료 후 · 사내 게이트웨이 지연 감안해도 09:00 시연 전 수신)
//
// 기록 없음 = 점검 장비가 안 돌았다는 뜻 — 그것 자체가 이상 신호라 요약 메일은 항상 발송.
// FC_TEST_MODE=true(테스트 단계)면 운영자(CC_EMAIL)에게만 발송.
import { pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { FC_TEST_MODE, FC_LEVEL_LABELS, FC_LATENCY_NOTE } from '../lib/constants.js';
import { formatDateLocal } from '../lib/dates.js';
import { getStore } from '../store/index.js';
import { sendMail } from '../mail/mailer.js';
import { buildHealthSummaryHtml, fcNormalizeNote } from '../mail/templates/healthSummary.js';

function fmtTs(tsv) {
  // 'MM-dd HH:mm' — ISO 문자열/Date 모두 처리 (KST 로컬)
  const d = tsv instanceof Date ? tsv : new Date(String(tsv));
  if (!isNaN(d)) {
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  return String(tsv).replace('T', ' ').slice(5, 16);
}

/** 일일 요약 본체 — 인앱 스케줄러(lib/scheduler.js)와 CLI가 공유 */
export async function runFieldcheckSummaryJob(store) {
  const rows = await store.health.list();

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = rows.filter((r) => {
    const t = new Date(r.timestamp);
    return r.id && !isNaN(t) && t >= cutoff;
  });
  // 시간순 정렬 (실패 상세의 "최근순" 슬라이스 전제)
  recent.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

  const today = formatDateLocal(new Date());
  let subject, body;
  const view = { today, total: recent.length, failCount: 0, levels: [], failures: [] };

  if (recent.length === 0) {
    subject = `[ThinQ Real] 자동 점검 일일 요약 (${today}) — ⚠ 점검 기록 없음`;
    body = [
      '최근 24시간 동안 FieldCheck 점검 기록이 없습니다.',
      '',
      '점검 장비(노트북)가 꺼져 있거나, 네트워크 문제로 전송이 실패했을 수 있습니다.',
      '점검 장비 상태를 확인해 주세요. (전송 실패분은 점검 장비의 results.jsonl에 남아 있습니다)',
    ].join('\n');
  } else {
    const fails = recent.filter((r) => r.result === 'fail');

    // 판정 단계(L1/L2/L3)별 집계 — 한 시나리오가 L1·L2 두 건을 남기므로 섞어 세면 성공률이 왜곡된다.
    const byLevel = {};
    recent.forEach((r) => {
      const lv = String(r.level || 'L1').toUpperCase();
      const key = r.scenario_label || r.scenario_id || '(미상)';
      if (!byLevel[lv]) byLevel[lv] = {};
      if (!byLevel[lv][key]) byLevel[lv][key] = { total: 0, fail: 0, latSum: 0, latN: 0 };
      const s = byLevel[lv][key];
      s.total++;
      if (r.result === 'fail') s.fail++;
      const lat = Number(r.latency_ms);
      if (lat > 0) { s.latSum += lat; s.latN++; }
    });

    const statusMark = fails.length === 0 ? '✅ 전체 정상' : `⚠ 실패 ${fails.length}건`;
    subject = `[ThinQ Real] 자동 점검 일일 요약 (${today}) — ${statusMark}`;

    const lines = [
      '최근 24시간 ThinQ ON 자동 점검 결과입니다.',
      '',
      `총 판정 : ${recent.length}건  (성공 ${recent.length - fails.length} / 실패 ${fails.length})`,
    ];

    view.failCount = fails.length;
    Object.keys(byLevel).sort().forEach((lv) => {
      lines.push('');
      lines.push(`── ${FC_LEVEL_LABELS[lv] || lv} ──`);
      const group = byLevel[lv];
      const items = [];
      Object.keys(group).forEach((key) => {
        const s = group[key];
        const rate = Math.round(((s.total - s.fail) / s.total) * 100);
        const avgLat = s.latN > 0 ? Math.round(s.latSum / s.latN) : null;
        const latPart = avgLat !== null ? `, 평균 응답 시작 ${avgLat}ms` : '';
        lines.push(`  ${key} : 성공률 ${rate}% (${s.total - s.fail}/${s.total})${latPart}`);
        items.push({ label: key, rate, pass: s.total - s.fail, total: s.total, avgLat });
      });
      view.levels.push({ code: lv, title: FC_LEVEL_LABELS[lv] || lv, items });
      if (items.some((it) => it.avgLat !== null)) {
        // 평문 클라이언트에도 같은 도식을 싣는다 (HTML판과 정보량을 맞춤)
        lines.push('');
        lines.push('  ※ 응답 시작 측정 구간');
        lines.push('     ① "하이 엘지" 재생 → ② ThinQ ON "띵" → ③ 1.5초 대기 → ④ 점검 질문 재생');
        lines.push('                                                      ↓ 재생 끝 = 0ms');
        lines.push('                                                ⑤ 녹음 시작 ─── ⑥ 말 시작');
        lines.push(`     ${FC_LATENCY_NOTE}`);
      }
    });

    if (fails.length > 0) {
      lines.push('');
      lines.push('── 실패 상세 (최근순, 최대 10건) ──');
      fails.slice(-10).reverse().forEach((r) => {
        const ts = fmtTs(r.timestamp);
        const lv = String(r.level || 'L1').toUpperCase();
        lines.push(`  ${ts}  [${lv}] ${r.scenario_label || r.scenario_id}  (녹음: ${r.media_ref || '-'})`);
        // L2 실패는 "무엇을 어떻게 잘못 답했는지"가 원인 파악의 핵심이므로 함께 싣는다
        const said = String(r.stt_text || '').trim();
        if (said) lines.push(`        인식: "${said.length > 120 ? said.slice(0, 120) + '…' : said}"`);
        // 점검 장비가 원인을 특정한 실패(마이크 무입력 등)는 사유를 그대로 노출 —
        // 없으면 점검 장비 설정 문제를 ThinQ ON 장애로 오인하게 된다.
        const note = fcNormalizeNote(r.note);
        if (note) lines.push(`        ⚠ ${note}`);
        view.failures.push({
          ts, level: lv,
          label: String(r.scenario_label || r.scenario_id || ''),
          media: String(r.media_ref || ''),
          said: said.length > 120 ? said.slice(0, 120) + '…' : said,
          note,
        });
      });
      lines.push('');
      lines.push('실패 녹음 파일은 점검 장비의 recordings 폴더에서 확인할 수 있습니다.');
      if (fails.some((r) => fcNormalizeNote(r.note).indexOf('마이크') >= 0)) {
        lines.push('');
        lines.push('※ "마이크 무입력"으로 표시된 건은 점검 장비 쪽 문제이며, ThinQ ON 장애가 아닙니다.');
        lines.push('   점검 장비에서  python fieldcheck.py --mic-test  로 확인해 주세요.');
      }
    }
    body = lines.join('\n');
  }

  // 예약 확정 메일과 동일하게 HTML + 평문 동시 발송
  const htmlBody = buildHealthSummaryHtml(view);
  const msg = FC_TEST_MODE
    ? { to: config.adminAlertCc, subject, text: body, html: htmlBody }
    : { to: config.fcReportTo, cc: config.adminAlertCc, subject, text: body, html: htmlBody };
  const result = await sendMail(msg);
  if (result.ok) console.log('[fieldcheck-summary] sent → ' + msg.to);
  else console.error('[fieldcheck-summary] send fail: ' + result.error);
}

// CLI 직접 실행 시에만 동작 (스케줄러가 import할 때는 실행 안 함)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  getStore()
    .then((store) => runFieldcheckSummaryJob(store))
    .then(() => process.exit(0), (e) => { console.error('[fieldcheck-summary] error:', e); process.exit(1); });
}
