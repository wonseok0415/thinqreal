// 월간 리포트 차트 — QuickChart(외부 PNG URL) 대체: 서버 내부 렌더링 (decisions §2-⑦).
// @napi-rs/canvas(프리빌드 내장 — GitHub 릴리스 다운로드 불필요, 프록시/사내망 안전) +
// chart.js v4로 PNG 버퍼 생성 → 메일에는 cid: 인라인 첨부, 미리보기에는 data: URI.
// 내부 데이터가 외부로 나가지 않음.
//
// optionalDependencies라 미설치 환경에서도 서버는 기동 — 차트만 HTML 폴백으로 대체.
import { PURPOSE_COLORS, ROI_VALUE_LABELS } from '../lib/constants.js';

let rendererPromise = null;

async function getRenderer() {
  if (!rendererPromise) {
    rendererPromise = (async () => {
      try {
        const [napiCanvas, chartjs, datalabels] = await Promise.all([
          import('@napi-rs/canvas'),
          import('chart.js'),
          // 반드시 ESM 빌드를 직접 import — 기본(main) CJS 빌드는 chart.js를 CJS로 다시 로드해
          // ArcElement 클래스 정체성이 갈리고(instanceof 실패) 도넛 datalabels가 크래시한다.
          import('chartjs-plugin-datalabels/dist/chartjs-plugin-datalabels.esm.js'),
        ]);
        const { Chart, registerables } = chartjs;
        Chart.register(...registerables, datalabels.default);
        Chart.defaults.font.family = "'Noto Sans CJK KR','Noto Sans KR',sans-serif"; // 한글 라벨
        Chart.defaults.devicePixelRatio = 1;
        return { createCanvas: napiCanvas.createCanvas, Chart };
      } catch (e) {
        console.warn('[charts] 차트 렌더러 미설치 — 차트 없이 리포트 생성: ' + e.message);
        return null;
      }
    })();
  }
  return rendererPromise;
}

// 메일 클라이언트 호환을 위해 흰 배경을 깔아주는 플러그인 (chart.js 기본은 투명)
const whiteBackground = {
  id: 'whiteBackground',
  beforeDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, chart.width, chart.height);
    ctx.restore();
  },
};

async function renderPng(configBuilder, { w, h }) {
  const mod = await getRenderer();
  if (!mod) return null;
  try {
    const canvas = mod.createCanvas(w, h);
    const config = configBuilder();
    const chart = new mod.Chart(canvas.getContext('2d'), {
      ...config,
      options: { ...config.options, responsive: false, animation: false },
      plugins: [whiteBackground, ...(config.plugins || [])],
    });
    const buf = canvas.toBuffer('image/png');
    chart.destroy();
    return buf;
  } catch (e) {
    console.warn('[charts] 렌더링 실패: ' + e.message);
    return null;
  }
}

const KRW_TICK = (v) => {
  if (v === 0) return '0';
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e8) return sign + (a / 1e8).toFixed(1).replace(/\.0$/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '억';
  if (a >= 1e4) return sign + Math.round(a / 1e4).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '만';
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

/** 방문 목적별 분포 도넛 — 6개 카테고리 전부 레전드 표시 (0건 포함) */
export async function renderPurposeDoughnut(purposeCounts) {
  const canonical = Object.keys(PURPOSE_COLORS);
  const extras = Object.keys(purposeCounts).filter((k) => !PURPOSE_COLORS[k] && purposeCounts[k] > 0);
  const labels = canonical.concat(extras);
  const values = canonical.map((k) => purposeCounts[k] || 0).concat(extras.map((k) => purposeCounts[k]));
  const colors = canonical.map((k) => PURPOSE_COLORS[k]).concat(extras.map(() => '#5e7858'));

  return renderPng(() => ({
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 3, borderColor: '#ffffff' }] },
    options: {
      cutout: '60%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10, boxWidth: 10, usePointStyle: true } },
        datalabels: {
          color: '#ffffff',
          font: { size: 13, weight: 'bold' },
          anchor: 'center',
          align: 'center',
          formatter: (value) => (value > 0 ? value + '건' : ''),
        },
      },
    },
  }), { w: 480, h: 240 });
}

/** ROI 가치 항목별 비중 도넛 — 라벨/색상은 ROI 툴과 동기화 (ROI_VALUE_LABELS) */
export async function renderRoiValueDoughnut(outputs) {
  const items = Object.keys(ROI_VALUE_LABELS).map((k) => ({
    value: Number(outputs[k]) || 0,
    label: ROI_VALUE_LABELS[k].label,
    color: ROI_VALUE_LABELS[k].color,
  }));
  if (items.reduce((s, it) => s + it.value, 0) <= 0) return null;

  return renderPng(() => ({
    type: 'doughnut',
    data: {
      labels: items.map((it) => it.label),
      datasets: [{ data: items.map((it) => it.value), backgroundColor: items.map((it) => it.color), borderWidth: 3, borderColor: '#ffffff' }],
    },
    options: {
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10, boxWidth: 10, usePointStyle: true } },
        datalabels: {
          color: '#ffffff',
          font: { size: 12, weight: 'bold' },
          anchor: 'center',
          align: 'center',
          formatter: (value) => (!value || value <= 0 ? '' : KRW_TICK(value)),
        },
      },
    },
  }), { w: 480, h: 240 });
}

/** 연도별 누적 손익 라인 — 누적 손익(채움) + 손익분기선(점선) */
export async function renderCumulativeLine(totalCost, annualValue) {
  const cumValues = [0, 1, 2, 3, 4, 5].map((y) => -totalCost + annualValue * y);

  return renderPng(() => ({
    type: 'line',
    data: {
      labels: ['0년', '1년', '2년', '3년', '4년', '5년'],
      datasets: [
        {
          label: '누적 손익',
          data: cumValues,
          borderColor: '#3a5035',
          backgroundColor: 'rgba(58, 80, 53, 0.08)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.3,
          pointRadius: 5,
          pointBackgroundColor: '#3a5035',
          pointBorderColor: 'white',
          pointBorderWidth: 2.5,
        },
        {
          label: '손익분기선',
          data: [0, 0, 0, 0, 0, 0],
          borderColor: '#ff9500',
          borderWidth: 1.5,
          borderDash: [6, 4],
          fill: false,
          pointRadius: 0,
        },
      ],
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 16, usePointStyle: true } },
        datalabels: { display: false },
      },
      scales: {
        y: { ticks: { font: { size: 10 }, callback: KRW_TICK }, grid: { color: 'rgba(0,0,0,0.04)' } },
        x: { ticks: { font: { size: 11 } }, grid: { display: false } },
      },
    },
  }), { w: 620, h: 280 });
}
