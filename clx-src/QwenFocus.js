// llm_smart_search_v5.js - 행 찾기 및 포커스 기능 추가

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

/*
 * 🔍 규칙 기반 사전 필터링 (AI 호출 전)
 */
function preprocessUserInput(rawText, allowedColumns) {
    var text = rawText.toLowerCase();
    
    // ⭐ 찾기 키워드 체크
    var findKeywords = ['찾아', '찾기', 'find', 'search', '검색'];
    var hasFindKeyword = findKeywords.some(function(kw) { return text.indexOf(kw) >= 0; });
    
    // ⭐ 해제/초기화 키워드 체크
    var clearKeywords = ['해제', '지워', '초기화', 'clear', 'reset', 'remove'];
    var hasClearKeyword = clearKeywords.some(function(kw) { return text.indexOf(kw) >= 0; });
    
    var showAllKeywords = ['전체', '모두', '전부', 'all', 'show all'];
    var hasShowAllKeyword = showAllKeywords.some(function(kw) { return text.indexOf(kw) >= 0; });
    
    // 필터/정렬 언급 체크
    var hasFilterMention = text.indexOf('필터') >= 0 || text.indexOf('filter') >= 0;
    var hasSortMention = text.indexOf('정렬') >= 0 || text.indexOf('sort') >= 0;
    
    // 1. 정렬 키워드 체크
    var sortKeywords = ['큰', '작은', '높은', '낮은', '많은', '적은', '순', '정렬', 'sort', 'order'];
    var hasSortKeyword = sortKeywords.some(function(kw) { return text.indexOf(kw) >= 0; });
    
    // 2. 필터 키워드 체크  
    var filterKeywords = ['만', '보여', 'only', 'show', 'filter', '필터'];
    var hasFilterKeyword = filterKeywords.some(function(kw) { return text.indexOf(kw) >= 0; });
    
    // 3. 컬럼명 명시 체크
    var mentionedColumn = null;
    for(var i = 0; i < allowedColumns.length; i++) {
        if(text.indexOf(allowedColumns[i].toLowerCase()) >= 0) {
            mentionedColumn = allowedColumns[i];
            break;
        }
    }
    
    // 4. 방향 키워드 체크
    var descKeywords = ['큰', '높은', '많은', 'desc', '내림'];
    var ascKeywords = ['작은', '낮은', '적은', 'asc', '오름'];
    
    var isDesc = descKeywords.some(function(kw) { return text.indexOf(kw) >= 0; });
    var isAsc = ascKeywords.some(function(kw) { return text.indexOf(kw) >= 0; });
    
    return {
        hasFindKeyword: hasFindKeyword,
        hasClearKeyword: hasClearKeyword,
        hasShowAllKeyword: hasShowAllKeyword,
        hasFilterMention: hasFilterMention,
        hasSortMention: hasSortMention,
        hasSortKeyword: hasSortKeyword,
        hasFilterKeyword: hasFilterKeyword,
        mentionedColumn: mentionedColumn,
        isDesc: isDesc,
        isAsc: isAsc
    };
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

    // ⭐ 규칙 기반 사전 분석
    var preAnalysis = preprocessUserInput(rawText, allowedColumns);
    
    console.log("📊 사전 분석:", preAnalysis);
    
    // ⭐ 해제/초기화 명령 즉시 처리 (AI 호출 불필요)
    if(preAnalysis.hasClearKeyword || preAnalysis.hasShowAllKeyword) {
        var logCtrl = app.lookup("optLog");
        
        // 필터 해제
        if(preAnalysis.hasFilterMention || preAnalysis.hasShowAllKeyword) {
            dataSet.clearFilter();
            console.log("✅ 필터 해제");
            if(logCtrl) {
                logCtrl.value = "✅ 필터 해제 완료";
            }
        }
        
        // 정렬 해제
        if(preAnalysis.hasSortMention || preAnalysis.hasShowAllKeyword) {
            dataSet.clearSort();
            console.log("✅ 정렬 해제");
            if(logCtrl) {
                logCtrl.value = logCtrl.value + " / 정렬 해제 완료";
            }
        }
        
        // 둘 다 언급 안 됐으면 전체 해제
        if(!preAnalysis.hasFilterMention && !preAnalysis.hasSortMention) {
            dataSet.clearFilter();
            dataSet.clearSort();
            if(logCtrl) {
                logCtrl.value = "✅ 필터 및 정렬 모두 해제 완료";
            }
        }
        
        app.getContainer().redraw();
        alert("초기화 완료! 전체 데이터를 표시합니다.");
        return; // AI 호출 없이 종료
    }
    
    // ⭐ 범용적 프롬프트 (편향 제거 + 찾기 기능 추가)
    var systemPrompt = `Analyze user request. Output ONLY one command format.

Available columns: ${allowedColumns.join(", ")}

Commands (use EXACTLY these):
1. FILTER|[value] - when user wants to see only specific value (hide others)
2. SORT|[column]|asc - when user wants ascending order
3. SORT|[column]|desc - when user wants descending order
4. FIND|[value] - when user wants to FIND and FOCUS on specific row (NOT filter)
5. MULTI|FILTER|[value]|SORT|[column]|[direction] - both filter and sort

Examples:
"[VALUE] only" → FILTER|[VALUE]
"show only [VALUE]" → FILTER|[VALUE]
"[COLUMN] high to low" → SORT|[COLUMN]|desc
"[COLUMN] low to high" → SORT|[COLUMN]|asc
"find [VALUE]" → FIND|[VALUE]
"search [VALUE]" → FIND|[VALUE]
"[VALUE] 찾아줘" → FIND|[VALUE]

IMPORTANT: 
- "찾아" (find) = FIND (focus on row)
- "만 보여" (only show) = FILTER (hide others)

Now analyze (keep exact values from user):`;

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
        
        // ⭐ AI 응답 후처리 (규칙 기반 검증/수정)
        var finalCommand = postprocessAIResponse(cleanReply, preAnalysis, rawText, allowedColumns);
        
        console.log("🎯 최종 명령:", finalCommand);
        
        executeSearchCommandV5(dataSet, finalCommand, allowedColumns, logCtrl);

    } catch(error) {
        console.error("❌ 오류:", error);
        alert("분석 중 오류 발생: " + error.message);
    }
}

/*
 * 🔧 AI 응답 후처리 (검증 및 수정)
 */
function postprocessAIResponse(aiReply, preAnalysis, rawText, allowedColumns) {
    var parts = aiReply.split("|");
    var cmdType = parts[0];
    
    // 1. 잘못된 명령어 수정
    if(cmdType !== "FILTER" && cmdType !== "SORT" && cmdType !== "MULTI" && 
       cmdType !== "FIND" && !cmdType.startsWith("FILTER_")) {
        
        // 찾기 키워드가 있으면 FIND로 강제 변환
        if(preAnalysis.hasFindKeyword) {
            var words = rawText.split(/\s+/);
            var valueCandidate = words[0];
            return "FIND|" + valueCandidate;
        }
        
        // 정렬 키워드가 있으면 SORT로 강제 변환
        if(preAnalysis.hasSortKeyword && preAnalysis.mentionedColumn) {
            var direction = preAnalysis.isDesc ? "desc" : "asc";
            return "SORT|" + preAnalysis.mentionedColumn + "|" + direction;
        }
        
        // 필터 키워드가 있으면 FILTER로 강제 변환
        if(preAnalysis.hasFilterKeyword) {
            var words = rawText.split(/\s+/);
            var valueCandidate = words[0];
            return "FILTER|" + valueCandidate;
        }
    }
    
    // 2. SORT 명령어 검증
    if(cmdType === "SORT") {
        if(parts.length >= 3) {
            var column = parts[1];
            var direction = parts[2];
            
            // 컬럼명 검증
            var columnExists = allowedColumns.indexOf(column) >= 0;
            if(!columnExists && preAnalysis.mentionedColumn) {
                column = preAnalysis.mentionedColumn;
            }
            
            // 방향 검증
            if(direction !== "asc" && direction !== "desc") {
                direction = preAnalysis.isDesc ? "desc" : "asc";
            }
            
            return "SORT|" + column + "|" + direction;
        }
    }
    
    // 3. 원본 그대로 반환
    return aiReply;
}

function executeSearchCommandV5(dataSet, command, allowedColumns, logCtrl) {
    var parts = command.split("|");
    var cmdType = parts[0];

    try {
        // ⭐ FIND: 행 찾아서 포커스 (필터링 아님!)
        if (cmdType === "FIND") {
            var targetValue = parts[1];
            var foundRow = null;
            var foundColumn = null;
            
            console.log("🔍 값 찾기 시작:", targetValue);
            
            // 모든 컬럼을 스캔해서 값 찾기
            for(var c = 0; c < allowedColumns.length; c++) {
                var searchCol = allowedColumns[c];
                var condition = searchCol + " == '" + targetValue + "'";
                
                try {
                    var firstRow = dataSet.findFirstRow(condition);
                    if(firstRow) {
                        foundRow = firstRow;
                        foundColumn = searchCol;
                        console.log("💡 첫 번째 행 발견:", searchCol, "행 인덱스:", firstRow.getIndex());
                        break;
                    }
                } catch(e) {
                    // 숫자로 재시도
                    try {
                        condition = searchCol + " == " + targetValue;
                        firstRow = dataSet.findFirstRow(condition);
                        if(firstRow) {
                            foundRow = firstRow;
                            foundColumn = searchCol;
                            console.log("💡 첫 번째 행 발견 (숫자):", searchCol, "행 인덱스:", firstRow.getIndex());
                            break;
                        }
                    } catch(e2) {}
                }
            }
            
            if(!foundRow) {
                if(logCtrl) {
                    logCtrl.value = "❌ '" + targetValue + "' 값을 찾을 수 없습니다.";
                }
                return alert("❌ '" + targetValue + "' 값을 찾을 수 없습니다.");
            }
            
            // 그리드에서 셀 인덱스 찾기
            var grid = app.lookup("grd1"); // 그리드 ID (실제 환경에 맞게 수정)
            var columnNames = grid.dataSet.getColumnNames();
            var cellIndex = -1;
            
            for(var i = 0; i < columnNames.length; i++) {
                if(columnNames[i] === foundColumn) {
                    cellIndex = i;
                    console.log("📍 셀 인덱스:", cellIndex);
                    break;
                }
            }
            
            if(cellIndex >= 0) {
                var rowIndex = foundRow.getIndex();
                grid.focusCell(rowIndex, cellIndex);
                
                console.log("✅ 셀 포커스 완료:", rowIndex, cellIndex);
                
                if(logCtrl) {
                    logCtrl.value = "✅ 찾음: " + (rowIndex + 1) + "행, " + foundColumn + " 컬럼";
                }
                
                alert("찾았습니다!\n행: " + (rowIndex + 1) + "\n컬럼: " + foundColumn + "\n값: " + targetValue);
            } else {
                alert("❌ 셀 인덱스를 찾을 수 없습니다.");
            }
            
        } else if (cmdType === "FILTER" || cmdType.startsWith("FILTER_")) {
            
            var targetValue = parts[1];
            
            var operator = "==";
            if (cmdType === "FILTER_GTE") operator = ">=";
            else if (cmdType === "FILTER_LTE") operator = "<=";
            else if (cmdType === "FILTER_GT") operator = ">";
            else if (cmdType === "FILTER_LT") operator = "<";
            else if (cmdType === "FILTER_CONTAINS") operator = "*=";
            
            var foundColumn = null;
            
            for(var c = 0; c < allowedColumns.length; c++) {
                var searchCol = allowedColumns[c];
                var testExpr = searchCol + " " + operator + " '" + targetValue + "'";
                
                try {
                    var foundRows = dataSet.findAllRow(testExpr);
                    
                    if(foundRows && foundRows.length > 0) {
                        foundColumn = searchCol;
                        console.log("💡 컬럼 발견:", foundColumn);
                        break;
                    }
                } catch(e) {
                    try {
                        testExpr = searchCol + " " + operator + " " + targetValue;
                        foundRows = dataSet.findAllRow(testExpr);
                        
                        if(foundRows && foundRows.length > 0) {
                            foundColumn = searchCol;
                            console.log("💡 컬럼 발견 (숫자):", foundColumn);
                            break;
                        }
                    } catch(e2) {}
                }
            }
            
            if(!foundColumn) {
                return alert("❌ '" + targetValue + "' 값을 찾을 수 없습니다.");
            }
            
            var isNumber = !isNaN(targetValue);
            var filterExpr = foundColumn + " " + operator + " " + (isNumber ? targetValue : "'" + targetValue + "'");
            dataSet.setFilter(filterExpr);
            
            console.log("✅ 필터:", filterExpr);
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
    var dataSet = app.lookup("ds1");
    dataSet.clearFilter();
    dataSet.clearSort();
    
    var logCtrl = app.lookup("optLog");
    if(logCtrl) {
        logCtrl.value = "🔄 초기화 완료";
    }
    
    app.getContainer().redraw();
    alert("필터/정렬 초기화 완료");
}

function onBtnShowStatusClick(e) {
    var dataSet = app.lookup("ds1");
    
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