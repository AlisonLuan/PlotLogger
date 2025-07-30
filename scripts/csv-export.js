/**
 * Generates and downloads a CSV from the provided Plotly traces.
 * Each row is "Time, trace1, trace2, ...", with missing values left blank.
 * @param {Array} traces - Array of Plotly traces, each containing x, y, and name.
 */
export function downloadTracesAsCSV(traces) {
    
    if (!traces || traces.length === 0) {
      console.warn("No traces found. CSV generation skipped.");
      showToast("No traces available. Please plot a graph before exporting.");
      return;
    }
  
    // 1) Collect all unique time points from every trace
    const allTimes = new Set();
    traces.forEach(trace => {
      trace.x.forEach(time => allTimes.add(time));
    });
    // Sort times (assumes numeric or date-like; adjust if needed)
    const sortedTimes = Array.from(allTimes)
    .map(t => new Date(t).getTime()) // Convert to numeric timestamps
    .sort((a, b) => a - b)
    .map(t => new Date(t).toISOString()); // Convert back to string format

    // 2) Build a map of time -> { traceIndex -> value }
    //    This way we can assemble rows easily
    const dataMap = new Map(); // key: time, value: object with traceIndex -> data
    traces.forEach((trace, traceIndex) => {
      trace.x.forEach((timeVal, i) => {
        const val = trace.y[i];
        if (!dataMap.has(timeVal)) {
          dataMap.set(timeVal, {});
        }
        dataMap.get(timeVal)[traceIndex] = val;
      });
    });
  
    // 3) Build CSV header: "Time, traceName1, traceName2, ... "
    const header = ["Time", ...traces.map(t => t.name)];
    let csvString = header.join(",") + "\n";
  
    // 4) Fill CSV rows, using sorted time points
    for (const t of sortedTimes) {
        const rowObj = dataMap.get(t) || {};
        //const rowData = [t];  ISO 8601 timestamps
        //const rowData = [t.replace("T", " ").replace("Z", "")]; // Convert to "YYYY-MM-DD HH:MM:SS.sss"
        const rowData = [excelSerialNumber(t)]; // Excel serial numbers (days since 1900-01-01)

        traces.forEach((_, i) => {
            rowData.push(rowObj[i] !== undefined ? rowObj[i] : "");
        });
    
        csvString += rowData.join(",") + "\n";
    }

    // 5) Trigger file download in browser
    const blob = new Blob([csvString], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "traces.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function excelSerialNumber(dateString) {
    const dt = new Date(dateString);
    return (dt.getTime() / 86400000) + 25569; // Convert ms to days & adjust for Excel
}