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

        const modelId = "Qwen2.5-0.5B-Local"; 
        
        // ⭐ 폐쇄망 절대 경로 지정
        const absoluteModelUrl = new URL("./lib/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/", window.location.href).href;
        const absoluteWasmUrl = new URL("./lib/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/Qwen2-0.5B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm", window.location.href).href;

        const customAppConfig = {
            model_list: [
                {
                    model_id: modelId,
                    model: absoluteModelUrl, 
                    model_lib: absoluteWasmUrl 
                }
            ]
        };

        var logCtrl = app.lookup("optLog");
        
        globalAIEngine = await webllm.CreateWebWorkerMLCEngine(worker, modelId, {
            appConfig: customAppConfig,
            initProgressCallback: (progress) => {
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
/*
 * "스마트 그리드 채우기" 버튼 클릭 이벤트 (AI 추출 + JS 복제 하이브리드 고도화)
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
    
    // 1. 목표 JSON 구조 정의 (동적 컬럼 매핑용)
    var expectedJsonFormat = {};
    for(var i = 0; i < headers.length; i++) {
        var colId = headers[i].getName(); 
        expectedJsonFormat[colId] = ""; 
    }
    
    // ⭐ [핵심 아이디어] AI에게 수량을 파악해서 넘겨달라고 전용 파라미터(_count)를 몰래 하나 추가합니다.
//    expectedJsonFormat["_count"] = 1; 
//    var formatStr = JSON.stringify(expectedJsonFormat);
//
//// ⭐ 추상적 논리 매핑 + 데이터 타입(String/Number) 강제 프롬프트
//    var systemPrompt = `당신은 텍스트에서 핵심 대상을 추출하여, 제공된 JSON 양식 중 가장 의미가 비슷한 컬럼(Key)에 스스로 짝지어주는(Mapping) 지능형 파서입니다.
//					인사말이나 마크다운 없이 오직 단일 JSON 배열 구조만 출력하세요.
//					
//					[범용 데이터 추출 및 매핑 규칙]
//					1. 핵심 대상 분리: 사용자의 문장에서 "추가", "데이터", "개", "건" 등의 지시어와 단위를 버리고, 입력하고자 하는 '실제 알맹이'만 추출하세요.
//					2. 동적 컬럼 매핑 (자율 추론): 아래 제공된 [목표 JSON 구조]의 영문 Key 이름들을 읽고 뜻을 분석하여, 추출한 '알맹이'의 종류/성격과 가장 의미가 일치하는 단 1개의 Key에 값을 넣으세요.
//					3. ⭐ 데이터 타입(String/Number) 판단: 추출한 값이 텍스트(이름, 품목 등)라면 반드시 따옴표를 씌운 String 타입으로 넣으세요. 만약 추출한 값이 숫자(금액, 나이 등)라면 반드시 따옴표 없는 Number 타입으로 넣으세요.
//					4. 수량 분리: 문장에 N개, N명, N건 등 복제를 의미하는 숫자가 있다면, 알맹이와 분리하여 오직 숫자만 "_count" Key에 Number 타입으로 넣으세요. (예: "_count": 15) 숫자가 없으면 1입니다.
//					5. 나머지 처리: 오늘 날짜는 "${todayStr}" 입니다. 매핑된 Key와 "_count", 날짜를 제외한 나머지 모든 Key는 빈 문자열("")로 비워두세요.
//					
//					[목표 JSON 구조] (반드시 이 구조의 Key만 사용할 것)
//					${formatStr}
//					
//					[추상적 작동 논리 예시]
//					입력: "[임의의_문자데이터] [숫자A]개"
//					출력: [
//					  {
//					    ...나머지 Key들은 모두 빈 문자열("")...,
//					    "문자와_가장_유사한_Key-이름": "[임의의_문자데이터]",
//					    "_count": [숫자A]
//					  }
//					]
//					
//					입력: "[임의의_숫자데이터] [숫자B]명"
//					출력: [
//					  {
//					    ...나머지 Key들은 모두 빈 문자열("")...,
//					    "숫자와_가장_유사한_Key-이름": [임의의_숫자데이터],
//					    "_count": [숫자B]
//					  }
//					]
//					
//					이제 위 추상적 논리 규칙에 따라, 아래 텍스트를 분석하여 완벽하게 매핑된 단일 JSON 배열을 출력하세요.`;


// 1. 목표 JSON 구조 정의 (동적 컬럼 매핑용)
    var expectedJsonFormat = {};
    for(var i = 0; i < headers.length; i++) {
        var colId = headers[i].getName(); 
        expectedJsonFormat[colId] = ""; 
    }
    
    // ⭐ [핵심 아이디어] AI에게 수량을 파악해서 넘겨달라고 전용 파라미터(_count)를 몰래 하나 추가합니다.
    expectedJsonFormat["_count"] = 1; 
    var formatStr = JSON.stringify(expectedJsonFormat);

    // ⭐ [추가 방어] AI가 엉뚱한 컬럼에 데이터를 넣지 못하도록 사용 가능한 Key 목록을 텍스트로 추출
    var allowedKeysStr = Object.keys(expectedJsonFormat).join(", ");

    // ⭐ 특정 단어 배제 + 숫자 강제 추출 + 허용 Key 제한 프롬프트
    var systemPrompt = `당신은 텍스트를 철저히 해체하여 정해진 JSON 양식에만 값을 채워 넣는 엄격한 데이터 추출기입니다.
			인사말 없이 오직 단일 JSON 배열 구조([{}])만 출력하세요.
			
			[🚨 절대 지켜야 할 규칙 🚨]
			1. 허용된 Key 제한: 반드시 [ ${allowedKeysStr} ] 목록에 존재하는 영문 Key만 사용하세요. 절대 새로운 Key를 만들지 마세요.
			2. ⭐ 수량(_count) 강제 분리: 텍스트에 숫자(0~9)가 포함되어 있다면, 뒤에 '건', '개', '추가' 같은 글자가 띄어쓰기 없이 붙어있더라도 글자는 무조건 잘라내고 오직 "숫자"만 "_count" Key에 Number 타입으로 넣으세요.
			3. 핵심 알맹이 매핑: 숫자와 불필요한 단어를 모두 제거하고 남은 '핵심 명사' 1개만 추출하세요. 그리고 허용된 Key 목록의 영문 뜻을 스스로 분석하여, 해당 명사와 가장 의미가 일치하는 단 1곳의 Key에만 String 타입으로 넣으세요.
			4. 나머지 비우기: 값을 넣은 1개의 Key와 "_count", 날짜("${todayStr}")를 제외한 모든 Key는 반드시 "" (빈 문자열)로 남겨두세요.
			
			[목표 JSON 템플릿] (이 템플릿 구조를 그대로 복사할 것)
			${formatStr}
			
			[추상적 작동 논리 예시] <--무조건 해당 예시 json 구조를 따라야한다
			입력: "[임의의_핵심명사] [숫자]건추가" (띄어쓰기가 없어도 숫자를 완벽히 분리해야 함)
			출력: [
			  {
			    ...나머지 모든 Key는 "",
			    "목록_중_가장_알맞은_실제_영문_Key": "[임의의_핵심명사]",
			    "_count": [숫자]
			  }
			]
			
			이제 위 규칙에 따라 텍스트를 분석하여, [목표 JSON 템플릿]을 완벽히 유지한 채 값만 채운 JSON 배열을 출력하세요.`;
    try {
        console.log("🚀 백그라운드 AI 스트리밍 분석 시작...");
        var logCtrl = app.lookup("optLog");
        
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
            if(logCtrl) {
                logCtrl.value = fullReply; 
                app.getContainer().redraw();
            }
        }

        console.log("✅ 스트리밍 완료. 데이터 파싱 시작...");

        // 3. 방어 코드 (혹시 모를 마크다운 제거)
        fullReply = fullReply.replace(/```json/g, "").replace(/```/g, "").trim();

        var cleanJsonStr = "";
        var arrayMatch = fullReply.match(/\[[\s\S]*\]/); 
        
        if (arrayMatch) {
            cleanJsonStr = arrayMatch[0];
        } else {
            var objectMatch = fullReply.match(/\{[\s\S]*\}/);
            if (objectMatch) {
                cleanJsonStr = "[" + objectMatch[0] + "]";
            } else {
                throw new Error("JSON 형식을 찾을 수 없습니다. 응답: " + fullReply);
            }
        }

        var extractedArray = JSON.parse(cleanJsonStr);
        if (!Array.isArray(extractedArray)) {
            extractedArray = [extractedArray];
        }

        // 4. 기존 코드 딕셔너리
        var codeDictionaries = {
            "deptCode": { "영업팀": "DEPT_001", "인사팀": "DEPT_002", "IT팀": "DEPT_003" },
            "bankCode": { "국민은행": "KB_04", "신한은행": "SH_05", "우리은행": "WR_06" },
            "itemCategory": { "모니터": "CAT_M", "마우스": "CAT_MO", "키보드": "CAT_K" }
        };

        var insertIdx = grid.getSelectedRowIndex();
        var totalAdded = 0; // 총 추가된 건수 카운트
        
        // ⭐ 5. 대망의 자바스크립트 자동 복제 로직
        for(var j = 0; j < extractedArray.length; j++) {
            var baseRowData = extractedArray[j];
            
            // AI가 찾아낸 수량을 가져옵니다. (기본값 1)
            var repeatCount = parseInt(baseRowData["_count"], 10) || 1; 
            delete baseRowData["_count"]; // 그리드에는 없는 컬럼이므로 지워줍니다.
            
            // 딕셔너리 변환
            for (var key in codeDictionaries) {
                if (baseRowData[key] && codeDictionaries[key][baseRowData[key]]) {
                    baseRowData[key] = codeDictionaries[key][baseRowData[key]];
                }
            }
            
            // ⭐ repeatCount 만큼 자바스크립트가 알아서 복제해서 그리드에 꽂아 넣습니다!
            for(var r = 0; r < repeatCount; r++) {
                // 객체가 참조되지 않도록 깊은 복사(Deep Copy)를 수행합니다.
                var newRowData = JSON.parse(JSON.stringify(baseRowData));
                
                if (insertIdx === -1) {
                    dataSet.addRowData(newRowData);
                } else {
                    grid.insertRowData(insertIdx + 1, false, newRowData);
                    insertIdx++; 
                }
                totalAdded++;
            }
        }
        
        app.getContainer().redraw();
        alert(totalAdded + "건의 데이터가 추가되었습니다.");
        
        if(logCtrl) {
            //logCtrl.value = "✅ 작업 완료! 총 " + totalAdded + "건 추가됨.";
            app.getContainer().redraw();
        }

    } catch(error) {
        console.error("❌ 처리 오류:", error);
        alert("분석 중 오류가 발생했습니다. 콘솔을 확인하세요.");
    }
}