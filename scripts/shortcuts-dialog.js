(function () {
    const dialog = document.getElementById("shortcutsDialog");
    const frame = document.getElementById("shortcutsFrame");
    const error = document.getElementById("shortcutsError");
    const link = document.getElementById("shortcutsLink");
    if (!dialog || !frame || !link) return;

    const BLANK = "about:blank";
    let loading = false;

    link.addEventListener("click", event => {
        // Keep native behaviour for new-tab / new-window clicks
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        error.hidden = true;
        loading = true;
        frame.src = "shortcuts.html?embedded=1";
        dialog.showModal();
    });

    frame.addEventListener("load", () => {
        if (!loading) return;
        loading = false;
        try {
            // Same-origin pages expose a document; a failed load yields an empty/error page
            const doc = frame.contentDocument;
            if (doc && !doc.querySelector(".features-container")) error.hidden = false;
        } catch (e) {
            error.hidden = false;
        }
    });

    document.getElementById("closeShortcuts").addEventListener("click", () => dialog.close());

    // Click on the backdrop (the dialog element itself) closes it
    dialog.addEventListener("click", event => {
        if (event.target === dialog) dialog.close();
    });

    // Unload the iframe document to release its memory
    dialog.addEventListener("close", () => {
        loading = false;
        frame.src = BLANK;
    });
})();
