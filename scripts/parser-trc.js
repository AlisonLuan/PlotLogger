class TRCFileVersion {
    static UNKNOWN = 0;
    static V1_0 = 100;
    static V1_1 = 101;
    static V1_2 = 102;
    static V1_3 = 103;
    static V2_0 = 200;
    static V2_1 = 201;
}

export async function parseTRC(file) {
    const text = await file.text();
    const lines = text.split("\n").map(line => line.trim());
    let fileVersion = TRCFileVersion.UNKNOWN;
    let startTime = 0;
    let columns = {};
    let messages = [];

    function parseMessage(cols) {
        if (fileVersion === TRCFileVersion.V1_0) {
            return parseMsgV1_0(cols);
        } else if (fileVersion === TRCFileVersion.V1_1) {
            return parseMsgV1_1(cols);
        } else if (fileVersion === TRCFileVersion.V1_3) {
            return parseMsgV1_3(cols);
        } else if (fileVersion >= TRCFileVersion.V2_0) {
            return parseMsgV2_X(cols);
        }
        return null;
    }

    function formatTimestamp(timestamp) {
        return timestamp;
    }

    function parseMsgV1_0(cols) {
        if (cols[2] === "FFFFFFFF") return null; // Ignore bus info lines
        return {
            timestamp: formatTimestamp(parseFloat(cols[1]) / 1000),
            arbitrationId: parseInt(cols[2], 10),
            isExtendedId: cols[2].length > 4,
            dlc: parseInt(cols[3]),
            data: cols.slice(4, 4 + parseInt(cols[3])).map(hex => parseInt(hex, 16))
        };
    }

    function parseMsgV1_1(cols) {
        return {
            timestamp: formatTimestamp(parseFloat(cols[1]) / 1000 + startTime),
            arbitrationId: parseInt(cols[3], 10),
            isExtendedId: cols[3].length > 4,
            dlc: parseInt(cols[4]),
            data: cols.slice(5, 5 + parseInt(cols[4])).map(hex => parseInt(hex, 16)),
            isRx: cols[2] === "Rx"
        };
    }

    function parseMsgV1_3(cols) {
        return {
            timestamp: formatTimestamp(parseFloat(cols[1]) / 1000 + startTime),
            arbitrationId: parseInt(cols[4], 16),
            isExtendedId: cols[4].length > 4,
            channel: parseInt(cols[2]),
            dlc: parseInt(cols[6]),
            data: cols.slice(7, 7 + parseInt(cols[6])).map(hex => parseInt(hex, 16)),
            isRx: cols[3] === "Rx"
        };
    }

    function parseMsgV2_X(cols) {        
        if (columns["T"] === undefined || columns["O"] === undefined || columns["I"] === undefined || columns["D"] === undefined) {
            console.warn("Missing required columns in mapping:", columns);
            return null;
        }        
    
        const type = cols[columns["T"]];
        const timestamp = parseFloat(cols[columns["O"]]) / 1000 + startTime;
        const arbitrationId = parseInt(cols[columns["I"]], 16);
        const isExtendedId = cols[columns["I"]].length > 4;
        const channel = columns["B"] ? parseInt(cols[columns["B"]]) : 1;
        
        let dlc = 0;
        if (columns["L"]) {
            dlc = parseInt(cols[columns["L"]]);
        } else if (columns["l"]) {
            dlc = parseInt(cols[columns["l"]]);
        } else {
            console.warn("No DLC column found, setting to 0");
        }
    
        let data = [];
        if (columns["D"] !== undefined) {
            try {
                data = cols.slice(columns["D"], columns["D"] + dlc).map(hex => parseInt(hex, 16));
            } catch (error) {
                console.error("Error parsing data field:", error);
            }
        }
        
        return {
            timestamp: formatTimestamp(timestamp),
            arbitrationId,
            isExtendedId,
            channel,
            dlc,
            data,
            isRx: cols[columns["d"]] === "Rx",
            isFd: ["FD", "FB", "FE", "BI"].includes(type),
            bitrateSwitch: ["FB", "FE"].includes(type),
            errorStateIndicator: ["FE", "BI"].includes(type)
        };
    }    

    for (let line of lines) {
        if (line.startsWith(";$FILEVERSION")) {
            const version = line.split("=")[1];
            fileVersion = TRCFileVersion["V" + version.replace(".", "_")] || TRCFileVersion.UNKNOWN;
        } else if (line.startsWith(";$STARTTIME")) {
            const baseDate = new Date(Date.UTC(1899, 11, 30, 0, 0, 0, 0)); // UTC base date
            const daysOffset = parseFloat(line.split("=")[1]); // Days offset
            const startTimestamp = baseDate.getTime() + daysOffset * 24 * 60 * 60 * 1000; // Convert days to ms
            startTime = startTimestamp / 1000; // Convert to seconds
        } else if (line.startsWith(";$COLUMNS")) {
            const cols = line.split("=")[1].split(",");
            columns = Object.fromEntries(cols.map((col, index) => [col, index]));
        } else if (!line.startsWith(";") && line.length > 0) {
            const cols = line.split(/\s+/);
            const msg = parseMessage(cols);
            if (msg) messages.push(msg);
        }
    }

    return messages.map(message => ({
        timestamp: message.timestamp,           // Timestamp in seconds
        arbitrationId: message.arbitrationId,  // Message ID in decimal
        data: message.data,                    // Raw CAN payload as Uint8Array
        channel: message.channel || null,      // CAN channel (null if not provided)
        isExtendedId: message.isExtendedId,    // Whether the ID is extended
        isRemoteFrame: message.isRemoteFrame || false, // Whether it's a remote frame
        isRx: message.isRx                     // Whether it's received
    }));    
}