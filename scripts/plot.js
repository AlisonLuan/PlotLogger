// Global Storage for data sets ready to be plotted (traces)
const plotData = {
    // Trace is commonly used in Plotly's terminology for a single plotted dataset
    // Multiple data sets are called traces
    traces: [], // Traces is a group of Trace.

    activeSubplots: 
    {
        sp1: true,
        sp1domain: [0, 1],
        sp2: false,
        sp2domain: [0, 1],
        sp3: false,
        sp3domain: [0, 1],
        sp4: false,
        sp4domain: [0, 1],
        sp5: false,
        sp5domain: [0, 1],
    },

    // Clear all traces from the group
    clearTraces() {
        this.traces.length = 0; // Reset the array by setting its length to 0
    },
    
    // Add a data set (trace) to the group
    addData(trace) {
        // If the trace is an array, loop through each trace in the array
        const tracesToAdd = Array.isArray(trace) ? trace : [trace]; // Make sure it's always an array
    
        tracesToAdd.forEach(t => {
            if (t && t.name) {
                this.traces.push(t);
            } else {
                console.error("Invalid trace object. A 'name' property is required.", t);
            }
        });
    },

    // Scan traces and remove the data related to the signal name given
    removeData(signalName) {
        const initialLength = this.traces.length;
        this.traces = this.traces.filter(trace => trace.name !== signalName);
        const removedCount = initialLength - this.traces.length;

        if (removedCount > 0) {
            console.log(`Removed ${removedCount} trace(s) for signal '${signalName}'.`);
        } else {
            console.warn(`No traces found for signal '${signalName}' to remove.`);
        }
    },

    isYAxisInUse(axis) {
        // Check if any trace has the specified yaxis
        return plotData.traces.some(trace => trace.yaxis === axis);
    },

    // Get all traces in the plotData object
    getTraces() {
        return this.traces;
    }
};

const plotLayout = {
    responsive: true,
    //editable: true,    // Enables editing of shapes and annotations
    hovermode: 'x',
    dragmode: 'pan',
    xaxis: 
    { 
        domain: [0.0, 1],
        anchor: 'free',    // do not anchor to a Y-axis domain
        side: 'bottom',    // draw axis along the bottom
        position: 0        // place it at the bottom of the entire figure 
    },
    yaxis: 
    {  
        title: { text: ''}, 
        domain: [0, 1],
        anchor: 'x',
        side: 'left', 
        visible: true, 
        showline: true
    },
    grid: 
    {
        rows: 1,
        columns: 1,
        roworder:'bottom to top'
    },
    annotations: [
        {
            text: 'Y1',
            x: 0,
            y: 1.02,  
            xref: 'paper',
            yref: 'paper',
            xanchor: 'right',
            yanchor: 'bottom',
            showarrow: false,
            visible: true,
            font: { size: 12, color: 'black' },
        },
        {
            text: 'Y2',
            x: 0.07,
            y: 1.02, 
            xref: 'paper',
            yref: 'paper',
            xanchor: 'right',
            yanchor: 'bottom',
            showarrow: false,
            visible: false,
            font: { size: 12, color: 'black' },
        },
        {
            text: 'Y3',
            x: 1,  // Align with y-axis3 tick labels on the right
            y: 1.02,  
            xref: 'paper',
            yref: 'paper',
            xanchor: 'left',
            yanchor: 'bottom',
            showarrow: false,
            visible: false,
            font: { size: 12, color: 'black' },
            align: 'center'
        }
    ]
};

const plotConfiguration = {
    displaylogo: false,
    displayModeBar: true,
    //editable: true,    // Enables editing of shapes and annotations
    responsive: true, // auto resize
    modeBarButtonsToRemove: ['select2d','lasso2d','resetScale2d'],
    modeBarButtonsToAdd: ['toggleHover','hovercompare','hoverclosest',
        {
            name: 'Delta Cursor',
            icon: Plotly.Icons.spikeline,   //https://github.com/plotly/plotly.js/blob/master/src/fonts/ploticon.js
            direction: 'up',
            click: function(gd) {toggleDeltaCursor();}
        }], //https://plotly.com/javascript/reference/layout/#layout-modebar-add
}

function updateYAxisProperty(axisNumber, property, value) {
    // Normalize axisNumber to "", "2", or "3"
    if (typeof axisNumber === "number") {
        axisNumber = axisNumber === 1 ? "" : axisNumber.toString();
    } else if (typeof axisNumber === "string") {
        axisNumber = axisNumber.replace("yaxis", "").replace("y", "");
    }

    const axisKey = `yaxis${axisNumber}`;

    if (!plotLayout[axisKey]) {
        console.warn(`Y-axis ${axisKey} does not exist.`);
        return;
    }

    // Handle "range" property as an array instead of creating "range[0]" or "range[1]"
    if (property === "range") {
        if (!Array.isArray(plotLayout[axisKey].range)) {
            plotLayout[axisKey].range = [null, null]; // Initialize if not present
        }

        const minOrMaxIndex = value.index; // 0 for min, 1 for max
        plotLayout[axisKey].range[minOrMaxIndex] = value.value;
    } else {
        plotLayout[axisKey][property] = value;
    }
}

/*function updateXAxisProperty(property, value) {
    plotLayout.xaxis[property] = value;
}*/

// Example usage:
//updatePlotLayout('yaxis2:visible', true);   // Makes yaxis2 visible
//updatePlotLayout('annotations:2:visible', true);  // Makes annotation 2 visible
//updatePlotLayout('yaxis3:showline', true);   // Ensures yaxis3 line is shown
function updatePlotLayout(propertyPath, newValue) {
    const keys = propertyPath.split(':');
    let obj = plotLayout;

    // Traverse the object to find the correct property
    for (let i = 0; i < keys.length - 1; i++) {
        let key = keys[i];

        // Convert index keys (e.g., annotations:2) into integers for array access
        if (!isNaN(key)) {
            key = parseInt(key);
        }

        // Ensure the key exists
        if (!(key in obj)) {
            console.warn(`Invalid property path: ${propertyPath}`);
            return;
        }

        obj = obj[key]; // Move deeper in the structure
    }

    let finalKey = keys[keys.length - 1];

    // Convert to integer if targeting an array index
    if (!isNaN(finalKey)) {
        finalKey = parseInt(finalKey);
    }

    // Set the new value without overwriting the object
    if (obj.hasOwnProperty(finalKey)) {
        obj[finalKey] = newValue;
    } else {
        console.warn(`Invalid final property: ${finalKey} in ${propertyPath}`);
        return;
    }
}

/**
 * Generate a brand new plot on the given HTML container id "plot" 
 * @param {Object[]} data - An array of Plotly trace objects ready for plotting.
 */
async function generatePlot() {
    const plotElement = document.getElementById('plot');
    if (!plotElement || plotData.traces.length === 0) {
        console.error("No valid data for plotting.");
        showToast("No matching data found for the selected signals.");
        return;
    }

    const displayTraces = plotData.traces.map(trace => {
        const displayTrace = {
            ...trace,
            name: trace.name.length > 45
                ? `${trace.name.substring(0, 30)}...${trace.name.substring(trace.name.length - 10)}`
                : trace.name,
        };
        if (trace.line) displayTrace.line = { ...trace.line };
        if (trace.marker) displayTrace.marker = { ...trace.marker };
        return displayTrace;
    });
    const usesRelativeTime = displayTraces.every(trace => trace.isRelativeTimestamp === true);
    plotLayout.xaxis.type = usesRelativeTime ? "linear" : "date";
    plotLayout.xaxis.title = { text: usesRelativeTime ? "Elapsed time (s)" : "" };
    resetDeltaCursor();
    Plotly.purge(plotElement);
    await Plotly.newPlot(plotElement, displayTraces, plotLayout, plotConfiguration);
    document.getElementById("plot-empty-state").hidden = true;
    clearAnnotationsAndShapes();
    displayConfigurationControls(displayTraces);
}


function updatePlot() {
    const data = [];
    //const traces = Plotly.d3.select('#plot').node().data;
    const traces = document.querySelector('#plot').data;

    // Update each trace based on configuration
    traces.forEach((trace, index) => {
        const mode = document.querySelector(`.line-mode[data-index="${index}"]`).value;
        const width = document.querySelector(`.line-width[data-index="${index}"]`).value;
        const markerSize = document.querySelector(`.marker-size[data-index="${index}"]`).value;

        let color;
        // Check if the trace is a line or scatter (or another type) and retrieve its color accordingly
        if (trace.line) {
            color = trace.line.color;  // Color for line traces
        } else if (trace.marker) {
            color = trace.marker.color;  // Color for scatter traces
        }
        trace.type = "scattergl";
        trace.mode = mode;
        trace.yaxis = plotData.traces[index].yaxis;
        trace.line = { width: parseInt(width), color: color };
        trace.marker = { size: parseInt(markerSize), color: color };

        data.push(trace);
    });

    // Replot the graph with updated configuration
    Plotly.react('plot', data, plotLayout);

    updateAxisFieldsState()
    console.log("plotLayout:", plotLayout);
}

/**
 * Generates a Plotly-ready dataset for a specific signal from appState.rawLog.
 */
function generatePlotlyDatasets(processedLogs) {
    const traces = [];
    processedLogs.forEach(signalData => {
        const signalArray = signalData.data;
        const unit = signalData.unit ? ` (${signalData.unit})` : "";
        if (signalArray.length === 0) {
            console.warn(`No data found for signal "${signalData.signalName}".`);
            return;
        }
        traces.push({
            x: signalArray.map(entry => entry.timestamp),
            y: signalArray.map(entry => entry.value),
            mode: "lines+markers",
            type: "scattergl",
            xaxis: 'x',
            yaxis: 'y',
            name: `${signalData.signalName} (${signalData.messageName})${unit}`,
            signalName: signalData.signalName,
            messageId: signalData.messageId,
            isRelativeTimestamp: signalData.isRelativeTimestamp
        });
        if (signalArray.some(entry => entry.description)) {
            const trace = traces[traces.length - 1];
            trace.customdata = signalArray.map(entry => entry.description || "");
            trace.hovertemplate = "%{fullData.name}<br>%{x}<br>%{y}<br>%{customdata}<extra></extra>";
        }
    });
    return traces;
}

function resetSubplotLayout() {
    // Standard case: only "xy" is used, so 1 row x 1 column
    plotLayout.grid = {
        rows: 1,
        columns: 1,
        subplots: [["xy"]]
    };

    // Make sure yaxis object exists
    if (!plotLayout.yaxis) {
        plotLayout.yaxis = createYAxisConfig('yaxis');
    }
    // Set main Y-axis visible
    plotLayout.yaxis.visible = true;
    plotLayout.yaxis.domain = [0, 1];

    // Delete all additional Y axis
    const extraYAxes = ["yaxis2", "yaxis3", "yaxis20", "yaxis30", "yaxis40", "yaxis50"];
    extraYAxes.forEach(axisName => {
        /*if (!plotLayout[axisName]) {
            plotLayout[axisName] = {};
        }
        plotLayout[axisName].visible = false;*/
        delete plotLayout[axisName];
    });

    console.log("Layout reset to standard case:", plotLayout);
}

function updateActiveSubplotsStatus() {
    // Ensure plotData.activeSubplots exists
    if (!plotData.activeSubplots) {
        plotData.activeSubplots = {
            sp1: false,
            sp2: false,
            sp3: false,
            sp4: false,
            sp5: false,
        };
    }

    // Set all subplots to false without replacing the object reference
    ["sp1", "sp2", "sp3", "sp4", "sp5"].forEach(key => {
        plotData.activeSubplots[key] = false;
    });

    // Iterate through all subplot selectors and update active status
    document.querySelectorAll(".subplot-selector").forEach((dropdown) => {
        const selectedValue = dropdown.value; // e.g., "sp1", "sp2"
        
        if (plotData.activeSubplots.hasOwnProperty(selectedValue)) {
            plotData.activeSubplots[selectedValue] = true;
        }
    });
}


function getSelectedSubplots() {
    const selections = {};

    document.querySelectorAll(".subplot-selector").forEach((dropdown) => {
        const index = dropdown.dataset.index; // Identify which trace it belongs to
        const selectedValue = dropdown.value; // e.g., "sp1", "sp2"
        selections[index] = selectedValue;
    });

    // 1) Gather all subplot values (e.g. ["sp2", "sp2", "sp3", "sp4"]).
    const values = Object.values(selections);

    // 2) Remove duplicates (Set).
    const unique = new Set(values); // e.g. { "sp2", "sp3", "sp4" }

    // 3) Convert to an array.
    const selectedSubplots = [...unique]; // e.g. ["sp2", "sp3", "sp4"]

    return selectedSubplots;
}

function updateSubplotLayout(selectedSubplots) {
    // Step 1: Extract unique subplots from values
    const activeSubplots = selectedSubplots;
    const activeCount = activeSubplots.length;

    //console.log("Active Subplots:", activeSubplots); 
    //console.log("Number of Active Subplots:", activeCount);

    // Step 2: Adjust your grid rows 
    plotLayout.grid.rows = activeCount || 1; // At least 1 row if all subplots are empty

    // Step 2a: Build subplots array based on active subplots
    //   sp1 => "xy"
    //   sp2 => "xy20"
    //   sp3 => "xy30"
    //   sp4 => "xy40"
    //   sp5 => "xy50"
    let subplotsArray = [];
    if (activeCount > 0) {
        // 1) Check if sp1 is in the activeSubplots
        if (activeSubplots.includes("sp1")) {
            // If so, push the main subplot "xy" first
            subplotsArray.push(["xy"]);
        }
        
        // 2) Now handle other subplots sp2..sp5 in a fixed bottom-to-top order
        const subplotOrder = ["sp2", "sp3", "sp4", "sp5"];
        subplotOrder.forEach(sp => {
            if (activeSubplots.includes(sp)) {
                const num = sp.substring(2);
                subplotsArray.push([`xy${num}0`]);
            }
        });
    } else {
        // If no active subplots, default to the main plot
        subplotsArray = [["xy"]];
    }

    // Assign the constructed array to the layout
    plotLayout.grid.subplots = subplotsArray;

    // Step 3: Reset Y-axis visibility to false (or create them if missing)
    /*const yAxes = ["yaxis", "yaxis20", "yaxis30", "yaxis40", "yaxis50"];
    yAxes.forEach(axis => {
        if (!plotLayout[axis]) {
            plotLayout[axis] = {};
        }
        plotLayout[axis].visible = false;
    });*/

    // Step 4: Evenly divide domain
    const step = 1 / (activeCount || 1); 
    let position = 0;

    // Step 5: Assign domains in a fixed priority order too, 
    //         so sp1 is bottom if it's active, then sp2, sp3, etc.
    const domainOrder = ["sp1","sp2","sp3","sp4","sp5"];
    domainOrder.forEach(sp => {
        if (activeSubplots.includes(sp)) {
            const axisKey = (sp === "sp1") ? "yaxis" : `yaxis${sp.substring(2)}0`;
            const domain = [position, position + step - 0.02];
            // Update plotLayout with the new domain
            plotLayout[axisKey].domain = domain;
            plotLayout[axisKey].visible = true;
            // Store the domain in activeSubplots
            plotData.activeSubplots[`${sp}domain`] = domain;
            position += step;
        }
    });
}

function manageMainYaxis() {
    const yInUse  = plotData.isYAxisInUse("y");
    const y2InUse = plotData.isYAxisInUse("y2");
    const y3InUse = plotData.isYAxisInUse("y3");

    // If y and y2 are active, y shall make room for y2
    // adjust label placement accordingly
    if (yInUse && !y2InUse) {
        plotLayout.annotations[0].x = 0; //Y1 label
    } else if (!yInUse && y2InUse) {
        plotLayout.annotations[1].x = 0; //Y2 label
    }

    // Ensure sp1domain exists and is an array
    const referenceDomain = Array.isArray(plotData.activeSubplots.sp1domain) 
        ? [...plotData.activeSubplots.sp1domain] 
        : [0, 1];
    
    if (yInUse && y2InUse){
        plotLayout.xaxis.domain = [0.07, 1];
        plotLayout.annotations[0].x = 0.07;
        plotLayout.annotations[1].x = 0;
    } else {
        plotLayout.xaxis.domain = [0, 1];
    }
        
    if (yInUse) {
        plotLayout["yaxis"] = plotLayout["yaxis"] || createYAxisConfig('yaxis');
        plotLayout["yaxis"].visible = true;
        plotLayout.annotations[0].visible = true;
    } else {
        delete plotLayout["yaxis"];
        plotLayout.annotations[0].visible = false;
    }

    if (y2InUse) {
        plotLayout["yaxis2"] = plotLayout["yaxis2"] || createYAxisConfig('yaxis2');
        plotLayout["yaxis2"].domain = referenceDomain;
        plotLayout["yaxis2"].visible = true;
        plotLayout.annotations[1].visible = true;
    } else {
        delete plotLayout["yaxis2"];
        plotLayout.annotations[1].visible = false;
    }

    if (y3InUse) {
        plotLayout["yaxis3"] = plotLayout["yaxis3"] || createYAxisConfig('yaxis3');
        plotLayout["yaxis3"].domain = referenceDomain;
        plotLayout["yaxis3"].visible = true;
        plotLayout.annotations[2].visible = true;
    } else {
        delete plotLayout["yaxis3"];
        plotLayout.annotations[2].visible = false;
    }
}