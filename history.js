document.addEventListener("DOMContentLoaded", () => {
    const list = document.getElementById("history-list");
    const empty = document.getElementById("history-empty");
    const count = document.getElementById("history-count");
    const status = document.getElementById("history-status");
    const clear = document.getElementById("clear-history");

    function send(request) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(request, (response) => {
                const error = chrome.runtime.lastError;
                if (error) return reject(new Error(error.message));
                if (response?.status === "ERROR") return reject(new Error(response.message));
                resolve(response);
            });
        });
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (character) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[character]);
    }

    async function copyItem(item, button) {
        button.disabled = true;
        let success = false;
        try {
            const html = `<a href="${escapeHtml(item.url)}">${escapeHtml(item.text)}</a>`;
            const plain = `[${item.text}](${item.url})`;
            try {
                await navigator.clipboard.write([new ClipboardItem({
                    "text/html": new Blob([html], { type: "text/html" }),
                    "text/plain": new Blob([plain], { type: "text/plain" })
                })]);
            } catch {
                let written = false;
                const onCopy = (event) => {
                    if (!event.clipboardData) return;
                    event.clipboardData.setData("text/html", html);
                    event.clipboardData.setData("text/plain", plain);
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    written = true;
                };
                window.addEventListener("copy", onCopy, true);
                try {
                    if (!document.execCommand("copy") || !written) throw new Error("클립보드 쓰기 실패");
                } finally {
                    window.removeEventListener("copy", onCopy, true);
                }
            }
            success = true;
            status.textContent = "하이퍼링크를 다시 복사했습니다.";
        } catch {
            status.textContent = "복사에 실패했습니다. 다시 시도해 주세요.";
        } finally {
            button.disabled = false;
        }
        try {
            const panelWindow = await chrome.windows.getCurrent();
            await send({ action: "COPY_RESULT", success, message: status.textContent, item: success ? item : undefined, windowId: panelWindow.id });
        } catch {
            if (success) status.textContent = "복사는 완료했지만 히스토리 갱신에 실패했습니다.";
        }
    }

    async function removeItem(id) {
        try {
            await send({ action: "DELETE_HISTORY", id });
            status.textContent = id ? "항목을 삭제했습니다." : "히스토리를 모두 삭제했습니다.";
            loadHistory();
        } catch {
            status.textContent = "삭제하지 못했습니다. 다시 시도해 주세요.";
        }
    }

    function renderHistory(history) {
        const scrollTop = list.scrollTop;
        list.replaceChildren();
        count.textContent = String(history.length);
        empty.hidden = history.length > 0;
        list.hidden = history.length === 0;
        clear.disabled = history.length === 0;
        for (const item of history) {
            const row = document.createElement("li");
            row.className = "history-item";
            const text = document.createElement("p");
            text.className = "history-text";
            text.textContent = item.text;
            text.title = item.text;
            const url = document.createElement("a");
            url.className = "history-url";
            url.textContent = item.url;
            url.title = item.url;
            url.href = item.url;
            url.target = "_blank";
            url.rel = "noopener noreferrer";
            const meta = document.createElement("div");
            meta.className = "history-meta";
            const time = document.createElement("time");
            time.className = "history-time";
            const date = new Date(item.copiedAt);
            time.textContent = Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ko-KR", {
                month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
            });
            time.title = Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ko-KR");
            const copy = document.createElement("button");
            copy.type = "button";
            copy.className = "btn-small";
            copy.textContent = "복사";
            copy.title = "이 항목을 다시 복사";
            copy.addEventListener("click", () => { void copyItem(item, copy); });
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "btn-small";
            remove.textContent = "삭제";
            remove.addEventListener("click", () => { void removeItem(item.id); });
            meta.append(time, copy, remove);
            row.append(text, url, meta);
            list.appendChild(row);
        }
        list.scrollTop = scrollTop;
    }

    function loadHistory() {
        chrome.storage.local.get(["history"], (result) => {
            if (chrome.runtime.lastError) {
                status.textContent = "히스토리를 불러오지 못했습니다.";
                return;
            }
            renderHistory((Array.isArray(result.history) ? result.history : []).filter((item) =>
                item && typeof item.id === "string" && typeof item.text === "string"
                && typeof item.url === "string" && /^(https?:|file:|ftp:)/i.test(item.url)));
        });
    }

    clear.addEventListener("click", () => { void removeItem(); });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.history) loadHistory();
    });
    loadHistory();
});
