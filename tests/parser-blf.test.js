import { deflate, Inflate } from "pako";
import { parseBLF } from "../scripts/parser-blf.js";

function createInnerObject(type, payload, timestamp = 0) {
    const objectSize = 32 + payload.length;
    const bytes = new Uint8Array((objectSize + 3) & ~3);
    const view = new DataView(bytes.buffer);
    bytes.set([76, 79, 66, 74], 0);
    view.setUint16(4, 16, true);
    view.setUint16(6, 1, true);
    view.setUint32(8, objectSize, true);
    view.setUint32(12, type, true);
    view.setUint32(16, 1, true);
    view.setBigUint64(24, BigInt(timestamp), true);
    bytes.set(payload, 32);
    return bytes;
}

function createContainer(data, compressionMethod = 0, declaredSize = data.length) {
    const storedData = compressionMethod === 2 ? deflate(data) : data;
    const objectSize = 32 + storedData.length;
    const bytes = new Uint8Array((objectSize + 3) & ~3);
    const view = new DataView(bytes.buffer);
    bytes.set([76, 79, 66, 74], 0);
    view.setUint16(4, 16, true);
    view.setUint16(6, 1, true);
    view.setUint32(8, objectSize, true);
    view.setUint32(12, 10, true);
    view.setUint16(16, compressionMethod, true);
    view.setUint32(24, declaredSize, true);
    bytes.set(storedData, 32);
    return bytes;
}

function createFile(containers, milliseconds = 0) {
    const fileSize = 72 + containers.reduce((size, container) => size + container.length, 0);
    const bytes = new Uint8Array(fileSize);
    const view = new DataView(bytes.buffer);
    bytes.set([76, 79, 71, 71], 0);
    view.setUint32(4, 72, true);
    view.setBigUint64(16, BigInt(fileSize), true);
    view.setBigUint64(24, BigInt(fileSize), true);
    view.setUint32(32, containers.length, true);
    const systemTime = [2025, 1, 0, 1, 1, 1, 0, milliseconds];
    systemTime.forEach((value, index) => view.setUint16(40 + index * 2, value, true));
    let offset = 72;
    for (const container of containers) {
        bytes.set(container, offset);
        offset += container.length;
    }
    return {
        size: fileSize,
        slice: (start, end) => ({ arrayBuffer: async () => bytes.buffer.slice(start, end) })
    };
}

function classicCanMessage(id, payload) {
    const data = new Uint8Array(16);
    const view = new DataView(data.buffer);
    view.setUint16(0, 1, true);
    data[3] = payload.length;
    view.setUint32(4, id, true);
    data.set(payload, 8);
    return createInnerObject(1, data, 100000);
}

function canFdMessage(id, payload) {
    const data = new Uint8Array(84);
    const view = new DataView(data.buffer);
    view.setUint16(0, 1, true);
    data[3] = 9;
    view.setUint32(4, id, true);
    view.setUint32(8, 12, true);
    data[13] = 1;
    data[14] = payload.length;
    data.set(payload, 20);
    return createInnerObject(100, data, 100000);
}

function canFd64Message(id, payload, extDataOffset = 0) {
    const data = new Uint8Array(42 + payload.length);
    const view = new DataView(data.buffer);
    data[0] = 1;
    data[1] = 9;
    data[2] = payload.length;
    view.setUint32(4, id, true);
    view.setUint32(8, 12, true);
    view.setUint32(12, 0x1000, true);
    data[35] = extDataOffset;
    data.set(payload, 42);
    return createInnerObject(101, data, 100000);
}

function canErrorFrame(id, payload) {
    const data = new Uint8Array(32);
    const view = new DataView(data.buffer);
    view.setUint16(0, 1, true);
    data[10] = payload.length;
    view.setUint32(16, id, true);
    data.set(payload, 24);
    return createInnerObject(73, data, 100000);
}

describe("parseBLF", () => {
    test("parses objects across multiple containers, including CAN FD and error frames", async () => {
        const first = createContainer(classicCanMessage(0x123, [0xAA, 0xBB]));
        const second = createContainer(new Uint8Array([
            ...canFdMessage(0x124, [1, 2, 3]),
            ...canFd64Message(0x125, [4, 5, 6, 7]),
            ...canErrorFrame(0x126, [8, 9])
        ]));
        const messages = await parseBLF(createFile([first, second]));
        expect(messages).toHaveLength(4);
        expect(messages.map(message => message.arbitrationId)).toEqual([0x123, 0x124, 0x125, 0x126]);
        expect(Array.from(messages[0].data)).toEqual([0xAA, 0xBB]);
        expect(Array.from(messages[1].data)).toEqual([1, 2, 3]);
        expect(messages[1].isFd).toBe(true);
        expect(Array.from(messages[2].data)).toEqual([4, 5, 6, 7]);
        expect(messages[2].isFd).toBe(true);
        expect(messages[3].isErrorFrame).toBe(true);
        expect(Array.from(messages[3].data)).toEqual([8, 9]);
    });

    test("inflates zlib containers", async () => {
        const previousPako = globalThis.pako;
        globalThis.pako = { Inflate };
        try {
            const messages = await parseBLF(createFile([
                createContainer(classicCanMessage(0x321, [0x55]), 2)
            ]));
            expect(messages).toHaveLength(1);
            expect(Array.from(messages[0].data)).toEqual([0x55]);
        } finally {
            if (previousPako === undefined) delete globalThis.pako;
            else globalThis.pako = previousPako;
        }
    });

    test("honors 4-byte padding between BLF objects and containers", async () => {
        const unalignedObject = createInnerObject(999, new Uint8Array(18));
        expect(new DataView(unalignedObject.buffer).getUint32(8, true) % 4).toBe(2);
        const firstContainer = createContainer(unalignedObject, 2);
        const secondContainer = createContainer(classicCanMessage(0x222, [0x44]));
        expect(new DataView(firstContainer.buffer).getUint32(8, true) % 4).not.toBe(0);

        const previousPako = globalThis.pako;
        globalThis.pako = { Inflate };
        try {
            const messages = await parseBLF(createFile([firstContainer, secondContainer]));
            expect(messages).toHaveLength(1);
            expect(messages[0].arbitrationId).toBe(0x222);
        } finally {
            if (previousPako === undefined) delete globalThis.pako;
            else globalThis.pako = previousPako;
        }
    });

    test("uses extDataOffset as the payload boundary and never reads into the next object", async () => {
        const extendedPayload = canFd64Message(0x125, [4, 5, 6], 77);
        const valid = await parseBLF(createFile([createContainer(extendedPayload)]));
        expect(Array.from(valid[0].data)).toEqual([4, 5, 6]);

        const shortPayload = canFd64Message(0x125, [4, 5, 6], 75);
        const nextMessage = classicCanMessage(0x222, [0x44]);
        const messages = await parseBLF(createFile([
            createContainer(new Uint8Array([...shortPayload, ...nextMessage]))
        ]));
        expect(Array.from(messages[0].data)).toEqual([4]);
        expect(messages[1].arbitrationId).toBe(0x222);
    });

    test("rejects BLF containers that declare excessive decompressed data", async () => {
        const container = createContainer(new Uint8Array([1]), 2, 256 * 1024 * 1024 + 1);
        await expect(parseBLF(createFile([container])))
            .rejects.toThrow("256 MiB safety limit");
    });

    test("rejects BLF files over the input size limit before reading", async () => {
        await expect(parseBLF({
            size: 512 * 1024 * 1024 + 1,
            slice: () => {
                throw new Error("Oversized files must be rejected before reading.");
            }
        })).rejects.toThrow("512 MiB");
    });

    test("keeps SYSTEMTIME milliseconds at millisecond precision", async () => {
        const messages = await parseBLF(createFile([
            createContainer(classicCanMessage(0x123, [1]))
        ], 500));
        expect(messages[0].timestamp).toBe(Date.UTC(2025, 0, 1, 1, 1, 0, 500) / 1000 + 1);
    });

    test("throws for invalid BLF signatures", async () => {
        const file = createFile([]);
        const bytes = await file.slice(0, file.size).arrayBuffer();
        new Uint8Array(bytes).set([66, 65, 68, 33]);
        await expect(parseBLF({
            size: file.size,
            slice: (start, end) => ({ arrayBuffer: async () => bytes.slice(start, end) })
        })).rejects.toThrow("Invalid BLF signature");
    });
});
