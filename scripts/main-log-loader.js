import { parseTRC } from './parser-trc.js';
import { parseASC } from './parser-asc.js';
import { parseBLF } from './parser-blf.js';
import { frameKey } from './signal-decoder.js';

const MAX_BINARY_LOG_FILE_SIZE = 512 * 1024 * 1024;
const MAX_TEXT_LOG_FILE_SIZE = 1024 * 1024 * 1024;

export let log = null; // Global variable to store the log

// Frame keys present in the log, filled while building the log so lookups are O(1).
let availableFrameKeys = new Set();

export function resetLog() {
    log = [];
    availableFrameKeys = new Set();
}

export function isFrameInLog(id, isExtendedId) {
    return availableFrameKeys.has(frameKey(id, isExtendedId));
}

// Check if log is not loaded.
export function isLogLoaded() {
    return Array.isArray(log) && log.length > 0;
}

export async function parseFileLOG(file) {
    try {
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const maxFileSize = fileExtension === 'blf' ? MAX_BINARY_LOG_FILE_SIZE : MAX_TEXT_LOG_FILE_SIZE;
        if (file.size > maxFileSize) {
            const maxSizeMiB = maxFileSize / (1024 * 1024);
            throw new RangeError(`Log files larger than ${maxSizeMiB} MiB are not supported.`);
        }

        let parsedData;
        document.body.style.cursor = 'wait'; // Switch cursor to wait

        switch (fileExtension) {
            case 'blf':
                parsedData = await parseBLF(file); // Directly handle BLF files
                break;
            case 'trc':
                parsedData = await parseTRC(file); // Handle TRC files
                break;
            case 'asc':
                parsedData = await parseASC(file); // Handle ASC files
                break;
            default:
                throw new Error(`Unsupported log file format: .${fileExtension}`);
        }
        return parsedData;

    } catch (error) {
        console.error("Error processing the log file:", error);
        throw error;
    } finally {
        document.body.style.cursor = 'default'; // Revert cursor to default
    }
}

/**
 * Converts parsed CAN messages into the unified log format.
 * The array is converted in place and becomes the log, so a large log is not held twice in memory.
 * Do not reuse `parsedMessages` after calling this.
 * @param {Array} parsedMessages - Array of parsed CAN messages from the log parsers.
 */
export function buildUnifiedLog(parsedMessages) {
    if (!Array.isArray(parsedMessages)) {
        throw new TypeError("Parsed log data must be an array.");
    }

    resetLog();

    const parsedCount = parsedMessages.length;
    let validCount = 0;
    let skippedMessages = 0;
    for (let index = 0; index < parsedCount; index++) {
        const msg = parsedMessages[index];
        if (!msg || !Number.isFinite(msg.timestamp) || !Number.isInteger(msg.arbitrationId) ||
            msg.arbitrationId < 0 || msg.arbitrationId > 0x1FFFFFFF ||
            (!Array.isArray(msg.data) && !(msg.data instanceof Uint8Array))) {
            skippedMessages++;
            continue;
        }
        const data = Array.from(msg.data);
        if (data.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
            skippedMessages++;
            continue;
        }
        const unifiedMessage = {
            timestamp: msg.isRelativeTimestamp
                ? msg.timestamp
                : timestampToISOString(msg.timestamp),
            id: `0x${msg.arbitrationId.toString(16).toUpperCase()}`, // Hexadecimal ID
            data,
            isRelativeTimestamp: msg.isRelativeTimestamp === true,
            channel: msg.channel ?? null, // CAN channel (null if not provided)
            isExtendedId: msg.isExtendedId, // Extended ID flag
            isRemoteFrame: msg.isRemoteFrame, // Remote frame flag
            isRx: msg.isRx, // Rx flag
            dlc: msg.dlc,
            isFd: msg.isFd,
            isErrorFrame: msg.isErrorFrame,
            bitrateSwitch: msg.bitrateSwitch,
            errorStateIndicator: msg.errorStateIndicator
        };

        parsedMessages[validCount++] = unifiedMessage;
        if (!unifiedMessage.isRemoteFrame && !unifiedMessage.isErrorFrame) {
            availableFrameKeys.add(frameKey(unifiedMessage.id, unifiedMessage.isExtendedId));
        }
    }
    if (skippedMessages > 0) {
        console.warn(`Skipped ${skippedMessages} invalid CAN message(s) while loading the log.`);
    }
    if (validCount === 0 && parsedCount > 0) {
        availableFrameKeys = new Set();
        throw new TypeError("The log contains no valid CAN messages.");
    }
    parsedMessages.length = validCount;
    log = parsedMessages;
    return skippedMessages;
}

export function timestampToISOString(timestampSeconds) {
    if (!Number.isFinite(timestampSeconds)) {
        throw new TypeError("Log message timestamp must be a finite number.");
    }
    const wholeSeconds = Math.floor(timestampSeconds);
    let microseconds = Math.round((timestampSeconds - wholeSeconds) * 1_000_000);
    const roundedSeconds = wholeSeconds + (microseconds === 1_000_000 ? 1 : 0);
    if (microseconds === 1_000_000) microseconds = 0;
    const datePart = new Date(roundedSeconds * 1000).toISOString().slice(0, 19);
    return `${datePart}.${String(microseconds).padStart(6, '0')}Z`;
}
