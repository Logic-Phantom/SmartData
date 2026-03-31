// llmUpgrade.js

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
        const absoluteWasmUrl  = new URL("./lib/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/Qwen2-0.5B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm", window.location.href).href;

        const customAppConfig = {
            model_list: [{
                model_id: modelId,
                model:     absoluteModelUrl,
                model_lib: absoluteWasmUrl
            }]
        };

        var logCtrl = app.lookup("optLog");
        
        globalAIEngine = await webllm.CreateWebWorkerMLCEngine(worker, modelId, {
            appConfig: customAppConfig,
            initProgressCallback: (progress) => {
                var progressText = `[AI 로컬 로딩] ${Math.round(progress.progress * 100)}% : ${progress.text}`;
                console.log(progressText);
                if (logCtrl) { logCtrl.value = progressText; app.getContainer().redraw(); }
            }
        });

        console.log("✅ AI 폐쇄망 예열 완료!");
        if (logCtrl) { logCtrl.value = "✅ AI 엔진 세팅 완료! 오프라인 동작 준비 끝."; app.getContainer().redraw(); }

    }).catch(function(error) {
        console.error("❌ AI 초기화 실패:", error);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 유틸 1: 날짜 포맷 헬퍼
// ─────────────────────────────────────────────────────────────────────────────
function fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 유틸 2: ⭐ 핵심 수정 - AI에게 넘기기 전에 JS에서 직접 날짜 치환
//   "오늘날짜로 임채명 추가해" → "2026-03-31 임채명 추가해"
//   AI는 이미 변환된 실제 값만 보게 됨
// ─────────────────────────────────────────────────────────────────────────────
function preprocessDateExpressions(text) {
    const now = new Date();
    const today     = fmtDate(now);
    const yesterday = fmtDate(new Date(now - 86400000));
    const tomorrow  = fmtDate(new Date(now + 86400000));
    const thisMonth = today.slice(0, 7);
    const thisYear  = now.getFullYear();

    // ⭐ 1순위: "2020년 2월 3일" → "2020-02-03"  (년+월+일 전체 명시)
    text = text.replace(/(\d{2,4})년\s*(\d{1,2})월\s*(\d{1,2})일/g, function(_, y, m, d) {
        return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    });

    // ⭐ 2순위: "2020년 2월" → "2020-02"  (년+월만)
    text = text.replace(/(\d{2,4})년\s*(\d{1,2})월/g, function(_, y, m) {
        return y + "-" + String(m).padStart(2, "0");
    });

    // ⭐ 3순위: "2020년" 단독 → "2020"
    text = text.replace(/(\d{2,4})년/g, function(_, y) {
        return y;
    });

    // ⭐ 4순위: "2월 2일" → "2026-02-02"  (년 없이 월+일)
    text = text.replace(/(\d{1,2})월\s*(\d{1,2})일/g, function(_, m, d) {
        return thisYear + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    });

    // ⭐ 5순위: "3월" 단독 (뒤에 숫자 없는 경우) → "2026-03"
    text = text.replace(/(\d{1,2})월(?!\s*\d)/g, function(_, m) {
        return thisYear + "-" + String(m).padStart(2, "0");
    });

    // ⭐ 점 구분 날짜 → 하이픈 통일 "2026.02.10" → "2026-02-10"
    text = text.replace(/(\d{4})\.(\d{2})\.(\d{2})/g, function(_, y, m, d) {
        return y + "-" + m + "-" + d;
    });

    // ⭐ 한국어 상대 날짜 치환 (오늘/내일/어제 등)
    text = text
        .replace(/오늘\s*날짜/g,  today)
        .replace(/현재\s*날짜/g,  today)
        .replace(/현재\s*일자/g,  today)
        .replace(/오늘\s*일자/g,  today)
        .replace(/이번\s*달/g,    thisMonth)
        .replace(/이번\s*월/g,    thisMonth)
        .replace(/오늘/g,         today)
        .replace(/현재/g,         today)
        .replace(/어제/g,         yesterday)
        .replace(/내일/g,         tomorrow)
        .replace(/올해/g,         String(thisYear))
        .replace(/금년/g,         String(thisYear));

    // ⭐ 맨 마지막: 범위 탐지 — 모든 날짜 치환 완료 후 실행해야 "오늘~내일"도 처리됨
    // 지원 구분자: ~ ～(전각)
    text = text.replace(/(\d{4}-\d{2}-\d{2})\s*[~～]\s*(\d{4}-\d{2}-\d{2})/g, function(_, s, e) {
        return "__RANGE_START__:" + s + " __RANGE_END__:" + e;
    });

    return text;
}


// ─────────────────────────────────────────────────────────────────────────────
// 유틸 3: 금액 문자열 → 숫자 변환  "150만원" → "1500000"
// ─────────────────────────────────────────────────────────────────────────────
function parseAmount(val) {
    val = val.replace(/,/g, "").trim();
    if (/억/.test(val)) return String(Math.round(parseFloat(val.replace(/[^0-9.]/g, "")) * 100000000));
    if (/만/.test(val)) return String(Math.round(parseFloat(val.replace(/[^0-9.]/g, "")) * 10000));
    var stripped = val.replace(/[^0-9.]/g, "");
    return stripped || val;
}

// ─────────────────────────────────────────────────────────────────────────────
// 유틸 4: Levenshtein 유사도 기반 컬럼 보정
// ─────────────────────────────────────────────────────────────────────────────
function calcSimilarity(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    if (a === b) return 1;
    const la = a.length, lb = b.length;
    const dp = Array.from({length: la+1}, (_, i) =>
        Array.from({length: lb+1}, (_, j) => i === 0 ? j : j === 0 ? i : 0)
    );
    for (let i = 1; i <= la; i++)
        for (let j = 1; j <= lb; j++)
            dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    return 1 - dp[la][lb] / Math.max(la, lb);
}

function resolveColumn(predicted, colNames, threshold) {
    threshold = threshold || 0.72;
    if (colNames.indexOf(predicted) !== -1) return predicted;

    var lower = predicted.toLowerCase();

    // 2순위: 대소문자 무시 완전 일치
    var exactCI = colNames.find(function(c) { return c.toLowerCase() === lower; });
    if (exactCI) return exactCI;

    // 3순위: ⭐ camelCase 토큰 공유 매칭
    // "userName" → ["user","name"] / "empName" → ["emp","name"] → "name" 공유 → 매칭
    function tokenize(s) {
        return s.replace(/([A-Z])/g, ' $1').trim().toLowerCase().split(/\s+/);
    }
    var predTokens = tokenize(predicted);
    var bestToken = null, bestTokenScore = 0;
    for (var i = 0; i < colNames.length; i++) {
        var colTokens = tokenize(colNames[i]);
        var shared = predTokens.filter(function(t) { return colTokens.indexOf(t) !== -1 && t.length >= 3; });
        var score = shared.length / Math.max(predTokens.length, colTokens.length);
        if (score > bestTokenScore) { bestTokenScore = score; bestToken = colNames[i]; }
    }
    if (bestTokenScore > 0) {
        console.log('🔧 토큰 매칭: "' + predicted + '" → "' + bestToken + '" (공유토큰 ' + (bestTokenScore*100).toFixed(0) + '%)');
        return bestToken;
    }

    // 4순위: Levenshtein 철자 유사도 (threshold 이상만)
    var best = null, bestScore = 0;
    for (var j = 0; j < colNames.length; j++) {
        var sim = calcSimilarity(predicted, colNames[j]);
        if (sim > bestScore) { bestScore = sim; best = colNames[j]; }
    }
    if (bestScore >= threshold) {
        console.log('🔧 철자 보정: "' + predicted + '" → "' + best + '" (유사도 ' + (bestScore*100).toFixed(0) + '%)');
        return best;
    }

    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 유틸 5: camelCase → 의미 힌트 ("deliveryDate" → "delivery date")
// ─────────────────────────────────────────────────────────────────────────────
function camelToWords(str) {
    return str.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인: "스마트 데이터맵 채우기" 버튼 클릭
// ─────────────────────────────────────────────────────────────────────────────
async function onBtnSmartMapFillClick(e) {
    var rawText = app.lookup("txaUserInput").value;
    if (!rawText) return alert("입력할 데이터를 텍스트로 작성해주세요.");
    if (!globalAIEngine) return alert("AI가 아직 예열 중입니다. 상단 로그를 확인해주세요.");

    // ⭐ 날짜 표현을 AI 이전에 JS에서 먼저 실제 값으로 치환
    var processedText = preprocessDateExpressions(rawText);
    console.log("📝 전처리된 입력:", processedText);

    // ⭐ 날짜 범위 마커를 텍스트에서 추출하고 AI 입력에서는 제거
    var extractedRanges = [];
    processedText = processedText.replace(/__RANGE_START__:([\d-]+)\s+__RANGE_END__:([\d-]+)/g, function(_, s, e) {
        extractedRanges.push({ start: s, end: e });
        console.log("📅 범위 추출:", s, "~", e);
        return ""; // AI에게는 범위 텍스트 제거 (혼란 방지)
    }).trim();

    var dataMap  = app.lookup("dmSample");
    var colNames = dataMap.getColumnNames();

    // 컬럼 힌트 문자열 생성 (camelCase 분리로 AI가 의미 파악)
    var colHints = colNames.map(function(c) { return c + "(" + camelToWords(c) + ")"; }).join(", ");

    // ─── 소형 모델(0.5B)용 최소화 프롬프트 ──────────────────────
    // ⭐ 예시 컬럼명을 실제 DataMap 컬럼에서 동적으로 뽑아 AI 혼란 방지
    var exampleDateCol  = colNames.find(function(c) { return /date|day|time|dt|일자|일시/i.test(c); }) || colNames[0];
    var exampleNameCol  = colNames.find(function(c) { return /name|nm|성명|이름/i.test(c); })         || colNames[1] || colNames[0];
    var fmtToday = (new Date()).getFullYear() + "-" +
        String((new Date()).getMonth()+1).padStart(2,"0") + "-" +
        String((new Date()).getDate()).padStart(2,"0");

    var systemPrompt =
        "Extract data from the user's Korean text and map to the most semantically similar column.\n\n" +
        "Available columns: " + colHints + "\n\n" +
        "Rules:\n" +
        "- Output ONLY lines in format: columnName|value\n" +
        "- ONLY use column names from the Available columns list above. Do NOT invent new column names.\n" +
        "- Remove Korean particles (은/는/이/가/을/를/로) and filler words (넣어/추가/입력/해줘/해/시작일/종료일)\n" +
        "- No explanations, no JSON, no markdown\n\n" +
        "Example (column names below are from YOUR actual list):\n" +
        "Input: \"" + fmtToday + " 홍길동 데이터 넣어줘\"\n" +
        "Output:\n" +
        exampleDateCol + "|" + fmtToday + "\n" +
        exampleNameCol + "|홍길동";

    try {
        var logCtrl = app.lookup("optLog");
        if (logCtrl) { logCtrl.value = "🤖 AI 분석 중..."; app.getContainer().redraw(); }

        console.log("🚀 AI DataMap 스마트 매핑 시작...");

        const chunks = await globalAIEngine.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user",   content: processedText }  // ⭐ 전처리된 텍스트 전달
            ],
            temperature: 0.0,
            stream: true
        });

        var fullReply = "";
        for await (const chunk of chunks) {
            var content = chunk.choices[0]?.delta?.content || "";
            fullReply += content;
            if (logCtrl) { logCtrl.value = fullReply; app.getContainer().redraw(); }
        }

        console.log("✅ AI 응답 완료:\n" + fullReply);

        // ─── 파싱 ───────────────────────────────────────────────
        var lines = fullReply
            .replace(/```[\s\S]*?```/g, "")
            .replace(/`/g, "")
            .trim()
            .split("\n")
            .map(function(l) { return l.trim(); })
            .filter(Boolean);

        if (!lines.length) return alert("매핑할 데이터를 추출하지 못했습니다.\nAI 응답: " + fullReply);

        // ─── 공통 코드 딕셔너리 ─────────────────────────────────
        var codeDictionaries = {
            "deptCode":     { "영업팀": "DEPT_001", "인사팀": "DEPT_002", "IT팀": "DEPT_003" },
            "bankCode":     { "국민은행": "KB_04", "신한은행": "SH_05", "우리은행": "WR_06" },
            "itemCategory": { "모니터": "CAT_M", "마우스": "CAT_MO", "키보드": "CAT_K" }
        };

        // ─── DataMap 세팅 ────────────────────────────────────────
        var updateCount = 0;
        var skipped = [];

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (!line.includes("|")) { skipped.push(line); continue; }

            var pipeIdx      = line.indexOf("|");
            var predictedCol = line.slice(0, pipeIdx).trim();
            var targetVal    = line.slice(pipeIdx + 1).trim();
            if (!predictedCol || !targetVal) continue;

            var resolvedCol = resolveColumn(predictedCol, colNames, 0.72);
            if (!resolvedCol) {
                console.warn("⚠️ 매칭 컬럼 없음, 무시:", predictedCol, "→", targetVal);
                skipped.push(predictedCol + "|" + targetVal);
                continue;
            }

            // 딕셔너리 변환
            if (codeDictionaries[resolvedCol] && codeDictionaries[resolvedCol][targetVal]) {
                targetVal = codeDictionaries[resolvedCol][targetVal];
            }

            // 금액 계열 자동 변환
            if (/amount|price|cost|fee|salary|pay/i.test(resolvedCol)) {
                targetVal = parseAmount(targetVal);
            }

            dataMap.setValue(resolvedCol, targetVal);
            updateCount++;
            console.log("✏️ DataMap 세팅: " + resolvedCol + " = " + targetVal);
        }

        // ⭐ 날짜 범위 → 시작일·종료일 컬럼 자동 매핑
        if (extractedRanges.length > 0) {
            // 시작일 컬럼 후보: start·from·begin·str·frm + Date/Dt/Day/일자 포함
            var startColRe = /start|from|begin|str|frm|시작/i;
            // 종료일 컬럼 후보: end·to·fin|close·until·exp + Date/Dt/Day/일자 포함
            var endColRe   = /end|to|fin|close|until|exp|마감|종료/i;

            var startDateCol = colNames.find(function(c) { return startColRe.test(c); })
                            || colNames.find(function(c) { return /date|dt|day|일/i.test(c); })
                            || null;
            var endDateCol   = colNames.find(function(c) { return endColRe.test(c); })
                            || colNames.filter(function(c) { return /date|dt|day|일/i.test(c); })[1]
                            || null;

            extractedRanges.forEach(function(range) {
                if (startDateCol) {
                    dataMap.setValue(startDateCol, range.start);
                    updateCount++;
                    console.log("✏️ 범위 시작일 세팅:", startDateCol, "=", range.start);
                }
                if (endDateCol) {
                    dataMap.setValue(endDateCol, range.end);
                    updateCount++;
                    console.log("✏️ 범위 종료일 세팅:", endDateCol, "=", range.end);
                }
                if (!startDateCol && !endDateCol) {
                    skipped.push("범위(" + range.start + "~" + range.end + "): 매칭 컬럼 없음");
                }
            });
        }

        app.getContainer().redraw();

        var resultMsg = "✅ " + updateCount + "개 데이터가 반영되었습니다.";
        if (skipped.length) resultMsg += "\n⚠️ " + skipped.length + "개 무시됨: " + skipped.join(", ");
        alert(resultMsg);

        if (logCtrl) {
            logCtrl.value = "✅ 매핑 완료! " + updateCount + "개 세팅 / " + skipped.length + "개 무시";
            app.getContainer().redraw();
        }

    } catch(error) {
        console.error("❌ 처리 오류:", error);
        alert("분석 중 오류가 발생했습니다. 콘솔을 확인하세요.");
    }
}