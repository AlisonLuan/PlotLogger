function createYAxisConfig(axisKey) {
    let axisNumber = axisKey.replace("yaxis", ""); // Extract axis number ("" for yaxis, "2" for yaxis2, etc.)
    
    switch (axisKey) {
        case "yaxis":
            return {
                title: { text: '' },
                domain: Array.isArray(plotData.activeSubplots.sp1domain) ? [...plotData.activeSubplots.sp1domain] : [0, 1],
                anchor: 'x',
                side: 'left',
                visible: true,
                showline: true
            };
        case "yaxis2":
            return {
                title: { text: '' },
                domain: Array.isArray(plotData.activeSubplots.sp1domain) ? [...plotData.activeSubplots.sp1domain] : [0, 1],
                overlaying: 'y',
                side: 'left',
                position: 0
            };
        case "yaxis3":
            return {
                title: { text: '' },
                domain: Array.isArray(plotData.activeSubplots.sp1domain) ? [...plotData.activeSubplots.sp1domain] : [0, 1],
                overlaying: 'y',
                side: 'right',
            };
        case "yaxis20":
            return {
                title: { text: 'Subplot A' }, 
                domain: Array.isArray(plotData.activeSubplots.sp2domain) ? [...plotData.activeSubplots.sp2domain] : [0, 1],
                anchor: 'x',
                showline: true, 
            };
        case "yaxis30":
            return {
                title: { text: 'Subplot B' }, 
                domain: Array.isArray(plotData.activeSubplots.sp3domain) ? [...plotData.activeSubplots.sp3domain] : [0, 1],
                anchor: 'x',
                showline: true, 
            };
        case "yaxis40":
            return {
                title: { text: 'Subplot C' }, 
                domain: Array.isArray(plotData.activeSubplots.sp4domain) ? [...plotData.activeSubplots.sp4domain] : [0, 1],
                anchor: 'x',
                showline: true, 
            };   
        case "yaxis50":
            return {
                title: { text: 'Subplot D' }, 
                domain: Array.isArray(plotData.activeSubplots.s5domain) ? [...plotData.activeSubplots.sp5domain] : [0, 1],
                anchor: 'x',
                showline: true, 
            };

        default:
            return {
                title: { text: `Subplot ${axisNumber}` },
                anchor: 'x',
                visible: false,
                showline: true
            };
    }
}


function createActiveYAxes() {
    const subplotOrder = ["sp2", "sp3", "sp4", "sp5"];
    
    // Ensure yaxis, yaxis2, and yaxis3 exist if sp1 is active
    if (plotData.activeSubplots.sp1) {
        manageMainYaxis();
    }

    // Iterate through other subplots and create only if missing
    subplotOrder.forEach(sp => {
        const axisKey = `yaxis${sp.substring(2)}0`;
        if (plotData.activeSubplots[sp]) {
            if (!plotLayout[axisKey]) {
                plotLayout[axisKey] = createYAxisConfig(axisKey);
            }
            plotLayout[axisKey].visible = true;
        } else {
            delete plotLayout[axisKey]; // Remove inactive subplots
        }
    });
}