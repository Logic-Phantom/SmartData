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
//
///*
// * "스마트 그리드 채우기" 버튼 클릭 이벤트
// */
//async function onBtnSmartGridFillClick(e) {
//    var rawText = app.lookup("txaUserInput").value; 
//    if (!rawText) return alert("추가할 데이터를 텍스트로 입력해주세요.");
//
//    // ⭐ 엔진이 아직 로딩 중인지 확인하는 방어 로직
//    if (!globalAIEngine) {
//        return alert("AI가 아직 예열 중입니다. 잠시 후 다시 시도해주세요. (F12 콘솔 확인)");
//    }
//
//    var grid = app.lookup("grd1");
//    var dataSet = grid.dataSet; 
//    var headers = dataSet.getHeaders(); 
//    
//    var today = new Date();
//    var todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, '0') + "-" + String(today.getDate()).padStart(2, '0');
//    
//    var expectedJsonFormat = {};
//    for(var i = 0; i < headers.length; i++) {
//        var colId = headers[i].getName(); 
//        expectedJsonFormat[colId] = "추출된_값"; 
//    }
//
//    // 시스템 프롬프트 구성
//    var systemPrompt = "당신은 데이터 추출 전문가입니다. 사용자의 텍스트를 분석하여 반드시 아래 조건에 맞는 JSON 배열(Array) 형태로만 응답하세요.\n\n" + 
//    "1. 다건(Row) 물리적 복제: 텍스트에 'N건', 'N개' 등 수량이 명시되어 있다면, 반드시 해당 데이터를 N번 복제하여 배열 내에 N개의 독립된 객체(Row)로 생성하세요.\n" +
//    "2. 유추 및 생성 금지: 명시되지 않은 품목은 절대 지어내지 마세요.\n" +
//    "3. 빈 값 처리: 찾을 수 없는 속성은 null로 처리하세요.\n" +
//    "4. 날짜 기준: 오늘 날짜는 [" + todayStr + "] 입니다. '오늘', '내일' 등의 단어는 YYYY-MM-DD 형식으로 변환하세요.\n\n" +
//    "출력은 반드시 다음 JSON 배열 형태를 따라야 합니다:\n" +
//    "[" + JSON.stringify(expectedJsonFormat) + "]";
//
//    try {
//        console.log("🚀 백그라운드 Worker에 AI 분석 요청 중...");
//        
//        // 메인 스레드는 멈추지 않고, 백그라운드 Worker에서 연산을 수행합니다.
//        const reply = await globalAIEngine.chat.completions.create({
//            messages: [
//                { role: "system", content: systemPrompt },
//                { role: "user", content: rawText }
//            ],
//            temperature: 0.1, 
//        });
//
//        var cleanJsonStr = reply.choices[0].message.content.replace(/```json/g, "").replace(/```/g, "").trim();
//        var extractedArray = JSON.parse(cleanJsonStr);
//        
//        if (!Array.isArray(extractedArray)) {
//            extractedArray = [extractedArray];
//        }
//
//        console.log("✅ 백그라운드 AI 추출 완료:", extractedArray);
//        
//        var codeDictionaries = {
//            "deptCode": { "영업팀": "DEPT_001", "인사팀": "DEPT_002", "IT팀": "DEPT_003" },
//            "bankCode": { "국민은행": "KB_04", "신한은행": "SH_05", "우리은행": "WR_06" },
//            "itemCategory": { "모니터": "CAT_M", "마우스": "CAT_MO", "키보드": "CAT_K" }
//        };
//
//        var insertIdx = grid.getSelectedRowIndex();
//        
//        for(var j = 0; j < extractedArray.length; j++) {
//            var rowData = extractedArray[j];
//            
//            for (var key in codeDictionaries) {
//                if (rowData[key] && codeDictionaries[key][rowData[key]]) {
//                    rowData[key] = codeDictionaries[key][rowData[key]];
//                }
//            }
//            
//            if (insertIdx === -1) {
//                dataSet.addRowData(rowData);
//            } else {
//                grid.insertRowData(insertIdx + 1, false, rowData);
//                insertIdx++; 
//            }
//        }
//        
//        app.getContainer().redraw();
//        alert(extractedArray.length + "건의 데이터가 추가되었습니다!");
//
//    } catch(error) {
//        console.error("❌ AI 추론 중 오류 발생:", error);
//        alert("데이터 추출 중 문제가 발생했습니다.");
//    }
//}
/*
 * "스마트 그리드 채우기" 버튼 클릭 이벤트 (스트리밍 + 방어 로직 강화)
 */
async function onBtnSmartGridFillClick(e) {
    var rawText = app.lookup("txaUserInput").value; 
    if (!rawText) return alert("추가할 데이터를 텍스트로 입력해주세요.");

    if (!globalAIEngine) {
        return alert("AI가 아직 예열 중입니다. 잠시 후 다시 시도해주세요.");
    }

    var grid = app.lookup("grd1");
    var dataSet = grid.dataSet; 
    var headers = dataSet.getHeaders(); 
    
    var today = new Date();
    var todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, '0') + "-" + String(today.getDate()).padStart(2, '0');
    
    // 1. 목표 JSON 구조 정의 (프롬프트 주입용)
    var expectedJsonFormat = {};
    for(var i = 0; i < headers.length; i++) {
        var colId = headers[i].getName(); 
        expectedJsonFormat[colId] = ""; 
    }
    var formatStr = JSON.stringify(expectedJsonFormat);

    // 2. 강화된 시스템 프롬프트 (배열 형태 강제)
//    var systemPrompt = `당신은 데이터 파서입니다. 사용자의 요청을 분석하여 반드시 [ ] 로 감싸진 JSON 배열만 출력하세요.
//		내용이 1건이라도 반드시 [ { ... } ] 형태여야 합니다. 인사말이나 설명은 절대 하지 마세요.
//		
//		- 오늘 날짜: ${todayStr}
//		- 목표 JSON 구조: ${formatStr}
//		- 규칙: 수량이 명시되면 해당 숫자만큼 객체를 복제하여 배열에 넣으세요.`;

var systemPrompt = `당신은 비정형 텍스트를 분석하여 시스템의 DataGrid에 입력할 수 있는 순수한 JSON 배열(Array)만 출력하는 범용 파서입니다.
					인사말 없이 오직 [ ] 로 감싼 JSON 배열만 응답하세요.
					
					[데이터 생성 및 복제 원칙]
                    제일중요한 원칙은 인사말이나 설명은 절대 하지 마세요. 데이터 만들고 결과만 표출하세여

					1. ⭐ 물리적 행(Row) 복제: 
					사용자가 "A 2건", "B 3개", "C 5명" 처럼 수량을 명시하면, JSON 배열 내에 해당 항목의 객체를 반드시 요청한 숫자만큼 반복해서 생성하세요.

					
					2. ⭐ 수량 분산 금지:
					데이터를 한 줄로 합치고 수량 컬럼에 숫자만 쓰는 방식은 절대 금지합니다. 무조건 동일한 데이터를 여러 번 반복해서 나열하세요.
					
					3. 🚫 환각 및 유추 금지:
					텍스트에 없는 정보는 빈 문자열("")로 두세요. 오늘 날짜는 "${todayStr}" 입니다.
					
					[목표 JSON 구조]
					모든 객체는 반드시 아래 Key 구조를 가져야 합니다:
					${formatStr}
					
					[추출 논리 예시]
					입력: "대상X 3개 추가해줘"
					출력: [ {대상X의 데이터}, {대상X의 데이터}, {대상X의 데이터} ]
					
					이제 위 원칙에 따라 사용자 입력 텍스트를 분석하고 결과만 출력하세요.`;

    try {
        console.log("🚀 백그라운드 AI 스트리밍 분석 시작...");
        
        const chunks = await globalAIEngine.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: rawText }
            ],
            temperature: 0.1,
            stream: true 
        });

        let fullReply = "";
        
        for await (const chunk of chunks) {
            const content = chunk.choices[0]?.delta?.content || "";
            fullReply += content;
            
            // 실시간 로그 출력 (optLog 컨트롤에 바인딩)
            var logCtrl = app.lookup("optLog");
            if(logCtrl) logCtrl.value = fullReply; 
            
            console.log("🤖 AI 생성 중...", content);
        }

        console.log("✅ 스트리밍 완료. 데이터 복구 및 파싱 시작...");

        // 3. 유연한 JSON 추출 로직 (방어 코드)
        var cleanJsonStr = "";
        var arrayMatch = fullReply.match(/\[[\s\S]*\]/); // 우선 배열([]) 탐색
        
        if (arrayMatch) {
            cleanJsonStr = arrayMatch[0];
        } else {
            // 배열이 없다면 객체({})라도 찾아서 배열로 강제 변환
            var objectMatch = fullReply.match(/\{[\s\S]*\}/);
            if (objectMatch) {
                console.warn("⚠️ AI가 배열 형식을 누락하여 객체를 배열로 보정합니다.");
                cleanJsonStr = "[" + objectMatch[0] + "]";
            } else {
                throw new Error("JSON 형식을 찾을 수 없습니다. 응답: " + fullReply);
            }
        }

        var extractedArray = JSON.parse(cleanJsonStr);
        
        if (!Array.isArray(extractedArray)) {
            extractedArray = [extractedArray];
        }

        // 4. 코드 매핑 및 그리드 데이터 삽입
        var codeDictionaries = {
            "deptCode": { "영업팀": "DEPT_001", "인사팀": "DEPT_002", "IT팀": "DEPT_003" },
            "bankCode": { "국민은행": "KB_04", "신한은행": "SH_05", "우리은행": "WR_06" },
            "itemCategory": { "모니터": "CAT_M", "마우스": "CAT_MO", "키보드": "CAT_K" }
        };

        var insertIdx = grid.getSelectedRowIndex();
        
        for(var j = 0; j < extractedArray.length; j++) {
            var rowData = extractedArray[j];
            
            // 딕셔너리 변환
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
        alert(extractedArray.length + "건의 데이터가 추가되었습니다.");

    } catch(error) {
        console.error("❌ 처리 오류:", error);
        alert("분석 중 오류가 발생했습니다. 콘솔을 확인하세요.");
    }
}