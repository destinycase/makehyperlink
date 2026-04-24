/**
 * MakeHyperlink Background Script (Service Worker)
 */

const MENU_ID = "make-hyperlink-context-menu";

// 컨텍스트 메뉴를 생성하거나 업데이트하는 통합 함수
function setupContextMenu() {
    chrome.storage.local.get(['shortcut', 'enabled'], (result) => {
        const enabled = result.hasOwnProperty('enabled') ? result.enabled : true;
        const shortcutDisplay = result.shortcut ? result.shortcut.display : "Ctrl+Alt+C";
        
        const title = enabled 
            ? `하이퍼링크 만들기 (${shortcutDisplay})` 
            : "하이퍼링크 만들기";

        // 기존 메뉴가 있는지 확인하기 위해 먼저 삭제 시도 (에러 무시)
        chrome.contextMenus.removeAll(() => {
            chrome.contextMenus.create({
                id: MENU_ID,
                title: title,
                contexts: ["selection"]
            }, () => {
                if (chrome.runtime.lastError) {
                    console.log("Context menu creation handled: " + chrome.runtime.lastError.message);
                }
            });
        });
    });
}

// 확장 프로그램 설치 또는 업데이트 시 실행
chrome.runtime.onInstalled.addListener(() => {
    setupContextMenu();
});

// 서비스 워커가 시작될 때마다 실행 (상태 유지)
setupContextMenu();

// 컨텍스트 메뉴 클릭 이벤트 처리
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === MENU_ID) {
        console.log("MakeHyperlink: 컨텍스트 메뉴 클릭됨. 연결 확인 중...");
        
        try {
            // 콘텐츠 스크립트가 로드되어 있는지 확인하고 없으면 주입
            await ensureContentScriptInjected(tab.id, tab.url);
            
            // 메시지 전송
            chrome.tabs.sendMessage(tab.id, { action: "COPY_LINK" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("MakeHyperlink: 최종 메시지 전송 실패 - ", chrome.runtime.lastError.message);
                } else {
                    console.log("MakeHyperlink: 메시지 전송 성공", response);
                }
            });
        } catch (err) {
            console.error("MakeHyperlink: 처리 중 오류 발생 - ", err.message);
        }
    }
});

// 콘텐츠 스크립트 주입 상태를 확인하고 필요 시 주입하는 함수
async function ensureContentScriptInjected(tabId, url) {
    // 특수 페이지(chrome:// 등)에서는 주입 불가
    if (!url || url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('https://chrome.google.com/webstore/')) {
        throw new Error("브라우저 정책상 이 페이지에서는 기능을 사용할 수 없습니다.");
    }

    return new Promise((resolve, reject) => {
        // 먼저 PING을 보내서 스크립트가 응답하는지 확인
        chrome.tabs.sendMessage(tabId, { action: "PING" }, (response) => {
            if (chrome.runtime.lastError || !response) {
                console.log("MakeHyperlink: 콘텐츠 스크립트 없음. 동적 주입 시작...");
                
                // 스크립트와 CSS 주입
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ["content.js"]
                }).then(() => {
                    return chrome.scripting.insertCSS({
                        target: { tabId: tabId },
                        files: ["style.css"]
                    });
                }).then(() => {
                    console.log("MakeHyperlink: 스크립트 주입 완료");
                    resolve();
                }).catch(err => {
                    console.error("MakeHyperlink: 스크립트 주입 실패", err);
                    reject(err);
                });
            } else {
                console.log("MakeHyperlink: 콘텐츠 스크립트가 이미 활성화되어 있습니다.");
                resolve();
            }
        });
    });
}

// 단축키 설정 변경 감지 시 메뉴 즉시 업데이트
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        setupContextMenu();
    }
});
