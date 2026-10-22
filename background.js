/**
 * MakeHyperlink Background Script (Service Worker)
 */

const MENU_ID = "make-hyperlink-context-menu";
const DEFAULT_SHORTCUT_DISPLAY = "Ctrl+Alt+C";
const injectionPromises = new Map();
let contextMenuUpdate = Promise.resolve();

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
                contexts: ["selection"]
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
    return !url
        || /^(?:chrome|edge|about|brave|opera|vivaldi|view-source|devtools|chrome-extension):/i.test(url)
        || url.startsWith("https://chrome.google.com/webstore/");
}

async function injectContentScript(tabId, frameId) {
    const response = await pingContentScript(tabId, frameId);
    if (response?.status === "ALIVE") {
        return;
    }

    console.log("MakeHyperlink: 콘텐츠 스크립트 없음. 동적 주입 시작...");
    await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        files: ["content.js"]
    });
    await chrome.scripting.insertCSS({
        target: { tabId, frameIds: [frameId] },
        files: ["style.css"]
    });
    console.log("MakeHyperlink: 스크립트 주입 완료");
}

// 콘텐츠 스크립트 주입을 탭별 Promise로 공유해 동시 클릭을 안전하게 처리합니다.
function ensureContentScriptInjected(tabId, frameId, url) {
    if (isRestrictedPage(url)) {
        return Promise.reject(new Error("브라우저 정책상 이 페이지에서는 기능을 사용할 수 없습니다."));
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

chrome.runtime.onInstalled.addListener(() => {
    void setupContextMenu();
});

void setupContextMenu();

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== MENU_ID || !tab?.id) {
        return;
    }

    try {
        const frameId = info.frameId ?? 0;
        await ensureContentScriptInjected(tab.id, frameId, tab.url);
        const response = await sendMessage(tab.id, frameId, { action: "COPY_LINK", selectedText: info.selectionText, url: info.pageUrl || tab.url });
        if (response?.status !== "SUCCESS") {
            console.warn("MakeHyperlink: 복사 처리 실패", response?.message || "알 수 없는 오류");
        }
    } catch (error) {
        console.error("MakeHyperlink: 처리 중 오류 발생", error);
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local" && ("shortcut" in changes || "enabled" in changes)) {
        void setupContextMenu();
    }
});
