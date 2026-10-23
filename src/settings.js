document.addEventListener("DOMContentLoaded", () => {
    const dialog = document.getElementById("settings-dialog");
    const open = document.getElementById("settings-open");
    const close = document.getElementById("settings-close");
    const language = document.getElementById("language-select");
    const status = document.getElementById("settings-status");
    open.addEventListener("click", () => {
        language.value = MH.language;
        if (!dialog.open) dialog.showModal();
    });
    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => open.focus());
    MH.subscribe((value) => { language.value = value; });
    language.addEventListener("change", () => {
        const previous = MH.language;
        language.disabled = true;
        chrome.storage.local.set({ language: language.value }, () => {
            language.disabled = false;
            if (chrome.runtime.lastError) {
                language.value = previous;
                status.textContent = MH.t("설정을 저장하지 못했습니다");
                return;
            }
            status.textContent = "";
            MH.apply(language.value);
        });
    });
});
