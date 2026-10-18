import { formatTracesAsCSV } from "../scripts/csv-export.js";

describe("CSV export", () => {
    test("quotes headers and aligns points by canonical timestamp", () => {
        const csv = formatTracesAsCSV([
            { name: 'Speed, "engine"', x: ["2025-01-01T00:00:00.000123Z"], y: [10] },
            { name: "RPM", x: [new Date("2025-01-01T00:00:00.000Z"), "2025-01-01T00:00:01Z"], y: [20, 30] }
        ]);
        expect(csv).toBe(
            '"Time","Speed, ""engine""","RPM"\r\n' +
            '"2025-01-01T00:00:00.000000Z","","20"\r\n' +
            '"2025-01-01T00:00:00.000123Z","10",""\r\n' +
            '"2025-01-01T00:00:01.000000Z","","30"\r\n'
        );
    });

    test("returns no content for empty traces", () => {
        expect(formatTracesAsCSV([])).toBe("");
    });

    test("exports relative timestamps as elapsed seconds", () => {
        const csv = formatTracesAsCSV([{
            name: "Speed",
            isRelativeTimestamp: true,
            x: [1.25, 1.5],
            y: [10, 20]
        }]);
        expect(csv).toBe(
            '"Elapsed time (s)","Speed"\r\n' +
            '"1.250000","10"\r\n' +
            '"1.500000","20"\r\n'
        );
    });
});
