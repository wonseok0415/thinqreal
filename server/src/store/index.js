// 저장소 팩토리 — STORE_BACKEND env로 구현체 선택 (교체 지점의 단일 소스)
import { config, loadServiceAccount } from '../config.js';
import { createMemoryStore } from './memory.js';
import { createSheetsStore } from './sheets/index.js';
import { createDynamoStore } from './dynamo/index.js';

let store = null;

/** @returns {import('./types.js').Store} */
export function getStore() {
  if (store) return store;
  const backend = config.storeBackend;

  if (backend === 'sheets') {
    const serviceAccount = loadServiceAccount();
    if (!serviceAccount) {
      console.error('[store] STORE_BACKEND=sheets이지만 GOOGLE_SERVICE_ACCOUNT_JSON이 없거나 잘못됨. 기동 중단.');
      process.exit(1);
    }
    store = createSheetsStore({ serviceAccount, sheetId: config.sheetId });
  } else if (backend === 'dynamo') {
    store = createDynamoStore();
  } else {
    if (backend !== 'memory') console.warn(`[store] 알 수 없는 STORE_BACKEND '${backend}' → memory 사용`);
    store = createMemoryStore({ seed: config.storeSeed });
  }
  console.log(`[store] backend = ${store.backend}`);
  return store;
}
