// llm-worker.js
// ⚠️ 경로 주의: 프로젝트 구조에 맞춰 web-llm.js의 올바른 상대 경로를 적어주세요.
import { WebWorkerMLCEngineHandler } from "./web-llm.js";

// 백그라운드 엔진 핸들러 생성
const handler = new WebWorkerMLCEngineHandler();

// 메인 스레드(eXBuilder6)와 메시지를 주고받는 리스너 연결
self.onmessage = (msg) => {
    handler.onmessage(msg);
};