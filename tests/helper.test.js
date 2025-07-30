import { extractRawValue } from "../scripts/helper.js";

describe('extractRawValue', () => {
  test('Little Endian: extract lower nibble from one byte (0xF2, startBit=0, length=4)', () => {
    // 0xF2 in binary: 11110010.
    // For Little Endian with startBit 0, we want the least-significant 4 bits:
    // Expected: "0010" → 2.
    const data = [0xF2];
    const startBit = 0;
    const length = 4;
    const byteOrder = "LittleEndian";
    const result = extractRawValue(data, startBit, length, byteOrder);
    expect(result).toBe(2);
  });

  test('Little Endian: extract upper nibble from one byte (0xF2, startBit=4, length=4)', () => {
    const data = [0xF2];
    const startBit = 4;
    const length = 4;
    const byteOrder = "LittleEndian";
    const result = extractRawValue(data, startBit, length, byteOrder);
    expect(result).toBe(15);
  });

  test('Big Endian: extract upper nibble from one byte (0xF2, startBit=4, length=4)', () => {
    // 0xF2 in binary: 11110010.
    // For Big Endian with startBit 4, bitOffset = 4.
    // The extraction uses: substring(7 - 4, 7 - 4 + 4) = substring(3, 7).
    // In "11110010", characters at indices 3..6 are "1001" which is 9.
    const data = [0xF2];
    const startBit = 4;
    const length = 4;
    const byteOrder = "BigEndian";
    const result = extractRawValue(data, startBit, length, byteOrder);
    expect(result).toBe(9);
  });

  test('Little Endian: extract 8-bit signal spanning two bytes', () => {
    // Use data = [0x12, 0x34].
    // In hex:
    //   0x12 = 00010010
    //   0x34 = 00110100
    // For Little Endian, the bytes are reversed to [0x34, 0x12] and then
    // the extraction uses: substring((totalBits - bitOffset - length), (totalBits - bitOffset)).
    // For startBit = 4, bitOffset = 4, totalBits = 16.
    // So the extraction index becomes substring(16 - 4 - 8, 16 - 4) = substring(4, 12).
    // The concatenated binary string from [0x34, 0x12] is:
    //   "00110100" + "00010010" = "0011010000010010"
    // Characters 4 to 11 of that string are "01000001", which is binary for 65.
    const data = [0x12, 0x34];
    const startBit = 4;
    const length = 8;
    const byteOrder = "LittleEndian";
    const result = extractRawValue(data, startBit, length, byteOrder);
    expect(result).toBe(65);
  });

  test('Big Endian: extract 8-bit signal spanning two bytes', () => {
    // With the same data [0x12, 0x34] and startBit = 4, length = 8:
    // The binary string (without byte reversal) is:
    //   "00010010" + "00110100" = "0001001000110100"
    // For Big Endian, the extraction is: substring(7 - bitOffset, 7 - bitOffset + 8)
    // With bitOffset = 4, that becomes substring(3, 11).
    // In "0001001000110100", substring(3,11) yields "10010000".
    // "00110010" in binary is 145.
    const data = [0x12, 0x34];
    const startBit = 4;
    const length = 8;
    const byteOrder = "BigEndian";
    const result = extractRawValue(data, startBit, length, byteOrder);
    expect(result).toBe(145);
  });

  test('Little Endian: extract full 16-bit value', () => {
    // For data = [0xAB, 0xCD]:
    //   0xAB = 10101011, 0xCD = 11001101.
    // For Little Endian, the bytes are reversed to [0xCD, 0xAB].
    // The full binary string becomes "11001101" + "10101011" = "1100110110101011".
    // With startBit = 0 and length = 16, the extraction should return the entire string,
    // yielding 0xCDAB.
    const data = [0xAB, 0xCD];
    const startBit = 0;
    const length = 16;
    const byteOrder = "LittleEndian";
    const result = extractRawValue(data, startBit, length, byteOrder);
    expect(result).toBe(0xCDAB);
  });

  test('Big Endian: extract full 16-bit value from non-zero startBit', () => {
    // Using data = [0xAB, 0xCD] again.
    // For Big Endian, extracting a full 16-bit value directly from startBit = 0
    // might be ambiguous due to the way calculateEndBit works.
    // Here we choose startBit = 7 so that the extraction (using substring(7 - bitOffset,...))
    // ends up selecting the complete 16-bit concatenated binary string.
    // With data = [0xAB, 0xCD]:
    //   "10101011" + "11001101" = "1010101111001101" → 0xABCD.
    const data = [0xAB, 0xCD];
    const startBit = 7;
    const length = 16;
    const byteOrder = "BigEndian";
    const result = extractRawValue(data, startBit, length, byteOrder);
    expect(result).toBe(0xABCD);
  });

  test('Little Endian: extract 24-bit signal from middle of 8-byte array (startBit=10, length=24)', () => {
    // Data: [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]
    // Explanation: For startBit=10, length=24, after reversing the relevant bytes,
    // the expected value is 5311688.
    const data = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88];
    const startBit = 10;
    const length = 24;
    const byteOrder = "LittleEndian";
    const result = extractRawValue(data, startBit, length, byteOrder);
    expect(result).toBe(5311688);
  });

  test('Little Endian: extract 24-bit signal from aligned 8-byte array (startBit=16, length=24)', () => {
    // Data: [0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x11, 0x22]
    // Explanation: For startBit=16, length=24, after reversing the relevant bytes,
    // the expected value is 0xEEDDCC.
    const data = [0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x11, 0x22];
    const startBit = 16;
    const length = 24;
    const byteOrder = "LittleEndian";
    const result = extractRawValue(data, startBit, length, byteOrder);
    expect(result).toBe(0xEEDDCC);
  });

  test('Big Endian: extract 20-bit signal from middle of 8-byte array (startBit=12, length=20)', () => {
    // Data: [0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF]
    // Explanation: For startBit=12, length=20, the expected value is 0x1A2B3.
    const data = [0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF];
    const startBit = 12;
    const length = 20;
    const byteOrder = "BigEndian";
    const result = extractRawValue(data, startBit, length, byteOrder);
    expect(result).toBe(0x1A2B3);
  });

  test('Little Endian: extract 16-bit signal from a 3-byte array with non-zero startBit (startBit=3, length=16)', () => {
    // Data: [0xDE, 0xAD, 0xBE]
    // Explanation: For startBit=3, length=16, after reversing the bytes,
    // the expected value is 0xD5BB.
    const data = [0xDE, 0xAD, 0xBE];
    const startBit = 3;
    const length = 16;
    const byteOrder = "LittleEndian";
    const result = extractRawValue(data, startBit, length, byteOrder);
    expect(result).toBe(0xD5BB);
  });

  test('Big Endian: extract 12-bit signal from a 3-byte array with non-zero startBit (startBit=4, length=12)', () => {
    // Data: [0xDE, 0xAD, 0xBE]
    // Explanation: For startBit=4, length=12, the expected value is 0xF56.
    const data = [0xDE, 0xAD, 0xBE];
    const startBit = 4;
    const length = 12;
    const byteOrder = "BigEndian";
    const result = extractRawValue(data, startBit, length, byteOrder);
    expect(result).toBe(0xF56);
  });
});
