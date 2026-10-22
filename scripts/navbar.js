document.addEventListener("DOMContentLoaded", function () {
    if (new URLSearchParams(window.location.search).get("embedded") === "1") {
        document.getElementById("navbar-container").hidden = true;
        document.body.style.paddingTop = "0";
        return;
    }

    let basePath = window.location.pathname.includes("/app/") ? "../" : "";

    // Define the navbar HTML directly in JS (avoids fetching delays)
    const navbarHTML = `
    <nav class="navbar">
        <a href="${basePath}index.html" class="nav-link">CAN Log Plotter</a>
        <a href="${basePath}shortcuts.html" class="nav-link">Shortcuts</a>
    </nav>
    `;

    // Inject the navbar instantly
    document.getElementById("navbar-container").innerHTML = navbarHTML;
});