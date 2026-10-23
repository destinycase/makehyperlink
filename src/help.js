document.addEventListener("DOMContentLoaded", () => {
    const dialog = document.getElementById("help-dialog");
    const open = document.getElementById("help-open");
    const close = document.getElementById("help-close");

    open.addEventListener("click", () => {
        if (!dialog.open) dialog.showModal();
    });
    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => open.focus());
    // Native modal dialog handles Escape, focus trapping and background inertness.
});
