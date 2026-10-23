(() => {
    const english = {
        "사용법": "Help", "사용법 열기": "Open help", "닫기": "Close", "사용법 닫기": "Close help",
        "MakeHyperlink 사이드 패널": "MakeHyperlink Side Panel", "MakeHyperlink 사용법": "MakeHyperlink Help",
        "설정": "Settings", "설정 열기": "Open settings", "설정 닫기": "Close settings", "언어": "Language",
        "단축키": "Keyboard shortcut", "단축키 사용": "Enable shortcut", "단축키 변경": "Change shortcut",
        "단축키 변경 취소": "Cancel shortcut change", "목록": "List", "전체 삭제": "Clear all",
        "아직 복사한 링크가 없습니다.": "No copied links yet.", "복사한 링크 목록": "Copied links",
        "이 브라우저에 최근 100개까지 저장": "Stores the latest 100 links in this browser",
        "이 항목을 다시 복사": "Copy this link again", "이 항목 삭제": "Delete this item",
        "표시 텍스트 수정": "Edit display text", "표시 텍스트": "Display text", "확인": "Confirm", "취소": "Cancel",
        "복사": "Copy", "삭제": "Delete", "표시할 텍스트를 입력해 주세요.": "Enter display text.",
        "텍스트를 저장하지 못했습니다. 다시 시도해 주세요.": "Could not save the text. Please try again.",
        "복사에 실패했습니다. 다시 시도해 주세요.": "Copy failed. Please try again.",
        "삭제하지 못했습니다. 다시 시도해 주세요.": "Could not delete the item. Please try again.",
        "히스토리를 불러오지 못했습니다.": "Could not load the list.",
        "복사는 완료했지만 히스토리 갱신에 실패했습니다.": "Copied, but could not update the list.",
        "설정을 불러오지 못했습니다": "Could not load settings", "설정을 저장하지 못했습니다": "Could not save settings",
        "단축키를 저장하지 못했습니다": "Could not save the shortcut",
        "키를 누르세요...": "Press a key...",
        "원하는 단축키 조합을 누르세요 (예: Ctrl + Shift + L)": "Press a shortcut (for example, Ctrl + Shift + L)",
        "Ctrl, Alt 또는 Meta와 다른 키를 함께 눌러 주세요.": "Combine Ctrl, Alt or Meta with another key.",
        "복사 하기": "Copying", "선택한 텍스트 복사": "Copy selected text", "페이지 제목으로 복사": "Copy the page title",
        "기본 링크 복사": "Copy an existing link", "목록 관리": "Managing the list", "단축키 설정": "Shortcut settings", "동작 확인": "Checking results",
        "웹페이지에서 텍스트를 선택하고 설정한 단축키를 누르거나, 우클릭 메뉴의 ‘하이퍼링크 만들기’를 선택하세요.": "Select text on a webpage and press your shortcut, or right-click and choose ‘Copy as hyperlink’.",
        "기본 단축키는": "The default shortcut is", "입니다. 주소창이나 사이드 패널이 아닌 웹페이지에 포커스가 있어야 합니다.": ". Focus must be on the webpage, rather than the address bar or side panel.",
        "선택한 텍스트 없이 실행하면 현재 탭의 제목과 주소를 복사합니다.": "Without a selection, the current tab title and address are copied.",
        "링크를 우클릭하고 ‘이 링크를 하이퍼링크로 복사’를 선택하면 링크의 텍스트와 실제 연결 주소를 복사합니다.": "Right-click a link and choose ‘Copy this link as hyperlink’ to copy its label and destination.",
        "최근 100개를 이 브라우저에 저장합니다. 왼쪽 연필 아이콘으로 표시 이름을 수정하고 확인 또는 Enter로 저장하세요. 취소 또는 Esc로 취소합니다. 이름을 바꾼 뒤 파란 복사 아이콘을 누르면 변경한 이름으로 복사됩니다. 주소와 기존 시간·목록 순서는 유지됩니다.": "The latest 100 links are stored in this browser. Use the left pencil to edit a label, then Confirm or Enter to save, or Cancel or Esc to discard. Click the blue copy icon to copy the new label. Addresses, timestamps and list order stay the same.",
        "빨간 휴지통 아이콘으로 개별 항목을 삭제하세요. ‘전체 삭제’는 모든 항목을 지우며 되돌릴 수 없습니다.": "Use the red trash icon to delete an item. ‘Clear all’ removes every item and cannot be undone.",
        "설정의 초록 연필 아이콘을 누르고 Ctrl, Alt, Meta 중 하나 이상을 포함한 키 조합을 입력하세요. Esc로 취소할 수 있습니다.": "In Settings, click the green pencil and press a key combination that includes Ctrl, Alt or Meta. Press Esc to cancel.",
        "‘단축키 사용’을 끄면 단축키 실행과 변경이 중단됩니다. 우클릭 메뉴와 목록의 복사 버튼은 계속 사용할 수 있습니다.": "Turn off ‘Enable shortcut’ to disable shortcut use and editing. Context menus and the list copy buttons remain available.",
        "확장 아이콘에 초록 OK는 복사 성공, 빨강 ERR는 실패를 뜻합니다. 브라우저 내부 화면과 웹 스토어 등에서는 페이지 복사를 사용할 수 없습니다.": "A green OK badge means copied; a red ERR badge means failure. Browser internal pages and web stores do not support page copying."
    };
    let language = "en";
    const listeners = new Set();
    const originals = new WeakMap();
    const originalAttributes = new WeakMap();
    const api = globalThis.MH = {
        t: (text) => language === "ko" ? text : text.replace(text.trim(), english[text.trim()] || text.trim()),
        get language() { return language; },
        subscribe: (fn) => listeners.add(fn),
        apply(value) {
            language = value === "ko" ? "ko" : "en";
            document.documentElement.lang = language;
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const node = walker.currentNode;
                if (node.parentElement.closest("script, style, .history-list, #current-shortcut, #status-msg, #history-status")) continue;
                if (!originals.has(node)) originals.set(node, node.textContent);
                const original = originals.get(node);
                const trimmed = original.trim();
                node.textContent = original.replace(trimmed, api.t(trimmed));
            }
            for (const element of document.querySelectorAll("[title], [aria-label]")) {
                if (element.closest(".history-list")) continue;
                if (!originalAttributes.has(element)) originalAttributes.set(element, {});
                const values = originalAttributes.get(element);
                for (const attr of ["title", "aria-label"]) {
                    if (!element.hasAttribute(attr)) continue;
                    values[attr] ??= element.getAttribute(attr);
                    element.setAttribute(attr, api.t(values[attr]));
                }
            }
            document.title = api.t("MakeHyperlink 사이드 패널");
            for (const listener of listeners) listener(language);
        }
    };
    document.addEventListener("DOMContentLoaded", () => {
        api.apply("en");
        chrome.storage.local.get(["language"], (result) => {
            if (!chrome.runtime.lastError) api.apply(result.language);
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "local" && changes.language) api.apply(changes.language.newValue);
        });
    });
})();
