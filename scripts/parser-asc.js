import { readTrimmedLines } from './text-lines.js';

export async function parseASC(file) {
    let messages = [];
    let startTime = null; // epoch seconds from the "date" line, if any
    let deltaTimestamps = false; // "timestamps relative": each value is the gap to the previous event
    let elapsed = 0; // running sum of gaps in delta mode
    let absoluteTimestamps = false; // "timestamps absolute": seconds since measurement start
    let base = 16; // Default to hex

    for await (const line of readTrimmedLines(file)) {
        if (line.startsWith("date ")) {
            startTime = parseDate(line.slice(5));
            continue;
        }
        if (line.startsWith("base ")) {
            base = line.includes("hex") ? 16 : 10;
            deltaTimestamps = line.includes("timestamps relative");
            absoluteTimestamps = line.includes("absolute");
            continue;
        }
        if (/^\d+\.\d+\s+Start of measurement/.test(line)) {
            continue;
        }
        const timestampMatch = line.match(/^(\d+\.\d+)(?:\s|$)/);
        if (!timestampMatch) {
            continue;
        }

        let parts = line.split(/\s+/);
        const eventTimestamp = Number(timestampMatch[1]);
        if (!Number.isFinite(eventTimestamp)) continue;
        // In delta mode every valid event line advances the clock, including skipped frames.
        if (deltaTimestamps) {
            const nextElapsed = elapsed + eventTimestamp;
            if (!Number.isFinite(nextElapsed)) continue;
            elapsed = nextElapsed;
        }
        if (!/^\d+$/.test(parts[1])) {
            continue;
        }
        let timestamp = deltaTimestamps ? elapsed : eventTimestamp;
        let channel = parts[1];
        let arbitrationIdRaw = parts[2];
        let isExtendedId = arbitrationIdRaw.endsWith("x");
        let arbitrationId = parseInt(
            isExtendedId ? arbitrationIdRaw.slice(0, -1) : arbitrationIdRaw,
            base
        );
        if (!Number.isFinite(timestamp) || !Number.isFinite(arbitrationId) || arbitrationId < 0) {
            continue;
        }
        let isRx = parts[3] === "Rx";
        const frameType = parts[4];
        if (frameType !== "r" && frameType !== "d") continue;
        const isAbsolute = absoluteTimestamps && !deltaTimestamps && startTime !== null;
        let data = frameType === "r" ? new Uint8Array() : parseData_asc(parts.slice(5), base);
        if (!data) continue;

        messages.push({
            // Without a "date" line there is no calendar anchor, so keep elapsed seconds.
            timestamp: isAbsolute ? timestamp + startTime : timestamp,
            isRelativeTimestamp: !isAbsolute,
            arbitrationId,
            data,
            channel: isNaN(parseInt(channel)) ? null : parseInt(channel) - 1,
            isExtendedId,
            isRemoteFrame: frameType === "r",
            isRx,
        });
    }

    return messages;
}

function parseDate(dateString) {
    const monthMap = {
        Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
        Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
    };

    // "Thu Feb 13 18:41:24.154 2025" or the 12-hour form "Fri Sep 30 03:09:41.360 pm 2016"
    const dateMatch = dateString.trim().match(
        /^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:\s+(am|pm))?\s+(\d{4})$/i
    );
    if (!dateMatch) {
        throw new Error(`Invalid date format: ${dateString}`);
    }

    const monthName = dateMatch[1][0].toUpperCase() + dateMatch[1].slice(1).toLowerCase();
    const month = monthMap[monthName];
    const day = Number(dateMatch[2]);
    const hourField = Number(dateMatch[3]);
    const minute = Number(dateMatch[4]);
    const second = Number(dateMatch[5]);
    const milliseconds = (dateMatch[6] ?? "0").padEnd(3, "0").slice(0, 3);
    const meridiem = dateMatch[7]?.toLowerCase();
    const year = Number(dateMatch[8]);
    let hour = hourField;

    if (meridiem) {
        if (!(hour >= 1 && hour <= 12)) {
            throw new Error(`Invalid date format: ${dateString}`);
        }
        hour = (hour % 12) + (meridiem === "pm" ? 12 : 0);
    }
    const daysInMonth = month ? new Date(Date.UTC(2000, month, 0)).getUTCDate() : 0;
    if (!month || day < 1 || day > daysInMonth || hour < 0 || hour > 23 ||
        minute > 59 || second > 59) {
        throw new Error(`Invalid date format: ${dateString}`);
    }

    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, second, Number(milliseconds));
    return date.getTime() / 1000;
}


function parseData_asc(dataParts, base) {
    let dataLength = parseInt(dataParts[0], base);
    if (!Number.isInteger(dataLength) || dataLength < 0 || dataParts.length < dataLength + 1) return null;
    const bytes = dataParts.slice(1, 1 + dataLength).map(byte => parseInt(byte, base));
    if (bytes.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) return null;
    return new Uint8Array(bytes);
}
