export async function loadGameConfig(url, requiredKeys = []) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  const data = await response.json();
  const missing = requiredKeys.filter((key) => data?.[key] == null
    || (Array.isArray(data[key]) && data[key].length === 0));
  if (missing.length) {
    throw new Error(`${url} is missing: ${missing.join(", ")}`);
  }
  return data;
}

export function showConfigError(error, { homeHref = "../../index.html" } = {}) {
  console.error(error);
  if (document.querySelector(".config-error")) {
    return;
  }
  const overlay = document.createElement("div");
  overlay.className = "config-error";
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-labelledby", "configErrorTitle");
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px;background:rgba(58,47,36,0.45);";
  overlay.innerHTML = `
    <div style="max-width:360px;padding:24px;border-radius:20px;background:#fffdf6;color:#3a2f24;text-align:center;box-shadow:0 12px 30px rgba(0,0,0,0.2);font-family:inherit;">
      <strong id="configErrorTitle" style="display:block;font-size:22px;">游戏内容没有加载成功</strong>
      <p style="margin:10px 0 18px;font-size:16px;">请检查网络后重新加载。</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        <button type="button" data-action="reload" style="font:inherit;font-size:17px;padding:10px 20px;border:0;border-radius:999px;background:#f08b3e;color:#fff;">重新加载</button>
        <a href="${homeHref}" style="font-size:17px;padding:10px 20px;border-radius:999px;background:#f1e6d3;color:#3a2f24;text-decoration:none;">返回首页</a>
      </div>
    </div>`;
  overlay.querySelector("[data-action=reload]").addEventListener("click", () => window.location.reload());
  document.body.append(overlay);
  overlay.querySelector("button").focus();
}
