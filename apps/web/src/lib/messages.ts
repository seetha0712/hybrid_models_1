// EN/JA strings for the site. Formal Japanese (敬体) for an executive audience, with a consistent
// finance/ML glossary: モデル・スペクトラム, トークンコスト, フロンティアモデル, 自社保有, ルーティング,
// PIIガード, ファインチューニング, 損益分岐点, 未知の加盟店, 確信度.
export type Locale = "en" | "ja";

export const messages = {
  // ---------------- chrome ----------------
  "brand.name": { en: "The Model Spectrum", ja: "モデル・スペクトラム" },
  "brand.live": { en: "live", ja: "ライブ" },
  "toggle.en": { en: "EN", ja: "EN" },
  "toggle.ja": { en: "日本語", ja: "日本語" },
  "footer.note": {
    en: "Prices from results/pricing.json · every number on these pages is either measured live or loaded from committed results JSON (labelled when placeholder).",
    ja: "価格は results/pricing.json に基づきます。本サイトの数値はすべてライブ計測、またはコミット済みの結果JSONから読み込んだものです（暫定値の場合はその旨を明記しています）。",
  },
  "live.live": { en: "live", ja: "ライブ" },
  "live.checking": { en: "checking…", ja: "確認中…" },
  "live.offline": { en: "offline — recorded results", ja: "オフライン — 記録済みの結果" },
  "live.warm": { en: "Warm up", ja: "ウォームアップ" },
  "live.warming": { en: "warming…", ja: "起動中…" },

  // ---------------- nav ----------------
  "nav.overview": { en: "Overview", ja: "概要" },
  "nav.spectrum": { en: "Spectrum", ja: "スペクトラム" },
  "nav.router": { en: "Router", ja: "ルーター" },
  "nav.guardrail": { en: "Guardrail", ja: "ガードレール" },
  "nav.batch": { en: "Batch", ja: "バッチ" },
  "nav.underwrite": { en: "Underwrite", ja: "コスト評価" },
  "nav.extraction": { en: "Extraction", ja: "抽出" },
  "nav.architecture": { en: "Architecture", ja: "アーキテクチャ" },
  "nav.paper": { en: "Paper", ja: "論文" },

  // ---------------- home ----------------
  "home.title": { en: "Don't switch models. Build the spectrum.", ja: "モデルを乗り換えるのではなく、スペクトラムを構築する。" },
  "home.intro": {
    en: "The same narrow task run through every rung, one gateway that scrubs PII and routes each request to the cheapest adequate tier, and a token P&L that shows what the policy saves. Every number is measured; placeholders say so.",
    ja: "同一の狭いタスクをすべての階層で実行し、PIIを除去して各リクエストを「十分な性能のうち最も安価な階層」へ振り分ける単一のゲートウェイと、その方針による削減額を示すトークン損益（P&L）を提示します。数値はすべて実測値であり、暫定値にはその旨を明記しています。",
  },
  "home.stat.owned": { en: "Owned tiny model", ja: "自社保有の小型モデル" },
  "home.stat.owned.sub": { en: "accuracy · p50 latency", ja: "精度 · p50レイテンシ" },
  "home.stat.costOwned": { en: "Cost per 1M tasks, owned", ja: "100万タスクあたりコスト（自社保有）" },
  "home.stat.costOwned.sub": { en: "CPU marginal, 2 cores", ja: "CPU限界コスト、2コア" },
  "home.stat.costFrontier": { en: "Cost per 1M tasks, frontier", ja: "100万タスクあたりコスト（フロンティア）" },
  "home.stat.piiSent": { en: "PII sent to frontier", ja: "フロンティアへ送信されたPII" },
  "home.stat.piiSent.sub": { en: "entities redacted in the replay", ja: "リプレイでマスキングされた項目数" },
  "home.section.rungs": { en: "Six ways to run a language model — what this demo actually does on each rung", ja: "言語モデルを運用する6つの方法 — 本デモが各階層で実際に行っていること" },
  "home.th.rung": { en: "Rung", ja: "階層" },
  "home.th.name": { en: "Name", ja: "名称" },
  "home.th.runs": { en: "Runs here", ja: "実行内容" },
  "home.th.technique": { en: "Learning technique", ja: "学習手法" },
  "home.section.walk": { en: "The ten-minute walk", ja: "10分でわかるツアー" },
  "home.walk.spectrum": { en: "the JPMorgan replica: from-scratch vs LoRA vs Claude few-shot; toggle unseen merchants.", ja: "JPMorganの再現：ゼロから学習 vs LoRA vs Claudeのfew-shot。未知の加盟店の切り替えも可能。" },
  "home.walk.guardrail": { en: "paste a chat with a card number; zero PII reaches the frontier. Regex F1 on names:", ja: "カード番号を含むチャットを貼り付け。PIIはフロンティアに一切届きません。氏名に対する正規表現のF1値：" },
  "home.walk.router": { en: "route five requests, force one to Opus, slide \"everything on the flagship\".", ja: "5件のリクエストをルーティングし、1件をOpusに強制。「すべてフラッグシップで処理」をスライダーで比較。" },
  "home.walk.batch": { en: "10,000 transactions through the owned model vs the frontier sample.", ja: "1万件の取引を自社モデルとフロンティアのサンプルで比較。" },
  "home.walk.underwrite": { en: "frontier prices fall 10× a year; watch the crossover move.", ja: "フロンティアの価格は年10分の1に低下。損益分岐点の移動を確認。" },

  // rung names (home table)
  "rung.r1": { en: "Frontier flagship", ja: "フロンティア・フラッグシップ" },
  "rung.r2": { en: "Frontier small tier", ja: "フロンティア小型階層" },
  "rung.r3": { en: "Architecture levers", ja: "アーキテクチャの工夫" },
  "rung.r4": { en: "Open weights as-is", ja: "オープンウェイト（そのまま）" },
  "rung.r5": { en: "Fine-tuned SLMs", ja: "ファインチューニング済みSLM" },
  "rung.r56": { en: "Owned tiny model", ja: "自社保有の小型モデル" },

  // ---------------- spectrum ----------------
  "spectrum.title": { en: "Phase 1 · the JPMorgan replica", ja: "フェーズ1 · JPMorganの再現" },
  "spectrum.datasetLabel": { en: "Dataset", ja: "データセット" },
  "spectrum.rows": { en: "rows", ja: "行" },
  "spectrum.classes": { en: "classes", ja: "クラス" },
  "spectrum.results": { en: "results", ja: "結果" },
  "spectrum.section.accSeen": { en: "Accuracy on the test split", ja: "テスト分割での精度" },
  "spectrum.section.accUnseen": { en: "Accuracy on merchants never seen in training", ja: "学習時に一度も見ていない加盟店での精度" },
  "spectrum.unseenToggle": { en: "unseen merchants", ja: "未知の加盟店" },
  "spectrum.accCaption": {
    en: "Frontier models are expected to win on unseen merchants: that gap is why the gateway escalates low-confidence items instead of trusting the tiny model everywhere.",
    ja: "未知の加盟店ではフロンティアモデルが優位になるのが想定どおりです。この差こそが、ゲートウェイが確信度の低い項目をエスカレーションし、小型モデルを万能に信頼しない理由です。",
  },
  "spectrum.section.cost": { en: "Cost per one million classifications (log scale)", ja: "100万件分類あたりのコスト（対数スケール）" },
  "spectrum.costCaption": {
    en: "Owned model: Modal CPU rate ÷ measured throughput (marginal, no warm-pool floor). Frontier: measured tokens × list price with the cached system prompt. JPMorgan's production figure was $0.24 vs $812.",
    ja: "自社モデル：Modalの CPU 単価 ÷ 実測スループット（限界コスト、ウォームプールの下限なし）。フロンティア：実測トークン数 × 定価（キャッシュ済みシステムプロンプト使用）。JPMorganの本番値は $0.24 対 $812 でした。",
  },
  "spectrum.section.table": { en: "Model table", ja: "モデル一覧" },
  "spectrum.section.classify": { en: "Classify a narration with the owned model (live)", ja: "自社モデルで取引明細を分類（ライブ）" },
  "spectrum.classify.btn": { en: "Classify", ja: "分類" },
  "spectrum.offline": { en: "Offline: set NEXT_PUBLIC_API_BASE to enable live calls.", ja: "オフライン：ライブ実行には NEXT_PUBLIC_API_BASE を設定してください。" },
  "spectrum.section.perClass": { en: "Per-class F1 (owned model)", ja: "クラス別F1値（自社モデル）" },

  // ---------------- router ----------------
  "router.title": { en: "Phase 2 · gateway, router, token P&L", ja: "フェーズ2 · ゲートウェイ、ルーター、トークン損益" },
  "router.intro.tail.live": { en: "Showing live logged traffic.", ja: "ライブで記録されたトラフィックを表示しています。" },
  "router.intro.tail.replay": { en: "Showing the recorded replay.", ja: "記録済みのリプレイを表示しています。" },
  "router.section.send": { en: "Send a request", ja: "リクエストを送信" },
  "router.route.btn": { en: "Route", ja: "ルーティング" },
  "router.routing": { en: "routing…", ja: "ルーティング中…" },
  "router.policyDecides": { en: "policy decides", ja: "方針に従う" },
  "router.trace": { en: "route trace", ja: "ルート経路" },
  "router.answer": { en: "answer", ja: "回答" },
  "router.stat.requests": { en: "Requests", ja: "リクエスト数" },
  "router.stat.escalated": { en: "escalated", ja: "エスカレーション" },
  "router.stat.policySpend": { en: "Spent under policy", ja: "方針適用時の支出" },
  "router.stat.allFlagship": { en: "Same traffic, all flagship", ja: "同一トラフィックを全てフラッグシップで処理" },
  "router.stat.piiToFrontier": { en: "PII entities sent to frontier", ja: "フロンティアへ送信されたPII項目" },
  "router.stat.redactedByGuard": { en: "redacted by the guard", ja: "ガードによりマスキング" },
  "router.section.whatif": { en: "What if we forced a share of traffic to the flagship?", ja: "トラフィックの一定割合をフラッグシップに強制したら？" },
  "router.whatif.caption": {
    en: "0% = current policy · 100% = everything on Claude Sonnet 5 with the same token counts. All-small floor:",
    ja: "0% = 現行方針 · 100% = 同一トークン数ですべてを Claude Sonnet 5 で処理。全て小型モデルの場合の下限：",
  },
  "router.section.costByTier": { en: "Cost per completed task, by final tier", ja: "完了タスクあたりコスト（最終階層別）" },
  "router.section.cumPnl": { en: "Cumulative token P&L", ja: "累積トークン損益" },
  "router.section.lastReq": { en: "Last requests", ja: "直近のリクエスト" },
  "router.section.calibration": { en: "Router calibration (held-out real requests)", ja: "ルーターの確信度較正（ホールドアウトの実リクエスト）" },
  "router.th.request": { en: "Request", ja: "リクエスト" },
  "router.th.intent": { en: "Intent", ja: "意図" },
  "router.th.path": { en: "Path", ja: "経路" },
  "router.legend.allFlagship": { en: "all flagship", ja: "全てフラッグシップ" },
  "router.legend.policy": { en: "policy", ja: "方針" },
  "router.legend.allSmall": { en: "all small", ja: "全て小型" },

  // ---------------- guardrail ----------------
  "guard.title": { en: "Phase 3 · the PII guardrail", ja: "フェーズ3 · PIIガードレール" },
  "guard.section.try": { en: "Try it", ja: "試してみる" },
  "guard.redact.btn": { en: "Redact", ja: "マスキング" },
  "guard.stat.f1model": { en: "Entity F1 · model ∪ regex", ja: "項目F1 · モデル∪正規表現" },
  "guard.stat.f1model.sub": { en: "held-out texts", ja: "ホールドアウトのテキスト" },
  "guard.stat.f1regex": { en: "Entity F1 · regex only", ja: "項目F1 · 正規表現のみ" },
  "guard.stat.f1regex.sub": { en: "names:", ja: "氏名：" },
  "guard.stat.latency": { en: "Guard latency p50", ja: "ガードのレイテンシ p50" },
  "guard.stat.latency.sub": { en: "CPU, 2 threads", ja: "CPU、2スレッド" },
  "guard.stat.piiSession": { en: "PII sent to frontier (this session)", ja: "フロンティアへ送信されたPII（本セッション）" },
  "guard.stat.piiSession.sub": { en: "entities redacted live", ja: "ライブでマスキングされた項目" },
  "guard.raw": { en: "raw ·", ja: "元のテキスト ·" },
  "guard.received": { en: "what the frontier model receives", ja: "フロンティアモデルが受け取る内容" },
  "guard.th.label": { en: "Label", ja: "ラベル" },
  "guard.th.text": { en: "Text", ja: "テキスト" },
  "guard.th.score": { en: "Score", ja: "スコア" },
  "guard.section.f1": { en: "Entity-level F1 by label: fine-tuned model vs regex", ja: "ラベル別の項目レベルF1：ファインチューニング済みモデル vs 正規表現" },
  "guard.f1.caption": {
    en: "Regex cannot find names or addresses; that gap is the case for the model. Dataset: ai4privacy FinPII (human-validated, six languages, no Japanese).",
    ja: "正規表現では氏名や住所を検出できません。この差がモデルを用いる根拠です。データセット：ai4privacy FinPII（人手検証済み、6言語、日本語は含まず）。",
  },

  // ---------------- batch ----------------
  "batch.title": { en: "Batch · the $/1M moment", ja: "バッチ · 「100万件あたりコスト」の瞬間" },
  "batch.run.btn": { en: "Run live", ja: "ライブ実行" },
  "batch.running": { en: "running (≈1 min)…", ja: "実行中（約1分）…" },
  "batch.section.how": { en: "How the numbers are computed", ja: "数値の算出方法" },
  "batch.how.owned": {
    en: "Owned model: Modal CPU rate (2 cores + 4 GiB, per second) × wall time ÷ items. Marginal cost; a warm container floor would add a fixed monthly amount shown on the Underwrite tab.",
    ja: "自社モデル：Modalの CPU 単価（2コア＋4GiB、秒課金）× 実行時間 ÷ 件数。限界コストです。常時起動コンテナの下限を加えると、コスト評価タブに示す固定月額が加算されます。",
  },
  "batch.how.frontier": {
    en: "Frontier: average tokens per call from the live sample (input, cache read, output) × list prices in results/pricing.json. The system prompt is cached, so most input tokens bill at 10%.",
    ja: "フロンティア：ライブサンプルの1コールあたり平均トークン数（入力・キャッシュ読み込み・出力）× results/pricing.json の定価。システムプロンプトはキャッシュされるため、入力トークンの大半は10%で課金されます。",
  },
  "batch.how.accuracy": {
    en: "Accuracy is not shown for the frontier here; see the Spectrum tab for the batch-API evaluation on the same test split.",
    ja: "ここではフロンティアの精度は表示していません。同一テスト分割でのバッチAPI評価はスペクトラムタブをご覧ください。",
  },

  // ---------------- underwrite ----------------
  "uw.title": { en: "Re-underwrite annually", ja: "コストは毎年見直す" },
  "uw.intro": {
    en: "Two views of the same question. The crossover model shows when owning beats renting for a generic workload; the extraction scenario prices one concrete workload end to end, with input and output tokens costed separately at each model list price. Frontier prices deflate about 10× per year at fixed capability, so build only what clears the bar for two or more years.",
    ja: "同じ問いを2つの視点で見ます。損益分岐点モデルは、一般的なワークロードで自社保有がレンタルを上回る条件を示します。抽出シナリオは、1つの具体的なワークロードを入力・出力トークンを各モデルの定価で個別に算定し、端から端までコスト化します。フロンティア価格は同一性能で年約10分の1に低下するため、2年以上にわたり基準を満たすものだけを内製すべきです。",
  },
  "uw.tab.crossover": { en: "Crossover model", ja: "損益分岐点モデル" },
  "uw.tab.scenario": { en: "Contract extraction scenario", ja: "契約書抽出シナリオ" },
  "uw.howToRead": { en: "How to read this chart", ja: "このグラフの読み方" },
  "uw.section.chart": { en: "Monthly cost vs volume (log scale)", ja: "月間コスト vs 処理量（対数スケール）" },
  "uw.stat.flagship": { en: "Flagship / month", ja: "フラッグシップ / 月" },
  "uw.stat.smallTier": { en: "Small tier / month", ja: "小型階層 / 月" },
  "uw.stat.selfHosted": { en: "Self-hosted / month", ja: "自社ホスティング / 月" },
  "uw.slider.years": { en: "Years ahead (frontier ÷10 / yr)", ja: "何年先か（フロンティアは年÷10）" },
  "uw.slider.tokens": { en: "Tokens per task", ja: "タスクあたりトークン数" },
  "uw.slider.flag": { en: "Flagship blended $/M tokens (today)", ja: "フラッグシップの実効単価 $/100万トークン（現在）" },
  "uw.slider.small": { en: "Small tier blended $/M tokens (today)", ja: "小型階層の実効単価 $/100万トークン（現在）" },
  "uw.slider.fixed": { en: "Self-hosted fixed $/month (warm pool + MLOps)", ja: "自社ホスティング固定費 $/月（ウォームプール＋MLOps）" },
  "uw.slider.variable": { en: "Self-hosted variable $/M tasks", ja: "自社ホスティング変動費 $/100万タスク" },
  "uw.slider.volume": { en: "Our volume (log10 tasks / month)", ja: "自社の処理量（log10 タスク/月）" },
  "uw.read.1": { en: "Three cost curves are compared: renting the flagship model, renting a smaller model, and self-hosting a small owned model.", ja: "3つのコスト曲線を比較します：フラッグシップモデルのレンタル、小型モデルのレンタル、自社保有の小型モデルのセルフホスティング。" },
  "uw.read.2": { en: "Both axes are logarithmic. The horizontal axis is monthly task volume; the vertical axis is monthly cost.", ja: "両軸とも対数です。横軸は月間タスク量、縦軸は月間コストです。" },
  "uw.read.3": { en: "The two rented curves start near zero and rise in proportion to volume. The self-hosted curve is nearly flat at low volume, because a warm pool of compute and the staff to run it are a fixed monthly cost, then rises slowly as volume grows.", ja: "2本のレンタル曲線はほぼゼロから始まり、処理量に比例して上昇します。自社ホスティング曲線は低処理量ではほぼ横ばいです。これはウォームプールの計算資源と運用要員が固定月額であるためで、処理量の増加とともに緩やかに上昇します。" },
  "uw.read.4": { en: "The crossover is the volume at which the self-hosted curve falls below the small-tier curve. Below it, renting is cheaper; above it, owning is cheaper. The tiles report the monthly cost of each option at the selected volume, and the crossover volume.", ja: "損益分岐点は、自社ホスティング曲線が小型階層曲線を下回る処理量です。これを下回ればレンタルが、上回れば自社保有が安価になります。各タイルは選択した処理量での各選択肢の月間コストと、損益分岐点の処理量を示します。" },
  "uw.read.5": { en: "The years-ahead control divides frontier prices by about 10× per year. Moving it forward slides the crossover to the right, which shrinks the set of workloads worth owning.", ja: "「何年先か」の操作は、フロンティア価格を年約10分の1に割り引きます。将来へ動かすと損益分岐点が右へ移動し、自社保有に見合うワークロードの範囲が狭まります。" },
  "uw.read.6": { en: "Reading rule: build only when the self-hosted curve is clearly the lowest at the operating volume and stays lowest one to two years into the future. Otherwise rent.", ja: "判断基準：運用処理量において自社ホスティング曲線が明確に最安で、かつ1〜2年先まで最安を維持する場合のみ内製します。それ以外はレンタルします。" },
  "uw.dotCaption": { en: "The filled dots sit on the dashed line at our current volume; each is coloured to its line, so read across to compare the three monthly costs at that volume.", ja: "塗りつぶしの点は現在の処理量における破線上にあり、各点は対応する線の色です。横に読むことで、その処理量での3つの月間コストを比較できます。" },
} as const;

export type MsgKey = keyof typeof messages;

// Pure lookup — safe to call from both server and client (this module has no "use client").
export function translate(locale: Locale, key: MsgKey): string {
  const row = messages[key];
  if (!row) return key;
  return (row as Record<Locale, string>)[locale] ?? row.en ?? key;
}
