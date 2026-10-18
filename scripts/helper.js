/**
 * Calculates the end bit position in a CAN message given the start bit and bit size.
 * Ensures correct alignment within byte boundaries.
 * 
 * @param {number} inputStartBit - The starting bit position.
 * @param {number} inputBitSize - The size of the signal in bits.
 * @returns {number} - The calculated end bit position.
 */
/**
 * Extracts a raw value from a CAN message payload.
 * Supports both Big Endian (Motorola) and Little Endian formats.
 * 
 * @param {Array<number>} data - CAN message data as an array of bytes.
 * @param {number} startBit - The start bit of the signal.
 * @param {number} length - The length of the signal in bits.
 * @param {string} byteOrder - "LittleEndian" or "BigEndian".
 * @returns {number} - Extracted raw value.
 */
export function extractRawValue(data, startBit, length, byteOrder) {
    if (!Array.isArray(data) && !(data instanceof Uint8Array)) {
        throw new TypeError("CAN payload must be an array of bytes.");
    }
    if (!Number.isInteger(startBit) || startBit < 0 ||
        !Number.isInteger(length) || length < 1) {
        throw new RangeError("Signal start bit and length must be positive integers.");
    }

    let rawValue = 0n;
    if (byteOrder === "BigEndian") {
        let bitIndex = startBit;
        for (let index = 0; index < length; index++) {
            const byteIndex = Math.floor(bitIndex / 8);
            if (byteIndex >= data.length) return NaN;
            const bitInByte = bitIndex % 8;
            rawValue = (rawValue << 1n) | BigInt((data[byteIndex] >> bitInByte) & 1);
            bitIndex = bitInByte === 0 ? bitIndex + 15 : bitIndex - 1;
        }
    } else {
        for (let index = 0; index < length; index++) {
            const bitIndex = startBit + index;
            const byteIndex = Math.floor(bitIndex / 8);
            if (byteIndex >= data.length) return NaN;
            const bitInByte = bitIndex % 8;
            if ((data[byteIndex] >> bitInByte) & 1) rawValue |= 1n << BigInt(index);
        }
    }

    return rawValue <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rawValue) : rawValue;
}