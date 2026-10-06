const PYODIDE_BASE = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";
let pyodide;

async function init() {
  try {
    importScripts(PYODIDE_BASE + "pyodide.js");
    pyodide = await loadPyodide({ indexURL: PYODIDE_BASE });
    postMessage({ type: "ready" });
  } catch (e) {
    postMessage({ type: "init-error", error: String(e?.stack || e) });
  }
}

self.onmessage = async (event) => {
  const msg = event.data;
  if (msg?.type !== "run") return;
  try {
    pyodide.globals.set("__user_code", msg.code || "");
    pyodide.globals.set("__user_input", msg.input || "");
    const payload = await pyodide.runPythonAsync(`
import io, sys, traceback, json
_stdin, _stdout, _stderr = sys.stdin, sys.stdout, sys.stderr
sys.stdin = io.StringIO(__user_input)
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()
_err = ""
try:
    _g = {"__name__": "__main__", "__builtins__": __builtins__}
    exec(compile(__user_code, "<submission>", "exec"), _g, _g)
except BaseException:
    _err = traceback.format_exc()
_out = sys.stdout.getvalue()
_errout = sys.stderr.getvalue()
sys.stdin, sys.stdout, sys.stderr = _stdin, _stdout, _stderr
json.dumps({"stdout": _out, "stderr": _errout, "error": _err})
`);
    postMessage({ type:"result", id:msg.id, ...JSON.parse(payload) });
  } catch (e) {
    postMessage({ type:"result", id:msg.id, stdout:"", stderr:"", error:String(e?.stack || e) });
  }
};

init();
