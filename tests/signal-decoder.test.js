import { findSignalInDatabase, processSelectedSignals, toSigned } from "../scripts/signal-decoder.js";

const makeSignal = (overrides = {}) => ({
    name: "Speed",
    startBit: 0,
    length: 8,
    byteOrder: "LittleEndian",
    valueType: "Unsigned",
    scaling: 1,
    offset: 0,
    units: "km/h",
    ...overrides
});

describe("signal decoder", () => {
    test("selects duplicate signal names by message identity", () => {
        const database = {
            messages: [
                { id: "0x100", name: "Engine", isExtendedId: false, signals: [makeSignal()] },
                { id: "0x200", name: "Vehicle", isExtendedId: false, signals: [makeSignal()] }
            ]
        };
        const log = [
            { id: "0x100", isExtendedId: false, data: [10], timestamp: "t1" },
            { id: "0x200", isExtendedId: false, data: [20], timestamp: "t2" }
        ];
        expect(findSignalInDatabase(database, "Speed", "0x200").messageName).toBe("Vehicle");
        expect(processSelectedSignals([{ signalName: "Speed", messageId: "0x200" }], log, database)[0].data)
            .toEqual([{ timestamp: "t2", value: 20 }]);
    });

    test("sign-extends values wider than 31 bits", () => {
        const database = {
            messages: [{
                id: "0x100",
                name: "Wide",
                signals: [makeSignal({ name: "SignedWide", length: 40, valueType: "Signed" })]
            }]
        };
        const log = [{
            id: "0x100",
            data: [0, 0, 0, 0, 0x80],
            timestamp: "t",
            isExtendedId: false
        }];
        const result = processSelectedSignals([{ signalName: "SignedWide", messageId: "0x100" }], log, database);
        expect(result[0].data[0].value).toBe(-(2 ** 39));
        expect(toSigned(0x80000000, 32)).toBe(-0x80000000);
    });

    test("filters multiplexed frames and skips remote or truncated data", () => {
        const database = {
            messages: [{
                id: "0x100",
                name: "MuxFrame",
                signals: [makeSignal({
                    name: "Child",
                    startBit: 8,
                    length: 8,
                    isMultiplexed: true,
                    multiplexerValue: 1,
                    multiplexerStartBit: 0,
                    multiplexerLength: 8,
                    multiplexerByteOrder: "LittleEndian"
                })]
            }]
        };
        const log = [
            { id: "0x100", isExtendedId: false, data: [1, 25], timestamp: "match" },
            { id: "0x100", isExtendedId: false, data: [2, 26], timestamp: "mismatch" },
            { id: "0x100", isExtendedId: false, data: [1], timestamp: "truncated" },
            { id: "0x100", isExtendedId: false, data: [1, 99], timestamp: "remote", isRemoteFrame: true },
            { id: "0x100", isExtendedId: false, data: [1, 88], timestamp: "error", isErrorFrame: true }
        ];
        const result = processSelectedSignals([{ signalName: "Child", messageId: "0x100" }], log, database);
        expect(result[0].data).toEqual([{ timestamp: "match", value: 25 }]);
    });

    test("decodes IEEE-754 DBC values and inclusive multiplex ranges", () => {
        const database = {
            messages: [{
                id: "0x100",
                name: "Mixed",
                signals: [
                    makeSignal({ name: "Temperature", startBit: 8, length: 32, valueType: "Float32" }),
                    makeSignal({
                        name: "Ranged",
                        startBit: 8,
                        length: 8,
                        isMultiplexed: true,
                        multiplexerRanges: [[2, 4]],
                        multiplexerStartBit: 0,
                        multiplexerLength: 8,
                        multiplexerByteOrder: "LittleEndian",
                        valueDescriptions: { "0": "Stopped" }
                    })
                ]
            }]
        };
        const log = [
            { id: "0x100", isExtendedId: false, data: [3, 0, 0, 192, 63], timestamp: "inside" },
            { id: "0x100", isExtendedId: false, data: [5, 0, 0, 192, 63], timestamp: "outside" }
        ];
        const results = processSelectedSignals([
            { signalName: "Temperature", messageId: "0x100" },
            { signalName: "Ranged", messageId: "0x100" }
        ], log, database);
        expect(results[0].data.map(point => point.value)).toEqual([1.5, 1.5]);
        expect(results[1].data).toEqual([{ timestamp: "inside", value: 0, description: "Stopped" }]);
    });
});
