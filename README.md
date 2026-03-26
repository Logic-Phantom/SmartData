# 🚀 SmartData: On-Device AI Smart Grid Fill

## 💡 프로젝트 소개
**SmartData**는 외부 인터넷 연결이나 API 서버 없이, 웹 브라우저 단에서 100% 로컬로 구동되는 **On-Device AI 스마트 데이터 입력 시스템**입니다. 
사용자가 자연어로 텍스트를 입력하면, 내장된 소형 AI 모델(WebLLM)이 이를 분석하여 정형화된 JSON 데이터로 변환하고 eXBuilder6의 Grid 컴포넌트에 자동으로 데이터를 채워 넣습니다.

## 🛠 기술 스택 (Tech Stack)
* **Frontend Framework:** eXBuilder6 (JavaScript, UI/UX)
* **AI Engine:** WebLLM (WebGPU, WebAssembly)
* **AI Model:** Phi-3-mini-4k-instruct-q4f16_1-MLC (로컬 구동용 경량화 모델)
* **IDE & Version Control:** Eclipse IDE, Git / GitHub

## ✨ 핵심 기능 (Core Features)
1. **100% 오프라인 AI 구동:** 외부 API 통신 없이 로컬 `.wasm` 엔진과 분할된 모델 가중치(`.bin`) 파일을 사용하여 브라우저 내부에서 텍스트 추론 및 데이터 추출.
2. **스마트 그리드 자동 완성:** 비정형 자연어(예: "모니터 3개, 키보드 1개 구매")를 인식하여, eXBuilder6 데이터셋(DataSet) 헤더 규격에 맞는 다건의 행(Row)으로 물리적 분리 및 삽입.
3. **코드 딕셔너리 자동 맵핑:** 자연어로 입력된 단어("영업팀", "국민은행")를 내부 시스템 코드("DEPT_001", "KB_04")로 자동 변환하여 Grid에 매핑.
4. **브라우저 캐싱 최적화:** AI 모델을 IndexedDB에 캐싱하여 최초 1회 로딩 이후에는 초고속으로 엔진 초기화.

## 🔄 데이터 처리 프로세스 (Workflow)
1. **사용자 입력:** 사용자가 텍스트 에어리어(TextArea)에 일상적인 문장으로 데이터 입력.
2. **AI 엔진 초기화:** `WebLLM` 모듈을 호출하여 로컬 경로에 있는 WASM 파일과 모델 파라미터 로드. (최초 로딩 시 브라우저 IndexedDB에 저장)
3. **프롬프트 엔지니어링:** Grid의 헤더 정보를 동적으로 읽어와, 엄격한 JSON 배열 형태로만 응답하도록 System Prompt 구성 및 주입.
4. **추론 및 추출:** 브라우저의 WebGPU를 활용하여 오프라인 상태에서 데이터 파싱.
5. **데이터 정제 및 바인딩:** 추출된 JSON 데이터를 내부 코드 딕셔너리 기준에 맞춰 변환 후, `dataSet.addRowData`를 통해 Grid에 렌더링.

## ⚠️ 설치 및 실행 시 주의사항 (Troubleshooting)
* **모델과 WASM 엔진 매칭:** `.wasm` 파일과 로드하는 모델 파라미터 설정의 버전(양자화 포맷 등)이 정확히 일치해야 합니다. 불일치 시 `Cannot find parameter in cache` 에러가 발생합니다.
* **캐시 비우기:** 엔진 버전을 교체하거나 모델을 변경할 경우, 반드시 브라우저 개발자 도구(F12) -> [Application] -> [IndexedDB]에서 `webllm` 캐시 데이터를 삭제해야 정상 구동됩니다.
* **웹 서버 환경 필수:** CORS 및 WebAssembly 모듈 로드 보안 정책으로 인해 로컬 파일 시스템(`file://`)에서는 동작하지 않으며, 반드시 웹 서버(e.g., Tomcat, Live Server) 환경에서 실행해야 합니다.

## 🚀 향후 과제 및 고도화 목표 (To-Do)
- [ ] **대용량 모델 관리 최적화:** 모델 파라미터 용량 증가 시 Git 일반 업로드 제한(총량)을 대비하여, 대용량 파일 저장소(Git LFS 또는 외부 CDN) 분리 아키텍처 검토.
- [ ] **WebGPU 미지원 환경 대응:** WebGPU를 지원하지 않는 구형 브라우저나 환경을 위한 Fallback 로직(예: WebGL 기반 엔진 전환 또는 알림창 처리) 추가.
- [ ] **프롬프트 정밀도 향상:** 더욱 복잡하고 난해한 비정형 텍스트에서도 누락 없이 완벽하게 데이터를 추출할 수 있도록 Few-shot 프롬프팅 기법 도입.
- [ ] **초기 로딩 UX 개선:** 첫 모델 다운로드(Caching) 시 사용자 이탈을 막기 위한 직관적인 프로그레스 바(Progress Bar) UI 고도화.
