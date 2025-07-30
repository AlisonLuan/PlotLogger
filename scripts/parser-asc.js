export async function parseASC(file) {
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
        let timestamp = parseFloat(parts[0]);
        let channel = parts[1];
        let arbitrationIdRaw = parts[2];
        let isExtendedId = arbitrationIdRaw.endsWith("x");
        let arbitrationId = parseInt(
            isExtendedId ? arbitrationIdRaw.slice(0, -1) : arbitrationIdRaw,
            base
        );
        let isRx = parts[3] === "Rx";
        let data = parseData_asc(parts.slice(5), base);

        messages.push({
            timestamp: relativeTimestamp ? timestamp : timestamp + startTime,
            arbitrationId,
            data,
            channel: isNaN(parseInt(channel)) ? null : parseInt(channel) - 1,
            isExtendedId,
            isRemoteFrame: parts[4] === "r" || false,
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

    let formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day} ${time}`;

    return new Date(formattedDate).getTime() / 1000;
}


function parseData_asc(dataParts, base) {
    let dataLength = parseInt(dataParts[0], base);
    return new Uint8Array(dataParts.slice(1, 1 + dataLength).map(byte => parseInt(byte, base)));
}
