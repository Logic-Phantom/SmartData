// llm_smart_search_v2.js - 컬럼 자동 탐색 방식

var globalAIEngine = null;

function onBodyLoad(e){
    const worker = new Worker(new URL("./lib/llm-worker.js", window.location.href), { type: "module" });

    worker.onerror = function(err) {
        console.error("🚨 [Worker 에러]:", err.message);
    };

    import("./lib/web-llm.js").then(async function(webllm) {
        console.log("⏳ 폐쇄망 로컬 AI 엔진 예열 시작...");

        const modelId = "Qwen2.5-0.5B-Local"; 
        
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
            logCtrl.value = "✅ AI 엔진 세팅 완료! 자연어 검색 준비 끝.";
            app.getContainer().redraw();
        }

    }).catch(function(error) {
        console.error("❌ AI 초기화 실패:", error);
    });
}

async function onBtnSmartSearchClick(e) {
    var rawText = app.lookup("txaUserInput").value; 
    if (!rawText) return alert("검색할 내용을 입력해주세요.");

    if (!globalAIEngine) {
        return alert("AI가 아직 예열 중입니다. 상단 로그를 확인해주세요.");
    }

    var dataSet = app.lookup("ds1");
    var headers = dataSet.getHeaders(); 
    
    var allowedColumns = [];
    for(var i = 0; i < headers.length; i++) {
        allowedColumns.push(headers[i].getName());
    }

    // ⭐ 초간단 프롬프트: 타입과 값만 추출 (컬럼명은 JS가 찾음)
    var systemPrompt = `Extract search intent. Output ONLY the command, NO explanations.

[RULES]
Keep user's values EXACTLY as written.

[FORMATS]

FILTER (show only specific value):
FILTER|value

Examples:
"짜장면만 보여줘" → FILTER|짜장면
"짜장면 데이터 만 보여줘" → FILTER|짜장면
"사과만" → FILTER|사과
"나이 20 이상" → FILTER_GTE|20
"나이 20 이하" → FILTER_LTE|20
"이름에 김 포함" → FILTER_CONTAINS|김

SORT (order data by column):
SORT|${allowedColumns.join(" or ")}|asc or desc

Examples:
"나이 많은 순" → SORT|age|desc
"가격 낮은 순" → SORT|price|asc

MULTI (both):
MULTI|FILTER|value|SORT|column|direction

Example:
"사과만 가격순으로" → MULTI|FILTER|사과|SORT|price|asc

Analyze:`;

    try {
        console.log("🚀 AI 분석 시작...");
        var logCtrl = app.lookup("optLog");
        
        const chunks = await globalAIEngine.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: rawText }
            ],
            temperature: 0.0, 
            max_tokens: 30,
            stream: true 
        });

        let fullReply = "";
        
        for await (const chunk of chunks) {
            const content = chunk.choices[0]?.delta?.content || "";
            fullReply += content;
            if(logCtrl) {
                logCtrl.value = "AI 분석: " + fullReply; 
                app.getContainer().redraw();
            }
        }

        console.log("✅ AI 분석 완료:", fullReply);

        var cleanReply = fullReply.trim().replace(/`/g, "");
        
        executeSearchCommandV2(dataSet, cleanReply, allowedColumns, logCtrl);

    } catch(error) {
        console.error("❌ 오류:", error);
        alert("분석 중 오류 발생: " + error.message);
    }
}

function executeSearchCommandV2(dataSet, command, allowedColumns, logCtrl) {
    var parts = command.split("|");
    var cmdType = parts[0];

    try {
        if (cmdType === "FILTER" || cmdType === "FILTER_GTE" || cmdType === "FILTER_LTE" || 
            cmdType === "FILTER_GT" || cmdType === "FILTER_LT" || cmdType === "FILTER_CONTAINS") {
            
            var targetValue = parts[1];
            
            // 연산자 결정
            var operator = "==";
            if (cmdType === "FILTER_GTE") operator = ">=";
            else if (cmdType === "FILTER_LTE") operator = "<=";
            else if (cmdType === "FILTER_GT") operator = ">";
            else if (cmdType === "FILTER_LT") operator = "<";
            else if (cmdType === "FILTER_CONTAINS") operator = "*=";
            
            // ⭐ 모든 컬럼을 스캔해서 값이 있는 컬럼 찾기 (기존 삭제 로직 방식)
            var foundColumn = null;
            
            for(var c = 0; c < allowedColumns.length; c++) {
                var searchCol = allowedColumns[c];
                var testExpr = searchCol + " " + operator + " '" + targetValue + "'";
                
                try {
                    var foundRows = dataSet.findAllRow(testExpr);
                    
                    if(foundRows && foundRows.length > 0) {
                        foundColumn = searchCol;
                        console.log("💡 컬럼 발견! '" + foundColumn + "' 컬럼에 '" + targetValue + "' 값 존재");
                        break;
                    }
                } catch(e) {
                    // 숫자 비교일 수도 있으니 따옴표 없이 재시도
                    try {
                        testExpr = searchCol + " " + operator + " " + targetValue;
                        foundRows = dataSet.findAllRow(testExpr);
                        
                        if(foundRows && foundRows.length > 0) {
                            foundColumn = searchCol;
                            console.log("💡 컬럼 발견! '" + foundColumn + "' 컬럼에 숫자 " + targetValue + " 존재");
                            break;
                        }
                    } catch(e2) {
                        // 이 컬럼은 매칭 안됨
                    }
                }
            }
            
            if(!foundColumn) {
                return alert("❌ 어떤 컬럼에서도 '" + targetValue + "' 값을 찾을 수 없습니다.");
            }
            
            // 필터 적용
            var isNumber = !isNaN(targetValue);
            var filterExpr = foundColumn + " " + operator + " " + (isNumber ? targetValue : "'" + targetValue + "'");
            dataSet.setFilter(filterExpr);
            
            console.log("✅ 필터 적용:", filterExpr);
            if(logCtrl) {
                logCtrl.value = "✅ 필터: " + foundColumn + " " + operator + " " + targetValue;
            }
            alert("필터 완료!\n컬럼: " + foundColumn + "\n조건: " + operator + " " + targetValue);
            
        } else if (cmdType === "SORT") {
            var column = parts[1];
            var order = parts[2];
            
            var sortExpr = column + " " + order;
            dataSet.setSort(sortExpr);
            
            console.log("✅ 정렬:", sortExpr);
            if(logCtrl) {
                logCtrl.value = "✅ 정렬: " + column + " " + (order === "desc" ? "내림차순" : "오름차순");
            }
            alert("정렬 완료: " + column + " " + (order === "desc" ? "큰 것부터" : "작은 것부터"));
            
        } else if (cmdType === "MULTI") {
            // MULTI|FILTER|값|SORT|컬럼|방향
            var filterValue = null;
            var sortColumn = null;
            var sortOrder = null;
            
            for(var i = 1; i < parts.length; i++) {
                if(parts[i] === "FILTER" && i + 1 < parts.length) {
                    filterValue = parts[i + 1];
                }
                if(parts[i] === "SORT" && i + 2 < parts.length) {
                    sortColumn = parts[i + 1];
                    sortOrder = parts[i + 2];
                }
            }
            
            // 필터 먼저 적용 (컬럼 자동 탐색)
            if(filterValue) {
                var foundColumn = null;
                
                for(var c = 0; c < allowedColumns.length; c++) {
                    var searchCol = allowedColumns[c];
                    var testExpr = searchCol + " == '" + filterValue + "'";
                    
                    try {
                        var foundRows = dataSet.findAllRow(testExpr);
                        if(foundRows && foundRows.length > 0) {
                            foundColumn = searchCol;
                            break;
                        }
                    } catch(e) {}
                }
                
                if(foundColumn) {
                    var filterExpr = foundColumn + " == '" + filterValue + "'";
                    dataSet.setFilter(filterExpr);
                    console.log("✅ 필터:", filterExpr);
                }
            }
            
            // 정렬 적용
            if(sortColumn && sortOrder) {
                var sortExpr = sortColumn + " " + sortOrder;
                dataSet.setSort(sortExpr);
                console.log("✅ 정렬:", sortExpr);
            }
            
            if(logCtrl) {
                logCtrl.value = "✅ 필터 + 정렬 완료!";
            }
            alert("필터 및 정렬 완료!");
            
        } else {
            alert("❌ 알 수 없는 명령: " + command);
        }
        
        app.getContainer().redraw();
        
    } catch(error) {
        console.error("❌ 실행 오류:", error);
        alert("실행 오류: " + error.message);
    }
}

function onBtnResetFilterClick(e) {
    var dataSet = app.lookup("dsOrder");
    dataSet.setFilter("");
    dataSet.setSort("");
    
    var logCtrl = app.lookup("optLog");
    if(logCtrl) {
        logCtrl.value = "🔄 초기화 완료";
    }
    
    app.getContainer().redraw();
    alert("필터/정렬 초기화 완료");
}

function onBtnShowStatusClick(e) {
    var dataSet = app.lookup("dsOrder");
    
    var currentFilter = dataSet.getFilter() || "(없음)";
    var currentSort = dataSet.getSort() || "(없음)";
    var rowCount = dataSet.getRowCount();
    
    var statusMsg = "📊 현재 상태\n\n";
    statusMsg += "🔍 필터: " + currentFilter + "\n";
    statusMsg += "📈 정렬: " + currentSort + "\n";
    statusMsg += "📝 행 수: " + rowCount;
    
    alert(statusMsg);
    
    var logCtrl = app.lookup("optLog");
    if(logCtrl) {
        logCtrl.value = "필터: " + currentFilter + " | 정렬: " + currentSort;
    }
}
