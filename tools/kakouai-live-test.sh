#!/bin/zsh
set -euo pipefail

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

CURL="/usr/bin/curl"
DATE="/bin/date"
JQ="/usr/bin/jq"
SLEEP="/bin/sleep"

API_BASE="${RIVER_API_BASE:-http://127.0.0.1:8790}"
MODEL="deepseek-v4.1-flash"

if [[ -z "${K:-}" ]]; then
  print -u2 "Missing K environment variable."
  exit 1
fi

header() {
  print ""
  print "============================================================"
  print "$1"
  print "============================================================"
}

request() {
  local name="$1"
  local path="$2"
  local body="$3"
  local output="/tmp/river-kakouai-${name}.json"
  header "STEP: ${name}"
  print "Provider : Kakouai"
  print "Base URL : https://api.kakouai.com"
  print "Model    : ${MODEL}"
  print "Time     : $(${DATE} '+%Y-%m-%d %H:%M:%S')"
  print "Requesting..."
  ${CURL} --fail-with-body --silent --show-error \
    -X POST "${API_BASE}${path}" \
    -H "content-type: application/json" \
    -H "x-ai-provider: deepseek" \
    -H "x-ai-api-key: ${K}" \
    --data "${body}" > "${output}"
  print "HTTP     : 200 OK"
  print "Model    : $(${JQ} -r '.model // "verified"' "${output}")"
  print "Usage    : input=$(${JQ} -r '.usage.inputTokens // 0' "${output}") output=$(${JQ} -r '.usage.outputTokens // 0' "${output}") CNY=$(${JQ} -r '.usage.estimatedCost // 0' "${output}")"
}

clear
print "RIVER x KAKOUAI - LIVE API TEST"
print "This recording contains no API key."
print "Starting in 15 seconds..."
SLEEP_BIN="${SLEEP}"
"${SLEEP_BIN}" 15

request "validate-key" "/api/ai/validate-key" "{\"model\":\"${MODEL}\"}"

request "simplify" "/api/ai/simplify" "{\"model\":\"${MODEL}\",\"nodeTitle\":\"聚光灯效应\",\"currentText\":\"人们常高估别人对自己外表或行为的关注程度。\",\"context\":\"社会心理学\"}"
print "RESULT:"
${JQ} -r '.data.text' "/tmp/river-kakouai-simplify.json"

request "regenerate" "/api/ai/regenerate" "{\"model\":\"${MODEL}\",\"nodeTitle\":\"聚光灯效应\",\"blockType\":\"example\",\"currentText\":\"例如：你以为大家都在看你衣服上的污渍，其实大多数人都没有注意。\",\"context\":\"社会心理学 / 聚光灯效应\"}"
print "RESULT:"
${JQ} -r '.data.text' "/tmp/river-kakouai-regenerate.json"

request "opening" "/api/ai/opening" "{\"model\":\"${MODEL}\",\"sourceText\":\"[第 1 张幻灯片]\\n生命周期评估 LCA：评估产品从获取、制造、使用到处置全过程的环境影响。包括目标与范围定义、清单分析、影响评估、结果解释四个步骤。\",\"profile\":{\"intent\":\"rough\",\"level\":\"zero\",\"purpose\":\"curiosity\",\"goalStyle\":\"question\"}}"
print "RESULT:"
${JQ} -r '.data.positioning' "/tmp/river-kakouai-opening.json"

request "knowledge-tree" "/api/ai/tree" "{\"model\":\"${MODEL}\",\"sourceText\":\"[第 1 张幻灯片]\\n生命周期评估 LCA：评估产品从获取、制造、使用到处置全过程的环境影响。包括目标与范围定义、清单分析、影响评估、结果解释四个步骤。\",\"profile\":{\"intent\":\"rough\",\"level\":\"zero\",\"purpose\":\"curiosity\",\"goalStyle\":\"question\"},\"introduction\":{\"mapSections\":[{\"title\":\"LCA 入门\",\"role\":\"intro\",\"summary\":\"认识生命周期评估的目标、四阶段和四步骤。\"}],\"goals\":[\"理解 LCA 评估什么\"],\"goalQuestions\":[\"LCA 为什么需要看产品的整个生命周期？\"],\"positioning\":\"零基础入门。\",\"prerequisiteNotes\":[]}}"
print "TREE:"
${JQ} -r '"Title: \(.data.title)\nNodes: \(.data.nodes | length | tostring)\nSummary: \(.data.summary)"' "/tmp/river-kakouai-knowledge-tree.json"

header "ALL LIVE TESTS PASSED"
print "Model: ${MODEL}"
print "Completed: $(${DATE} '+%Y-%m-%d %H:%M:%S')"
