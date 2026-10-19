const MAX_LINE_LENGTH = 1024 * 1024; // characters; real log lines are far shorter

// Streams a File line by line (trimmed) so large text logs never need to fit in a single string.
// File-like objects without stream()/TextDecoderStream fall back to text().
export async function* readTrimmedLines(file) {
    if (typeof file.stream !== "function" || typeof TextDecoderStream === "undefined") {
        for (const line of (await file.text()).split("\n")) yield line.trim();
        return;
    }

    const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
    let pending = "";
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            pending += value;
            let start = 0;
            let newline;
            while ((newline = pending.indexOf("\n", start)) !== -1) {
                yield pending.slice(start, newline).trim();
                start = newline + 1;
            }
            pending = pending.slice(start);
            if (pending.length > MAX_LINE_LENGTH) {
                throw new RangeError(`Log line exceeds ${MAX_LINE_LENGTH} characters; the file is not a valid text log.`);
            }
        }
        if (pending.length > 0) yield pending.trim();
    } finally {
        reader.releaseLock();
    }
}
