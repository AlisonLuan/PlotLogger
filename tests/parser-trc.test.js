import { parseTRC } from "../scripts/parser-trc.js";

describe('parseTRC', () => {
    test('parses V1.0 messages and ignores bus info lines', async () => {
        const fileContent = `
;$FILEVERSION=1.0
M1 2000 1234 3 0A 0B 0C
M1 2001 FFFFFFFF 3 0A 0B 0C
    `.trim();
        const file = { text: async () => fileContent };
        const messages = await parseTRC(file);

        // Only the first message should be included (the bus info line is ignored)
        expect(messages).toHaveLength(1);
        expect(messages[0]).toEqual({
            timestamp: 2000 / 1000, // 2 seconds
            arbitrationId: 1234,
            data: [10, 11, 12],
            channel: null,
            isExtendedId: false,
            isRemoteFrame: false,
            isRx: undefined
        });
    });

    test('parses V1.1 messages correctly', async () => {
        // Compute the expected startTime as used in parseTRC.
        const baseDate = new Date(Date.UTC(1899, 11, 30, 0, 0, 0, 0));
        const daysOffset = 43831.5;
        const expectedStartTime = (baseDate.getTime() + daysOffset * 24 * 60 * 60 * 1000) / 1000;

        const fileContent = `
;$FILEVERSION=1.1
;$STARTTIME=43831.5
M1 2000 Rx 1234 3 0A 0B 0C
    `.trim();
        const file = { text: async () => fileContent };
        const messages = await parseTRC(file);

        expect(messages).toHaveLength(1);
        expect(messages[0]).toEqual({
            timestamp: 2000 / 1000 + expectedStartTime, // 2 + startTime
            arbitrationId: 1234,
            data: [10, 11, 12],
            channel: null,
            isExtendedId: false,
            isRemoteFrame: false,
            isRx: true
        });
    });

    test('parses V1.3 messages correctly', async () => {
        const baseDate = new Date(Date.UTC(1899, 11, 30, 0, 0, 0, 0));
        const daysOffset = 43831.5;
        const expectedStartTime = (baseDate.getTime() + daysOffset * 24 * 60 * 60 * 1000) / 1000;

        // For V1.3, note that:
        //  - cols[1] is timestamp (3000 => 3 sec),
        //  - cols[2] is channel,
        //  - cols[3] indicates "Rx",
        //  - cols[4] is the arbitration ID (in hex),
        //  - cols[6] is the DLC,
        //  - cols[7...n] hold the data bytes.
        const fileContent = `
;$FILEVERSION=1.3
;$STARTTIME=43831.5
M1 3000 1 Rx 1A2B 99 3 0A 0B 0C
    `.trim();
        const file = { text: async () => fileContent };
        const messages = await parseTRC(file);

        expect(messages).toHaveLength(1);
        expect(messages[0]).toEqual({
            timestamp: 3000 / 1000 + expectedStartTime, // 3 + startTime
            arbitrationId: parseInt("1A2B", 16), // 6699
            data: [10, 11, 12],
            channel: 1,
            isExtendedId: false,
            isRemoteFrame: false,
            isRx: true
        });
    });

    test('parses V2.0 messages correctly', async () => {
        const baseDate = new Date(Date.UTC(1899, 11, 30, 0, 0, 0, 0));
        const daysOffset = 43831.5;
        const expectedStartTime = (baseDate.getTime() + daysOffset * 24 * 60 * 60 * 1000) / 1000;

        // For V2_X messages we need to define a columns mapping.
        // Here we use a header with a custom column order: T,O,I,B,L,d,D
        // This means:
        //   - T (index 0): message type (e.g. "FB")
        //   - O (index 1): timestamp field (in ms)
        //   - I (index 2): arbitration ID in hex
        //   - B (index 3): channel
        //   - L (index 4): DLC (data length)
        //   - d (index 5): isRx indicator ("Rx" means true)
        //   - D (index 6): starting index for data bytes (slice uses DLC to read subsequent items)
        const fileContent = `
;$FILEVERSION=2.0
;$STARTTIME=43831.5
;$COLUMNS=T,O,I,B,L,d,D
FB 4000 1A2B 2 3 Rx 0A 0B 0C
    `.trim();
        const file = { text: async () => fileContent };
        const messages = await parseTRC(file);

        expect(messages).toHaveLength(1);
        expect(messages[0]).toEqual({
            timestamp: 4000 / 1000 + expectedStartTime, // 4 + startTime
            arbitrationId: parseInt("1A2B", 16), // 6699
            data: [10, 11, 12],
            channel: 2,
            isExtendedId: false,
            isRemoteFrame: false,
            isRx: true
        });
    });
});
