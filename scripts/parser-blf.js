// CAN Message Types
const CAN_MESSAGE = 1;
const LOG_CONTAINER = 10;
const CAN_ERROR_EXT = 73;
const CAN_MESSAGE2 = 86;
const GLOBAL_MARKER = 96;
const CAN_FD_MESSAGE = 100;
const CAN_FD_MESSAGE_64 = 101;

// Compression Types
const NO_COMPRESSION = 0;
const ZLIB_DEFLATE = 2;

// CAN Flags
const CAN_MSG_EXT = 0x80000000;
const REMOTE_FLAG = 0x80;
const EDL = 0x1;
const BRS = 0x2;
const ESI = 0x4;
const DIR = 0x1;

// Time Units
const TIME_TEN_MICS = 0x00000001;
const TIME_ONE_NANS = 0x00000002;
const MAX_BLF_FILE_SIZE = 512 * 1024 * 1024;
const MAX_CONTAINER_SIZE = 256 * 1024 * 1024;
const MAX_BLF_UNCOMPRESSED_SIZE = 512 * 1024 * 1024;
const INFLATE_INPUT_CHUNK_SIZE = 16 * 1024;


export async function parseBLF(file) {
    try {
        const parsedMessages = [];
        if (file.size > MAX_BLF_FILE_SIZE) {
            throw new RangeError("BLF files larger than 512 MiB are not supported.");
        }

        const headerBuffer = await file.slice(0, 72).arrayBuffer();
        const data = new DataView(headerBuffer);

        const header = FILE_HEADER_STRUCTunpack(data);
        if (Number(header.fileSize) > MAX_BLF_FILE_SIZE) {
            throw new RangeError("BLF files larger than 512 MiB are not supported.");
        }

        if (header.signature !== "LOGG") {
            throw new Error(`Invalid BLF signature: expected 'LOGG', got '${header.signature}'.`);
        }

        const startTimestamp = systemTimeToTimestamp(header.timeStart);
        const fileSize = Number(header.fileSize);
        if (fileSize < header.headerSize || fileSize > file.size) {
            throw new Error("BLF header declares an invalid file size.");
        }
        let offset = header.headerSize;
        let totalUncompressedSize = 0;
        while (offset + 16 <= fileSize) {
            const objectBuffer = await file.slice(offset, offset + 16).arrayBuffer();
            const object = OBJ_HEADER_BASE_STRUCTunpack(new DataView(objectBuffer));
            if (object.signature !== "LOBJ") {
                throw new Error(`Invalid BLF object signature at byte ${offset}.`);
            }
            if (object.objectSize < object.headerSize + 16 || offset + object.objectSize > fileSize) {
                throw new Error(`Invalid BLF object size at byte ${offset}.`);
            }

            if (object.objectType === LOG_CONTAINER) {
                const objectContentBuffer = await file.slice(
                    offset + object.headerSize,
                    offset + object.objectSize
                ).arrayBuffer();
                const containerView = new DataView(objectContentBuffer);
                const container = LOG_CONTAINER_STRUCTunpack(containerView);
                if (container.sizeUncompressed > MAX_CONTAINER_SIZE) {
                    throw new RangeError("BLF container expands beyond the 256 MiB safety limit.");
                }
                if (container.sizeUncompressed > MAX_BLF_UNCOMPRESSED_SIZE - totalUncompressedSize) {
                    throw new RangeError("BLF data expands beyond the 512 MiB total safety limit.");
                }
                let containerData = new Uint8Array(objectContentBuffer, 16);
                if (container.compressionMethod === ZLIB_DEFLATE) {
                    if (!globalThis.pako?.Inflate) {
                        throw new Error("pako is required to read compressed BLF containers.");
                    }
                    const maxOutputSize = Math.min(
                        MAX_CONTAINER_SIZE,
                        MAX_BLF_UNCOMPRESSED_SIZE - totalUncompressedSize
                    );
                    containerData = inflateContainer(containerData, maxOutputSize);
                } else if (container.compressionMethod !== NO_COMPRESSION) {
                    throw new Error(`Unsupported BLF compression method ${container.compressionMethod}.`);
                }
                if (containerData.byteLength > MAX_CONTAINER_SIZE) {
                    throw new RangeError("BLF container expands beyond the 256 MiB safety limit.");
                }
                totalUncompressedSize += containerData.byteLength;
                if (totalUncompressedSize > MAX_BLF_UNCOMPRESSED_SIZE) {
                    throw new RangeError("BLF data expands beyond the 512 MiB total safety limit.");
                }
                if (container.sizeUncompressed && containerData.byteLength !== container.sizeUncompressed) {
                    throw new Error("BLF container decompressed size does not match its header.");
                }
                for (const message of parseData(containerData, startTimestamp)) {
                    parsedMessages.push({
                        timestamp: message.timestamp,
                        arbitrationId: message.arbitrationId,
                        data: message.data,
                        channel: message.channel !== undefined ? message.channel : null,
                        isExtendedId: message.isExtendedId,
                        isRemoteFrame: message.isRemoteFrame,
                        isRx: message.isRx,
                        isFd: message.isFd,
                        isErrorFrame: message.isErrorFrame,
                        dlc: message.dlc,
                        bitrateSwitch: message.bitrateSwitch,
                        errorStateIndicator: message.errorStateIndicator
                    });
                }
            }
            const objectEnd = offset + object.objectSize;
            const alignedObjectEnd = (objectEnd + 3) & ~3;
            if (alignedObjectEnd > fileSize && objectEnd !== fileSize) {
                throw new Error(`Truncated BLF object padding at byte ${objectEnd}.`);
            }
            offset = Math.min(alignedObjectEnd, fileSize);
        }

        function inflateContainer(compressedData, maxOutputSize) {
            const inflater = new globalThis.pako.Inflate();
            const chunks = [];
            let outputSize = 0;
            let exceededLimit = false;
            inflater.onData = chunk => {
                outputSize += chunk.byteLength;
                if (outputSize > maxOutputSize) {
                    exceededLimit = true;
                    return;
                }
                chunks.push(chunk);
            };

            for (let offset = 0; offset < compressedData.length; offset += INFLATE_INPUT_CHUNK_SIZE) {
                const end = Math.min(offset + INFLATE_INPUT_CHUNK_SIZE, compressedData.length);
                inflater.push(compressedData.subarray(offset, end), end === compressedData.length);
                if (exceededLimit) {
                    throw new RangeError("BLF container exceeds the decompressed data safety limit.");
                }
                if (inflater.err) {
                    throw new Error(`Unable to decompress BLF container: ${inflater.msg}`);
                }
            }
            if (compressedData.length === 0) {
                inflater.push(compressedData, true);
            }
            if (!inflater.ended) {
                throw new Error("BLF container contains incomplete zlib data.");
            }

            const result = new Uint8Array(outputSize);
            let offset = 0;
            for (const chunk of chunks) {
                result.set(chunk, offset);
                offset += chunk.byteLength;
            }
            return result;
        }

        return parsedMessages;
    } catch (error) {
        console.error("Error processing the file:", error);
        throw error;
    }
}


/**
 * Unpacks the OBJ_HEADER_BASE_STRUCT from a DataView.
 * @param {DataView} dataView - The binary data as a DataView.
 * @returns {object} The unpacked fields as an object containing the object header base information.
 * @throws {Error} If the input is not a DataView object.
 */
function OBJ_HEADER_BASE_STRUCTunpack(dataView) {
    // Validate input
    if (!(dataView instanceof DataView)) {
        throw new Error("Input must be a DataView object.");
    }

    let offset = 0;

    // Parse the fields as defined in the struct
    const signature = String.fromCharCode(
        dataView.getUint8(offset++),
        dataView.getUint8(offset++),
        dataView.getUint8(offset++),
        dataView.getUint8(offset++)
    );

    const headerSize = dataView.getUint16(offset, true); // Little-endian
    offset += 2;

    const headerVersion = dataView.getUint16(offset, true); // Little-endian
    offset += 2;

    const objectSize = dataView.getUint32(offset, true); // Little-endian
    offset += 4;

    const objectType = dataView.getUint32(offset, true); // Little-endian
    offset += 4;

    // Return the unpacked values as an object
    return {
        signature,
        headerSize,
        headerVersion,
        objectSize,
        objectType
    };
}

/**
 * Unpacks the FILE_HEADER_STRUCT from a DataView.
 * @param {DataView} dataView - The binary data as a DataView.
 * @returns {object} The unpacked fields as an object containing the file header information.
 * @throws {Error} If the input is not a DataView object.
 */
function FILE_HEADER_STRUCTunpack(dataView) {
    // Validate input
    if (!(dataView instanceof DataView)) {
        throw new Error("Input must be a DataView object.");
    }

    let offset = 0;

    // Parse the fields as defined in the struct
    const signature = String.fromCharCode(
        dataView.getUint8(offset++),
        dataView.getUint8(offset++),
        dataView.getUint8(offset++),
        dataView.getUint8(offset++)
    );

    const headerSize = dataView.getUint32(offset, true);
    offset += 4;

    const appID = dataView.getUint8(offset++);
    const appMajor = dataView.getUint8(offset++);
    const appMinor = dataView.getUint8(offset++);
    const appBuild = dataView.getUint8(offset++);

    const binLogMajor = dataView.getUint8(offset++);
    const binLogMinor = dataView.getUint8(offset++);
    const binLogBuild = dataView.getUint8(offset++);
    const binLogPatch = dataView.getUint8(offset++);

    const fileSize = dataView.getBigUint64(offset, true);
    offset += 8;

    const uncompressedSize = dataView.getBigUint64(offset, true);
    offset += 8;

    const objectCount = dataView.getUint32(offset, true);
    offset += 4;

    const objectsRead = dataView.getUint32(offset, true);
    offset += 4;

    const timeStart = [];
    for (let i = 0; i < 8; i++) {
        timeStart.push(dataView.getUint16(offset, true));
        offset += 2;
    }

    const timeStop = [];
    for (let i = 0; i < 8; i++) {
        timeStop.push(dataView.getUint16(offset, true));
        offset += 2;
    }

    // Return the parsed structure as an object
    return {
        signature,
        headerSize,
        appID,
        appMajor,
        appMinor,
        appBuild,
        binLogMajor,
        binLogMinor,
        binLogBuild,
        binLogPatch,
        fileSize: fileSize.toString(),
        uncompressedSize: uncompressedSize.toString(),
        objectCount,
        objectsRead,
        timeStart,
        timeStop
    };
}

/**
 * Unpacks the LOG_CONTAINER_STRUCT from a DataView.
 * @param {DataView} dataView - The binary data as a DataView.
 * @returns {object} The unpacked fields as an object { compressionMethod, sizeUncompressed }.
 * @throws {Error} If the input is not a DataView object.
 */
function LOG_CONTAINER_STRUCTunpack(dataView) {
    // Validate input
    if (!(dataView instanceof DataView)) {
        throw new Error("Input must be a DataView object.");
    }

    let offset = 0;

    // Read the compression method (unsigned short, 2 bytes)
    const compressionMethod = dataView.getUint16(offset, true); // Little-endian
    offset += 2;

    // Skip 6 bytes of padding
    offset += 6;

    // Read the size uncompressed (unsigned long, 4 bytes)
    const sizeUncompressed = dataView.getUint32(offset, true); // Little-endian
    offset += 4;

    // Skip the final 4 bytes of padding
    offset += 4;

    // Return the unpacked values as an object
    return {
        compressionMethod,
        sizeUncompressed
    };
}

/**
 * Unpacks an object header base structure from a Uint8Array.
 * @param {Uint8Array} uint8Array - The binary data as a Uint8Array.
 * @param {number} [offset=0] - The starting offset in the array.
 * @returns {Array} The unpacked fields as an array [signature, headerSize, headerVersion, objectSize, objectType].
 * @throws {Error} If the input is not a Uint8Array.
 */
function unpackObjHeaderBase(uint8Array, offset = 0) {
    // Validate input
    if (!(uint8Array instanceof Uint8Array)) {
        throw new Error("Input must be a Uint8Array.");
    }

    // Create a DataView for reading structured binary data
    const dataView = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);

    // Unpack fields and return them as an array
    const signature = String.fromCharCode(
        dataView.getUint8(offset),
        dataView.getUint8(offset + 1),
        dataView.getUint8(offset + 2),
        dataView.getUint8(offset + 3)
    );
    const headerSize = dataView.getUint16(offset + 4, true); // Little-endian
    const headerVersion = dataView.getUint16(offset + 6, true);
    const objectSize = dataView.getUint32(offset + 8, true); // Little-endian
    const objectType = dataView.getUint32(offset + 12, true); // Little-endian

    return [signature, headerSize, headerVersion, objectSize, objectType];
}

/**
 * Unpacks an object header version 1 structure from a Uint8Array.
 * @param {Uint8Array} uint8Array - The binary data as a Uint8Array.
 * @param {number} [offset=0] - The starting offset in the array.
 * @returns {Array} The unpacked fields as an array [flags, clientIndex, objectVersion, timestamp].
 * @throws {Error} If the input is not a Uint8Array.
 */
function unpackObjHeaderV1(uint8Array, offset = 0) {
    // Validate input
    if (!(uint8Array instanceof Uint8Array)) {
        throw new Error("Input must be a Uint8Array.");
    }

    // Create a DataView for reading structured binary data
    const dataView = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);

    // Unpack fields from the DataView
    const flags = dataView.getUint32(offset, true); // Little-endian
    const clientIndex = dataView.getUint16(offset + 4, true); // Little-endian
    const objectVersion = dataView.getUint16(offset + 6, true); // Little-endian
    const timestamp = dataView.getBigUint64(offset + 8, true); // Little-endian (BigInt)

    // Return unpacked fields as an array
    return [flags, clientIndex, objectVersion, timestamp];
}

/**
 * Unpacks a CAN message structure from a Uint8Array.
 * @param {Uint8Array} uint8Array - The binary data as a Uint8Array.
 * @param {number} [offset=0] - The starting offset in the array.
 * @returns {Array} The unpacked fields as an array [channel, flags, dlc, arbitrationId, data].
 * @throws {Error} If the input is not a Uint8Array.
 */
function unpackCanMsg(uint8Array, offset = 0) {
    // Validate input
    if (!(uint8Array instanceof Uint8Array)) {
        throw new Error("Input must be a Uint8Array.");
    }

    // Create a DataView for reading structured binary data
    const dataView = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);

    // Unpack fields
    const channel = dataView.getUint16(offset, true); // Little-endian
    const flags = dataView.getUint8(offset + 2);
    const dlc = dataView.getUint8(offset + 3);
    const arbitrationId = dataView.getUint32(offset + 4, true); // Little-endian

    // Read 8 bytes of data as a Uint8Array
    const data = uint8Array.slice(offset + 8, offset + 16);

    // Return unpacked fields as an array
    return [channel, flags, dlc, arbitrationId, data];
}

/**
 * Unpacks an object header version 2 structure from a Uint8Array.
 * @param {Uint8Array} uint8Array - The binary data as a Uint8Array.
 * @param {number} [offset=0] - The starting offset in the array.
 * @returns {Array} The unpacked fields as an array [flags, timestampStatus, objectVersion, timestamp].
 * @throws {Error} If the input is not a Uint8Array.
 */
function unpackObjHeaderV2(uint8Array, offset = 0) {
    // Validate input
    if (!(uint8Array instanceof Uint8Array)) {
        throw new Error("Input must be a Uint8Array.");
    }

    // Create a DataView for reading structured binary data
    const dataView = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);

    // Unpack fields
    const flags = dataView.getUint32(offset, true); // Little-endian
    const timestampStatus = dataView.getUint8(offset + 4); // 1 byte
    const objectVersion = dataView.getUint16(offset + 6, true); // Little-endian
    const timestamp = dataView.getBigUint64(offset + 8, true); // Little-endian (BigInt)

    // Return unpacked fields as an array
    return [flags, timestampStatus, objectVersion, timestamp];
}

/**
 * Unpacks a CAN FD message structure from a Uint8Array.
 * @param {Uint8Array} uint8Array - The binary data as a Uint8Array.
 * @param {number} [offset=0] - The starting offset in the array.
 * @returns {object} The unpacked fields as an object.
 * @throws {Error} If the input is not a Uint8Array.
 */
function unpackCanFdMsg(uint8Array, offset = 0) {
    // Validate input
    if (!(uint8Array instanceof Uint8Array)) {
        throw new Error("Input must be a Uint8Array.");
    }

    // Create a DataView for reading structured binary data
    const dataView = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);

    // Unpack fields
    const channel = dataView.getUint16(offset, true); // 2 bytes, little-endian
    const flags = dataView.getUint8(offset + 2); // 1 byte
    const dlc = dataView.getUint8(offset + 3); // 1 byte
    const arbitrationId = dataView.getUint32(offset + 4, true); // 4 bytes, little-endian
    const frameLength = dataView.getUint32(offset + 8, true); // 4 bytes, little-endian
    const bitCount = dataView.getUint8(offset + 12); // 1 byte
    const fdFlags = dataView.getUint8(offset + 13); // 1 byte
    const validDataBytes = dataView.getUint8(offset + 14); // 1 byte

    // Skip 5 bytes of padding
    const data = uint8Array.slice(offset + 20, offset + 84); // Extract 64 bytes of data

    // Return unpacked fields
    return {
        channel,
        flags,
        dlc,
        arbitrationId,
        frameLength,
        bitCount,
        fdFlags,
        validDataBytes,
        data,
    };
}

/**
 * Unpacks a CAN FD 64 message structure from a Uint8Array.
 * @param {Uint8Array} uint8Array - The binary data as a Uint8Array.
 * @param {number} [offset=0] - The starting offset in the array.
 * @returns {object} The unpacked fields as an object.
 * @throws {Error} If the input is not a Uint8Array.
 */
function unpackCanFd64Msg(uint8Array, offset = 0) {
    // Validate input
    if (!(uint8Array instanceof Uint8Array)) {
        throw new Error("Input must be a Uint8Array.");
    }

    // Create a DataView for reading structured binary data
    const dataView = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);

    // Unpack fields
    const channel = dataView.getUint8(offset); // 1 byte
    const dlc = dataView.getUint8(offset + 1); // 1 byte
    const validPayloadLength = dataView.getUint8(offset + 2); // 1 byte
    const txCount = dataView.getUint8(offset + 3); // 1 byte
    const arbitrationId = dataView.getUint32(offset + 4, true); // 4 bytes, little-endian
    const frameLength = dataView.getUint32(offset + 8, true); // 4 bytes, little-endian
    const flags = dataView.getUint32(offset + 12, true); // 4 bytes, little-endian
    const bitRateArbitration = dataView.getUint32(offset + 16, true); // 4 bytes, little-endian
    const bitRateData = dataView.getUint32(offset + 20, true); // 4 bytes, little-endian
    const timeOffsetBRS = dataView.getUint32(offset + 24, true); // 4 bytes, little-endian
    const timeOffsetCRC = dataView.getUint32(offset + 28, true); // 4 bytes, little-endian
    const bitCount = dataView.getUint16(offset + 32, true); // 2 bytes, little-endian
    const direction = dataView.getUint8(offset + 34); // 1 byte
    const extDataOffset = dataView.getUint8(offset + 35); // 1 byte
    const crc = dataView.getUint32(offset + 36, true); // 4 bytes, little-endian

    // Return unpacked fields as an object
    return {
        channel,
        dlc,
        validPayloadLength,
        txCount,
        arbitrationId,
        frameLength,
        flags,
        bitRateArbitration,
        bitRateData,
        timeOffsetBRS,
        timeOffsetCRC,
        bitCount,
        direction,
        extDataOffset,
        crc,
    };
}


/**
 * Unpacks CAN error extended structure from a Uint8Array.
 * @param {Uint8Array} uint8Array - The binary data as a Uint8Array.
 * @param {number} [offset=0] - The starting offset in the array.
 * @returns {object} The unpacked fields as an object.
 * @throws {Error} If the input is not a Uint8Array.
 */
function unpackCanErrorExt(uint8Array, offset = 0) {
    // Validate input
    if (!(uint8Array instanceof Uint8Array)) {
        throw new Error("Input must be a Uint8Array.");
    }

    // Create a DataView for reading structured binary data
    const dataView = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);

    // Unpack fields
    const channel = dataView.getUint16(offset, true); // 2 bytes, little-endian
    const length = dataView.getUint16(offset + 2, true); // 2 bytes, little-endian
    const flags = dataView.getUint32(offset + 4, true); // 4 bytes, little-endian
    const ecc = dataView.getUint8(offset + 8); // 1 byte
    const position = dataView.getUint8(offset + 9); // 1 byte
    const dlc = dataView.getUint8(offset + 10); // 1 byte

    // Skip 1 byte of padding
    const frameLength = dataView.getUint32(offset + 12, true); // 4 bytes, little-endian
    const id = dataView.getUint32(offset + 16, true); // 4 bytes, little-endian
    const flagsExt = dataView.getUint16(offset + 20, true); // 2 bytes, little-endian

    // Skip 2 bytes of padding
    const data = uint8Array.slice(offset + 24, offset + 32); // Extract 8 bytes of data

    // Return unpacked fields as an object
    return {
        channel,
        length,
        flags,
        ecc,
        position,
        dlc,
        frameLength,
        id,
        flagsExt,
        data,
    };
}

/**
 * Converts a system time array to a timestamp.
 * @param {Array<number>} systemTime - Array containing system time values:
 *    [year, month, day, hour, minute, second, millisecond]
 * @returns {number} The timestamp in seconds, or 0 if invalid.
 */
function systemTimeToTimestamp(systemTime) {
    try {
        if (!Array.isArray(systemTime) || systemTime.length < 8) {
            throw new Error("Invalid systemTime array.");
        }

        // Extract values from the systemTime array
        const [year, month, , day, hour, minute, second, milliseconds] = systemTime;

        // Create a JavaScript Date object
        const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, milliseconds));

        // Return the timestamp (seconds since UNIX epoch)
        return date.getTime() / 1000; // Convert from milliseconds to seconds
    } catch (error) {
        console.error("Error converting system time to timestamp:", error.message);
        return 0;
    }
}

/**
 * Parses binary data and yields parsed messages based on object types.
 * @param {Uint8Array} data - The binary data to parse.
 * @yields {object} Parsed message objects with relevant fields.
 */
function* parseData(data, fileStartTimestamp) {
    // Local copies of sizes and unpack functions
    const objHeaderBaseSize = 16; // OBJ_HEADER_BASE_STRUCT.size
    const objHeaderV1Size = 16; // OBJ_HEADER_V1_STRUCT.size
    const objHeaderV2Size = 24; // OBJ_HEADER_V2_STRUCT.size
    const canFd64MsgSize = 42;
    const maxPos = data.byteLength;
    let pos = 0;

    while (pos + objHeaderBaseSize <= maxPos) {
        const objectStart = pos;
        const header = unpackObjHeaderBase(data, pos);
        const [signature, , headerVersion, objSize, objType] = header;
        if (signature !== "LOBJ") {
            throw new Error(`Invalid object signature at container byte ${pos}.`);
        }
        const nextPos = pos + objSize;
        if (objSize < objHeaderBaseSize || nextPos > maxPos) {
            throw new Error(`Invalid object size at container byte ${pos}.`);
        }
        const alignedNextPos = (nextPos + 3) & ~3;
        if (alignedNextPos > maxPos && nextPos !== maxPos) {
            throw new Error(`Truncated object padding at container byte ${nextPos}.`);
        }
        pos += objHeaderBaseSize;

        // Read rest of header
        let flags, timestamp;
        if (headerVersion === 1) {
            [flags, , , timestamp] = unpackObjHeaderV1(data, pos);
            pos += objHeaderV1Size;
        } else if (headerVersion === 2) {
            [flags, , , timestamp] = unpackObjHeaderV2(data, pos);
            pos += objHeaderV2Size;
        } else {
            pos = Math.min(alignedNextPos, maxPos);
            continue;
        }
        if (pos > nextPos) throw new Error(`Invalid object header size at container byte ${pos}.`);

        // Calculate absolute timestamp
        const factor = flags === 1 ? 1e-5 : 1e-9;
        timestamp = Number(timestamp) * factor + fileStartTimestamp;

        // Parse object data based on objType
        switch (objType) {
            case CAN_MESSAGE:
            case CAN_MESSAGE2: {
                const [channel, flags, dlc, canId, canData] = unpackCanMsg(data, pos);
                yield {
                    timestamp,
                    arbitrationId: canId & 0x1FFFFFFF,
                    isExtendedId: Boolean(canId & CAN_MSG_EXT),
                    isRemoteFrame: Boolean(flags & REMOTE_FLAG),
                    isRx: !Boolean(flags & DIR),
                    dlc,
                    data: canData.slice(0, dlc),
                    channel: channel - 1,
                };
                break;
            }
            case CAN_ERROR_EXT: {
                const members = unpackCanErrorExt(data, pos);
                const { channel, dlc, id: canId, data: canData } = members;
                yield {
                    timestamp,
                    isErrorFrame: true,
                    isExtendedId: Boolean(canId & CAN_MSG_EXT),
                    arbitrationId: canId & 0x1FFFFFFF,
                    dlc,
                    data: canData.slice(0, dlc),
                    channel: channel - 1,
                };
                break;
            }
            case CAN_FD_MESSAGE: {
                const { channel, flags, dlc, arbitrationId: canId, fdFlags, validDataBytes: validBytes, data: canData } = unpackCanFdMsg(data, pos);
                yield {
                    timestamp,
                    arbitrationId: canId & 0x1FFFFFFF,
                    isExtendedId: Boolean(canId & CAN_MSG_EXT),
                    isRemoteFrame: Boolean(flags & REMOTE_FLAG),
                    isFd: Boolean(fdFlags & 0x1),
                    isRx: !Boolean(flags & DIR),
                    bitrateSwitch: Boolean(fdFlags & 0x2),
                    errorStateIndicator: Boolean(fdFlags & 0x4),
                    dlc: dlcToLength(dlc),
                    data: canData.slice(0, validBytes),
                    channel: channel - 1,
                };
                break;
            }
            case CAN_FD_MESSAGE_64: {
                const {
                    channel,
                    dlc,
                    validPayloadLength: validBytes,
                    arbitrationId: canId,
                    flags: fdFlags,
                    direction,
                    extDataOffset
                } = unpackCanFd64Msg(data, pos);
                if (pos + canFd64MsgSize > nextPos) {
                    throw new Error(`Truncated CAN FD 64 header at container byte ${pos}.`);
                }
                const payloadOffset = pos + canFd64MsgSize;
                const payloadEnd = extDataOffset
                    ? objectStart + extDataOffset
                    : nextPos;
                if (payloadEnd > nextPos) {
                    throw new Error(`Invalid CAN FD 64 extended-data offset at container byte ${pos}.`);
                }
                const availablePayloadBytes = Math.max(0, payloadEnd - payloadOffset);
                yield {
                    timestamp,
                    arbitrationId: canId & 0x1FFFFFFF,
                    isExtendedId: Boolean(canId & CAN_MSG_EXT),
                    isRemoteFrame: Boolean(fdFlags & 0x0010),
                    isFd: Boolean(fdFlags & 0x1000),
                    isRx: !direction,
                    bitrateSwitch: Boolean(fdFlags & 0x2000),
                    errorStateIndicator: Boolean(fdFlags & 0x4000),
                    dlc: dlcToLength(dlc),
                    data: data.slice(
                        payloadOffset,
                        payloadOffset + Math.min(validBytes, availablePayloadBytes)
                    ),
                    channel: channel - 1,
                };
                break;
            }

            default:
                // This line has been commented out so as not to overflow the console, but the parser itself does not fully recognise the blf.
                //console.warn(`Unknown object type (${objType})`);
        }

        pos = Math.min(alignedNextPos, maxPos);
    }
}

function dlcToLength(dlc) {
    const lengths = [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 20, 24, 32, 48, 64];
    return lengths[dlc] ?? dlc;
}

/**
 * Helper function to find the "LOBJ" signature in a binary data array.
 * @param {Uint8Array} data - The binary data to search.
 * @param {number} start - The start index for the search.
 * @param {number} end - The end index for the search.
 * @returns {number} The index of the "LOBJ" signature.
 * @throws {Error} If the "LOBJ" signature is not found.
 */
function findLOBJ(data, start, end) {
    for (let i = start; i < end; i++) {
        if (
            data[i] === "L".charCodeAt(0) &&
            data[i + 1] === "O".charCodeAt(0) &&
            data[i + 2] === "B".charCodeAt(0) &&
            data[i + 3] === "J".charCodeAt(0)
        ) {
            return i;
        }
    }
    throw new Error("LOBJ signature not found");
}
