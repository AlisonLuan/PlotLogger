function canonicalTime(time, isRelativeTimestamp) {
    if (isRelativeTimestamp) {
        if (typeof time !== "number" || !Number.isFinite(time)) {
            throw new TypeError("Relative trace timestamps must be finite seconds.");
        }
        return time.toFixed(6);
    }
    if (!(time instanceof Date) && typeof time !== "string" &&
        !(typeof time === "number" && Number.isFinite(time))) {
        throw new TypeError("Trace timestamps must be date strings, Date objects, or epoch milliseconds.");
    }
    const date = time instanceof Date ? time : new Date(time);
    const iso = date.toISOString();
    const sourceFraction = typeof time === "string"
        ? time.match(/\.(\d+)(?:Z|[+-]\d{2}:?\d{2})$/)?.[1]
        : null;
    const fraction = (sourceFraction || iso.slice(20, 23)).slice(0, 6).padEnd(6, "0");
    return `${iso.slice(0, 19)}.${fraction}Z`;
}

function quoteCsv(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
}

export function formatTracesAsCSV(traces) {
    if (!Array.isArray(traces) || traces.length === 0) return "";

    const relativeTraceCount = traces.filter(trace => trace.isRelativeTimestamp === true).length;
    if (relativeTraceCount > 0 && relativeTraceCount !== traces.length) {
        throw new TypeError("All traces must use the same timestamp domain.");
    }
    const isRelativeTimestamp = relativeTraceCount === traces.length;
    const valuesByTime = new Map();
    for (const [traceIndex, trace] of traces.entries()) {
        if (!Array.isArray(trace.x) || !Array.isArray(trace.y) || trace.x.length !== trace.y.length) {
            throw new TypeError(`Trace ${traceIndex} must have matching x and y arrays.`);
        }
        trace.x.forEach((time, pointIndex) => {
            const key = canonicalTime(time, isRelativeTimestamp);
            if (!valuesByTime.has(key)) valuesByTime.set(key, new Map());
            valuesByTime.get(key).set(traceIndex, trace.y[pointIndex]);
        });
    }

    const times = Array.from(valuesByTime.keys()).sort(
        isRelativeTimestamp ? (left, right) => Number(left) - Number(right) : undefined
    );
    const rows = [[ isRelativeTimestamp ? "Elapsed time (s)" : "Time", ...traces.map(trace => trace.name) ]];
    for (const time of times) {
        const values = valuesByTime.get(time);
        rows.push([time, ...traces.map((_, index) => values.get(index) ?? "")]);
    }
    return rows.map(row => row.map(quoteCsv).join(",")).join("\r\n") + "\r\n";
}

export function downloadTracesAsCSV(traces) {
    if (!traces || traces.length === 0) {
        console.warn("No traces found. CSV generation skipped.");
        window.showToast?.("No traces available. Please plot a graph before exporting.");
        return;
    }

    const blob = new Blob([formatTracesAsCSV(traces)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "traces.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
