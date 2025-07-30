/**
 * Converts a numeric message ID to a formatted hexadecimal string.
 * If the highest bit is set, ID is extended and will be formatted as 29 bits,
 * otherwise, it will be formatted as 11 bits.
 * 
 * @param {number} messageId - The message ID to convert.
 * @returns {{ id: string, isExtended: boolean }} - An object containing:
 *          - `id`: The formatted hexadecimal string ("0x______").
 *          - `isExtended`: A boolean indicating if it's an extended ID.
 */
function formatMessageId(messageId) {
    const EXT_FLAG = 0x80000000;
    const STD_ID_MASK = 0x7FF;
    const EXT_ID_MASK = 0x1FFFFFFF;
    const STD_ID_LENGTH = 3;
    const EXT_ID_LENGTH = 8;

    messageId = Number(messageId);
    if (isNaN(messageId)) {
        throw new Error("Invalid messageId: Must be a number.");
    }

    const isExtended = (messageId & EXT_FLAG) !== 0;
    const truncatedId = isExtended ? (messageId & EXT_ID_MASK) : (messageId & STD_ID_MASK);

    const formattedId = `0x${truncatedId.toString(16).toUpperCase().padStart(
        isExtended ? EXT_ID_LENGTH : STD_ID_LENGTH,
        '0'
    )}`;

    return { id: formattedId, isExtended };
}

/**
 * Parses the DBC file content into structured data.
 * 
 * @param {string} content - The raw DBC file content.
 * @returns {Object} - Parsed data including messages and nodes.
 */
export function parseDBC(content) {
    content = content.replace(/\ï¿½/g, "°");

    const lines = content.split("\n");
    const messages = [];
    const nodes = new Set();
    const valueDescriptions = {};
    const pendingComments = {};
    const pendingSignalComments = {};

    let currentMessage = null;

    lines.forEach((line) => {
        line = line.trim();

        const messageMatch = line.match(/^BO_\s+(\d+)\s+(\w+):\s+(\d+)\s+(\w+)$/);
        if (messageMatch) {
            if (currentMessage) {
                messages.push(currentMessage);
            }

            const { id, isExtended } = formatMessageId(messageMatch[1]);

            currentMessage = {
                id,
                isExtendedId: isExtended,
                name: messageMatch[2],
                dlc: parseInt(messageMatch[3], 10),
                sender: messageMatch[4],
                signals: [],
            };

            nodes.add(messageMatch[4]);
            return;
        }

        const signalMatch = line.match(/^SG_\s+(\w+)(?:\s+(M|m(\d+)))?\s*:\s+(\d+)\|(\d+)@([01])([+-])\s*\(\s*([\d.]+)\s*,\s*([-]?\d*\.?\d+)\s*\)\s*\[\s*([-]?\d*\.?\d+)\s*\|\s*([-]?\d*\.?\d+)\s*\]\s*"([^"]*)".*$/);

        if (signalMatch && currentMessage) {
            const signal = {
                name: signalMatch[1],
                startBit: parseInt(signalMatch[4], 10),
                length: parseInt(signalMatch[5], 10),
                byteOrder: signalMatch[6] === "1" ? "LittleEndian" : "BigEndian",
                valueType: signalMatch[7] === "+" ? "Unsigned" : "Signed",
                scaling: parseFloat(signalMatch[8]),
                offset: parseFloat(signalMatch[9]),
                valueRange: [parseFloat(signalMatch[10]), parseFloat(signalMatch[11])],
                units: signalMatch[12],
                defaultValue: 0,
            };

            if (signalMatch[2]?.trim() === "M") {
                signal.isMultiplexer = true;
            }

            if (signalMatch[3]) {
                signal.multiplexerValue = parseInt(signalMatch[3], 10);
            }

            currentMessage.signals.push(signal);
            return;
        }

        const valueMatch = line.match(/^VAL_\s+(\d+)\s+(\w+)\s+((?:\d+\s+\"[^\"]*\"\s*)+);$/);
        if (valueMatch) {
            const { id: messageId } = formatMessageId(valueMatch[1]);
            const signalName = valueMatch[2];
            const valuePairs = valueMatch[3].match(/(\d+)\s+\"([^\"]*)\"/g);

            if (!valueDescriptions[messageId]) {
                valueDescriptions[messageId] = {};
            }

            valueDescriptions[messageId][signalName] = valuePairs.reduce((acc, pair) => {
                const [value, description] = pair.match(/(\d+)\s+\"([^\"]*)\"/).slice(1, 3);
                acc[value] = description;
                return acc;
            }, {});
        }

        const commentMatch = line.match(/^CM_\s+BO_\s+(\d+)\s+"([^"]*)";$/);
        if (commentMatch) {
            const { id: messageId } = formatMessageId(commentMatch[1]);
            const description = commentMatch[2];
            pendingComments[messageId] = description;
        }

        const signalCommentMatch = line.match(/^CM_\s+SG_\s+(\d+)\s+(\w+)\s+"([^"]+)";$/);
        if (signalCommentMatch) {
            const { id: messageId } = formatMessageId(signalCommentMatch[1]);
            const signalName = signalCommentMatch[2];
            const description = signalCommentMatch[3];
            if (!pendingSignalComments[messageId]) {
                pendingSignalComments[messageId] = {};
            }
            pendingSignalComments[messageId][signalName] = description;
        }
    });

    if (currentMessage) {
        messages.push(currentMessage);
    }

    messages.forEach((msg) => {
        if (pendingComments[msg.id]) {
            msg.description = pendingComments[msg.id];
        }

        const muxSignal = msg.signals.find(sig => sig.isMultiplexer);

        msg.signals.forEach((signal) => {
            if (pendingSignalComments[msg.id] && pendingSignalComments[msg.id][signal.name]) {
                signal.description = pendingSignalComments[msg.id][signal.name];
            }
            const signalDescriptions = valueDescriptions[msg.id]?.[signal.name];
            signal.valueDescriptions = signalDescriptions ?? {};

            if (signal.multiplexerValue !== undefined) {
                signal.isMultiplexed = true;
                if (muxSignal) {
                    signal.multiplexerStartBit = muxSignal.startBit;
                    signal.multiplexerLength = muxSignal.length;
                    signal.multiplexerByteOrder = muxSignal.byteOrder;
                }
            } else {
                signal.isMultiplexed = false;
            }
        });
    });

    return { messages, nodes: Array.from(nodes) };
}
