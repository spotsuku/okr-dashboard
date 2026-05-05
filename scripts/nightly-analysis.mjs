#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────
// Nightly Analysis: Claude API でコードを監査し、結果を GitHub Issue 化
//
// 入力: 直近のコミット差分 / package.json / 主要ディレクトリの構造
// 出力: GitHub Issue (label: bot/finding, 確信度 >= MIN_CONFIDENCE のみ)
//
// 環境変数:
//   ANTHROPIC_API_KEY  必須
//   GITHUB_TOKEN       必須 (Actions が自動付与)
//   GITHUB_REPOSITORY  "owner/repo" 形式
//   AI_MODEL           デフォルト 'claude-sonnet-4-5'
//   MIN_CONFIDENCE     デフォルト 0.7 (0.0〜1.0)
// ─────────────────────────────────────────────────────────────────

import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const API_KEY = process.env.ANTHROPIC_API_KEY
const GH_TOKEN = process.env.GITHUB_TOKEN
const REPO = process.env.GITHUB_REPOSITORY  // "owner/repo"
const MODEL = process.env.AI_MODEL || 'claude-sonnet-4-5'
const MIN_CONF = Number(process.env.MIN_CONFIDENCE || '0.7')

if (!API_KEY) { console.error('ANTHROPIC_API_KEY が未設定です'); process.exit(1) }
if (!GH_TOKEN) { console.error('GITHUB_TOKEN が未設定です'); process.exit(1) }
if (!REPO) { console.error('GITHUB_REPOSITORY が未設定です'); process.exit(1) }

const sh = (cmd) => {
  try { return execSync(cmd, { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 }) }
  catch (e) { return (e.stdout || '') + (e.stderr || '') }
}

// ─── 解析対象データを収集 ────────────────────────────────────────
console.log('[1/4] context 収集...')

// 直近 14 日のコミット
const recentCommits = sh('git log --since="14 days ago" --pretty=format:"%h %ad %s" --date=short -n 50').trim()

// 直近のファイル変更 (どのディレクトリが活発か)
const recentFiles = sh('git log --since="14 days ago" --name-only --pretty=format: | sort | uniq -c | sort -rn | head -30').trim()

// プロジェクト構造 (主要ディレクトリのファイル一覧)
const componentList = sh('ls components/ 2>/dev/null | head -50').trim()
const apiList = sh('find app/api -type f -name "*.js" 2>/dev/null | head -40').trim()
const sqlList = sh('ls supabase_*.sql 2>/dev/null | head -30').trim()

// package.json の依存
let packageInfo = ''
try {
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
  packageInfo = `name: ${pkg.name}\nversion: ${pkg.version}\nframework: Next.js ${pkg.dependencies?.next || ''}\nreact: ${pkg.dependencies?.react || ''}\nsupabase: ${pkg.dependencies?.['@supabase/supabase-js'] || ''}`
} catch { packageInfo = '(package.json 読み込み失敗)' }

// CLAUDE.md (リポジトリのプロジェクトルール)
let claudeMd = ''
if (existsSync('CLAUDE.md')) {
  claudeMd = readFileSync('CLAUDE.md', 'utf-8').slice(0, 4000)
}

// ─── Claude API でレビュー ───────────────────────────────────────
console.log('[2/4] Claude API で解析中...')

const systemPrompt = `あなたは Next.js + Supabase で構築された OKR 管理ダッシュボード "${REPO}" の コードレビュアー兼プロダクトアドバイザーです。

直近 2 週間のコミット履歴とプロジェクト構造から、以下を抽出してください:

1. **bug** : 過去のコミット文や活発な変更箇所から推察される、まだ未対応のバグ・不整合
2. **improvement** : ユーザー体験・パフォーマンス・コード品質の改善提案
3. **missing_feature** : 競合 SaaS にあるがこのプロダクトに無さそうな機能の追加提案

【重要】
- 確信度 (confidence) を 0.0〜1.0 で正直に。0.5 未満の推測は出さない
- 各 finding は**短く・具体的に**書く (60字以内タイトル、本文 300字程度)
- 既知の制約 (CLAUDE.md にある「mainマージ禁止」「デザインシステム遵守」等) を必ず守る
- 重複しそうな提案 (例: "コードに型を追加" など曖昧なもの) は避ける

出力は **JSON 配列のみ** で、以下の schema:
[
  {
    "category": "bug" | "improvement" | "missing_feature",
    "severity": "high" | "medium" | "low",
    "confidence": 0.0-1.0,
    "title": "60字以内の具体的タイトル",
    "description": "300字程度の本文。問題点 / 推奨対処 / 影響範囲 を箇条書きで",
    "suggested_files": ["関連しそうなファイルパス"]
  }
]

JSON 以外のテキストは絶対に含めないでください (前置き・後置きの説明文も不要)。`

const userPrompt = `## プロジェクト概要
${packageInfo}

## CLAUDE.md (プロジェクトルール抜粋)
${claudeMd || '(なし)'}

## 直近 14 日のコミット
${recentCommits || '(コミットなし)'}

## 直近 14 日でよく変更されたファイル (トップ30)
${recentFiles || '(変更なし)'}

## components/ 一覧 (抜粋)
${componentList}

## app/api/ 一覧 (抜粋)
${apiList}

## SQL マイグレーション一覧
${sqlList}

上記から bug / improvement / missing_feature を JSON 配列で出力してください。`

const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': API_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  }),
})
if (!aiRes.ok) {
  const body = await aiRes.text()
  console.error(`Claude API ${aiRes.status}: ${body.slice(0, 500)}`)
  process.exit(1)
}
const aiJson = await aiRes.json()
const text = aiJson.content?.[0]?.text || ''
console.log(`Claude usage: input=${aiJson.usage?.input_tokens}, output=${aiJson.usage?.output_tokens}`)

let findings = []
try {
  // ```json などで囲まれていても抽出
  const m = text.match(/\[[\s\S]*\]/)
  findings = JSON.parse(m ? m[0] : text)
  if (!Array.isArray(findings)) throw new Error('not array')
} catch (e) {
  console.error('AI 出力の JSON パース失敗:', e.message)
  console.error('Raw output (先頭 1000 文字):', text.slice(0, 1000))
  process.exit(1)
}

console.log(`[3/4] 取得 ${findings.length} 件の finding (うち confidence>=${MIN_CONF} を Issue 化)`)

// ─── 既存の open Issue を取得して重複防止 ─────────────────────────
async function gh(method, urlPath, body) {
  const r = await fetch(`https://api.github.com${urlPath}`, {
    method,
    headers: {
      'Authorization': `Bearer ${GH_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error(`GitHub API ${r.status}: ${await r.text()}`)
  return r.json()
}

const existingIssues = await gh('GET', `/repos/${REPO}/issues?state=open&labels=bot/finding&per_page=100`)
const existingTitles = new Set(existingIssues.map(i => i.title.replace(/^\[(BUG|IMP|FEAT)\]\s*/i, '').trim()))

// ─── filter + Issue 作成 ─────────────────────────────────────────
console.log('[4/4] Issue 作成...')
const labelMap = { bug: 'bug', improvement: 'enhancement', missing_feature: 'enhancement' }
const prefixMap = { bug: '[BUG]', improvement: '[IMP]', missing_feature: '[FEAT]' }
const sevEmoji = { high: '🔴', medium: '🟡', low: '⚪' }

let created = 0, skipped = 0, lowConf = 0
for (const f of findings) {
  if (typeof f.confidence !== 'number' || f.confidence < MIN_CONF) {
    lowConf++; continue
  }
  const baseTitle = (f.title || '').slice(0, 60)
  if (existingTitles.has(baseTitle)) { skipped++; continue }

  const prefix = prefixMap[f.category] || '[NOTE]'
  const sev = sevEmoji[f.severity] || ''
  const title = `${prefix} ${baseTitle}`
  const body = `${sev} **severity**: ${f.severity || 'unknown'} ・ **confidence**: ${(f.confidence * 100).toFixed(0)}%

${f.description || ''}

${f.suggested_files?.length ? `### 関連ファイル\n${f.suggested_files.map(p => `- \`${p}\``).join('\n')}\n` : ''}
---
🤖 自動解析 (毎日 22:00 JST 実行) ・ ${new Date().toISOString().slice(0, 10)}
このIssueを採用するなら \`approved\` ラベルを追加してください。`

  const labels = ['bot/finding', labelMap[f.category] || 'enhancement']
  if (f.severity === 'high') labels.push('priority/high')
  try {
    await gh('POST', `/repos/${REPO}/issues`, { title, body, labels })
    created++
    console.log(`  ✓ ${title}`)
  } catch (e) {
    console.warn(`  ✗ Issue 作成失敗: ${title} - ${e.message}`)
  }
}

console.log(`\n=== 結果 ===`)
console.log(`作成: ${created} 件 / 重複スキップ: ${skipped} 件 / 確信度低: ${lowConf} 件 / 取得計: ${findings.length} 件`)
