/**
 * Calculates the end bit position in a CAN message given the start bit and bit size.
 * Ensures correct alignment within byte boundaries.
 * 
 * @param {number} inputStartBit - The starting bit position.
 * @param {number} inputBitSize - The size of the signal in bits.
 * @returns {number} - The calculated end bit position.
 */
function calculateEndBit(inputStartBit, inputBitSize) {
    const rowStart = Math.floor(inputStartBit / 8);
    const relStart = inputStartBit % 8;
    const invStart = 7 - relStart;
    const invStartOffset = invStart + (rowStart * 8);
    const endBit = (invStartOffset + inputBitSize) - 1;
    const modEnd = endBit % 8;
    const norEnd = 8 - modEnd - 1;
    return (Math.floor(endBit / 8) * 8) + norEnd;
}

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
    let newStartBit = byteOrder === "BigEndian" ? calculateEndBit(startBit, length) : startBit;
    const startByte = Math.floor(startBit / 8);
    const endByte = Math.ceil((newStartBit + length) / 8);
    const bitOffset = startBit % 8;

    // Extract relevant bytes
    let valueBytes = data.slice(startByte, endByte);
    if (byteOrder === "LittleEndian") {
        valueBytes.reverse();
    }

    // Convert to binary and extract bits
    const binaryString = valueBytes
        .map(byte => byte.toString(2).padStart(8, '0'))
        .join('');

    let rawBinary;
    if (byteOrder === "BigEndian") {
        rawBinary = binaryString.substring(7 - bitOffset, 7 - bitOffset + length);
    } else {
        // For little endian, count from the right side of the binary string.
        rawBinary = binaryString.substring(
            binaryString.length - (bitOffset + length),
            binaryString.length - bitOffset
        );
    }

    return parseInt(rawBinary, 2);
}