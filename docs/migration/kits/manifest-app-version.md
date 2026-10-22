# 매니페스트 키트 M1 — `/healthz version` 표시 (APP_VERSION downward API)

> 외부 트랙 지정(2026-10-22). 사내 Claude는 이 문서에 적힌 범위만 적용한다. 판단이 필요한 차이가 있으면 수정하지 말고 "확인 필요"로 보고.

## 배경
- 앱은 env `APP_VERSION`을 최우선으로 읽어 `/healthz`의 `version`에 표시한다(키트 v4.7). Gitea `package.json`에 version 필드가 없고 릴리스 워크플로가 갱신하지 않아 지금은 `"unknown"`.
- 사내 Claude 확인(10/22): `release.yml:80`의 sed는 `deployment.yaml`의 **모든** `version:` 줄을 갱신한다. `version:`은 현재 **top-level `metadata.labels`에만** 있고 pod template 라벨에는 없다.

## 변경 대상
`deploy/base/deployment.yaml` 1개. 다른 파일·다른 줄은 건드리지 않는다(`image:`·`envFrom`·configmap·overlay 무변경).

## 변경 내용
1. `spec.template.metadata.labels`에 `version:` 줄을 추가한다. 값·따옴표 형식은 top-level `metadata.labels.version`과 **동일한 문자열**. (다음 릴리스부터 sed가 두 줄을 함께 갱신.)
2. `thinq-real` 컨테이너의 `env:` 목록(현재 `PORT`가 있는 곳)에 아래 항목을 추가한다. 들여쓰기는 기존 `PORT` 항목과 맞춘다.

```yaml
- name: APP_VERSION
  valueFrom:
    fieldRef:
      fieldPath: metadata.labels['version']
```

## 커밋
- 메시지: `chore: APP_VERSION downward API — pod template version 라벨 + env`
- push: `git pull --rebase origin main && git push origin main`
- push 후 `git show --stat HEAD`에 `deploy/base/deployment.yaml`이 있어야 한다.

## 동작
`deploy/**`만 변경 → 빌드 없음. pod template이 바뀌므로 ArgoCD sync 시 pod 재시작(롤아웃).

## 검증 (담당자, 몇 분 뒤 ST)
| 확인 | 주소 | 정상 |
|---|---|---|
| env 도달 | `<ST>/api?type=env_keys` | `names`에 `APP_VERSION` |
| 표시 | `<ST>/healthz` | `version`이 숫자(예 `0.19.2`), `pod` 이름 교체 |

실패 시: `APP_VERSION`이 names에 없으면 매니페스트가 pod에 안 닿은 것(위치·sync), 있는데 `unknown`이면 라벨 값이 빈 것 — 두 경우 모두 `deployment.yaml`의 해당 블록을 인용해 외부 트랙에 보고.
