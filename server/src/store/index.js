// 저장소 팩토리 — STORE_BACKEND env로 구현체 선택 (교체 지점의 단일 소스).
// sheets/dynamo는 동적 import — googleapis(무거움)를 memory 백엔드 기동 시 로드하지 않아
// K8s 메모리 limit(256Mi) 안에서 여유를 확보한다.
import { config, loadServiceAccount } from '../config.js';
import { createMemoryStore } from './memory.js';

let store = null;

/** @returns {Promise<import('./types.js').Store>} */
export async function getStore() {
  if (store) return store;
  const backend = config.storeBackend;

  if (backend === 'sheets') {
    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) {
      console.error('[store] STORE_BACKEND=sheets이지만 GOOGLE_SERVICE_ACCOUNT_JSON이 없거나 잘못됨. 기동 중단.');
      process.exit(1);
    }
    const { createSheetsStore } = await import('./sheets/index.js');
    store = createSheetsStore({ serviceAccount, sheetId: config.sheetId });
  } else if (backend === 'dynamo') {
    const { createDynamoStore } = await import('./dynamo/index.js');
    store = createDynamoStore();
  } else {
    if (backend !== 'memory') console.warn(`[store] 알 수 없는 STORE_BACKEND '${backend}' → memory 사용`);
    store = createMemoryStore({ seed: config.storeSeed });
  }
  console.log(`[store] backend = ${store.backend}`);
  return store;
}
