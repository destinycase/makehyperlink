/**
 * MakeHyperlink Background Script (Service Worker)
 */

const MENU_ID = "make-hyperlink-context-menu";
const DEFAULT_SHORTCUT_DISPLAY = "Ctrl+Alt+C";
const injectionPromises = new Map();
let contextMenuUpdate = Promise.resolve();
const badgeStates = new Map();
const HISTORY_LIMIT = 100;
let historyUpdate = Promise.resolve();

// Register on every worker start so toolbar clicks open the persistent panel.
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
    console.error("MakeHyperlink: 사이드 패널 설정 실패", error);
});

function updateHistory(transform) {
    const pending = historyUpdate.catch(() => {}).then(() => new Promise((resolve, reject) => {
        chrome.storage.local.get(["history"], (result) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            const history = transform(Array.isArray(result.history) ? result.history : []);
            chrome.storage.local.set({ history }, () => {
                if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                resolve(history);
            });
        });
    }));
    historyUpdate = pending;
    return pending;
}

function saveHistory(item) {
    if (!item || typeof item.text !== "string" || !item.text.trim() || typeof item.url !== "string"
        || !/^(https?:|file:|ftp:)/i.test(item.url)) return Promise.resolve();
    return updateHistory((history) => [{ id: crypto.randomUUID(), text: item.text, url: item.url, copiedAt: Date.now() },
        ...history.filter((old) => old && (old.text !== item.text || old.url !== item.url))].slice(0, HISTORY_LIMIT));
}

async function recordCopyResult(tabId, success, message, item) {
    if (success) {
        try {
            await saveHistory(item);
        } catch (error) {
            message = "복사는 완료했지만 히스토리 저장에 실패했습니다.";
            console.warn("MakeHyperlink: 히스토리 저장 실패", error);
        }
    }
    await showCopyBadge(tabId, success, message);
}

async function showCopyBadge(tabId, success, message) {
    if (!Number.isInteger(tabId) || tabId < 0) return;
    clearTimeout(badgeStates.get(tabId)?.timer);
    const state = {};
    badgeStates.set(tabId, state);
    try {
        await Promise.all([
            chrome.action.setBadgeBackgroundColor({ tabId, color: success ? "#137333" : "#B3261E" }),
            chrome.action.setBadgeText({ tabId, text: success ? "OK" : "ERR" }),
            chrome.action.setTitle({ tabId, title: `MakeHyperlink: ${message || (success ? "하이퍼링크 복사 완료!" : "복사에 실패했습니다.")}` })
        ]);
        if (badgeStates.get(tabId) !== state) return;
        state.timer = setTimeout(() => {
            if (badgeStates.get(tabId) !== state) return;
            badgeStates.delete(tabId);
            void Promise.all([
                chrome.action.setBadgeText({ tabId, text: "" }),
                chrome.action.setTitle({ tabId, title: "MakeHyperlink 사이드 패널 열기" })
            ]).catch((error) => console.warn("MakeHyperlink: 배지 초기화 실패", error));
        }, 1000);
    } catch (error) {
        console.warn("MakeHyperlink: 배지 표시 실패", error);
        if (badgeStates.get(tabId) === state) badgeStates.delete(tabId);
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_TAB_DETAILS" && sender.tab) {
        sendResponse({ title: sender.tab.title || "", url: sender.tab.url || "" });
        return false;
    }
    const fromPanel = sender.url === chrome.runtime.getURL("sidepanel.html");
    if (request.action === "DELETE_HISTORY" && fromPanel) {
        void updateHistory((history) => request.id ? history.filter((item) => item.id !== request.id) : [])
            .then(() => sendResponse({ status: "SUCCESS" }))
            .catch((error) => sendResponse({ status: "ERROR", message: error.message }));
        return true;
    }
    if (request.action === "COPY_RESULT" && typeof request.success === "boolean" && fromPanel) {
        const query = Number.isInteger(request.windowId) && request.windowId >= 0
            ? { active: true, windowId: request.windowId } : { active: true, currentWindow: true };
        void chrome.tabs.query(query)
            .then(([tab]) => recordCopyResult(tab?.id, request.success, request.message, request.item))
            .then(() => sendResponse({ status: "RECEIVED" }))
            .catch((error) => sendResponse({ status: "ERROR", message: error.message }));
        return true;
    }
    if (request.action !== "COPY_RESULT" || typeof request.success !== "boolean" || !sender.tab) return false;
    void recordCopyResult(sender.tab.id, request.success, typeof request.message === "string" ? request.message : "", request.item)
        .then(() => sendResponse({ status: "RECEIVED" }));
    return true;
});

function hasOwn(object, property) {
    return Object.prototype.hasOwnProperty.call(object, property);
}

function getLocalSettings() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(["shortcut", "enabled"], (result) => {
            const error = chrome.runtime.lastError;
            if (error) {
                reject(new Error(error.message));
                return;
            }
            resolve(result);
        });
    });
}

function removeAllContextMenus() {
    return new Promise((resolve, reject) => {
        chrome.contextMenus.removeAll(() => {
            const error = chrome.runtime.lastError;
            if (error) {
                reject(new Error(error.message));
                return;
            }
            resolve();
        });
    });
}

function createContextMenu(options) {
    return new Promise((resolve, reject) => {
        chrome.contextMenus.create(options, () => {
            const error = chrome.runtime.lastError;
            if (error) {
                reject(new Error(error.message));
                return;
            }
            resolve();
        });
    });
}

// 설정 변경이 짧은 시간에 여러 번 발생해도 메뉴 갱신 순서를 보장합니다.
function setupContextMenu() {
    contextMenuUpdate = contextMenuUpdate
        .catch(() => {})
        .then(async () => {
            const settings = await getLocalSettings();
            const enabled = hasOwn(settings, "enabled") ? settings.enabled : true;
            const shortcutDisplay = settings.shortcut?.display || DEFAULT_SHORTCUT_DISPLAY;
            const title = enabled
                ? `하이퍼링크 만들기 (${shortcutDisplay})`
                : "하이퍼링크 만들기";

            await removeAllContextMenus();
            await createContextMenu({
                id: MENU_ID,
                title,
                contexts: ["selection", "page", "editable"]
            });
        })
        .catch((error) => {
            console.error("MakeHyperlink: 컨텍스트 메뉴 설정 실패", error);
        });

    return contextMenuUpdate;
}

function sendMessage(tabId, frameId, message) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, { frameId }, (response) => {
            const error = chrome.runtime.lastError;
            if (error) {
                reject(new Error(error.message));
                return;
            }
            resolve(response);
        });
    });
}

function pingContentScript(tabId, frameId) {
    return sendMessage(tabId, frameId, { action: "PING" }).catch(() => null);
}

function isRestrictedPage(url) {
    return /^(?:chrome|whale|edge|about|brave|opera|vivaldi|view-source|devtools|chrome-extension|whale-extension|moz-extension):/i.test(url || "")
        || /^https:\/\/chrome\.google\.com\/webstore(?:\/|$)/i.test(url || "")
        || /^https:\/\/chromewebstore\.google\.com(?:\/|$)/i.test(url || "");
}

async function injectContentScript(tabId, frameId) {
    const response = await pingContentScript(tabId, frameId);
    if (response?.status === "ALIVE") {
        return;
    }

    await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        files: ["content.js"]
    });
}

// 콘텐츠 스크립트 주입을 탭별 Promise로 공유해 동시 클릭을 안전하게 처리합니다.
function ensureContentScriptInjected(tabId, frameId, url) {
    if (!url) {
        return Promise.reject(new Error("페이지 주소를 확인할 수 없습니다. 페이지가 로드된 뒤 다시 시도해 주세요."));
    }
    if (isRestrictedPage(url)) {
        return Promise.reject(new Error("브라우저 내부 화면·다른 확장 프로그램 화면·웹 스토어에서는 페이지 내 단축키·우클릭 복사를 사용할 수 없습니다. 원본 웹페이지에서 실행해 주세요."));
    }

    const key = `${tabId}:${frameId}`;
    const existingPromise = injectionPromises.get(key);
    if (existingPromise) {
        return existingPromise;
    }

    const injectionPromise = injectContentScript(tabId, frameId).finally(() => {
        if (injectionPromises.get(key) === injectionPromise) {
            injectionPromises.delete(key);
        }
    });
    injectionPromises.set(key, injectionPromise);
    return injectionPromise;
}

async function activateExistingTabs() {
    const tabs = await chrome.tabs.query({});
    await Promise.allSettled(tabs.filter((tab) => tab.id && tab.url && !isRestrictedPage(tab.url)).map(async (tab) => {
        try {
            // Static content scripts only run on navigation. Register listeners in
            // already-open documents too, before the first keyboard shortcut.
            await chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: true },
                files: ["content.js"]
            });
        } catch (error) {
            // Tabs can close or navigate to protected documents during install.
            console.warn("MakeHyperlink: 열린 탭 활성화 실패", tab.id, error);
        }
    }));
}

chrome.runtime.onInstalled.addListener(() => {
    void setupContextMenu();
    void activateExistingTabs().catch((error) => {
        console.warn("MakeHyperlink: 열린 탭 조회 실패", error);
    });
});

void setupContextMenu();

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== MENU_ID || !tab?.id) {
        return;
    }

    try {
        const frameId = info.frameId ?? 0;
        const pageUrl = tab.url || info.pageUrl;
        await ensureContentScriptInjected(tab.id, frameId, pageUrl);
        const response = await sendMessage(tab.id, frameId, { action: "COPY_LINK", selectedText: info.selectionText, url: info.pageUrl || tab.url, title: tab.title });
        await recordCopyResult(tab.id, response?.status === "SUCCESS", response?.message, response?.item);
        if (response?.status !== "SUCCESS") {
            console.warn("MakeHyperlink: 복사 처리 실패", response?.message || "알 수 없는 오류");
        }
    } catch (error) {
        console.error("MakeHyperlink: 처리 중 오류 발생", error);
        await showCopyBadge(tab.id, false, error?.message);
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local" && ("shortcut" in changes || "enabled" in changes)) {
        void setupContextMenu();
    }
});
