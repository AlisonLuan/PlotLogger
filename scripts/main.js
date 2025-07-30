import databaseHandler from "./main-db-loader.js";

import {buildUnifiedLog, parseFileLOG, isLogLoaded, resetLog, log} from "./main-log-loader.js";

import {downloadTracesAsCSV} from "./csv-export.js";

import {extractRawValue} from "./helper.js";

import {handleFilterOptionsScroll} from "./sidebar-main.js";
import {populateCheckboxGroup} from "./sidebar-main.js";
import {populateSignals} from "./sidebar-main.js";

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

function findMessageInDatabaseByName(name) {
    const db = databaseHandler.getDatabase();
    if (!db) return null;
    return db.messages.find(msg => msg.name === name) || null;
 }

/* Helpers to find messages/signals in the database */
function findMessageInDatabaseById(hexId) {
    const db = databaseHandler.getDatabase();
    if (!db) return null;
    return db.messages.find(msg =>
      parseInt(msg.id, 16) === parseInt(hexId, 16)
    ) || null;
 }

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
        const files = event.dataTransfer.files;
        const file = files[0];
        const allowedExtensions = ['.dbc', '.sym'];
        const fileExtension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

        if (!allowedExtensions.includes(fileExtension)) {
            console.error("Invalid file type. Only .dbc and .sym are allowed.");
            showToast("A database must have the sym or dbc extension!");
            dropText.textContent = "Load your Database here.";
            databaseDropArea.classList.remove("active");
            databaseHandler.resetDatabase();
            resetUI();
            return;
        } else {
        processFile(files);
        }
    }

    async function processFile(files) {
        if (files.length === 0) return;

        const file = files[0]; // Only process the first file
        const allowedExtensions = ['.dbc', '.sym'];
        const fileExtension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

        if (!allowedExtensions.includes(fileExtension)) {
            console.error("Invalid file type. Only .dbc and .sym are allowed.");
            showToast("A database must have the sym or dbc extension!");
            dropText.textContent = "Load your Database here.";
            databaseDropArea.classList.remove("active");
            databaseHandler.resetDatabase();
            resetUI();
            return;
        } else {
            // Update the drop zone text with the selected file name and change layout
            dropText.textContent = file.name;
            databaseDropArea.classList.add("active");

            // Step 1: Load the database (file selection + parsing + transformation)
            databaseHandler.resetDatabase(); // Ensure previous data is cleared
            await databaseHandler.loadDatabase(file);

            // Step 2: Check if the database is loaded successfully
            if (databaseHandler.isDatabaseLoaded()) {
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
            }
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
    databaseDropArea.addEventListener("click", () => handleClickInput(databaseInput));
    databaseInput.addEventListener("change", (e) => handleFileSelect(e));
});

/******************** Drop area Log ********************/
document.addEventListener("DOMContentLoaded", () => {
    const logDropArea = document.getElementById("drop-area-log");
    const logInput = document.getElementById("fileInputLog");
    const dropText = document.getElementById("drop-text-log");

    function handleFileDrop(event) {
        event.preventDefault();
        const files = event.dataTransfer.files;
        const file = files[0]; // Only process the first file 
        const allowedExtensions = ['.blf', '.trc', '.asc']; 
        const fileExtension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        
        logDropArea.classList.remove("active");
        if (!allowedExtensions.includes(fileExtension)) {
            console.error("Invalid file type. Only blf, trc and asc files are allowed.");
            showToast("A database must have the blf, trc or asc extension!");
            dropText.textContent = "Load your Log here.";
            document.getElementById("PlotButton").disabled = true;
            resetLog();
            return;
        } else {
        processFile(files);
        }
    }

    async function processFile(files) {
        if (files.length === 0) return;

        const file = files[0]; // Only process the first file

        const allowedExtensions = ['.blf', '.trc', '.asc']; 
        const fileExtension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        
        logDropArea.classList.remove("active");
        if (!allowedExtensions.includes(fileExtension)) {
            console.error("Invalid file type. Only blf, trc and asc files are allowed.");
            showToast("A database must have the blf, trc or asc extension!");
            dropText.textContent = "Load your Log here.";
            document.getElementById("PlotButton").disabled = true;
            resetLog();
            return;
        } else {
            dropText.textContent = "Loading File...";

            // Step 2: Parse the file content
            const parsedData = await parseFileLOG(file);

            // Step 3: Load the global log in unified JSON format
            buildUnifiedLog(parsedData);

            if(isLogLoaded()){
                // Update the drop zone text with the selected file name and change layout
                dropText.textContent = file.name;
                logDropArea.classList.add("active");

                if(databaseHandler.isDatabaseLoaded()){
                    // Enable the "Generate Plot" button
                    document.getElementById("PlotButton").disabled = false;
                }
            }
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
    logDropArea.addEventListener("click", () => handleClickInput(logInput));
    logInput.addEventListener("change", (e) => handleFileSelect(e));
});

/******************** Plot listener ********************/
// Update plot according to changes in configuration sidebar
function addConfigListeners() {
    // Add listener for mode selection
    document.querySelectorAll('.line-mode').forEach(selector => {
        selector.addEventListener('change', updatePlot);
    });

    // Add listener for line width change
    document.querySelectorAll('.line-width').forEach(slider => {
        slider.addEventListener('input', function (event) {
            const lineWidthValue = event.target.value;
            event.target.previousElementSibling.querySelector('.line-width-value').textContent = lineWidthValue;
            updatePlot();
        });
    });

    // Add listener for marker size change
    document.querySelectorAll('.marker-size').forEach(slider => {
        slider.addEventListener('input', function (event) {
            const markerSizeValue = event.target.value;
            const markerSizeSpan = event.target.parentNode.querySelector('.marker-size-value');
            if (markerSizeSpan) {
                markerSizeSpan.textContent = markerSizeValue;
            }
            updatePlot();
        });
    });

    // Add listener for color swatch click
    document.querySelectorAll('.color-palette').forEach(palette => {
        palette.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.addEventListener('click', function (event) {
                // Remove the 'selected' class from all swatches within the current palette
                palette.querySelectorAll('.color-swatch').forEach(s => {
                    s.classList.remove('selected');
                });

                // Add the 'selected' class to the clicked swatch
                swatch.classList.add('selected');

                const selectedColor = event.target.getAttribute('data-color');
                const index = event.target.closest('.color-palette').getAttribute('data-index');

                // Update the trace color directly in Plotly
                //const traces = Plotly.d3.select('#plot').node().data;
                const traces = document.querySelector('#plot').data;

                const trace = traces[index];

                // Ensure trace.line exists before setting color
                if (!trace.line) {
                    trace.line = {}; // Initialize line object if it doesn't exist
                }
                trace.line.color = selectedColor;
                
                // Update marker color as well if it's used
                if (!trace.marker) {
                    trace.marker = {}; // Initialize marker object if it doesn't exist
                }
                trace.marker.color = selectedColor;

                // Update signal name color to match trace color
                /*const signalNameElement = document.querySelector(`.signal-name[data-index="${index}"]`);
                if (signalNameElement) {
                    signalNameElement.style.color = color;
                }*/

                updatePlot();
            });
        });
    });

    document.querySelectorAll(".y-axis-selector").forEach(select => {
        select.addEventListener("change", event => {
            const index = event.target.dataset.index;
            const selIndex = event.target.selectedIndex;
            const newYAxis = selIndex === 0 ? "y" : `y${selIndex + 1}`; //y, y2, y3 are used in the trace
            //const axisKey = selIndex === 0 ? "yaxis" : `yaxis${selIndex + 1}`; //yaxis, yaxis2, yaxis3 are used in the layout

            // Update the trace's yaxis property
            plotData.traces[index].yaxis = newYAxis;
            
            manageMainYaxis();

            console.log("Updated plotLayout:", plotLayout);

            updatePlot();
        });
    });

    
    document.querySelectorAll(".subplot-selector").forEach(select => {
        select.addEventListener("change", event => {
            const index = event.target.dataset.index;
            const selectedValue = event.target.value; // e.g., "sp1", "sp2"
              
            // 1) Locate the .y-axis-selector for this trace and enable/disable
            const yAxisSelect = document.querySelector(`.y-axis-selector[data-index="${index}"]`);
            yAxisSelect.value = "y1";
            if (yAxisSelect) {
                if (selectedValue === "sp1") {
                    yAxisSelect.disabled = false;  // Re-enable Y-Axis dropdown
                } else {
                    yAxisSelect.disabled = true;   // Disable Y-Axis dropdown if sp2..sp5
                }
            }

            // 2) Update subplot statuses, layout, and re-plot
            updateActiveSubplotsStatus();

            // 3) Switch-case to set the yaxis property
            switch (selectedValue) {
                case "sp1":
                    plotData.traces[index].yaxis = "y";
                    break;
                case "sp2":
                    plotData.traces[index].yaxis = "y20";
                    break;
                case "sp3":
                    plotData.traces[index].yaxis = "y30";
                    break;
                case "sp4":
                    plotData.traces[index].yaxis = "y40";
                    break;
                case "sp5":
                    plotData.traces[index].yaxis = "y50";
                    break;
                default:
                    plotData.traces[index].yaxis = "y";
                    break;
            }

            
            createActiveYAxes();
            updateSubplotLayout(getSelectedSubplots());
            manageMainYaxis();
            updatePlot();
        });
    });
};

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
                    const processedLogs = processSelectedSignals(selectedSignalsA);

                    // Clear any previous traces to generate a fresh plot
                    plotData.clearTraces();

                    // Generate traces based on processed log
                    const traces = generatePlotlyDatasets(processedLogs);

                    // Add the trace to the global plotData
                    plotData.addData(traces); 

                    updateActiveSubplotsStatus();
                    resetSubplotLayout();
                    generatePlot();

                    populateAxisFields();
                    updateAxisFieldsState();

                    addConfigListeners();

                } catch (error) {
                    console.error("Error during plot process:", error);
                }
            });
        }
    });

/**
 * Extracts the names of selected signals from the checkbox-signals container.
 * @returns {Array<string>} - Array of selected signal names (no parentheses).
 */
function getSelectedSignals() {
    const checkboxes = document.querySelectorAll(
        '#checkbox-signals .checkbox-group input[type="checkbox"]:checked'
    );
    return Array.from(checkboxes).map((checkbox) => {
        // "Speed (Engine)" => ["Speed", "Engine)"]
        return checkbox.value.split(' (')[0];
    });
}

function toSigned(value, bitLength) {
    let signBit = 1 << (bitLength - 1);
    return (value & (signBit - 1)) - (value & signBit);
}

/**
 * Processes the log to extract values for selected signals,
 * including honoring mux‐field filters for multiplexed children.
 * @param {Array<string>} selectedSignals - List of selected signal names.
 */
function processSelectedSignals(selectedSignals) {
  const processedLogs = {};

  selectedSignals.forEach(signalName => {
    const dbSig = findSignalInDatabase(signalName);
    if (!dbSig) {
      console.warn(`Signal "${signalName}" not found.`);
      return;
    }

    // Pre‐compute: is this a multiplexed child?
    const isChild = Boolean(dbSig.isMultiplexed);

    // Filter on message ID
    const filtered = log.filter(msg =>
      parseInt(msg.id, 16) === parseInt(dbSig.messageId, 16)
    ).filter(msg => {
      if (!isChild) return true;
      // extract mux raw first:
      const muxRaw = extractRawValue(
        msg.data,
        dbSig.multiplexerStartBit,
        dbSig.multiplexerLength,
        dbSig.multiplexerByteOrder
      );
      return muxRaw === dbSig.multiplexerValue;
    });

    // Build time‐series
    const series = filtered.map(msg => {
      let raw = extractRawValue(
        msg.data,
        dbSig.startBit, dbSig.length, dbSig.byteOrder
      );
      if (dbSig.valueType === "Signed") {
        raw = toSigned(raw, dbSig.length);
      }
      const scaled = raw * dbSig.scaling + dbSig.offset;
      return { timestamp: msg.timestamp, value: scaled };
    });

    processedLogs[signalName] = {
      data: series,
      unit: sanitizeUnit(dbSig.unit || "")
    };
  });

  return processedLogs;
}

/**
 * Finds a signal in the database by its name, including multiplex info.
 * @param {string} signalName - Name of the signal.
 * @returns {Object|null} - Signal object with messageId and properties, or null if not found.
 */
function findSignalInDatabase(signalName) {
  const db = databaseHandler.getDatabase();
  for (const message of db.messages) {
    for (const signal of message.signals) {
      if (signal.name === signalName) {
        // base info
        const res = {
          messageId: message.id,
          startBit:  signal.startBit,
          length:    signal.length,
          byteOrder: signal.byteOrder,
          scaling:   signal.scaling,
          offset:    signal.offset,
          valueType: signal.valueType,
          unit:      signal.units,
          description: signal.description || ""
        };

        // regular value‐to‐text map (for mux signals)
        if (signal.isMultiplexer) {
          res.isMultiplexer = true;
          res.valueDescriptions = { ...signal.valueDescriptions };
        }

        // multiplexed‐child metadata
        if (signal.isMultiplexed) {
          res.isMultiplexed        = true;
          res.multiplexerValue     = signal.multiplexerValue;
          res.multiplexerStartBit  = signal.multiplexerStartBit;
          res.multiplexerLength    = signal.multiplexerLength;
          res.multiplexerByteOrder = signal.multiplexerByteOrder;
        }

        return res;
      }
    }
  }

  return null; // not found
}

// Make these helper functions available globally:
window.findMessageInDatabaseById = findMessageInDatabaseById;
window.findMessageInDatabaseByName = findMessageInDatabaseByName;
window.findSignalInDatabase = findSignalInDatabase;

/******************** Plot Container ********************/
/*window.addEventListener('resize', () => {
    //Plotly.Plots.resize('plot'); // Resizes the Plotly chart
});*/


function sanitizeUnit(unit) {
    if (!unit) return ""; // Return empty if no unit is provided

    // Remove non-ASCII characters and keep only alphanumeric, common symbols
    return unit.replace(/[^\x20-\x7E°Ωμ]/g, "").trim();
}

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

function resetUI() {
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

// Helper function to format a timestamp (in ms) into a local date string 
// matching the "YYYY-MM-DD HH:mm:ss.sss" format.
function formatDateLocal(ts) {
    let d = new Date(ts);
    let year = d.getFullYear();
    let month = ('0' + (d.getMonth() + 1)).slice(-2);
    let day = ('0' + d.getDate()).slice(-2);
    let hours = ('0' + d.getHours()).slice(-2);
    let minutes = ('0' + d.getMinutes()).slice(-2);
    let seconds = ('0' + d.getSeconds()).slice(-2);
    let ms = d.getMilliseconds().toString().padStart(3, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
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

        // Convert date strings to timestamps (milliseconds)
        let xMin = new Date(currentXRange[0]).getTime();
        let xMax = new Date(currentXRange[1]).getTime();
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

        // Convert timestamps back to local date strings
        let newXRange = [formatDateLocal(newXMin), formatDateLocal(newXMax)];

        // Update Plotly layout: disable autorange and apply the new x-axis range
        Plotly.relayout(plotDiv, {
            "xaxis.autorange": false,
            "xaxis.range": newXRange
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
        
        // Update immediately when using up/down buttons
        inputField.addEventListener('input', function (event) {
            let value = event.target.value.replace(',', '.'); // Replace comma with dot
            let parsedValue = parseFloat(value);
        
            if (!isNaN(parsedValue)) {
                event.target.value = parsedValue % 1 === 0 ? parsedValue : parsedValue.toFixed(3).replace(/\.?0+$/, '');
                updateAxisRange(axisMappings[fieldId], fieldId.includes("min") ? "min" : "max", parsedValue);
            }
        });
        }
    });
});