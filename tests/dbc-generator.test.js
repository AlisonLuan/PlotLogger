import { jest } from "@jest/globals";
import {
    DEFAULT_GENERATOR_OPTIONS,
    formatDbcMessageId,
    inferDatabaseFromLog,
    normalizeGeneratorOptions,
    serializeDBC,
} from "../scripts/dbc-generator.js";
import { parseDBC } from "../scripts/parser-dbc.js";
import { extractRawValue } from "../scripts/helper.js";
import databaseHandler from "../scripts/main-db-loader.js";

function makeRandom(seed = 12345) {
    let state = seed;
    return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return (state >> 8) & 0xff;
    };
}

function frame(id, data, extra = {}) {
    return { id, data, isExtendedId: false, isRemoteFrame: false, isErrorFrame: false, ...extra };
}

function framesFor(id, count, build, extra = {}) {
    return Array.from({ length: count }, (_, index) => frame(id, build(index), extra));
}

const findMessage = (database, id) => database.messages.find(message => message.id === id);

describe("normalizeGeneratorOptions", () => {
    test("applies defaults", () => {
        expect(normalizeGeneratorOptions()).toEqual(DEFAULT_GENERATOR_OPTIONS);
    });

    test.each([0, 1, 2.5, -3, 1_000_001, "abc"])("rejects minFrames %p", (value) => {
        expect(() => normalizeGeneratorOptions({ minFrames: value })).toThrow(RangeError);
    });
});

describe("inferDatabaseFromLog", () => {
    test("rejects empty or invalid logs", () => {
        expect(() => inferDatabaseFromLog([])).toThrow(TypeError);
        expect(() => inferDatabaseFromLog(null)).toThrow(TypeError);
    });

    test("fails clearly when nothing varies", () => {
        const log = framesFor("0x100", 20, () => [1, 2, 3, 4]);
        expect(() => inferDatabaseFromLog(log)).toThrow(/No message/);
    });

    test("splits independent changing bytes and ignores constant bytes", () => {
        const random = makeRandom();
        const log = framesFor("0x123", 300, () => [random(), 0x55, random(), 0]);
        const { database, summary } = inferDatabaseFromLog(log, { detectCounters: false });
        const message = findMessage(database, "0x123");

        expect(message.dlc).toBe(4);
        expect(message.name).toBe("MSG_123");
        expect(message.signals.map(({ startBit, length, byteOrder }) => ({ startBit, length, byteOrder })))
            .toEqual([
                { startBit: 0, length: 8, byteOrder: "LittleEndian" },
                { startBit: 16, length: 8, byteOrder: "LittleEndian" },
            ]);
        expect(summary).toEqual({ messages: 1, signals: 2, skippedIds: 0 });
    });

    test("detects a rolling byte counter and a counter nibble", () => {
        const random = makeRandom(99);
        const log = framesFor("0x200", 300, index => [random(), index & 0xff, (index & 0x0f) | ((random() & 0x0f) << 4)]);
        const { database } = inferDatabaseFromLog(log);
        const signals = findMessage(database, "0x200").signals.map(({ name, startBit, length }) => ({ name, startBit, length }));

        expect(signals).toEqual([
            { name: "Sig_1", startBit: 0, length: 8 },
            { name: "Counter_2", startBit: 8, length: 8 },
            { name: "Counter_3", startBit: 16, length: 4 },
            { name: "Sig_4", startBit: 20, length: 4 },
        ]);
    });

    test("can disable counter detection", () => {
        const log = framesFor("0x201", 100, index => [index & 0xff]);
        const { database } = inferDatabaseFromLog(log, { detectCounters: false });
        expect(findMessage(database, "0x201").signals.map(signal => signal.name)).toEqual(["Sig_1"]);
    });

    test("merges a little-endian multi-byte value into one signal", () => {
        const log = framesFor("0x300", 400, index => {
            const value = index * 37;
            return [value & 0xff, value >> 8];
        });
        const { database } = inferDatabaseFromLog(log);
        const [signal, ...others] = findMessage(database, "0x300").signals;

        expect(others).toHaveLength(0);
        expect(signal).toMatchObject({ startBit: 0, length: 14, byteOrder: "LittleEndian", valueType: "Unsigned" }); // top two bits never change;
        expect(extractRawValue(log[10].data, signal.startBit, signal.length, signal.byteOrder)).toBe(370);
    });

    test("merges a big-endian multi-byte value using the Motorola start bit", () => {
        const log = framesFor("0x301", 400, index => {
            const value = index * 37;
            return [value >> 8, value & 0xff];
        });
        const { database } = inferDatabaseFromLog(log);
        const [signal, ...others] = findMessage(database, "0x301").signals;

        expect(others).toHaveLength(0);
        expect(signal).toMatchObject({ startBit: 5, length: 14, byteOrder: "BigEndian" });
        expect(extractRawValue(log[300].data, signal.startBit, signal.length, signal.byteOrder)).toBe(300 * 37);
    });

    test("infers signedness from values crossing zero", () => {
        const signedLog = framesFor("0x400", 200, index => [Math.round(20 * Math.sin(index / 5)) & 0xff]);
        const unsignedLog = framesFor("0x401", 200, index => [Math.round(128 + 120 * Math.sin(index / 5))]);
        const { database } = inferDatabaseFromLog([...signedLog, ...unsignedLog], { detectCounters: false });

        const signed = findMessage(database, "0x400").signals[0];
        expect(signed).toMatchObject({ valueType: "Signed", valueRange: [-128, 127] });
        expect(findMessage(database, "0x401").signals[0]).toMatchObject({ valueType: "Unsigned", valueRange: [0, 255] });
    });

    test("keeps standard and extended frames with the same numeric ID apart", () => {
        const standard = framesFor("0x123", 20, index => [index * 7 & 0xff]);
        const extended = framesFor("0x123", 20, index => [0, index * 13 & 0xff], { isExtendedId: true });
        const { database } = inferDatabaseFromLog([...extended, ...standard], { detectCounters: false });

        expect(database.messages.map(({ id, isExtendedId }) => ({ id, isExtendedId }))).toEqual([
            { id: "0x123", isExtendedId: false },
            { id: "0x00000123", isExtendedId: true },
        ]);
        expect(database.messages[1].signals[0].startBit).toBe(8);
    });

    test("skips IDs below the minimum frame count and reports them", () => {
        const log = [
            ...framesFor("0x10", 3, index => [index]),
            ...framesFor("0x11", 10, index => [index * 5]),
        ];
        const { database, summary } = inferDatabaseFromLog(log, { minFrames: 5, detectCounters: false });

        expect(database.messages.map(message => message.id)).toEqual(["0x011"]);
        expect(summary.skippedIds).toBe(1);
    });

    test("ignores remote frames, error frames and empty payloads", () => {
        const log = [
            ...framesFor("0x20", 20, index => [index * 3], { isRemoteFrame: true }),
            ...framesFor("0x21", 20, index => [index * 3], { isErrorFrame: true }),
            ...framesFor("0x22", 20, () => []),
            ...framesFor("0x23", 20, index => [index * 3]),
        ];
        const { database } = inferDatabaseFromLog(log, { detectCounters: false });
        expect(database.messages.map(message => message.id)).toEqual(["0x023"]);
    });

    test("uses the longest payload as the DLC when frame lengths differ", () => {
        const log = [
            ...framesFor("0x30", 10, index => [index * 3]),
            ...framesFor("0x30", 10, index => [index * 3, index * 11 & 0xff, 0]),
        ];
        const { database } = inferDatabaseFromLog(log, { detectCounters: false });
        expect(findMessage(database, "0x030").dlc).toBe(3);
    });
});

describe("formatDbcMessageId", () => {
    test("pads standard and extended identifiers like the DBC parser", () => {
        expect(formatDbcMessageId(0x1a, false)).toBe("0x01A");
        expect(formatDbcMessageId(0x1a, true)).toBe("0x0000001A");
    });
});

describe("serializeDBC", () => {
    function sampleLog() {
        const random = makeRandom(7);
        return [
            ...framesFor("0x123", 300, index => [random(), index & 0xff, Math.round(20 * Math.sin(index / 5)) & 0xff]),
            ...framesFor("0x18FEF100", 300, index => [index * 37 & 0xff, index * 37 >> 8], { isExtendedId: true }),
        ];
    }

    test("round-trips through parseDBC", () => {
        const { database } = inferDatabaseFromLog(sampleLog());
        const parsed = parseDBC(serializeDBC(database));

        expect(parsed.messages).toHaveLength(database.messages.length);
        parsed.messages.forEach((message, messageIndex) => {
            const expected = database.messages[messageIndex];
            expect(message).toMatchObject({
                id: expected.id,
                name: expected.name,
                dlc: expected.dlc,
                isExtendedId: expected.isExtendedId,
            });
            expect(message.signals.map(({ name, startBit, length, byteOrder, valueType, scaling, offset, valueRange }) =>
                ({ name, startBit, length, byteOrder, valueType, scaling, offset, valueRange })))
                .toEqual(expected.signals.map(({ name, startBit, length, byteOrder, valueType, scaling, offset, valueRange }) =>
                    ({ name, startBit, length, byteOrder, valueType, scaling, offset, valueRange })));
        });
    });

    test("emits a DBC extended-ID flag and comments", () => {
        const { database } = inferDatabaseFromLog(sampleLog());
        const text = serializeDBC(database);

        expect(text).toContain(`BO_ ${0x18FEF100 + 0x80000000} MSG_18FEF100: 2 Vector__XXX`);
        expect(text).toMatch(/CM_ BO_ 291 "Inferred from 300 frame\(s\) in the log\.";/);
    });

    test("escapes quotes and line breaks in comments", () => {
        const text = serializeDBC({
            nodes: [],
            messages: [{
                id: "0x001", name: "M", dlc: 1, sender: "Vector__XXX", isExtendedId: false,
                description: 'say "hi"\nnext',
                signals: [],
            }],
        });
        expect(text).toContain('CM_ BO_ 1 "say \'hi\' next";');
    });

    test("rejects data without messages", () => {
        expect(() => serializeDBC({})).toThrow(TypeError);
    });
});

describe("databaseHandler.loadParsedDatabase", () => {
    beforeEach(() => databaseHandler.resetDatabase());

    test("installs the generated database and fills the dropdown content", () => {
        const { database } = inferDatabaseFromLog(framesFor("0x123", 50, index => [index * 5]), { detectCounters: false });
        const unified = databaseHandler.loadParsedDatabase(database);

        expect(databaseHandler.isDatabaseLoaded()).toBe(true);
        expect(unified.messages[0].signals[0]).toMatchObject({ name: "Sig_1", startBit: 0, length: 8, scaling: 1 });
        expect(databaseHandler.getDropdownContent().Signal).toEqual(["Sig_1"]);
    });

    test("replaces a previously loaded database and rejects invalid data", () => {
        databaseHandler.database = { messages: [{ id: "0x1", name: "Old", signals: [] }] };
        databaseHandler.dropdownContent = { ID: ["0x1"], MsgName: ["Old"], Sender: [], Signal: [] };
        const { database } = inferDatabaseFromLog(framesFor("0x123", 50, index => [index * 5]), { detectCounters: false });
        databaseHandler.loadParsedDatabase(database);

        expect(databaseHandler.getDropdownContent().MsgName).toEqual(["MSG_123"]);
        expect(() => databaseHandler.loadParsedDatabase({})).toThrow(TypeError);
    });
});
