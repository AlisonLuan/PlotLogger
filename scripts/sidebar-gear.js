// Populate axis fields with initial values from the plot
function populateAxisFields() {
    const yAxes = ["yaxis", "yaxis2", "yaxis3"];
    yAxes.forEach((axis, index) => {
        const axisData = plotLayout[axis];
        if (axisData && axisData.range) {
            document.getElementById(`y${index + 1}-min`).value = axisData.range[0];
            document.getElementById(`y${index + 1}-max`).value = axisData.range[1];
        }
    });
}

function updateAxisFieldsState() {
    const yAxes = ["y", "y2", "y3"];
    
    yAxes.forEach((axis, index) => {
        const isUsed = plotData.isYAxisInUse(axis);
        const minField = document.getElementById(`y${index + 1}-min`);
        const maxField = document.getElementById(`y${index + 1}-max`);

        if (minField && maxField) {
            minField.disabled = !isUsed;
            maxField.disabled = !isUsed;
        }
    });
}