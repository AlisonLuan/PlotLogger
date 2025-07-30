// Global scope of elements
const sidebar = document.querySelector('.sidebar');
const content = document.querySelector('.content');
const container = document.querySelector('.container');

// Define the sidebar configurations
const sidebarConfigurations = {
    main: 'mainConfig',
    brush: 'brushConfig',
    gear: 'gearConfig',
    export: 'exportConfig'
};

function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
    if (sidebar.classList.contains('collapsed')) {
        arrowButton.textContent = '→';
        arrowButton.title = 'Expand Sidebar';
        content.style.width = `100%`;
    } else {
        arrowButton.textContent = '←';
        arrowButton.title = 'Collapse Sidebar';
        const sidebarWidth = sidebar.getBoundingClientRect().width; // Get current sidebar width
        content.style.width = `calc(100% - ${sidebarWidth}px)`; // Adjust content width dynamically
    }
    Plotly.Plots.resize('plot');
}

// Function to toggle between different sidebar configurations
function toggleSidebarContent(configType) {
    // Hide all sidebar contents first
    const allConfigContents = document.querySelectorAll('.sidebar-content');
    allConfigContents.forEach(content => {
        content.classList.remove('active');
    });

    // Show the requested configuration
    const configToShow = sidebarConfigurations[configType];
    const contentToShow = document.getElementById(configToShow);
    if (contentToShow) {
        contentToShow.classList.add('active');
    }
}



/******************** Resize Sidebar  ********************/
let isResizing = false;
let throttleTimeout = null;

// Listen for the window resize event
window.addEventListener('resize', adjustSidebarOnResize);

function adjustSidebarOnResize() {
    // Ensure the sidebar stays proportional to the container
    const containerWidth = container.offsetWidth;
    const sidebarWidth = sidebar.offsetWidth;
    const sidebarRatio = sidebarWidth / containerWidth;

    const newSidebarWidth = containerWidth * sidebarRatio;
    const minWidth = 200; // Minimum sidebar width
    const maxWidth = 600; // Maximum sidebar width

    if (newSidebarWidth >= minWidth && newSidebarWidth <= maxWidth) {
        sidebar.style.width = `${newSidebarWidth}px`; // Adjust sidebar width
        content.style.width = `calc(100% - ${newSidebarWidth}px)`; // Adjust content width
    }
}

// Existing resizing logic for manual adjustment
const resizeHandle = document.getElementById('resizeHandle');
resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none'; // Disable text selection
    document.addEventListener('mousemove', throttledResizeSidebar);
    document.addEventListener('mouseup', stopResize);
});

function throttledResizeSidebar(e) {
    if (!throttleTimeout) {
        throttleTimeout = setTimeout(() => {
            resizeSidebar(e);
            throttleTimeout = null; // Reset the timeout
        }, 16); // ~60fps (16ms interval)
    }
}

function resizeSidebar(e) {
    if (!isResizing) return;

    const containerOffset = container.getBoundingClientRect().left;
    const newWidth = e.clientX - containerOffset;

    const minWidth = 200;
    const maxWidth = 600;

    if (newWidth >= minWidth && newWidth <= maxWidth) {
        sidebar.style.width = `${newWidth}px`;
        content.style.width = `calc(100% - ${newWidth}px)`;
    }
}

function stopResize() {
    isResizing = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = ''; // Re-enable text selection
    document.removeEventListener('mousemove', throttledResizeSidebar);
    document.removeEventListener('mouseup', stopResize);
}