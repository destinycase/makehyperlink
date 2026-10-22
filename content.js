/**
 * MakeHyperlink Content Script
 */

(function () {
    if (window.hasMakeHyperlinkLoaded) {
        console.log("MakeHyperlink: 이미 로드되어 있습니다.");
        return;
    }
    window.hasMakeHyperlinkLoaded = true;

    const DEFAULT_SHORTCUT = {
        ctrlKey: true,
        altKey: true,
        shiftKey: false,
        metaKey: false,
        code: "KeyC",
        display: "Ctrl + Alt + C"
    };

    let copyInProgress = false;

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

    async function copyHyperlink(request = {}) {
        if (copyInProgress) {
            return false;
        }

        const selectedText = typeof request.selectedText === "string"
            ? request.selectedText.trim() : getSelectedText();
        if (!selectedText) {
            console.log("MakeHyperlink: 선택된 텍스트가 없습니다.");
            return false;
        }

        copyInProgress = true;
        const currentUrl = request.url || window.location.href;
        const htmlLink = createHyperlinkHtml(selectedText, currentUrl);
        const plainTextLink = `[${selectedText}](${currentUrl})`;

        try {
            try {
                const clipboardItem = new ClipboardItem({
                    "text/html": new Blob([htmlLink], { type: "text/html" }),
                    "text/plain": new Blob([plainTextLink], { type: "text/plain" })
                });
                await navigator.clipboard.write([clipboardItem]);
                console.log("MakeHyperlink: Clipboard API 복사 성공");
                return true;
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
                console.log("MakeHyperlink: execCommand 복사 성공");
                return true;
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
            console.log("MakeHyperlink: 단축키 변경됨", currentShortcut.display);
        }
        if ("enabled" in changes) {
            isEnabled = changes.enabled.newValue === true;
            console.log("MakeHyperlink: 활성화 상태 변경됨", isEnabled);
        }
    });

    window.addEventListener("keydown", (event) => {
        if (!isEnabled || event.repeat || event.isComposing) {
            return;
        }

        const isMatch = event.ctrlKey === !!currentShortcut.ctrlKey
            && event.altKey === !!currentShortcut.altKey
            && event.shiftKey === !!currentShortcut.shiftKey
            && event.metaKey === !!currentShortcut.metaKey
            && event.code === currentShortcut.code;

        if (isMatch) {
            if (!getSelectedText()) {
                return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            void copyHyperlink();
        }
    }, true);

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "PING") {
            sendResponse({ status: "ALIVE" });
            return false;
        }

        if (request.action === "COPY_LINK") {
            copyHyperlink(request).then((success) => {
                sendResponse(success
                    ? { status: "SUCCESS" }
                    : { status: "ERROR", message: "복사할 텍스트가 없거나 복사에 실패했습니다." });
            }).catch((error) => {
                sendResponse({ status: "ERROR", message: error?.message || "복사에 실패했습니다." });
            });
            return true;
        }

        return false;
    });

    console.log("MakeHyperlink: 확장이 로드되었습니다. (Ctrl+Alt+C)");
})();
