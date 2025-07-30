let deltaModeActive = false;
let deltaPointA = null;
let deltaPointB = null;
let originalHovermode = null;

function clearAnnotationsAndShapes() {
    const plotEl = document.getElementById('plot');
    // Clear any previous annotations and shapes when starting a new measurement cycle
    // Preserve axis annotations while removing only delta cursor annotations
    const preservedAnnotations = plotEl.layout.annotations.filter(ann => !ann.text.startsWith("X: "));
    Plotly.relayout(plotEl, { annotations: preservedAnnotations, shapes: [] });
}

function toggleDeltaCursor() {
    // Check if only "sp1" (Main Plot) is active
    const activeSubplots = getSelectedSubplots();
    if (activeSubplots.length > 1 || (activeSubplots.length === 1 && activeSubplots[0] !== "sp1")) {
        showToast("Delta Cursor is only supported for the Main Plot.");
        return;
    }

    // Check if only "y" (Main Y-Axis) is active
    const yInUse = plotData.isYAxisInUse("y");
    const y2InUse = plotData.isYAxisInUse("y2");
    const y3InUse = plotData.isYAxisInUse("y3");

    if (!yInUse || y2InUse || y3InUse) {
        showToast("Delta Cursor is only supported on the Main Y-Axis.");
        return;
    }

    deltaModeActive = !deltaModeActive;
    const plotEl = document.getElementById('plot');
    
    if (deltaModeActive) {
        plotEl.style.cursor = 'crosshair';
        deltaPointA = null;
        deltaPointB = null;
        
        // Clear any previous annotations and shapes when starting a new measurement cycle
        clearAnnotationsAndShapes();

        // Store the original hovermode and switch to 'closest'
        if (!originalHovermode) {
            originalHovermode = plotEl._fullLayout.hovermode || 'compare';
        }
        Plotly.relayout(plotEl, { hovermode: 'closest' });
        
        // Ensure previous event listener is removed before adding a new one
        plotEl.removeListener('plotly_click', deltaClickHandler);
        setTimeout(() => { plotEl.on('plotly_click', deltaClickHandler); }, 0);
        console.log("Delta Cursor activated.");
    } else {
        plotEl.style.cursor = 'default';
        // Properly remove event listener when delta mode is deactivated
        plotEl.removeListener('plotly_click', deltaClickHandler);
        
        // Revert hovermode and clear annotations and shapes
        if (originalHovermode) {
            Plotly.relayout(plotEl, { hovermode: originalHovermode });
            originalHovermode = null;
        }
        clearAnnotationsAndShapes();

        let deltaOverlay = document.getElementById('delta-overlay');
        if (deltaOverlay) {
            deltaOverlay.style.display = 'none';
        }
        console.log("Delta Cursor deactivated.");
    }
}

function deltaClickHandler(data) {
    // Ignore clicks if delta mode is not active
    if (!deltaModeActive) return;
    if (!data.points || data.points.length === 0) return;
    
    const point = data.points[0];
    const x = point.x;
    const y = parseFloat(point.y.toFixed(3));
    const plotEl = document.getElementById('plot');
    
    if (!deltaPointA) {
        // New measurement cycle: clear previous annotations and shapes
        clearAnnotationsAndShapes();
        deltaPointA = { x: x, y: y };
        console.log("Point A set at:", deltaPointA);
        addAnnotationAndLines(x, y);
    } else {
        deltaPointB = { x: x, y: y };
        console.log("Point B set at:", deltaPointB);
        addAnnotationAndLines(x, y);
        
        // Convert timestamp strings to Date objects
        const timeA = new Date(deltaPointA.x);
        const timeB = new Date(deltaPointB.x);

        const deltaMs = Math.abs(new Date(Math.max(timeA, timeB)) - new Date(Math.min(timeA, timeB)));

        // Format ΔX dynamically
        let deltaXFormatted = "";
        let remainingMs = deltaMs;

        const hours = Math.floor(remainingMs / (60 * 60 * 1000));
        remainingMs %= (60 * 60 * 1000);
        const minutes = Math.floor(remainingMs / (60 * 1000));
        remainingMs %= (60 * 1000);
        const seconds = Math.floor(remainingMs / 1000);
        const milliseconds = remainingMs % 1000;

        // Build the formatted string dynamically
        if (hours > 0) deltaXFormatted += `${hours}h `;
        if (minutes > 0 || hours > 0) deltaXFormatted += `${minutes}m `;
        if (seconds > 0 || minutes > 0 || hours > 0) deltaXFormatted += `${seconds}s `;
        if (milliseconds > 0 || (hours === 0 && minutes === 0 && seconds === 0)) deltaXFormatted += `${milliseconds}ms`;

        // Trim any extra spaces
        deltaXFormatted = deltaXFormatted.trim();
        
        console.log("Delta X:", deltaXFormatted);
        
        // Update overlay
        let deltaOverlay = document.getElementById('delta-overlay');
        if (!deltaOverlay) {
            deltaOverlay = document.createElement('div');
            deltaOverlay.id = 'delta-overlay';
            deltaOverlay.style.position = 'absolute';
            deltaOverlay.style.bottom = '20px';
            deltaOverlay.style.right = '20px';
            deltaOverlay.style.background = 'rgba(0,0,0,0.7)';
            deltaOverlay.style.color = 'white';
            deltaOverlay.style.padding = '8px 12px';
            deltaOverlay.style.borderRadius = '5px';
            deltaOverlay.style.fontSize = '14px';
            deltaOverlay.style.display = 'none';
            document.body.appendChild(deltaOverlay);
        }

        const deltaY = deltaPointB.x > deltaPointA.x ? deltaPointB.y - deltaPointA.y : deltaPointA.y - deltaPointB.y;
        // Format ΔY to avoid trailing zeros
        const deltaYFormatted = parseFloat(deltaY.toFixed(10)).toString();
        deltaOverlay.innerHTML = `ΔX: ${deltaXFormatted} | ΔY: ${deltaYFormatted}`;
        deltaOverlay.style.display = 'block';
        
        // Reset for the next measurement cycle
        deltaPointA = null;
        deltaPointB = null;
    }
}

// Adds an annotation and dashed gray lines for the given point.
// The annotation text is formatted as "X: <time><br>Y: <value>" with left-aligned text.
// Two lines are drawn: one vertical from the point to y=0 (x-axis) and one horizontal from the point to x=0 (y-axis).
function addAnnotationAndLines(x, y) {
    const plotEl = document.getElementById('plot');
    let timePart = x;
    if (typeof x === 'string' && x.indexOf(' ') !== -1) {
        // Extract only the time portion (remove day, month, year)
        timePart = x.split(' ')[1];
    }
    const annotationText = "X: " + timePart + "<br>Y: " + y;
    
    // Determine diagonal offset for inclination
    let offsetX = 50; // Horizontal shift
    let offsetY = -50; // Vertical shift

    // Adjust the annotation position dynamically
    if (x < (plotEl._fullLayout.xaxis.range[0] + plotEl._fullLayout.xaxis.range[1]) / 2) {
        // If the point is on the left half, move annotation to the right
        offsetX = 50;
    } else {
        // If the point is on the right half, move annotation to the left
        offsetX = -50;
    }

    let newAnnotation = {
        text: annotationText,
        x: x,
        y: y,
        xref: 'x',
        yref: 'y',
        showarrow: true,
        arrowhead: 7,
        ax: offsetX,
        ay: offsetY,
        xanchor: offsetX > 0 ? 'left' : 'right'
    };
    
    // Build shapes for the dashed lines:
    let verticalLine = {
        type: 'line',
        x0: x,
        x1: x,
        y0: y,
        y1: 0, // Extend vertically to the x-axis
        line: {
            color: 'gray',
            dash: 'dash'
        },
        xref: 'x',
        yref: 'y'
    };
    
    // Determine the first x value in the dataset without converting it into a timestamp
    let firstXValue = plotEl.data.length > 0 
    ? plotEl.data[0].x[0]  // Simply take the first x-value in the dataset
    : plotEl._fullLayout.xaxis.range[0];

    let horizontalLine = {
        type: 'line',
        x0: x,
        x1: firstXValue,
        y0: y,
        y1: y,
        line: {
            color: 'gray',
            dash: 'dash'
        },
        xref: 'x',
        yref: 'y'
    };
    
    // Get the current annotations and shapes (if any)
    let currentAnnotations = (plotEl.layout && plotEl.layout.annotations) ? plotEl.layout.annotations.slice() : [];
    let currentShapes = (plotEl.layout && plotEl.layout.shapes) ? plotEl.layout.shapes.slice() : [];
    
    // Append the new annotation and shapes.
    currentAnnotations.push(newAnnotation);
    currentShapes.push(verticalLine);
    currentShapes.push(horizontalLine);
    
    // Update the plot with the new annotations and shapes.
    Plotly.relayout(plotEl, { annotations: currentAnnotations, shapes: currentShapes });
}