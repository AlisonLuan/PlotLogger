import { parseBLF } from "../scripts/parser-blf.js";

describe('parseBLF', () => {
  test('parses a valid BLF file with one CAN message', async () => {
    // Total file size: we'll use 152 bytes for our synthetic file.
    const totalSize = 152;
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const u8 = new Uint8Array(buffer);

    // Helper to write an ASCII string at a given offset.
    function writeString(str, offset) {
      for (let i = 0; i < str.length; i++) {
        u8[offset + i] = str.charCodeAt(i);
      }
    }

    // --- Segment 1: File Header (bytes 0-72) ---
    // Signature "LOGG" (4 bytes)
    writeString("LOGG", 0);
    // headerSize (4 bytes, little-endian): set to 72 (no extra header extension)
    view.setUint32(4, 72, true);
    // appID, appMajor, appMinor, appBuild (4 bytes): zeros (offset 8-11)
    u8.set([0, 0, 0, 0], 8);
    // binLogMajor, binLogMinor, binLogBuild, binLogPatch (4 bytes): zeros (offset 12-15)
    u8.set([0, 0, 0, 0], 12);
    // fileSize (8 bytes, little-endian, BigUint64): set to totalSize
    view.setBigUint64(16, BigInt(totalSize), true);
    // uncompressedSize (8 bytes): also totalSize
    view.setBigUint64(24, BigInt(totalSize), true);
    // objectCount (4 bytes): 1
    view.setUint32(32, 1, true);
    // objectsRead (4 bytes): 1
    view.setUint32(36, 1, true);
    // timeStart (16 bytes): 8 uint16 values.
    // We choose: [2025, 1, 0, 1, 1, 1, 0, 0]
    // When unpacked via: const [year, month, , day, hour, minute, second, ms] = timeStart,
    // this yields a date of: 2025-01-01 01:01:00.000 (local time).
    const timeStart = [2025, 1, 0, 1, 1, 1, 0, 0]    ;
    for (let i = 0; i < 8; i++) {
      view.setUint16(40 + i * 2, timeStart[i], true);
    }
    // timeStop (16 bytes): set all to 0.
    for (let i = 0; i < 8; i++) {
      view.setUint16(56 + i * 2, 0, true);
    }

    // --- Segment 2: Object Header (bytes 72-88) ---
    // This header is read by OBJ_HEADER_BASE_STRUCTunpack.
    // Write signature "LOBJ" (4 bytes)
    writeString("LOBJ", 72);
    // headerSize (2 bytes): 16
    view.setUint16(76, 16, true);
    // headerVersion (2 bytes): 1
    view.setUint16(78, 1, true);
    // objectSize (4 bytes): outer object size.
    // We plan for our object content to contain 16 bytes for LOG_CONTAINER_STRUCT
    // plus 48 bytes for container data (see below) → 16+48 = 64.
    // Since the object header base is 16 bytes, set objectSize = 16 + 64 = 80.
    view.setUint32(80, 80, true);
    // objectType (4 bytes): LOG_CONTAINER (10)
    view.setUint32(84, 10, true);

    // --- Segment 3: Object Content (bytes 88-152) ---
    // Object content length = objectSize - 16 = 80 - 16 = 64 bytes.
    // First 16 bytes: LOG_CONTAINER_STRUCT.
    // compressionMethod (2 bytes): NO_COMPRESSION (0)
    view.setUint16(88, 0, true);
    // 6 bytes of padding (offsets 90-95): zeros.
    for (let i = 90; i < 96; i++) {
      u8[i] = 0;
    }
    // sizeUncompressed (4 bytes): arbitrary (set to 64)
    view.setUint32(96, 64, true);
    // 4 bytes of final padding (offsets 100-103): zeros.
    for (let i = 100; i < 104; i++) {
      u8[i] = 0;
    }
    // The remaining 48 bytes (offsets 104-152) are containerData.
    // We'll build one inner object (CAN message) here.

    // --- Inner Object Message (48 bytes total) ---
    const innerOffset = 104;
    // Segment A: Inner object header base (16 bytes)
    // Signature "LOBJ"
    writeString("LOBJ", innerOffset); // bytes 104-107
    // headerSize: 16 (2 bytes)
    view.setUint16(innerOffset + 4, 16, true);
    // headerVersion: 1 (2 bytes)
    view.setUint16(innerOffset + 6, 1, true);
    // objectSize: total inner message size = 16 (header base) + 16 (header V1) + 16 (CAN message) = 48
    view.setUint32(innerOffset + 8, 48, true);
    // objectType: CAN_MESSAGE (1)
    view.setUint32(innerOffset + 12, 1, true);

    // Segment B: Inner header V1 (16 bytes, from offset 120 to 135)
    const innerV1Offset = 120;
    // flags (4 bytes): set to 1 so that factor becomes 1e-5
    view.setUint32(innerV1Offset, 1, true);
    // clientIndex (2 bytes): 0
    view.setUint16(innerV1Offset + 4, 0, true);
    // objectVersion (2 bytes): 1
    view.setUint16(innerV1Offset + 6, 1, true);
    // timestamp (8 bytes): set to BigInt(100000)
    view.setBigUint64(innerV1Offset + 8, BigInt(100000), true);

    // Segment C: CAN message (16 bytes, from offset 136 to 151)
    const canMsgOffset = 136;
    // channel (2 bytes): set to 1 (will yield channel 0 after subtracting 1)
    view.setUint16(canMsgOffset, 1, true);
    // flags (1 byte): 0 (so isRemoteFrame is false and isRx becomes true)
    u8[canMsgOffset + 2] = 0;
    // dlc (1 byte): 4
    u8[canMsgOffset + 3] = 4;
    // arbitrationId (4 bytes): set to 0x123 (291 decimal)
    view.setUint32(canMsgOffset + 4, 0x123, true);
    // data (8 bytes): first 4 bytes are 0xAA, 0xBB, 0xCC, 0xDD; the remaining bytes can be 0.
    u8[canMsgOffset + 8] = 0xAA;
    u8[canMsgOffset + 9] = 0xBB;
    u8[canMsgOffset + 10] = 0xCC;
    u8[canMsgOffset + 11] = 0xDD;
    for (let i = canMsgOffset + 12; i < canMsgOffset + 16; i++) {
      u8[i] = 0;
    }

    // --- Fake File Object ---
    // Our fake file exposes a slice method returning an object with an arrayBuffer() method.
    const fakeFile = {
      slice: (start, end) => ({
        arrayBuffer: async () => buffer.slice(start, end)
      })
    };

    // Call parseBLF with our fake file.
    const messages = await parseBLF(fakeFile);

    // Compute expected global start timestamp using the same logic as systemTimeToTimestamp.
    // For timeStart [2025, 1, 0, 1, 1, 0, 0, 0]:
    // The destructuring in systemTimeToTimestamp is:
    //   const [year, month, , day, hour, minute, second, milliseconds] = systemTime;
    // Thus, year=2025, month=1, day=1, hour=1, minute=1, second=0, ms=0.
    const expectedStart = new Date(2025, 0, 1, 1, 1, 0, 0).getTime() / 1000;
    // In the inner header, timestamp = 100000 and flags = 1, so factor = 1e-5.
    // Effective inner message timestamp = 100000 * 1e-5 = 1, plus global start.
    const expectedTimestamp = expectedStart + 1;

    const expectedMessage = {
      timestamp: expectedTimestamp,
      arbitrationId: 0x123,
      data: new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD]),
      channel: 0, // channel 1 becomes 0 after subtracting 1
      isExtendedId: false,
      isRemoteFrame: false,
      isRx: true
    };

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(expectedMessage);
  });

  test('returns empty array for invalid BLF signature', async () => {
    const buffer = new ArrayBuffer(72);
    const u8 = new Uint8Array(buffer);
    // Write an invalid signature "BAD!"
    u8[0] = 'B'.charCodeAt(0);
    u8[1] = 'A'.charCodeAt(0);
    u8[2] = 'D'.charCodeAt(0);
    u8[3] = '!'.charCodeAt(0);

    const fakeFile = {
      slice: (start, end) => ({
        arrayBuffer: async () => buffer.slice(start, end)
      })
    };

    const messages = await parseBLF(fakeFile);
    expect(messages).toEqual([]);
  });
});
