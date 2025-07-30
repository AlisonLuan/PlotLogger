import { parseASC } from "../scripts/parser-asc.js";

describe('parseASC', () => {
  test('parses relative hex messages correctly', async () => {
    // No date and base lines, so default is relative timestamp and hex (base 16)
    const fileContent = `
1.234 1 1A2x Rx r 2 0A 0B
Some random line that should be skipped
1.500 1 123 Rx r 3 0C 0D 0E
Start of measurement: this should be ignored too
1.800 2 1B3 Rx r 1 0F
    `.trim();

    const file = { text: async () => fileContent };
    const messages = await parseASC(file);

    // Expect three valid messages.
    expect(messages).toHaveLength(3);

    // Message 1:
    // Timestamp: 1.234 (relative mode)
    // Channel: "1" → 1-1 = 0
    // Arbitration ID: "1A2x" → remove trailing "x", then parse "1A2" as hex → 0x1A2 = 418
    // isExtendedId: true
    // isRx: true (parts[3] is "Rx")
    // isRemoteFrame: parts[4] equals "r" → true
    // Data: "2" indicates length 2, followed by "0A" and "0B" → [10, 11]
    expect(messages[0]).toEqual({
      timestamp: 1.234,
      arbitrationId: 418,
      data: new Uint8Array([10, 11]),
      channel: 0,
      isExtendedId: true,
      isRemoteFrame: true,
      isRx: true,
    });

    // Message 2:
    // "1.500 1 123 Rx r 3 0C 0D 0E"
    // Timestamp: 1.500
    // Channel: 0
    // Arbitration ID: "123" parsed as hex → 0x123 = 291
    // isExtendedId: false
    // Data: length 3 → [0C, 0D, 0E] → [12, 13, 14]
    expect(messages[1]).toEqual({
      timestamp: 1.500,
      arbitrationId: 291,
      data: new Uint8Array([12, 13, 14]),
      channel: 0,
      isExtendedId: false,
      isRemoteFrame: true,
      isRx: true,
    });

    // Message 3:
    // "1.800 2 1B3 Rx r 1 0F"
    // Timestamp: 1.800
    // Channel: "2" → 2-1 = 1
    // Arbitration ID: "1B3" as hex → 0x1B3 = 435
    // isExtendedId: false
    // Data: length 1 → [0F] → [15]
    expect(messages[2]).toEqual({
      timestamp: 1.800,
      arbitrationId: 435,
      data: new Uint8Array([15]),
      channel: 1,
      isExtendedId: false,
      isRemoteFrame: true,
      isRx: true,
    });
  });

  test('parses absolute dec messages correctly', async () => {
    // In this case we provide a date line and a base line to switch to absolute timestamp mode with base 10.
    const fileContent = `
date Tue Feb 13 18:41:24.154 2025
base dec absolute
10.0 2 123 Rx r 3 4 5 6
    `.trim();

    const file = { text: async () => fileContent };

    // Compute the expected start time using the same logic as in parseDate.
    const expectedStartTime = (() => {
      const monthMap = {
        Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
        Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
      };
      const parts = "Tue Feb 13 18:41:24.154 2025".split(" ");
      const day = parts[2];
      const month = monthMap[parts[1]];
      const year = parts[4];
      const time = parts[3];
      const formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day} ${time}`;
      return new Date(formattedDate).getTime() / 1000;
    })();

    // The measurement line "10.0 2 123 Rx r 3 4 5 6" should:
    // - Add startTime to the 10.0 timestamp since we are in absolute mode.
    // - Use base 10 for parsing numbers.
    // - Channel: "2" → 2-1 = 1.
    // - Arbitration ID: parseInt("123", 10) = 123.
    // - Data: "3" means length 3, then data bytes "4", "5", "6" become [4,5,6].
    const messages = await parseASC(file);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      timestamp: 10.0 + expectedStartTime,
      arbitrationId: 123,
      data: new Uint8Array([4, 5, 6]),
      channel: 1,
      isExtendedId: false,
      isRemoteFrame: true,
      isRx: true,
    });
  });

  test('skips non-matching lines and handles extended IDs in absolute hex mode', async () => {
    const fileContent = `
Some random text
date Wed Mar 10 12:00:00.000 2025
base hex absolute
This line should be skipped
2.500 1 1FF Rx r 2 AA BB
Not a valid line
2.600 1 1FFx Rx r 1 CC
    `.trim();

    const file = { text: async () => fileContent };

    // Compute the expected start time from the date line.
    const expectedStartTime = (() => {
      const monthMap = {
        Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
        Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
      };
      const parts = "Wed Mar 10 12:00:00.000 2025".split(" ");
      const day = parts[2];
      const month = monthMap[parts[1]];
      const year = parts[4];
      const time = parts[3];
      const formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day} ${time}`;
      return new Date(formattedDate).getTime() / 1000;
    })();

    // There should be two valid measurement lines.
    // First measurement:
    // "2.500 1 1FF Rx r 2 AA BB"
    // - Timestamp: 2.500 + expectedStartTime
    // - Channel: "1" → 0
    // - Arbitration ID: parseInt("1FF", 16) = 511
    // - isExtendedId: false (does not end with "x")
    // - Data: length 2 → [AA, BB] → [170, 187] in hex.
    // Second measurement:
    // "2.600 1 1FFx Rx r 1 CC"
    // - Arbitration ID: "1FFx" → remove trailing "x", then parse "1FF" as hex → 511
    // - isExtendedId: true
    // - Data: length 1 → [CC] → [204] in hex.
    const messages = await parseASC(file);
    expect(messages).toHaveLength(2);

    expect(messages[0]).toEqual({
      timestamp: 2.500 + expectedStartTime,
      arbitrationId: 511,
      data: new Uint8Array([170, 187]),
      channel: 0,
      isExtendedId: false,
      isRemoteFrame: true,
      isRx: true,
    });

    expect(messages[1]).toEqual({
      timestamp: 2.600 + expectedStartTime,
      arbitrationId: 511,
      data: new Uint8Array([204]),
      channel: 0,
      isExtendedId: true,
      isRemoteFrame: true,
      isRx: true,
    });
  });
});
