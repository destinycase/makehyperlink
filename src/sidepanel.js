/**
 * MakeHyperlink Side Panel Settings
 */

document.addEventListener("DOMContentLoaded", () => {
    const DEFAULT_SHORTCUT_DISPLAY = "Ctrl + Alt + C";
    const recordButton = document.getElementById("record-btn");
    const shortcutDisplay = document.getElementById("shortcut-display");
    const currentShortcutText = document.getElementById("current-shortcut");
    const statusMessage = document.getElementById("status-msg");
    const enableShortcutCheckbox = document.getElementById("enable-shortcut");

    let isRecording = false;
    let stopRecordingTimer;
    let isSaving = false;
    let isEnabled = true;

    function applyEnabled(enabled) {
        isEnabled = enabled;
        enableShortcutCheckbox.checked = enabled;
        if (!enabled && isRecording) stopRecording();
        recordButton.disabled = !enabled || isSaving;
        shortcutDisplay.classList[enabled ? "remove" : "add"]("is-disabled");
    }

    function setStatus(message) {
        statusMessage.textContent = message;
    }

    function loadSavedShortcut() {
        chrome.storage.local.get(["shortcut"], (result) => {
            const error = chrome.runtime.lastError;
            if (error) {
                if (!isRecording) {
                    setStatus(`설정을 불러오지 못했습니다: ${error.message}`);
                }
                return;
            }
            if (!isRecording) {
                currentShortcutText.textContent = result.shortcut?.display || DEFAULT_SHORTCUT_DISPLAY;
            }
        });
    }

    loadSavedShortcut();
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (changes.shortcut && !isRecording) loadSavedShortcut();
        if (changes.enabled) applyEnabled(changes.enabled.newValue !== false);
    });
    chrome.storage.local.get(["enabled"], (result) => {
        const error = chrome.runtime.lastError;
        if (!error && typeof result.enabled === "boolean") {
            applyEnabled(result.enabled);
        }
    });

    enableShortcutCheckbox.addEventListener("change", () => {
        const previous = isEnabled;
        applyEnabled(enableShortcutCheckbox.checked);
        chrome.storage.local.set({ enabled: enableShortcutCheckbox.checked }, () => {
            const error = chrome.runtime.lastError;
            if (error) {
                applyEnabled(previous);
                setStatus(`설정을 저장하지 못했습니다: ${error.message}`);
            }
        });
    });

    recordButton.addEventListener("click", () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });

    function startRecording() {
        if (!isEnabled || isSaving) return;
        clearTimeout(stopRecordingTimer);
        isRecording = true;
        recordButton.className = "btn-primary icon-button icon-cancel";
        recordButton.title = recordButton.ariaLabel = "\uB2E8\uCD95\uD0A4 \uBCC0\uACBD \uCDE8\uC18C";
        shortcutDisplay.classList.add("recording");
        currentShortcutText.textContent = "키를 누르세요...";
        setStatus("원하는 단축키 조합을 누르세요 (예: Ctrl + Shift + L)");
        window.addEventListener("keydown", handleKeyDown);
    }

    function stopRecording() {
        clearTimeout(stopRecordingTimer);
        stopRecordingTimer = undefined;
        isRecording = false;
        recordButton.className = "btn-primary icon-button icon-edit";
        recordButton.title = recordButton.ariaLabel = "\uB2E8\uCD95\uD0A4 \uBCC0\uACBD";
        shortcutDisplay.classList.remove("recording");
        loadSavedShortcut();
        setStatus("");
        window.removeEventListener("keydown", handleKeyDown);
    }

    function getKeyLabel(code) {
        if (code.startsWith("Key")) {
            return code.slice(3);
        }
        if (code.startsWith("Digit")) {
            return code.slice(5);
        }
        return code;
    }

    function handleKeyDown(event) {
        if (!isEnabled || !isRecording || isSaving || event.isComposing || event.repeat || ["Control", "Shift", "Alt", "Meta"].includes(event.key)) {
            return;
        }

        event.preventDefault();
        if (event.key === "Escape") {
            stopRecording();
            return;
        }
        if (!(event.ctrlKey || event.altKey || event.metaKey) || !event.code) {
            setStatus("Ctrl, Alt 또는 Meta와 다른 키를 함께 눌러 주세요.");
            return;
        }
        const parts = [];
        if (event.ctrlKey) parts.push("Ctrl");
        if (event.altKey) parts.push("Alt");
        if (event.shiftKey) parts.push("Shift");
        if (event.metaKey) parts.push("Meta");
        parts.push(getKeyLabel(event.code));

        const display = parts.join(" + ");
        const shortcutData = {
            display,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            code: event.code
        };

        isSaving = true;
        recordButton.disabled = true;
        chrome.storage.local.set({ shortcut: shortcutData }, () => {
            isSaving = false;
            recordButton.disabled = !isEnabled;
            const error = chrome.runtime.lastError;
            if (error) {
                if (isRecording) {
                    setStatus(`단축키를 저장하지 못했습니다: ${error.message}`);
                }
                return;
            }
            if (!isRecording) {
                return;
            }

            stopRecording();
            currentShortcutText.textContent = display;

        });
    }
});
