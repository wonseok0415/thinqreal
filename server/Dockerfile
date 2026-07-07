# ThinQ Real 단일 컨테이너 — 백엔드 API + 정적 프론트 서빙
# 빌드 컨텍스트 = 리포 루트 (정적 파일 COPY 위해):
#   docker build -f server/Dockerfile -t thinqreal:local .
#   docker run --rm -p 8080:8080 --env-file server/.env thinqreal:local
# Docker Hub 접근이 제한된 네트워크에서는 미러로 교체 가능:
#   --build-arg BASE_IMAGE=mirror.gcr.io/library/node:22-slim
# (사내 이관 시에는 사내 도커 이미지 저장소의 베이스로 교체 — decisions §2-②)
ARG BASE_IMAGE=node:22-slim
FROM ${BASE_IMAGE}

# 한글 차트 라벨용 폰트 (chartjs-node-canvas가 시스템 폰트 사용)
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-noto-cjk \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY server/src ./src

# 정적 프론트 (리포 루트에서) — 컨테이너가 함께 서빙
COPY index.html thinqreal_admin.html ThinQ_Real_ROI_Tool.html privacy.html ./public/
COPY CNAME .nojekyll ./public/
COPY images ./public/images

ENV NODE_ENV=production \
    TZ=Asia/Seoul \
    PORT=8080 \
    STATIC_DIR=/app/public

EXPOSE 8080

# 월간 리포트 CronJob은 같은 이미지에 command만 오버라이드:
#   command: ["node", "src/jobs/monthlyReport.js"]
CMD ["node", "src/index.js"]
