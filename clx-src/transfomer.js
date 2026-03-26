/*
 * 🚀 Grid + DataSet 최종판 (100% 오프라인 On-Device AI)
 */
function onBtnSmartGridFillClick(e) {

    var rawText = app.lookup("txaUserInput").value; 
    if (!rawText) return alert("추가할 데이터를 텍스트로 입력해주세요.");

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

    import("./lib/web-llm.js").then(async function(webllm) {
        
        console.log("로컬 AI 엔진 초기화 중... (최초 1회 캐싱 시 시간이 소요됩니다.)");
        
        const initProgressCallback = (initProgress) => {
            console.log("AI 로딩 상태: [" + Math.round(initProgress.progress * 100) + "%] " + initProgress.text);
        };

const modelId = "Phi-3-mini-local";

        // 모델 기본 경로는 그대로 둡니다. (WebLLM이 알아서 뒤에 resolve/main/을 붙입니다)
        const absoluteModelUrl = new URL("./lib/Phi-3-mini-4k-instruct-q4f16_1-MLC/", window.location.href).href;
        
        // ⭐ WASM 파일은 우리가 main 폴더 안으로 옮겼으니 경로를 맞춰줍니다!
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

        // ... (이하 코드 동일)
        // 로컬 설정 주입하여 AI 엔진 생성
        const engine = await webllm.CreateMLCEngine(modelId, { 
            appConfig: customAppConfig,
            initProgressCallback: initProgressCallback 
        });

        // 6. 시스템 프롬프트
        var systemPrompt = "당신은 데이터 추출 전문가입니다. 사용자의 텍스트를 분석하여 반드시 아래 조건에 맞는 JSON 배열(Array) 형태로만 응답하세요.\n\n" + 
        "🔥 [데이터 추출의 엄격한 3대 원칙] 🔥\n" +
        "1. 다건(Row) 물리적 복제: 텍스트에 'N건', 'N개' 등 수량이 명시되어 있다면, 반드시 해당 데이터를 N번 복제하여 배열 내에 N개의 독립된 객체(Row)로 생성하세요. (예: '짜장면 3개' -> 똑같은 짜장면 데이터 객체 3개 생성)\n" +
        "2. 유추 및 생성 금지: 명시되지 않은 품목은 절대 지어내지 마세요.\n" +
        "3. 빈 값 처리: 찾을 수 없는 속성은 null로 처리하세요.\n" +
        "4. 날짜 기준: 오늘 날짜는 [" + todayStr + "] 입니다. '오늘', '내일' 등의 단어는 YYYY-MM-DD 형식으로 변환하세요.\n\n" +
        "출력은 반드시 다음 JSON 배열 형태를 따라야 합니다:\n" +
        "[" + JSON.stringify(expectedJsonFormat) + "]";

        console.log("로컬 AI 분석 시작...");
        
        const reply = await engine.chat.completions.create({
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

        console.log("✅ 로컬 AI 추출 완료:", extractedArray);
        
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
        alert(extractedArray.length + "건의 데이터가 로컬 AI를 통해 추가되었습니다!");

    }).catch(function(error) {
        console.error("❌ 오프라인 AI 구동 오류:", error);
        alert("로컬 AI 구동 중 오류가 발생했습니다. 브라우저 개발자 도구(F12) 콘솔을 확인해주세요.");
    });
}