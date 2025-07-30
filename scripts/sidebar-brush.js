// Example function to handle specific display of configuration (e.g., for Brush)
function displayConfigurationControls(data) {
    const configContainer = document.getElementById('lineConfigurations');
    configContainer.innerHTML = '';

    data.forEach((trace, index) => {
        const lineConfig = document.createElement('div');
        lineConfig.classList.add('line-config');
        const lineWidth = trace.line && trace.line.width ? trace.line.width : 2;
        const markerSize = trace.marker && trace.marker.size ? trace.marker.size : 6;
        const assignedYAxis = trace.yaxis || "y"; // Default to Y-axis 1
        const assignedXAxis = trace.xaxis || "x"; // Default X-Axis
        //const traceColor = trace.line && trace.line.color ? trace.line.color : 'rgb(0, 0, 0)'; // Default black

        lineConfig.innerHTML = `
        <!-- Signal Name with Dynamic Color -->
        <label>
            <span class="signal-name" data-index="${index}" style="color:#000; font-weight: bold;">${trace.name}</span>
        </label>
    
        <!-- Trace Color Picker (Color Swatches) -->
        <label>Trace Color</label>
        <div class="color-palette" data-index="${index}">
            <!-- Blue Shades -->
            <div class="color-swatch" style="background-color:rgb(100, 149, 237);" data-color="rgb(100, 149, 237)"></div> <!-- Soft Blue -->
            <div class="color-swatch" style="background-color:rgb(70, 130, 180);" data-color="rgb(70, 130, 180)"></div> <!-- Medium Blue -->
            <div class="color-swatch" style="background-color:rgb(30, 60, 120);" data-color="rgb(30, 60, 120)"></div> <!-- Dark Blue -->
            
            <!-- Green Shades -->
            <div class="color-swatch" style="background-color:rgb(144, 238, 144);" data-color="rgb(144, 238, 144)"></div> <!-- Soft Green -->
            <div class="color-swatch" style="background-color:rgb(60, 179, 113);" data-color="rgb(60, 179, 113)"></div> <!-- Medium Sea Green -->
            <div class="color-swatch" style="background-color:rgb(34, 139, 34);" data-color="rgb(34, 139, 34)"></div> <!-- Dark Green -->
            
            <!-- Red Shades -->
            <div class="color-swatch" style="background-color:rgb(205, 92, 92);" data-color="rgb(205, 92, 92)"></div> <!-- Soft Red -->
            <div class="color-swatch" style="background-color:rgb(255, 99, 71);" data-color="rgb(255, 99, 71)"></div> <!-- Tomato Red -->
            <div class="color-swatch" style="background-color:rgb(139, 0, 0);" data-color="rgb(139, 0, 0)"></div> <!-- Dark Red -->
            
            <!-- Violet Shades -->
            <div class="color-swatch" style="background-color:rgb(186, 85, 211);" data-color="rgb(186, 85, 211)"></div> <!-- Soft Purple -->
            <div class="color-swatch" style="background-color:rgb(138, 43, 226);" data-color="rgb(138, 43, 226)"></div> <!-- Blue Violet -->
            <div class="color-swatch" style="background-color:rgb(75, 0, 130);" data-color="rgb(75, 0, 130)"></div> <!-- Dark Violet -->
            
            <!-- Gray Shades -->
            <div class="color-swatch" style="background-color:rgb(169, 169, 169);" data-color="rgb(169, 169, 169)"></div> <!-- Gray -->
            <div class="color-swatch" style="background-color:rgb(105, 105, 105);" data-color="rgb(105, 105, 105)"></div> <!-- Dark Gray -->
            
            <!-- Black -->
            <div class="color-swatch" style="background-color:rgb(0, 0, 0);" data-color="rgb(0, 0, 0)"></div> <!-- Black -->
        </div>
        
        <hr class="separator">

        <!-- Mode Selector -->
        <div class="mode-selector-container">
            <label>Mode</label>
            <select class="line-mode" data-index="${index}">
                <option value="lines" ${trace.mode === 'lines' ? 'selected' : ''}>Lines</option>
                <option value="markers" ${trace.mode === 'markers' ? 'selected' : ''}>Markers</option>
                <option value="lines+markers" ${trace.mode === 'lines+markers' ? 'selected' : ''}>Lines + Markers</option>
            </select>
        </div>
    
        <!-- Main container for the two groups -->
        <div class="main-container">
            <!-- First group (Line Width) -->
            <div class="group-container">
                <!-- Label and Span container -->
                <div class="label-span-container">
                    <label for="lineWidth">Line Width:</label>
                    <span class="line-width-value">${lineWidth}</span>
                </div>
                <!-- Range container -->
                <input type="range" id="lineWidth" class="line-width" data-index="${index}" min="1" max="10" value="${lineWidth}" />
            </div>
        
            <!-- Second group (Marker Size) -->
            <div class="group-container">
                <!-- Label and Span container -->
                <div class="label-span-container">
                    <label for="markerSize">Marker Size:</label>
                    <span class="marker-size-value">${markerSize}</span>
                </div>
                <!-- Range container -->
                <input type="range" id="markerSize" class="marker-size" data-index="${index}" min="1" max="10" value="${markerSize}" />
            </div>
        </div>

        <hr class="separator">

        <!-- Y-Axis Selector -->
        <div class="y-axis-selector-container">
            <label>Y-Axis</label>
            <select class="y-axis-selector" data-index="${index}">
                <option value="y1" ${assignedYAxis === "y1" ? "selected" : ""}>Y1 (Primary)</option>
                <option value="y2" ${assignedYAxis === "y2" ? "selected" : ""}>Y2 (Secondary)</option>
                <option value="y3" ${assignedYAxis === "y3" ? "selected" : ""}>Y3 (Right side)</option>
            </select>
        </div>

        <!-- Subplot Selector -->
        <div class="subplot-selector-container">
            <label>Subplots</label>
            <select class="subplot-selector" data-index="${index}">
                <option value="sp1">Main Plot</option>
                <option value="sp2">Subplot A</option>
                <option value="sp3">Subplot B</option>
                <option value="sp4">Subplot C</option>
                <option value="sp5">Subplot D</option>
            </select>
        </div>
        `;
        configContainer.appendChild(lineConfig);
    });
}

/******************** Y Axis  ********************/
// Function to update all fields (Min or Max) for the same Y-axis
function updateAllFields(axis, fieldType, value) {
    document.querySelectorAll(`.${fieldType}-input`).forEach(input => {
        if (getSelectedYAxis(input) === axis) {
            input.value = value; // Ensure all fields for the same axis have the same value
        }
    });
}
