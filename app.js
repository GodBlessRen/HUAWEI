const UPSTREAM = "https://raw.githubusercontent.com/Zhou-xingyu-ts/huawei-acm-practice/main/build/dataset";
const MANIFEST_URL = `${UPSTREAM}/manifest.json`;

const state = {
  problems: [],
  selected: null,
  tab: "statement",
  cache: new Map(),
  worker: null,
  workerReady: null,
  runSeq: 0,
};

const el = (id) => document.getElementById(id);
const listEl = el("problemList");
const countEl = el("problemCount");
const editor = el("codeEditor");
const runBtn = el("runBtn");
const runtimeBadge = el("runtimeBadge");
const judgeResults = el("judgeResults");
const judgeSummary = el("judgeSummary");
const contentPanel = el("contentPanel");
const problemHeader = el("problemHeader");
const draftState = el("draftState");

const key = (kind, pid) => `huawei-acm:${kind}:${pid}`;
const escapeHtml = (s="") => s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const normalizeOutput = (s="") => s.replace(/\r\n/g, "\n").trimEnd();

function markdown(md="") {
  const blocks = [];
  md = md.replace(/```([\s\S]*?)```/g, (_, code) => {
    const token = `@@BLOCK_${blocks.length}@@`;
    blocks.push(`<pre><code>${escapeHtml(code.replace(/^\n|\n$/g,""))}</code></pre>`);
    return token;
  });
  let html = escapeHtml(md)
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^\n]+?)`/g, "<code>$1</code>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>");
  html = `<p>${html}</p>`;
  blocks.forEach((b, i) => { html = html.replace(`@@BLOCK_${i}@@`, b); });
  return html.replace(/<p>\s*<h/g, "<h").replace(/<\/h([123])>\s*<\/p>/g, "</h$1>");
}

async function fetchText(url) {
  const r = await fetch(url, { cache: "force-cache" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}
async function fetchJson(url) { return JSON.parse(await fetchText(url)); }

function starter(pid) {
  return `# ${pid} · ACM / OJ 输入输出格式
import sys

def solve():
    data = sys.stdin.read().strip().split()
    # TODO: 在这里实现你的算法
    # print(answer)

if __name__ == "__main__":
    solve()
`;
}

function localAC(pid) { return localStorage.getItem(key("ac", pid)) === "1"; }
function setAC(pid, yes) {
  if (yes) localStorage.setItem(key("ac", pid), "1");
  else localStorage.removeItem(key("ac", pid));
}

function filters() {
  return {
    q: el("searchInput").value.trim().toLowerCase(),
    difficulty: el("difficultyFilter").value,
    status: el("statusFilter").value,
  };
}
function visibleProblems() {
  const f = filters();
  return state.problems.filter(p => {
    const hay = `${p.pid} ${p.title} ${(p.alg_tags||[]).join(" ")} ${p.reference_time}`.toLowerCase();
    if (f.q && !hay.includes(f.q)) return false;
    if (f.status === "ac" && !localAC(p.pid)) return false;
    if (f.status === "todo" && localAC(p.pid)) return false;
    if (f.difficulty) {
      const [a,b] = f.difficulty.split("-").map(Number);
      if (p.difficulty < a || p.difficulty > b) return false;
    }
    return true;
  });
}
function renderList() {
  const items = visibleProblems();
  countEl.textContent = `${items.length} / ${state.problems.length} 题`;
  listEl.innerHTML = items.map(p => `
    <button class="problem-item ${state.selected?.pid === p.pid ? "active":""}" data-pid="${p.pid}" type="button">
      <div class="problem-row">${localAC(p.pid) ? '<span class="dot-ac"></span>' : ''}<span class="pid">${p.pid}</span></div>
      <div class="problem-title">${escapeHtml(p.title)}</div>
      <div class="problem-meta"><span>难度 ${p.difficulty}</span><span>样例 ${p.sample_count}</span><span>${escapeHtml((p.alg_tags||[])[0]||"综合")}</span></div>
    </button>
  `).join("") || '<div class="judge-empty">没有匹配的题目。</div>';
  listEl.querySelectorAll("[data-pid]").forEach(btn => btn.addEventListener("click", () => selectProblem(btn.dataset.pid)));
}

async function loadProblem(pid) {
  if (state.cache.has(pid)) return state.cache.get(pid);
  const base = `${UPSTREAM}/problems/${pid}`;
  const p = state.problems.find(x => x.pid === pid);
  const sampleNames = p.sample_names || [];
  const [statement, solution, samples] = await Promise.all([
    fetchText(`${base}/problem.md`),
    fetchText(`${base}/official_solution.md`).catch(() => "暂无公开参考题解。"),
    Promise.all(sampleNames.map(async name => ({
      name,
      input: await fetchText(`${base}/samples/${name}.in`),
      output: await fetchText(`${base}/samples/${name}.out`),
    })))
  ]);
  const detail = { statement, solution, samples };
  state.cache.set(pid, detail);
  return detail;
}

function renderHeader(p) {
  problemHeader.innerHTML = `
    <div>
      <div class="eyebrow">${escapeHtml(p.reference_time || "华为校招机考题库")}</div>
      <h2>${p.pid} · ${escapeHtml(p.title)}</h2>
      <p>难度 ${p.difficulty} · ${p.time_limit_ms || 1000} ms · ${p.memory_limit_mb || 256} MB · ${p.sample_count || 0} 个公开样例</p>
      <div class="tags">${[...(p.alg_tags||[]), ...(p.catalog_tags||[])].filter((x,i,a)=>a.indexOf(x)===i).slice(0,5).map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
    </div>`;
}

async function renderContent() {
  const p = state.selected;
  if (!p) return;
  contentPanel.classList.remove("empty-panel");
  contentPanel.innerHTML = '<div class="judge-empty">加载内容…</div>';
  try {
    const d = await loadProblem(p.pid);
    contentPanel.innerHTML = markdown(state.tab === "statement" ? d.statement : d.solution);
  } catch (e) {
    contentPanel.innerHTML = `<div class="judge-empty">加载失败：${escapeHtml(e.message)}。可刷新后重试。</div>`;
  }
}

async function selectProblem(pid) {
  const p = state.problems.find(x => x.pid === pid);
  if (!p) return;
  saveDraft();
  state.selected = p;
  state.tab = "statement";
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === "statement"));
  renderList();
  renderHeader(p);
  editor.value = localStorage.getItem(key("draft", pid)) ?? starter(pid);
  draftState.textContent = localAC(pid) ? "已 AC · 草稿自动保存" : "草稿自动保存";
  runBtn.disabled = false;
  judgeSummary.textContent = "等待运行";
  judgeResults.innerHTML = '<div class="judge-empty">运行公开样例，快速验证 ACM 输入输出。</div>';
  await renderContent();
}

function saveDraft() {
  const pid = state.selected?.pid;
  if (!pid) return;
  localStorage.setItem(key("draft", pid), editor.value);
  draftState.textContent = localAC(pid) ? "已 AC · 已保存" : "已保存";
}
let saveTimer;
editor.addEventListener("input", () => {
  if (!state.selected) return;
  draftState.textContent = "正在保存…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 250);
});

function createWorker() {
  if (state.worker) state.worker.terminate();
  state.worker = new Worker("./py-worker.js");
  runtimeBadge.textContent = "Python 加载中…";
  runtimeBadge.classList.remove("ready");
  state.workerReady = new Promise((resolve, reject) => {
    const onMessage = e => {
      if (e.data?.type === "ready") {
        runtimeBadge.textContent = "Python Ready";
        runtimeBadge.classList.add("ready");
        state.worker.removeEventListener("message", onMessage);
        resolve();
      }
      if (e.data?.type === "init-error") reject(new Error(e.data.error));
    };
    state.worker.addEventListener("message", onMessage);
  });
  return state.workerReady;
}
async function ensureWorker() {
  if (!state.worker) createWorker();
  return state.workerReady;
}

async function executePython(code, input, timeoutMs=4500) {
  await ensureWorker();
  const id = ++state.runSeq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.worker.terminate();
      state.worker = null;
      state.workerReady = null;
      runtimeBadge.textContent = "Python 已重启";
      runtimeBadge.classList.remove("ready");
      reject(Object.assign(new Error("Time Limit Exceeded"), { verdict:"TLE" }));
    }, timeoutMs);
    const handler = e => {
      if (e.data?.type !== "result" || e.data.id !== id) return;
      clearTimeout(timer);
      state.worker.removeEventListener("message", handler);
      resolve(e.data);
    };
    state.worker.addEventListener("message", handler);
    state.worker.postMessage({ type:"run", id, code, input });
  });
}

function resultCard(r, expected) {
  const cls = r.verdict.toLowerCase();
  return `
    <div class="result-card">
      <div class="result-head"><span>${escapeHtml(r.name)}</span><span class="verdict ${cls}">${r.verdict} · ${r.ms} ms</span></div>
      <div class="result-body">
        ${r.error ? `<div><div class="result-label">错误</div><pre>${escapeHtml(r.error)}</pre></div>` : ""}
        <div><div class="result-label">你的输出</div><pre>${escapeHtml(r.output || "(空)")}</pre></div>
        ${r.verdict !== "AC" ? `<div><div class="result-label">期望输出</div><pre>${escapeHtml(expected || "(空)")}</pre></div>` : ""}
      </div>
    </div>`;
}

async function runSamples() {
  if (!state.selected) return;
  runBtn.disabled = true;
  runBtn.textContent = "运行中…";
  judgeSummary.textContent = "初始化 Python…";
  judgeResults.innerHTML = '<div class="judge-empty">第一次加载 Pyodide 会下载浏览器 Python 运行时。</div>';
  const code = editor.value;
  const d = await loadProblem(state.selected.pid);
  const results = [];
  try {
    await ensureWorker();
    for (let i=0; i<d.samples.length; i++) {
      const s = d.samples[i];
      judgeSummary.textContent = `正在运行 ${i+1} / ${d.samples.length}`;
      const started = performance.now();
      try {
        const out = await executePython(code, s.input, 4500);
        const actual = normalizeOutput(out.stdout || "");
        const expected = normalizeOutput(s.output || "");
        const verdict = out.error ? "RE" : actual === expected ? "AC" : "WA";
        results.push({ name:s.name, verdict, output:out.stdout || "", error:out.error || "", ms:Math.round(performance.now()-started), expected:s.output });
      } catch (e) {
        results.push({ name:s.name, verdict:e.verdict || "RE", output:"", error:e.message, ms:Math.round(performance.now()-started), expected:s.output });
      }
      judgeResults.innerHTML = results.map(r => resultCard(r, r.expected)).join("");
    }
    const ok = results.length > 0 && results.every(r => r.verdict === "AC");
    setAC(state.selected.pid, ok);
    judgeSummary.textContent = ok ? `全部通过 · ${results.length}/${results.length}` : `通过 ${results.filter(r=>r.verdict==="AC").length}/${results.length}`;
    draftState.textContent = ok ? "已 AC · 草稿自动保存" : "已保存";
    renderList();
  } catch (e) {
    judgeSummary.textContent = "运行失败";
    judgeResults.innerHTML = `<div class="judge-empty">Python 运行时初始化失败：${escapeHtml(e.message)}</div>`;
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "运行样例";
    saveDraft();
  }
}

document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
  state.tab = btn.dataset.tab;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === btn));
  renderContent();
}));
["searchInput","difficultyFilter","statusFilter"].forEach(id => el(id).addEventListener(id==="searchInput" ? "input" : "change", renderList));
runBtn.addEventListener("click", runSamples);
el("resetBtn").addEventListener("click", () => {
  if (!state.selected) return;
  if (!confirm("重置当前题目的本地草稿？")) return;
  editor.value = starter(state.selected.pid);
  saveDraft();
});
el("themeBtn").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme === "dark";
  document.documentElement.dataset.theme = dark ? "" : "dark";
  localStorage.setItem("huawei-acm:theme", dark ? "light" : "dark");
});
if (localStorage.getItem("huawei-acm:theme") === "dark") document.documentElement.dataset.theme = "dark";

async function init() {
  try {
    state.problems = await fetchJson(MANIFEST_URL);
    renderList();
    const saved = localStorage.getItem("huawei-acm:last");
    await selectProblem(state.problems.find(p=>p.pid===saved)?.pid || state.problems[0]?.pid);
    if (state.selected) localStorage.setItem("huawei-acm:last", state.selected.pid);
  } catch (e) {
    countEl.textContent = "题库加载失败";
    listEl.innerHTML = `<div class="judge-empty">无法读取公开题库：${escapeHtml(e.message)}</div>`;
  }
}
window.addEventListener("beforeunload", saveDraft);
init();
