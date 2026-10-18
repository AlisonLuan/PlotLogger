import { buildUnifiedLog, isLogLoaded, log, resetLog, timestampToISOString } from "../scripts/main-log-loader.js";

describe("unified log loader", () => {
    beforeEach(() => resetLog());

    test("treats null and empty logs as not loaded", () => {
        expect(isLogLoaded()).toBe(false);
        expect(log).toEqual([]);
        expect(isLogLoaded()).toBe(false);
    });

    test("accepts non-empty logs and retains channel zero", () => {
        buildUnifiedLog([{
            timestamp: 1.25,
            arbitrationId: 256,
            data: [1],
            channel: 0,
            isExtendedId: false
        }]);
        expect(isLogLoaded()).toBe(true);
        expect(log[0].channel).toBe(0);
    });

    test("preserves microsecond timestamp precision", () => {
        expect(timestampToISOString(1.000123)).toBe("1970-01-01T00:00:01.000123Z");
    });

    test("keeps relative timestamps as elapsed seconds", () => {
        buildUnifiedLog([{
            timestamp: 1.000123,
            arbitrationId: 256,
            data: [1],
            isRelativeTimestamp: true
        }]);
        expect(log[0].timestamp).toBe(1.000123);
        expect(log[0].isRelativeTimestamp).toBe(true);
    });

    test("rejects missing parsed data instead of treating it as a loaded log", () => {
        expect(() => buildUnifiedLog(undefined)).toThrow("must be an array");
        expect(isLogLoaded()).toBe(false);
    });

    test("skips malformed frames while preserving valid log messages", () => {
        const skipped = buildUnifiedLog([
            { timestamp: 1, arbitrationId: 256, data: [1] },
            { timestamp: NaN, arbitrationId: 257, data: [2] },
            { timestamp: 3, arbitrationId: 258, data: [999] }
        ]);
        expect(skipped).toBe(2);
        expect(log).toHaveLength(1);
        expect(log[0].id).toBe("0x100");
    });

    test("does not load a log when every parsed frame is malformed", () => {
        expect(() => buildUnifiedLog([
            { timestamp: NaN, arbitrationId: 256, data: [1] }
        ])).toThrow("no valid CAN messages");
        expect(isLogLoaded()).toBe(false);
    });
});
