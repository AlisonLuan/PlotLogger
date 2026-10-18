export async function parseASC(file) {
    if (file.size > 128 * 1024 * 1024) {
        throw new RangeError("ASC files larger than 128 MiB are not supported.");
    }
    const text = await file.text();
    const lines = text.split('\n').map(line => line.trim());
    let messages = [];
    let startTime = 0;
    let relativeTimestamp = true;
    let base = 16; // Default to hex

    for (let line of lines) {
        if (line.startsWith("date ")) {
            startTime = parseDate(line.split("date ")[1]);
            continue;
        }
        if (line.startsWith("base ")) {
            base = line.includes("hex") ? 16 : 10;
            relativeTimestamp = !line.includes("absolute");
            continue;
        }
        if (/^\d+\.\d+\s+Start of measurement/.test(line)) {
            continue;
        }
        if (!/^\d+\.\d+/.test(line)) {
            continue;
        }

        let parts = line.split(/\s+/);
        if (!/^\d+$/.test(parts[1])) {
            continue;
        }
        let timestamp = parseFloat(parts[0]);
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
        let data = frameType === "r" ? new Uint8Array() : parseData_asc(parts.slice(5), base);
        if (!data) continue;

        messages.push({
            timestamp: relativeTimestamp ? timestamp : timestamp + startTime,
            isRelativeTimestamp: relativeTimestamp,
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

    let parts = dateString.split(" "); // Split by space
    let day = parts[2]; // "13"
    let month = monthMap[parts[1]]; // "Feb" → 2
    let year = parts[4]; // "2025"
    let time = parts[3]; // "18:41:24.154"

    if (!month || !year) {
        throw new Error(`Invalid date format: ${dateString}`);
    }

    const [hours, minutes, seconds] = time.split(":");
    const [wholeSeconds, milliseconds = "0"] = seconds.split(".");
    return Date.UTC(
        Number(year),
        month - 1,
        Number(day),
        Number(hours),
        Number(minutes),
        Number(wholeSeconds),
        Number(milliseconds.padEnd(3, "0").slice(0, 3))
    ) / 1000;
}


function parseData_asc(dataParts, base) {
    let dataLength = parseInt(dataParts[0], base);
    if (!Number.isInteger(dataLength) || dataLength < 0 || dataParts.length < dataLength + 1) return null;
    const bytes = dataParts.slice(1, 1 + dataLength).map(byte => parseInt(byte, base));
    if (bytes.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) return null;
    return new Uint8Array(bytes);
}
