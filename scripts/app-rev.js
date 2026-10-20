// Build revision: newest Last-Modified among the page and its scripts/styles, so it changes on any deploy.
(async function showBuildRevision() {
    const element = document.getElementById("appRev");
    if (!element) return;
    const urls = [location.href, ...document.querySelectorAll("script[src], link[rel=stylesheet][href]")]
        .map(node => typeof node === "string" ? node : (node.src || node.href));
    const times = await Promise.all(urls.map(async url => {
        try {
            const response = await fetch(url, { method: "HEAD" });
            const header = response.headers.get("Last-Modified");
            return header ? new Date(header).getTime() : NaN;
        } catch {
            return NaN;
        }
    }));
    const valid = times.filter(Number.isFinite);
    if (valid.length === 0) return;
    const modified = new Date(Math.max(...valid));
    const pad = value => String(value).padStart(2, "0");
    element.textContent = `Build ${modified.getFullYear()}-${pad(modified.getMonth() + 1)}-${pad(modified.getDate())} ${pad(modified.getHours())}:${pad(modified.getMinutes())}`;
    element.title = `Latest file change: ${modified.toLocaleString()}`;
})();
