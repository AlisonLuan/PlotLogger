// A log frame costs roughly 300 bytes as a JS object, so this keeps a tab under a few GB.
export const MAX_LOG_FRAMES = 10_000_000;

export function checkFrameCount(count) {
    if (count >= MAX_LOG_FRAMES) {
        throw new RangeError(`Logs with more than ${MAX_LOG_FRAMES.toLocaleString("en-US")} CAN frames are not supported (the browser would run out of memory).`);
    }
}

// Lets a newer file drop stop a parse that is no longer wanted.
export function throwIfAborted(signal) {
    if (signal?.aborted) {
        const error = new Error("Log load was superseded by a newer file.");
        error.name = "AbortError";
        throw error;
    }
}
