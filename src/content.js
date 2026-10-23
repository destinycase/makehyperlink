/**
 * MakeHyperlink Content Script
 */

(function () {
    if (typeof window.hasMakeHyperlinkLoaded === "function" && window.hasMakeHyperlinkLoaded()) {
        return;
    }
    // A boolean from an old, invalidated extension context must not block reload.
    window.hasMakeHyperlinkLoaded = () => {
        try {
            chrome.runtime.getManifest();
            return true;
        } catch {
            return false;
        }
    };

    const DEFAULT_SHORTCUT = {
        ctrlKey: true,
        altKey: true,
        shiftKey: false,
        metaKey: false,
        code: "KeyC",
        display: "Ctrl + Alt + C"
    };

    let copyInProgress = false;
    function reportCopyResult(success, message, item) {
        try {
            chrome.runtime.sendMessage({ action: "COPY_RESULT", success, message, item }, () => {
                // Badge delivery must not affect the clipboard result.
                const error = chrome.runtime.lastError;
                if (error) console.warn("MakeHyperlink: 배지 알림 실패", error.message);
            });
        } catch (error) {
            console.warn("MakeHyperlink: 배지 알림 실패", error);
        }
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function createHyperlinkHtml(text, url) {
        return `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`;
    }

    function getSelectedText() {
        let activeElement = document.activeElement;
        while (activeElement?.shadowRoot?.activeElement) {
            activeElement = activeElement.shadowRoot.activeElement;
        }
        if (activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")) {
            return typeof activeElement.selectionStart === "number"
                && typeof activeElement.selectionEnd === "number"
                ? activeElement.value.substring(activeElement.selectionStart, activeElement.selectionEnd).trim()
                : "";
        }
        return window.getSelection()?.toString().trim() || "";
    }

    let contextLink = null;
    window.addEventListener("contextmenu", (event) => {
        // Capture a snapshot without changing page DOM, selection or focus.
        const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
        const link = path.find((node) => node?.matches?.("a[href], area[href]"))
            || event.target?.closest?.("a[href], area[href]");
        contextLink = link ? {
            url: link.href,
            text: (link.innerText || link.textContent || link.getAttribute("aria-label")
                || link.querySelector?.("img[alt]")?.alt || link.title || "").trim()
        } : null;
    }, true);

    function getTabDetails() {
        const fallback = { title: document.title || "", url: window.location.href };
        return new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage({ action: "GET_TAB_DETAILS" }, (response) => {
                    if (chrome.runtime.lastError || !response?.url) return resolve(fallback);
                    resolve(response);
                });
            } catch {
                resolve(fallback);
            }
        });
    }

    async function copyHyperlink(request = {}) {
        if (copyInProgress) {
            return false;
        }

        let selectedText = typeof request.selectedText === "string"
            ? request.selectedText.trim() : getSelectedText();
        let currentUrl = request.url || window.location.href;
        if (!selectedText) {
            copyInProgress = true;
            const tab = typeof request.title === "string"
                ? { title: request.title, url: currentUrl } : await getTabDetails();
            currentUrl = tab.url || currentUrl;
            selectedText = tab.title?.trim() || currentUrl;
        }

        copyInProgress = true;
        const htmlLink = createHyperlinkHtml(selectedText, currentUrl);
        const plainTextLink = `[${selectedText}](${currentUrl})`;

        try {
            try {
                const clipboardItem = new ClipboardItem({
                    "text/html": new Blob([htmlLink], { type: "text/html" }),
                    "text/plain": new Blob([plainTextLink], { type: "text/plain" })
                });
                await navigator.clipboard.write([clipboardItem]);
                return { text: selectedText, url: currentUrl };
            } catch (error) {
                console.warn("MakeHyperlink: Clipboard API 실패, 폴백 시도...", error?.message || error);
            }

            let clipboardDataWritten = false;
            const handleCopy = (event) => {
                if (!event.clipboardData) {
                    return;
                }
                event.clipboardData.setData("text/html", htmlLink);
                event.clipboardData.setData("text/plain", plainTextLink);
                event.preventDefault();
                event.stopImmediatePropagation();
                clipboardDataWritten = true;
            };
            window.addEventListener("copy", handleCopy, true);

            try {
                if (!document.execCommand("copy") || !clipboardDataWritten) {
                    throw new Error("Clipboard write failed");
                }
                return { text: selectedText, url: currentUrl };
            } finally {
                window.removeEventListener("copy", handleCopy, true);
            }
        } catch (error) {
            const message = error?.message || String(error);
            console.error("MakeHyperlink: 모든 복사 시도 실패", message);
            return false;
        } finally {
            copyInProgress = false;
        }
    }

    function isValidShortcut(shortcut) {
        return shortcut
            && typeof shortcut.code === "string"
            && shortcut.code.length > 0
            && !!(shortcut.ctrlKey || shortcut.altKey || shortcut.metaKey);
    }

    function hasOwn(object, property) {
        return Object.prototype.hasOwnProperty.call(object, property);
    }

    let currentShortcut = { ...DEFAULT_SHORTCUT };
    let isEnabled = true;

    chrome.storage.local.get(["shortcut", "enabled"], (result) => {
        if (isValidShortcut(result.shortcut)) {
            currentShortcut = { ...DEFAULT_SHORTCUT, ...result.shortcut };
        }
        isEnabled = hasOwn(result, "enabled") ? result.enabled === true : true;
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== "local") {
            return;
        }
        if ("shortcut" in changes) {
            currentShortcut = isValidShortcut(changes.shortcut.newValue)
                ? { ...DEFAULT_SHORTCUT, ...changes.shortcut.newValue } : { ...DEFAULT_SHORTCUT };
        }
        if ("enabled" in changes) {
            isEnabled = changes.enabled.newValue === true;
        }
    });

    window.addEventListener("keydown", (event) => {
        // IMEs can report composition during Ctrl/Alt shortcuts as well.
        // Match the explicit modifier combination and physical key below.
        if (!isEnabled || event.repeat) {
            return;
        }

        const isMatch = event.ctrlKey === !!currentShortcut.ctrlKey
            && event.altKey === !!currentShortcut.altKey
            && event.shiftKey === !!currentShortcut.shiftKey
            && event.metaKey === !!currentShortcut.metaKey
            && event.code === currentShortcut.code;

        if (isMatch) {
            event.preventDefault();
            event.stopImmediatePropagation();
            void copyHyperlink().then((item) => {
                reportCopyResult(!!item, item ? "하이퍼링크 복사 완료!" : "복사에 실패했습니다.", item || undefined);
            }).catch((error) => {
                reportCopyResult(false, error?.message || "복사에 실패했습니다.");
            });
        }
    }, true);

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "PING") {
            sendResponse({ status: "ALIVE" });
            return false;
        }

        if (request.action === "COPY_LINK" || request.action === "COPY_EXISTING_LINK") {
            if (request.action === "COPY_EXISTING_LINK") {
                if (typeof request.url !== "string" || !/^(https?:|file:|ftp:)/i.test(request.url)) {
                    sendResponse({ status: "ERROR", message: "Unsupported link address" });
                    return false;
                }
                request = { url: request.url, selectedText: contextLink?.url === request.url
                    ? contextLink.text || request.url : request.url };
            }
            copyHyperlink(request).then((item) => {
                sendResponse(item
                    ? { status: "SUCCESS", item }
                    : { status: "ERROR", message: "복사에 실패했습니다." });
            }).catch((error) => {
                sendResponse({ status: "ERROR", message: error?.message || "복사에 실패했습니다." });
            });
            return true;
        }

        return false;
    });

})();
