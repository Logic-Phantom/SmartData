/************************************************
 * llmUpgrade.js
 * Created at 2026. 3. 26. 오후 1:45:10.
 *
 * @author 서현
 ************************************************/

// ⭐ 1. 백그라운드 AI 엔진을 담아둘 전역 변수
var globalAIEngine = null;

/*
 * 루트 컨테이너에서 load 이벤트 발생 시 호출.
 * 앱이 최초 랜더링된 직후에 발생하는 이벤트입니다. (Pre-loading 역할)
 */
function onBodyLoad(e){
    // 1. 백그라운드 스레드(Worker) 생성 
    // ⚠️ 주의: 맨 앞의 슬래시(/)를 점(.)으로 바꿔서 상대 경로로 맞춰보세요!
    const worker = new Worker(new URL("./lib/llm-worker.js", window.location.href), { type: "module" });

    // ⭐ CCTV 달기: 워커 내부에서 에러가 나면 콘솔에 빨간색으로 찍어줍니다.
    worker.onerror = function(err) {
        console.error("🚨 [Worker 사망] 워커 내부 에러 발생:", err.message);
    };

    // 2. WebLLM 모듈을 불러와서 Worker 안에 AI 엔진 세팅하기
    import("./lib/web-llm.js").then(async function(webllm) {
        console.log("⏳ 백그라운드 AI 로컬 엔진 예열 시작... (UI는 멈추지 않습니다!)");

        const modelId = "Phi-3-mini-local";
        const absoluteModelUrl = new URL("./lib/Phi-3-mini-4k-instruct-q4f16_1-MLC/", window.location.href).href;
        const absoluteWasmUrl = new URL("./lib/Phi-3-mini-4k-instruct-q4f16_1-MLC/resolve/main/Phi-3-mini-4k-instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm", window.location.href).href;

        const customAppConfig = {
            model_list: [
                {
                    model_id: modelId,
                    model: absoluteModelUrl, 
                    model_lib: absoluteWasmUrl
                }
            ]
        };

        // ⭐ 일반 엔진이 아닌 'WebWorker' 전용 엔진 생성 함수 사용!
        globalAIEngine = await webllm.CreateWebWorkerMLCEngine(worker, modelId, {
            appConfig: customAppConfig,
            initProgressCallback: (progress) => {
                // 이 로그가 찍히는 동안에도 화면의 다른 버튼을 누르거나 스크롤할 수 있습니다.
                console.log(`[AI 로딩 상태] ${Math.round(progress.progress * 100)}% : ${progress.text}`);
            }
        });

        console.log("✅ AI 예열 완료! 이제 즉시 분석이 가능합니다.");

    }).catch(function(error) {
        console.error("❌ AI 초기화 실패:", error);
    });
}

/*
 * "스마트 그리드 채우기" 버튼 클릭 이벤트
 */
async function onBtnSmartGridFillClick(e) {
    var rawText = app.lookup("txaUserInput").value; 
    if (!rawText) return alert("추가할 데이터를 텍스트로 입력해주세요.");

    // ⭐ 엔진이 아직 로딩 중인지 확인하는 방어 로직
    if (!globalAIEngine) {
        return alert("AI가 아직 예열 중입니다. 잠시 후 다시 시도해주세요. (F12 콘솔 확인)");
    }

    var grid = app.lookup("grd1");
    var dataSet = grid.dataSet; 
    var headers = dataSet.getHeaders(); 
    
    var today = new Date();
    var todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, '0') + "-" + String(today.getDate()).padStart(2, '0');
    
    var expectedJsonFormat = {};
    for(var i = 0; i < headers.length; i++) {
        var colId = headers[i].getName(); 
        expectedJsonFormat[colId] = "추출된_값"; 
    }

    // 시스템 프롬프트 구성
    var systemPrompt = "당신은 데이터 추출 전문가입니다. 사용자의 텍스트를 분석하여 반드시 아래 조건에 맞는 JSON 배열(Array) 형태로만 응답하세요.\n\n" + 
    "1. 다건(Row) 물리적 복제: 텍스트에 'N건', 'N개' 등 수량이 명시되어 있다면, 반드시 해당 데이터를 N번 복제하여 배열 내에 N개의 독립된 객체(Row)로 생성하세요.\n" +
    "2. 유추 및 생성 금지: 명시되지 않은 품목은 절대 지어내지 마세요.\n" +
    "3. 빈 값 처리: 찾을 수 없는 속성은 null로 처리하세요.\n" +
    "4. 날짜 기준: 오늘 날짜는 [" + todayStr + "] 입니다. '오늘', '내일' 등의 단어는 YYYY-MM-DD 형식으로 변환하세요.\n\n" +
    "출력은 반드시 다음 JSON 배열 형태를 따라야 합니다:\n" +
    "[" + JSON.stringify(expectedJsonFormat) + "]";

    try {
        console.log("🚀 백그라운드 Worker에 AI 분석 요청 중...");
        
        // 메인 스레드는 멈추지 않고, 백그라운드 Worker에서 연산을 수행합니다.
        const reply = await globalAIEngine.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: rawText }
            ],
            temperature: 0.1, 
        });

        var cleanJsonStr = reply.choices[0].message.content.replace(/```json/g, "").replace(/```/g, "").trim();
        var extractedArray = JSON.parse(cleanJsonStr);
        
        if (!Array.isArray(extractedArray)) {
            extractedArray = [extractedArray];
        }

        console.log("✅ 백그라운드 AI 추출 완료:", extractedArray);
        
        var codeDictionaries = {
            "deptCode": { "영업팀": "DEPT_001", "인사팀": "DEPT_002", "IT팀": "DEPT_003" },
            "bankCode": { "국민은행": "KB_04", "신한은행": "SH_05", "우리은행": "WR_06" },
            "itemCategory": { "모니터": "CAT_M", "마우스": "CAT_MO", "키보드": "CAT_K" }
        };

        var insertIdx = grid.getSelectedRowIndex();
        
        for(var j = 0; j < extractedArray.length; j++) {
            var rowData = extractedArray[j];
            
            for (var key in codeDictionaries) {
                if (rowData[key] && codeDictionaries[key][rowData[key]]) {
                    rowData[key] = codeDictionaries[key][rowData[key]];
                }
            }
            
            if (insertIdx === -1) {
                dataSet.addRowData(rowData);
            } else {
                grid.insertRowData(insertIdx + 1, false, rowData);
                insertIdx++; 
            }
        }
        
        app.getContainer().redraw();
        alert(extractedArray.length + "건의 데이터가 추가되었습니다!");

    } catch(error) {
        console.error("❌ AI 추론 중 오류 발생:", error);
        alert("데이터 추출 중 문제가 발생했습니다.");
    }
}