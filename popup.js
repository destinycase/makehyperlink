/**
 * MakeHyperlink Popup Script
 */

document.addEventListener('DOMContentLoaded', () => {
    const recordBtn = document.getElementById('record-btn');
    const shortcutDisplay = document.getElementById('shortcut-display');
    const currentShortcutTxt = document.getElementById('current-shortcut');
    const statusMsg = document.getElementById('status-msg');
    const enableShortcutCheckbox = document.getElementById('enable-shortcut');

    let isRecording = false;

    // 초기 설정 로드
    chrome.storage.local.get(['shortcut', 'enabled'], (result) => {
        if (result.shortcut) {
            currentShortcutTxt.textContent = result.shortcut.display;
        }
        if (result.hasOwnProperty('enabled')) {
            enableShortcutCheckbox.checked = result.enabled;
        }
    });

    // 활성화 체크박스 이벤트
    enableShortcutCheckbox.addEventListener('change', () => {
        chrome.storage.local.set({ enabled: enableShortcutCheckbox.checked });
    });

    recordBtn.addEventListener('click', () => {
        if (!isRecording) {
            startRecording();
        } else {
            stopRecording();
        }
    });

    function startRecording() {
        isRecording = true;
        recordBtn.textContent = '취소하기';
        shortcutDisplay.classList.add('recording');
        currentShortcutTxt.textContent = '키를 누르세요...';
        statusMsg.textContent = '원하는 단축키 조합을 누르세요 (예: Ctrl + Shift + L)';

        window.addEventListener('keydown', handleKeyDown);
    }

    function stopRecording() {
        isRecording = false;
        recordBtn.textContent = '변경하기';
        shortcutDisplay.classList.remove('recording');
        
        // 다시 로드하여 이전 상태 복구
        chrome.storage.local.get(['shortcut'], (result) => {
            currentShortcutTxt.textContent = result.shortcut ? result.shortcut.display : 'Ctrl + Alt + C';
            statusMsg.textContent = "설정을 변경하려면 '변경하기' 버튼을 누르세요.";
        });

        window.removeEventListener('keydown', handleKeyDown);
    }

    function handleKeyDown(e) {
        // 기능키 단독 입력은 무시 (Ctrl, Shift, Alt, Meta)
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
            return;
        }

        e.preventDefault();

        const parts = [];
        if (e.ctrlKey) parts.push('Ctrl');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
        if (e.metaKey) parts.push('Meta');
        
        // 실제 키 추가
        const key = e.code.replace('Key', '');
        parts.push(key);

        const display = parts.join(' + ');
        
        // 저장할 데이터 객체
        const shortcutData = {
            display: display,
            ctrlKey: e.ctrlKey,
            altKey: e.altKey,
            shiftKey: e.shiftKey,
            metaKey: e.metaKey,
            code: e.code
        };

        // 크롬 스토리지에 저장
        chrome.storage.local.set({ shortcut: shortcutData }, () => {
            currentShortcutTxt.textContent = display;
            statusMsg.textContent = '단축키가 성공적으로 저장되었습니다!';
            setTimeout(stopRecording, 1000);
        });
    }
});
