/**
 * MakeHyperlink Content Script
 */

(function() {
    // 중복 로드 방지
    if (window.hasMakeHyperlinkLoaded) {
        console.log('MakeHyperlink: 이미 로드되어 있습니다.');
        return;
    }
    window.hasMakeHyperlinkLoaded = true;

    console.log('MakeHyperlink: 콘텐츠 스크립트 로드됨');
    // 토스트 알림 요소 생성 및 초기화
    let toastTimeout;
    const toast = document.createElement('div');
    toast.className = 'mh-toast-container';
    toast.innerHTML = `
        <div class="mh-toast-icon">✓</div>
        <span class="mh-toast-text">하이퍼링크가 클립보드에 복사되었습니다!</span>
    `;
    document.body.appendChild(toast);

    function showToast(message, isError = false) {
        if (message) {
            toast.querySelector('.mh-toast-text').textContent = message;
        }
        
        const iconElement = toast.querySelector('.mh-toast-icon');
        if (isError) {
            iconElement.innerHTML = '✕';
            iconElement.style.background = 'linear-gradient(to right, #ff416c, #ff4b2b)';
        } else {
            iconElement.innerHTML = '✓';
            iconElement.style.background = 'linear-gradient(to right, #3a7bd5, #00d2ff)';
        }
        
        clearTimeout(toastTimeout);
        toast.classList.add('show');
        
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, isError ? 4000 : 2500);
    }

    // 하이퍼링크 생성 및 복사 함수
    async function copyHyperlink() {
        let selection = window.getSelection();
        let selectedText = selection.toString().trim();
        
        // Input이나 Textarea 내부의 텍스트가 드래그된 경우, window.getSelection()으로 잡히지 않으므로 별도 처리
        if (!selectedText && document.activeElement) {
            try {
                const activeEl = document.activeElement;
                if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') {
                    if (typeof activeEl.selectionStart === 'number' && typeof activeEl.selectionEnd === 'number') {
                        selectedText = activeEl.value.substring(activeEl.selectionStart, activeEl.selectionEnd).trim();
                    }
                }
            } catch (secErr) {
                console.warn('MakeHyperlink: activeElement 접근 중 보안 에러 (Cross-Origin Iframe 등)', secErr);
                showToast('보안 정책(외부 Iframe 등)으로 인해 텍스트에 접근할 수 없습니다.', true);
                return;
            }
        }
        
        if (!selectedText) {
            console.log('MakeHyperlink: 선택된 텍스트가 없습니다.');
            showToast('텍스트를 먼저 드래그해 주세요.', true);
            return;
        }
        console.log('MakeHyperlink: 복사 시도 - ', selectedText);

        const currentUrl = window.location.href;
        
        // HTML 형식의 하이퍼링크 생성
        const htmlLink = `<a href="${currentUrl}">${selectedText}</a>`;
        const plainTextLink = `[${selectedText}](${currentUrl})`; // 기본값은 마크다운 형식을 텍스트로

        try {
            // 1. 현대적인 Clipboard API 시도
            const htmlBlob = new Blob([htmlLink], { type: 'text/html' });
            const textBlob = new Blob([selectedText], { type: 'text/plain' });
            
            const data = [new ClipboardItem({
                'text/html': htmlBlob,
                'text/plain': textBlob
            })];

            await navigator.clipboard.write(data);
            console.log('MakeHyperlink: Clipboard API 복사 성공');
            showToast('하이퍼링크 복사 완료!');
        } catch (err) {
            const firstErrMsg = err && err.message ? err.message : String(err);
            console.warn('MakeHyperlink: Clipboard API 실패, 폴백 시도...', firstErrMsg);
            
            // 기존 선택 영역 저장
            const selection = window.getSelection();
            const originalRanges = [];
            for (let i = 0; i < selection.rangeCount; i++) {
                originalRanges.push(selection.getRangeAt(i).cloneRange());
            }

            // 2. document.execCommand('copy')를 이용한 Rich Text 복사 폴백
            try {
                const tempDiv = document.createElement('div');
                tempDiv.style.position = 'fixed';
                tempDiv.style.left = '-9999px';
                tempDiv.style.whiteSpace = 'pre';
                tempDiv.innerHTML = htmlLink;
                document.body.appendChild(tempDiv);
                
                const range = document.createRange();
                range.selectNodeContents(tempDiv);
                selection.removeAllRanges();
                selection.addRange(range);
                
                const success = document.execCommand('copy');
                document.body.removeChild(tempDiv);
                
                if (success) {
                    console.log('MakeHyperlink: execCommand 복사 성공');
                    showToast('하이퍼링크 복사 완료!');
                } else {
                    throw new Error('execCommand returned false');
                }
            } catch (fallbackErr) {
                const fallbackErrMsg = fallbackErr && fallbackErr.message ? fallbackErr.message : String(fallbackErr);
                console.error('MakeHyperlink: 모든 복사 시도 실패', fallbackErrMsg);
                
                let errorDisplay = `1: ${firstErrMsg} | 2: ${fallbackErrMsg}`;
                if (errorDisplay.length > 70) {
                    errorDisplay = errorDisplay.substring(0, 67) + '...';
                }
                showToast(`복사 실패: ${errorDisplay}`, true);
            } finally {
                // 기존 선택 영역 복구
                selection.removeAllRanges();
                originalRanges.forEach(range => selection.addRange(range));
            }
        }
    }

    // 단축키 설정 로드 (기본값: Ctrl + Alt + C)
    let currentShortcut = {
        ctrlKey: true,
        altKey: true,
        shiftKey: false,
        metaKey: false,
        code: 'KeyC'
    };
    let isEnabled = true;

    // 설정값 초기화 및 로드
    function loadSettings() {
        chrome.storage.local.get(['shortcut', 'enabled'], (result) => {
            if (result.shortcut) {
                currentShortcut = result.shortcut;
            }
            // enabled 설정이 없으면 기본값 true 사용
            isEnabled = result.hasOwnProperty('enabled') ? result.enabled : true;
        });
    }

    loadSettings();

    // 스토리지 변경 감지 (팝업에서 변경 시 실시간 반영)
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            if ('shortcut' in changes) {
                currentShortcut = changes.shortcut.newValue;
                console.log('MakeHyperlink: 단축키 변경됨', currentShortcut.display);
            }
            if ('enabled' in changes) {
                isEnabled = changes.enabled.newValue;
                console.log('MakeHyperlink: 활성화 상태 변경됨', isEnabled);
            }
        }
    });

    // 단축키 이벤트 리스너
    window.addEventListener('keydown', (event) => {
        if (!isEnabled) return;

        const isMatch = 
            event.ctrlKey === !!currentShortcut.ctrlKey &&
            event.altKey === !!currentShortcut.altKey &&
            event.shiftKey === !!currentShortcut.shiftKey &&
            event.metaKey === !!currentShortcut.metaKey &&
            event.code === currentShortcut.code;

        if (isMatch) {
            event.preventDefault();
            copyHyperlink();
        }
    });

    // 메시지 리스너 (컨텍스트 메뉴 등으로부터 명령 수신)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "PING") {
            sendResponse({ status: "ALIVE" });
            return true;
        }
        
        if (request.action === "COPY_LINK") {
            copyHyperlink().then(() => {
                sendResponse({ status: "SUCCESS" });
            }).catch(err => {
                sendResponse({ status: "ERROR", message: err.message });
            });
            return true; // 비동기 응답을 위해 true 반환
        }
    });

    console.log('MakeHyperlink: 확장이 로드되었습니다. (Ctrl+Alt+C)');
})();
