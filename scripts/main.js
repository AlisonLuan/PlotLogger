import databaseHandler from "./main-db-loader.js";

import {buildUnifiedLog, parseFileLOG, isLogLoaded, resetLog, log} from "./main-log-loader.js";

import {downloadTracesAsCSV} from "./csv-export.js";

import {processSelectedSignals as decodeSelectedSignals} from "./signal-decoder.js";

import {handleFilterOptionsScroll, clearSelectedSignals} from "./sidebar-main.js";
import {populateCheckboxGroup} from "./sidebar-main.js";
import {populateSignals} from "./sidebar-main.js";

let databaseLoadGeneration = 0;
let logLoadGeneration = 0;

function clearCurrentPlot() {
    plotData.clearTraces();
    resetDeltaCursor();
    const plotElement = document.getElementById("plot");
    if (plotElement) Plotly.purge(plotElement);
    const emptyState = document.getElementById("plot-empty-state");
    if (emptyState) emptyState.hidden = false;
    const configurations = document.getElementById("lineConfigurations");
    if (configurations) {
        configurations.innerHTML = "<p>Customization options will be shown once a plot has been generated.</p>";
    }
}

/* Helper: Show/hide tooltip at mouse position */
window.showTooltip = function (event, text) {
    // Check if text is empty or only whitespace
    if (!text || text.trim() === "") {
        return;
    }
    const tooltip = document.getElementById("custom-tooltip");
    tooltip.style.display = "block";
    tooltip.textContent = text;
    tooltip.style.left = (event.pageX + 10) + "px";
    tooltip.style.top = (event.pageY + 10) + "px";
};

window.hideTooltip = function () {
    const tooltip = document.getElementById("custom-tooltip");
    tooltip.style.display = "none";
 };

/************ Permanent Sidebar arrowButton *****************/
document.addEventListener('DOMContentLoaded', function () {
    const arrowButton = document.getElementById('arrowButton');
    arrowButton.addEventListener('click', toggleSidebar);
    /*window.addEventListener('resize', () => {
        //Plotly.Plots.resize('plot');
    });*/
});

/******************** Drop area Database ********************/
document.addEventListener("DOMContentLoaded", () => {
    const databaseDropArea = document.getElementById("drop-area");
    const databaseInput = document.getElementById("fileInput");
    const dropText = document.getElementById("drop-text");

    function handleFileDrop(event) {
        event.preventDefault();
        processFile(event.dataTransfer.files);
    }

    async function processFile(files) {
        if (files.length === 0) return;
        const generation = ++databaseLoadGeneration;
        const file = files[0];
        document.getElementById("PlotButton").disabled = true;
        clearCurrentPlot();
        databaseHandler.resetDatabase();
        clearSelectedSignals();
        resetUI();
        dropText.textContent = "Loading Database...";
        databaseDropArea.classList.remove("active");
        try {
            if (!['.dbc', '.sym'].includes(file.name.slice(file.name.lastIndexOf('.')).toLowerCase())) {
                throw new Error("Only .dbc and .sym database files are supported.");
            }
            await databaseHandler.loadDatabase(file, () => generation === databaseLoadGeneration);
            if (generation !== databaseLoadGeneration) return;
            if (!databaseHandler.isDatabaseLoaded()) {
                throw new Error("The selected database contains no messages.");
            }
            dropText.textContent = file.name;
            databaseDropArea.classList.add("active");
                console.log("Database loaded:", databaseHandler.getDatabase());
                databaseHandler.extractDropdownContent(); // Update dropdowns
                const dropdownContent = databaseHandler.getDropdownContent();
                document.getElementById("filterOptions").value = "filterByName";


                populateCheckboxGroup("filterByName", dropdownContent); // Populate the checkbox group
                
                const database = databaseHandler.getDatabase();

                populateSignals(database); // Update UI elements

                // Step 3: Enable the "Generate Plot" button if the log is also loaded
                if (isLogLoaded()) {
                    document.getElementById("PlotButton").disabled = false;
                }
        } catch (error) {
            console.error("Error loading database:", error);
            if (generation === databaseLoadGeneration) {
                databaseHandler.resetDatabase();
                resetUI();
                dropText.textContent = "Load your Database here.";
                databaseDropArea.classList.remove("active");
                showToast(`Could not load database: ${error.message}`);
            }
        } finally {
            const input = document.getElementById("fileInput");
            if (input && generation === databaseLoadGeneration) input.value = "";
        }
    }

    function handleClickInput(inputElement) {
        inputElement.click();
    }

    function handleFileSelect(event) {
        processFile(event.target.files);
    }

    // Event listeners for Database Drop Area
    databaseDropArea.addEventListener("dragover", (e) => e.preventDefault());
    databaseDropArea.addEventListener("drop", (e) => handleFileDrop(e));
    databaseDropArea.addEventListener("click", event => {
        if (event.target !== databaseInput) handleClickInput(databaseInput);
    });
    databaseInput.addEventListener("change", (e) => handleFileSelect(e));
});

/******************** Drop area Log ********************/
document.addEventListener("DOMContentLoaded", () => {
    const logDropArea = document.getElementById("drop-area-log");
    const logInput = document.getElementById("fileInputLog");
    const dropText = document.getElementById("drop-text-log");

    function handleFileDrop(event) {
        event.preventDefault();
        processFile(event.dataTransfer.files);
    }

    async function processFile(files) {
        if (files.length === 0) return;

        const generation = ++logLoadGeneration;
        const file = files[0];
        document.getElementById("PlotButton").disabled = true;
        clearCurrentPlot();
        resetLog();
        logDropArea.classList.remove("active");
        dropText.textContent = "Loading File...";
        try {
            if (!['.blf', '.trc', '.asc'].includes(file.name.slice(file.name.lastIndexOf('.')).toLowerCase())) {
                throw new Error("Only .blf, .trc and .asc log files are supported.");
            }
            const parsedData = await parseFileLOG(file);
            if (generation !== logLoadGeneration) return;
            if (!Array.isArray(parsedData) || parsedData.length === 0) {
                throw new Error("The selected log contains no CAN messages.");
            }
            const skippedMessages = buildUnifiedLog(parsedData);
            if (skippedMessages > 0) {
                showToast(`Skipped ${skippedMessages} invalid CAN message(s).`);
            }
                // Update the drop zone text with the selected file name and change layout
                dropText.textContent = file.name;
                logDropArea.classList.add("active");

                if(databaseHandler.isDatabaseLoaded()){
                    // Enable the "Generate Plot" button
                    document.getElementById("PlotButton").disabled = false;
                }
        } catch (error) {
            console.error("Error loading log:", error);
            if (generation === logLoadGeneration) {
                resetLog();
                dropText.textContent = "Load your Log here.";
                logDropArea.classList.remove("active");
                document.getElementById("PlotButton").disabled = true;
                showToast(`Could not load log: ${error.message}`);
            }
        } finally {
            const input = document.getElementById("fileInputLog");
            if (input && generation === logLoadGeneration) input.value = "";
        }
    }

    function handleClickInput(inputElement) {
        inputElement.click();
    }

    function handleFileSelect(event) {
        processFile(event.target.files);
    }

    // Event listeners for Database Drop Area
    logDropArea.addEventListener("dragover", (e) => e.preventDefault());
    logDropArea.addEventListener("drop", (e) => handleFileDrop(e));
    logDropArea.addEventListener("click", event => {
        if (event.target !== logInput) handleClickInput(logInput);
    });
    logInput.addEventListener("change", (e) => handleFileSelect(e));
});

/******************** Plot listener ********************/
// Update plot according to changes in configuration sidebar
function addConfigListeners() {
    const container = document.getElementById('lineConfigurations');
    if (!container || container.dataset.listenersBound) return;
    container.dataset.listenersBound = 'true';

    container.addEventListener('input', event => {
        const target = event.target;
        if (target.matches('.line-width')) {
            target.closest('.group-container').querySelector('.line-width-value').textContent = target.value;
            updatePlot();
        } else if (target.matches('.marker-size')) {
            target.closest('.group-container').querySelector('.marker-size-value').textContent = target.value;
            updatePlot();
        }
    });

    container.addEventListener('click', event => {
        const swatch = event.target.closest('.color-swatch');
        if (!swatch) return;
        const palette = swatch.closest('.color-palette');
        palette.querySelectorAll('.color-swatch').forEach(item => item.classList.toggle('selected', item === swatch));
        const trace = document.querySelector('#plot').data[Number(palette.dataset.index)];
        trace.line = { ...trace.line, color: swatch.dataset.color };
        trace.marker = { ...trace.marker, color: swatch.dataset.color };
        updatePlot();
    });

    container.addEventListener('change', event => {
        const target = event.target;
        if (target.matches('.line-mode')) {
            updatePlot();
        } else if (target.matches('.y-axis-selector')) {
            const index = Number(target.dataset.index);
            plotData.traces[index].yaxis = target.value === 'y1' ? 'y' : target.value;
            manageMainYaxis();
            updatePlot();
        } else if (target.matches('.subplot-selector')) {
            const index = Number(target.dataset.index);
            const yAxisSelect = container.querySelector(`.y-axis-selector[data-index="${index}"]`);
            yAxisSelect.disabled = target.value !== 'sp1';
            if (target.value !== 'sp1') yAxisSelect.value = 'y1';
            plotData.traces[index].yaxis = target.value === 'sp1' ? 'y' : `y${target.value.slice(2)}0`;
            updateActiveSubplotsStatus();
            createActiveYAxes();
            updateSubplotLayout(getSelectedSubplots());
            manageMainYaxis();
            updatePlot();
        }
    });
}

/******************** Droplist Filter Options Scroll ********************/
document.addEventListener('DOMContentLoaded', function () {
    const filterOptions = document.getElementById("filterOptions");
    filterOptions.addEventListener("wheel", handleFilterOptionsScroll);
});

/******************** Checkbox Sources ********************/
// Event listener for the dropdown selection change
document.getElementById('filterOptions').addEventListener('change', function () {
    populateCheckboxGroup(this.value,databaseHandler.getDropdownContent());
});

/******************** Checkbox Signals ********************/
// Event listener for changes in the checkbox-sources
document.querySelector('#checkbox-sources .checkbox-group').addEventListener('change', function (event) {
    if (event.target.tagName === 'INPUT' && event.target.type === 'checkbox') {
        const database = databaseHandler.getDatabase();
        populateSignals(database);
    }
});

/******************** Button Plot ********************/
/**
 * Processes all selected checkboxes within the container checkbox-signals, 
 * generates a Plotly trace for each selected signal, and adds the traces to the global plotData. 
 * This function is triggered when the "PlotButton" is clicked.
 */

document.addEventListener("DOMContentLoaded", () => {
    const PlotBtn = document.getElementById("PlotButton");
        if (PlotBtn) {
            PlotBtn.addEventListener("click", async () => {
                try {
                    // Get the checkbox container
                    const checkboxContainer = document.getElementById('checkbox-signals');

                    // Check if the container exists
                    if (!checkboxContainer) {
                        console.error("Checkbox container with ID 'checkbox-signals' not found.");
                        return;
                    }

                    // Get all checked checkboxes within the container
                    const selectedCheckboxes = Array.from(
                        checkboxContainer.querySelectorAll('input[type="checkbox"]:checked')
                    );

                    if (selectedCheckboxes.length === 0) {
                        console.warn("No signals selected for trace generation.");
                        showToast("No signals selected for trace generation");
                        return;
                    }

                    // Get signals selected in the checkbox
                    const selectedSignalsA = getSelectedSignals();

                    // sort and convert log based on signals selected
                    const processedLogs = decodeSelectedSignals(
                        selectedSignalsA,
                        log,
                        databaseHandler.getDatabase()
                    );

                    // Generate traces based on processed log
                    const traces = generatePlotlyDatasets(processedLogs);
                    if (traces.length === 0) {
                        showToast("No matching log data found for the selected signals.");
                        return;
                    }

                    // Add the trace to the global plotData
                    plotData.clearTraces();
                    plotData.addData(traces); 

                    plotData.activeSubplots.sp1 = true;
                    ["sp2", "sp3", "sp4", "sp5"].forEach(subplot => {
                        plotData.activeSubplots[subplot] = false;
                    });
                    resetSubplotLayout();
                    await generatePlot();

                    populateAxisFields();
                    updateAxisFieldsState();

                    addConfigListeners();

                } catch (error) {
                    console.error("Error during plot process:", error);
                    showToast(`Could not generate plot: ${error.message}`);
                }
            });
        }
    });

/**
 * Extracts selected signals with their message identity.
 * @returns {{signalName: string, messageId: string}[]}
 */
function getSelectedSignals() {
    const checkboxes = document.querySelectorAll(
        '#checkbox-signals .checkbox-group input[type="checkbox"]:checked'
    );
    return Array.from(checkboxes, checkbox => ({
        signalName: checkbox.dataset.signalName,
        messageId: checkbox.dataset.messageId
    }));
}

/******************** Plot Container ********************/
/*window.addEventListener('resize', () => {
    //Plotly.Plots.resize('plot'); // Resizes the Plotly chart
});*/


function showToast(message) {
    const toastContainer = document.getElementById("toast-container");

    // Create toast element
    const toast = document.createElement("div");
    toast.classList.add("toast");
    toast.textContent = message;

    // Append toast to container
    toastContainer.appendChild(toast);

    // Show the toast with animation
    setTimeout(() => {
        toast.classList.add("show");
    }, 10);

    // Remove toast after 3 seconds
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
window.showToast = showToast;

function resetUI() {
    clearSelectedSignals();
    // Reset the dropdown to "No Filter"
    document.getElementById("filterOptions").value = "noFilter";

    // Clear checkboxes inside "checkbox-sources" and "checkbox-signals"
    document.querySelector("#checkbox-sources .checkbox-group").innerHTML = "<p>Apply a filter to see the sources.</p>";
    document.querySelector("#checkbox-signals .checkbox-group").innerHTML = "<p>Select a source to see the signals.</p>";

    // Disable the "Generate Plot" button
    document.getElementById("PlotButton").disabled = true;

    // Reset the "lineConfigurations" text
    document.getElementById("lineConfigurations").innerHTML = `
        <p>Customization options will be shown once a plot has been generated.</p>
    `;
}

// Attach the wheel event listener to the Plotly chart container
document.getElementById("plot").addEventListener("wheel", function(event) {
    event.preventDefault(); // Prevent default page scroll behavior

    const plotDiv = document.getElementById("plot");
    // Check if plotDiv is initialized with layout and data
    if (!plotDiv || !plotDiv.layout || !plotDiv.data || !plotDiv.layout.xaxis) {
        // Exit early if the plot isn't available yet
        return;
    }

    const zoomFactor = 0.05; // 5% zoom step

    // ---- X-Axis Zoom (Ctrl + Scroll or General Scroll) ----
    if (!event.shiftKey) {
        // Get current x-axis range from Plotly layout, falling back to the first trace's range if needed.
        let currentXRange = plotDiv.layout.xaxis.range || [
            plotDiv.data[0].x[0],
            plotDiv.data[0].x[plotDiv.data[0].x.length - 1]
        ];

        const hasNumericTime = typeof currentXRange[0] === "number";
        let xMin = hasNumericTime ? currentXRange[0] : new Date(currentXRange[0]).getTime();
        let xMax = hasNumericTime ? currentXRange[1] : new Date(currentXRange[1]).getTime();
        let rangeWidth = xMax - xMin;

        // Determine zoom step (5% of the current range)
        let zoomStep = rangeWidth * zoomFactor;
        let direction = event.deltaY < 0 ? 1 : -1; // Scroll up: zoom in, Scroll down: zoom out

        // Calculate new boundaries by shifting the edges
        let newXMin = xMin + direction * zoomStep;
        let newXMax = xMax - direction * zoomStep;

        // Adjust for symmetry: recalc center and use half the new range on each side
        let center = (xMin + xMax) / 2;
        let halfNewRange = (newXMax - newXMin) / 2;
        newXMin = center - halfNewRange;
        newXMax = center + halfNewRange;

        // Update Plotly layout: disable autorange and apply the new x-axis range
        Plotly.relayout(plotDiv, {
            "xaxis.autorange": false,
            "xaxis.range": [newXMin, newXMax]
        });
    }

    // ---- Y-Axis Zoom (Scroll or Shift+Scroll) ----
    // Only execute if ctrlKey is not pressed (or modify as needed)
    if (!event.ctrlKey) {
        // Get the bounding rectangle of the plot container
        // Calculate the mouse Y position relative to the container (normalized between 0 and 1)
        //const rect = plotDiv.getBoundingClientRect();
        //const relativeY = 1 - ((event.clientY - rect.top) / rect.height);
        const rect = plotDiv.getBoundingClientRect();
        const marginTop = plotLayout.margin ? (plotLayout.margin.t || 0) : 100; //FIXME: hardcoded value, margin from top to subplot
        const marginBottom = plotLayout.margin ? (plotLayout.margin.b || 0) : 70; //FIXME: hardcoded value, margin from bottom to subplot
        const effectiveHeight = rect.height - marginTop - marginBottom;
        const adjustedY = event.clientY - rect.top - marginTop;
        const relativeY = 1 - (adjustedY / effectiveHeight);

        // List of all potential y-axes (adjust as needed for your subplots)
        const yAxes = ["yaxis", "yaxis20", "yaxis30", "yaxis40", "yaxis50"];
        
        // Loop over each y-axis and check if the mouse is hovering over its domain
        yAxes.forEach(axisKey => {
            const axisObj = plotLayout[axisKey];
            if (axisObj && axisObj.visible && axisObj.range && axisObj.domain) {
                // If the relativeY is within this axis's domain, apply the zoom
                if (relativeY >= axisObj.domain[0] && relativeY <= axisObj.domain[1]) {
                    const currentYRange = axisObj.range;
                    const yMin = currentYRange[0];
                    const yMax = currentYRange[1];
                    const yRangeWidth = yMax - yMin;
                    const yZoomStep = yRangeWidth * zoomFactor;
                    // Determine zoom direction (scroll up: zoom in, scroll down: zoom out)
                    const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
                    const direction = delta < 0 ? 1 : -1;
                    
                    // Calculate new range boundaries symmetrically
                    let newYMin = yMin + direction * yZoomStep;
                    let newYMax = yMax - direction * yZoomStep;
                    const center = (yMin + yMax) / 2;
                    const halfYRange = (newYMax - newYMin) / 2;
                    newYMin = center - halfYRange;
                    newYMax = center + halfYRange;
                    
                    // Update only the hovered y-axis
                    const updateObj = {};
                    updateObj[axisKey + ".autorange"] = false;
                    updateObj[axisKey + ".range"] = [newYMin, newYMax];
                    Plotly.relayout(plotDiv, updateObj);
                }
            }
        });
    }
});
/*
        updateXAxisProperty("autorange", false); // Disable X-axis autorange
        updateXAxisProperty("range", [
            adjustDateRange(xRange[0], zoomInSeconds),
            adjustDateRange(xRange[1], -zoomInSeconds)

                updatePlot(); // Apply updates to the plot

*/




document.addEventListener("DOMContentLoaded", function () {
    const exportButton = document.getElementById("ExportButton");
    if (exportButton) {
        exportButton.addEventListener("click", function () {
            const traces = plotData.getTraces();
            if (!traces || traces.length === 0) {
                showToast("No traces available. Please plot a graph before exporting.");
                return;
            }
            downloadTracesAsCSV(traces);
        });
    }
});


//******************* Gear Sidebar  ************************//
// Ensure axis fields are initialized as disabled when the script loads
document.addEventListener("DOMContentLoaded", updateAxisFieldsState);
document.addEventListener("DOMContentLoaded", function () {
    // Function to update the axis property
    function updateAxisRange(axis, fieldType, value) {
        if (isNaN(value)) return; // Ignore invalid values
    
        let MinOrMax = fieldType === 'min' ? 0 : 1; // Min corresponds to range[0], Max to range[1]
    
        // Round value to 3 decimal places
        value = parseFloat(value.toFixed(3));
    
        // Update the respective Y-axis property in plotLayout
        updateYAxisProperty(axis, "autorange", false);
        updateYAxisProperty(axis, "range", { index: MinOrMax, value });
    
        console.log(`Updated ${axis}:`, plotLayout[axis]);
    
        updatePlot(); // Redraw the plot
    }

    // Add event listeners for each axis configuration field
    const axisMappings = {
        "y1-min": "yaxis",
        "y1-max": "yaxis",
        "y2-min": "yaxis2",
        "y2-max": "yaxis2",
        "y3-min": "yaxis3",
        "y3-max": "yaxis3"
    };

    Object.keys(axisMappings).forEach(fieldId => {
        const inputField = document.getElementById(fieldId);
        if (inputField) {
            inputField.addEventListener('blur', function (event) {
                updateAxisRange(axisMappings[fieldId], fieldId.includes("min") ? "min" : "max", parseFloat(event.target.value));
            });

            inputField.addEventListener('keydown', function (event) {
                if (event.key === 'Enter') {
                    updateAxisRange(axisMappings[fieldId], fieldId.includes("min") ? "min" : "max", parseFloat(event.target.value));
                }
            });
        
        inputField.addEventListener('change', function (event) {
            const value = event.target.value.replace(',', '.');
            const parsedValue = parseFloat(value);
            if (!isNaN(parsedValue)) {
                updateAxisRange(axisMappings[fieldId], fieldId.includes("min") ? "min" : "max", parsedValue);
            }
        });
        }
    });
});
