document.addEventListener("DOMContentLoaded", () => {
    const t = (text) => globalThis.MH?.t(text) ?? text;
    const list = document.getElementById("history-list");
    const empty = document.getElementById("history-empty");
    const count = document.getElementById("history-count");
    const status = document.getElementById("history-status");
    const clear = document.getElementById("clear-history");
    const edits = new Map();

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
                    if (!document.execCommand("copy") || !written) throw new Error(t("클립보드 쓰기 실패"));
                } finally {
                    window.removeEventListener("copy", onCopy, true);
                }
            }
            success = true;
            status.textContent = "";
        } catch {
            status.textContent = t("복사에 실패했습니다. 다시 시도해 주세요.");
        } finally {
            button.disabled = false;
        }
        try {
            const panelWindow = await chrome.windows.getCurrent();
            await send({ action: "COPY_RESULT", success, message: status.textContent, item: success ? item : undefined, windowId: panelWindow.id });
        } catch {
            if (success) status.textContent = t("복사는 완료했지만 히스토리 갱신에 실패했습니다.");
        }
    }

    async function removeItem(id, button) {
        if (button.disabled) return;
        button.disabled = true;
        try {
            await send({ action: "DELETE_HISTORY", id });
            status.textContent = "";
            loadHistory();
        } catch {
            status.textContent = t("삭제하지 못했습니다. 다시 시도해 주세요.");
        }
    }

    function renderHistory(history) {
        const scrollTop = list.scrollTop;
        list.replaceChildren();
        count.textContent = `${history.length} / 100`;
        empty.hidden = history.length > 0;
        list.hidden = history.length === 0;
        clear.disabled = history.length === 0;
        for (const id of edits.keys()) {
            if (!history.some((item) => item.id === id)) edits.delete(id);
        }
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
            time.textContent = Number.isNaN(date.getTime()) ? "" : date.toLocaleString(globalThis.MH?.language === "en" ? "en-US" : "ko-KR", {
                month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
            });
            time.title = Number.isNaN(date.getTime()) ? "" : date.toLocaleString(globalThis.MH?.language === "en" ? "en-US" : "ko-KR");
            const copy = document.createElement("button");
            copy.type = "button";
            copy.className = "btn-small icon-button icon-copy";

            copy.ariaLabel = item.text + t(" 복사");
            copy.title = t("이 항목을 다시 복사");
            copy.addEventListener("click", () => { void copyItem(item, copy); });
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "btn-small btn-remove icon-button icon-delete";

            remove.title = t("이 항목 삭제");
            remove.ariaLabel = item.text + t(" 삭제");
            remove.addEventListener("click", () => { void removeItem(item.id, remove); });
            meta.append(time, copy, remove);
            row.append(text, url, meta);
            const edit = document.createElement("button");
            edit.type = "button";
            edit.className = "icon-button icon-edit history-edit";
            edit.title = edit.ariaLabel = t("표시 텍스트 수정");
            const editor = document.createElement("div");
            editor.className = "history-editor";
            const input = document.createElement("input");
            input.type = "text";
            input.className = "history-edit-input";
            input.ariaLabel = t("표시 텍스트");
            const confirm = document.createElement("button");
            confirm.type = "button";
            confirm.className = "icon-button icon-confirm";
            confirm.title = confirm.ariaLabel = t("확인");
            const cancel = document.createElement("button");
            cancel.type = "button";
            cancel.className = "icon-button icon-delete icon-cancel";
            cancel.title = cancel.ariaLabel = t("취소");
            editor.append(input, confirm, cancel);
            const state = edits.get(item.id);
            function showEditor(visible) {
                editor.hidden = !visible;
                text.hidden = edit.hidden = meta.hidden = visible;
            }
            showEditor(!!state);
            input.value = state?.draft ?? item.text;
            input.disabled = confirm.disabled = cancel.disabled = !!state?.saving;
            edit.addEventListener("click", () => {
                edits.set(item.id, { draft: item.text, saving: false });
                input.value = item.text;
                showEditor(true);
                input.focus();
                input.select();
            });
            input.addEventListener("input", () => {
                input.setCustomValidity("");
                const current = edits.get(item.id);
                if (current) current.draft = input.value;
            });
            function cancelEdit() {
                if (edits.get(item.id)?.saving) return;
                edits.delete(item.id);
                showEditor(false);
                edit.focus();
            }
            async function saveEdit() {
                const current = edits.get(item.id);
                if (!current || current.saving) return;
                if (!input.value.trim()) {
                    input.setCustomValidity(t("표시할 텍스트를 입력해 주세요."));
                    input.reportValidity();
                    return;
                }
                input.setCustomValidity("");
                current.draft = input.value;
                current.saving = true;
                input.disabled = confirm.disabled = cancel.disabled = true;
                try {
                    await send({ action: "UPDATE_HISTORY_TEXT", id: item.id, text: current.draft });
                    edits.delete(item.id);
                    status.textContent = "";
                    loadHistory();
                } catch {
                    current.saving = false;
                    input.disabled = confirm.disabled = cancel.disabled = false;
                    status.textContent = t("텍스트를 저장하지 못했습니다. 다시 시도해 주세요.");
                    loadHistory();
                }
            }
            confirm.addEventListener("click", () => { void saveEdit(); });
            cancel.addEventListener("click", cancelEdit);
            input.addEventListener("keydown", (event) => {
                if (event.isComposing) return;
                if (event.key === "Enter") { event.preventDefault(); void saveEdit(); }
                if (event.key === "Escape") { event.preventDefault(); cancelEdit(); }
            });
            row.append(edit, editor);
            list.appendChild(row);
        }
        list.scrollTop = scrollTop;
    }

    function loadHistory() {
        chrome.storage.local.get(["history"], (result) => {
            if (chrome.runtime.lastError) {
                status.textContent = t("히스토리를 불러오지 못했습니다.");
                return;
            }
            renderHistory((Array.isArray(result.history) ? result.history : []).filter((item) =>
                item && typeof item.id === "string" && typeof item.text === "string"
                && typeof item.url === "string" && /^(https?:|file:|ftp:)/i.test(item.url)));
        });
    }

    clear.addEventListener("click", () => { void removeItem(undefined, clear); });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.history) loadHistory();
    });
    globalThis.MH?.subscribe(() => { status.textContent = ""; loadHistory(); });
    loadHistory();
});
