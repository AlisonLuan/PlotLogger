import { checkFrameCount, throwIfAborted, MAX_LOG_FRAMES } from "../scripts/log-limits.js";
import { parseASC } from "../scripts/parser-asc.js";
import { parseTRC } from "../scripts/parser-trc.js";

const ascFile = {
    text: async () => `
0.5 1 100 Rx d 1 01
1.5 1 100 Rx d 1 02
`.trim()
};
const trcFile = {
    text: async () => `
;$FILEVERSION=1.1
M 1 Rx 100 1 01
`.trim()
};

describe("log limits", () => {
    test("checkFrameCount accepts counts below the limit and rejects the limit", () => {
        expect(() => checkFrameCount(MAX_LOG_FRAMES - 1)).not.toThrow();
        expect(() => checkFrameCount(MAX_LOG_FRAMES)).toThrow(RangeError);
    });

    test("throwIfAborted throws an AbortError only for an aborted signal", () => {
        expect(() => throwIfAborted(undefined)).not.toThrow();
        const controller = new AbortController();
        expect(() => throwIfAborted(controller.signal)).not.toThrow();
        controller.abort();
        expect(() => throwIfAborted(controller.signal)).toThrow(expect.objectContaining({ name: "AbortError" }));
    });

    test("ASC and TRC parsers still parse without a signal", async () => {
        expect(await parseASC(ascFile)).toHaveLength(2);
        expect(await parseTRC(trcFile)).toHaveLength(1);
    });

    test("ASC and TRC parsers stop when their signal is aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(parseASC(ascFile, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
        await expect(parseTRC(trcFile, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    });
});
