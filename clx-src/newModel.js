// llmUpgrade.js

var globalAIEngine = null;

function onBodyLoad(e){
 
    // 1. 백그라운드 스레드(Worker) 생성 
    const worker = new Worker(new URL("./lib/llm-worker.js", window.location.href), { type: "module" });

    worker.onerror = function(err) {
        console.error("🚨 [Worker 에러]:", err.message);
    };

    import("./lib/web-llm.js").then(async function(webllm) {
        console.log("⏳ 폐쇄망 로컬 AI 엔진 예열 시작...");

        const modelId = "Qwen2.5-0.5B-Local"; // 이름은 임의로 지정 가능
        
        // ⭐ 폐쇄망 핵심: 프로젝트 내부 서버에 올려둔 모델 파일과 WASM 파일의 절대 경로 지정
        const absoluteModelUrl = new URL("./lib/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/", window.location.href).href;
        const absoluteWasmUrl = new URL("./lib/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/Qwen2-0.5B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm", window.location.href).href;

        const customAppConfig = {
            model_list: [
                {
                    model_id: modelId,
                    model: absoluteModelUrl, // ndarray-cache.json이 있는 폴더 경로
                    model_lib: absoluteWasmUrl // wasm 파일 경로
                }
            ]
        };

        var logCtrl = app.lookup("optLog");
        
        // ⭐ 로컬 AppConfig를 주입하여 생성
        globalAIEngine = await webllm.CreateWebWorkerMLCEngine(worker, modelId, {
            appConfig: customAppConfig,
            initProgressCallback: (progress) => {
                // 폐쇄망 환경이므로 외부 다운로드가 아닌 '로컬 서버 -> 브라우저 캐시'로 이동하는 퍼센티지입니다.
                var progressText = `[AI 로컬 로딩] ${Math.round(progress.progress * 100)}% : ${progress.text}`;
                console.log(progressText);
                
                if (logCtrl) {
                    logCtrl.value = progressText;
                    app.getContainer().redraw();
                }
            }
        });

        console.log("✅ AI 폐쇄망 예열 완료!");
        if (logCtrl) {
            logCtrl.value = "✅ AI 엔진 세팅 완료! 오프라인 동작 준비 끝.";
            app.getContainer().redraw();
        }

    }).catch(function(error) {
        console.error("❌ AI 초기화 실패:", error);
    });
}

// 아래 onBtnSmartGridFillClick 클릭 이벤트는 제가 방금 전 답변에서 드린 
// 스트리밍 + 프롬프트 최적화 코드를 그대로 사용하시면 됩니다!

/*
 * "스마트 그리드 채우기" 버튼 클릭 이벤트 (스트리밍 + 방어 로직 강화)
 */
async function onBtnSmartGridFillClick(e) {
    var rawText = app.lookup("txaUserInput").value; 
    if (!rawText) return alert("추가할 데이터를 텍스트로 입력해주세요.");

    if (!globalAIEngine) {
        return alert("AI가 아직 예열 중입니다. 상단 로그를 확인해주세요.");
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

    // 2. 강화된 시스템 프롬프트
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
        var logCtrl = app.lookup("optLog");
        
        // 메인 스레드는 멈추지 않고 워커에 스트리밍 요청
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
            
            // 실시간 로그 출력 (스트리밍 타이핑 효과)
            if(logCtrl) {
                logCtrl.value = fullReply; 
                app.getContainer().redraw(); // eXBuilder6 화면 강제 갱신
            }
            
            console.log("🤖 AI 생성 중...", content);
        }

        console.log("✅ 스트리밍 완료. 데이터 파싱 시작...");

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
        
        if(logCtrl) {
            logCtrl.value = "✅ 작업 완료! 대기 중...";
            app.getContainer().redraw();
        }

    } catch(error) {
        console.error("❌ 처리 오류:", error);
        alert("분석 중 오류가 발생했습니다. 콘솔을 확인하세요.");
    }
}