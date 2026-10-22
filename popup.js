/**
 * MakeHyperlink Popup Script
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
    chrome.storage.local.get(["enabled"], (result) => {
        const error = chrome.runtime.lastError;
        if (!error && typeof result.enabled === "boolean") {
            enableShortcutCheckbox.checked = result.enabled;
        }
    });

    enableShortcutCheckbox.addEventListener("change", () => {
        chrome.storage.local.set({ enabled: enableShortcutCheckbox.checked }, () => {
            const error = chrome.runtime.lastError;
            if (error) {
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
        clearTimeout(stopRecordingTimer);
        isRecording = true;
        recordButton.textContent = "취소하기";
        shortcutDisplay.classList.add("recording");
        currentShortcutText.textContent = "키를 누르세요...";
        setStatus("원하는 단축키 조합을 누르세요 (예: Ctrl + Shift + L)");
        window.addEventListener("keydown", handleKeyDown);
    }

    function stopRecording() {
        clearTimeout(stopRecordingTimer);
        stopRecordingTimer = undefined;
        isRecording = false;
        recordButton.textContent = "변경하기";
        shortcutDisplay.classList.remove("recording");
        loadSavedShortcut();
        setStatus("설정을 변경하려면 '변경하기' 버튼을 누르세요.");
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
        if (!isRecording || isSaving || event.isComposing || event.repeat || ["Control", "Shift", "Alt", "Meta"].includes(event.key)) {
            return;
        }

        event.preventDefault();
        if (event.key === "Escape") {
            stopRecording();
            return;
        }
        if (!(event.ctrlKey || event.altKey || event.metaKey) || !event.code) {
            setStatus("Ctrl, Alt ?? Meta? ?? ?? ?? ????.");
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
            recordButton.disabled = false;
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
            setStatus("???? ????? ???????!");
        });
    }
});
