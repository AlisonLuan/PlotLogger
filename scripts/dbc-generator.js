import { extractRawValue } from "./helper.js";

/*
 * Infers a CAN database from a loaded (unified) log and serializes it as DBC text.
 *
 * The algorithm is heuristic. For every (ID, extended-flag) pair it:
 *   1. records which bits ever change between consecutive frames and how often,
 *   2. detects rolling counters (8-bit bytes or 4-bit nibbles that increment by one per frame),
 *   3. groups the remaining changing bits into signals, merging neighbouring bytes only when the
 *      toggle-rate pattern looks like one multi-byte number (Intel or Motorola order),
 *   4. guesses signedness from the observed raw value distribution.
 * Scaling, offset, units, names and multiplexing cannot be recovered from a log.
 */

export const DEFAULT_GENERATOR_OPTIONS = Object.freeze({ minFrames: 5, detectCounters: true });

const SENDER = "Vector__XXX";
const MAX_FRAME_BYTES = 64;
const MAX_SIGNAL_LENGTH = 64;
const MAX_SIGNED_SAMPLES = 2000;
const COUNTER_MIN_RATIO = 0.9;
const LINK_RATE_FACTOR = 0.6;
const SIGNED_MIN_END_SHARE = 0.01;
const COUNTER_FIELDS = [
    { name: "byte", shift: 0, bits: 8 },
    { name: "low", shift: 0, bits: 4 },
    { name: "high", shift: 4, bits: 4 },
];

export function normalizeGeneratorOptions(options = {}) {
    const minFrames = Number(options.minFrames ?? DEFAULT_GENERATOR_OPTIONS.minFrames);
    if (!Number.isInteger(minFrames) || minFrames < 2 || minFrames > 1_000_000) {
        throw new RangeError("Minimum frames per ID must be a whole number between 2 and 1000000.");
    }
    return {
        minFrames,
        detectCounters: options.detectCounters ?? DEFAULT_GENERATOR_OPTIONS.detectCounters,
    };
}

function createStats(numericId, isExtendedId) {
    return {
        numericId,
        isExtendedId,
        frames: 0,
        maxLength: 0,
        previous: null,
        pairs: new Uint32Array(MAX_FRAME_BYTES),
        toggles: new Uint32Array(MAX_FRAME_BYTES * 8),
        counterHits: new Uint32Array(MAX_FRAME_BYTES * COUNTER_FIELDS.length),
        samples: [],
        sampleStride: 1,
        sampleSeen: 0,
    };
}

// Keeps an evenly spread, bounded sample of payloads for signedness detection.
function addSample(stats, data) {
    if (stats.sampleSeen++ % stats.sampleStride !== 0) return;
    stats.samples.push(data);
    if (stats.samples.length >= MAX_SIGNED_SAMPLES * 2) {
        stats.samples = stats.samples.filter((_, index) => index % 2 === 0);
        stats.sampleStride *= 2;
    }
}

function collectStats(log) {
    const statsById = new Map();
    for (const message of log) {
        if (!message || message.isRemoteFrame || message.isErrorFrame || !Array.isArray(message.data)) continue;
        const length = Math.min(message.data.length, MAX_FRAME_BYTES);
        if (length === 0) continue;
        const numericId = parseInt(message.id, 16);
        if (!Number.isInteger(numericId)) continue;
        const isExtendedId = Boolean(message.isExtendedId);
        const key = `${numericId}:${isExtendedId}`;
        let stats = statsById.get(key);
        if (!stats) {
            stats = createStats(numericId, isExtendedId);
            statsById.set(key, stats);
        }

        const data = message.data;
        const previous = stats.previous;
        stats.frames++;
        stats.maxLength = Math.max(stats.maxLength, length);
        if (previous) {
            const shared = Math.min(length, previous.length, MAX_FRAME_BYTES);
            for (let byte = 0; byte < shared; byte++) {
                stats.pairs[byte]++;
                const diff = data[byte] ^ previous[byte];
                if (diff) {
                    for (let bit = 0; bit < 8; bit++) {
                        if ((diff >> bit) & 1) stats.toggles[byte * 8 + bit]++;
                    }
                }
                COUNTER_FIELDS.forEach((field, index) => {
                    const mask = (1 << field.bits) - 1;
                    const delta = (((data[byte] >> field.shift) & mask) - ((previous[byte] >> field.shift) & mask)) & mask;
                    if (delta === 1) stats.counterHits[byte * COUNTER_FIELDS.length + index]++;
                });
            }
        }
        stats.previous = data;
        addSample(stats, data);
    }
    return statsById;
}

const bitRate = (stats, bit) => {
    const pairs = stats.pairs[bit >> 3];
    return pairs ? stats.toggles[bit] / pairs : 0;
};

function segmentRate(stats, segment) {
    let total = 0;
    for (let bit = segment.lo; bit <= segment.hi; bit++) total += bitRate(stats, segment.byte * 8 + bit);
    return total / (segment.hi - segment.lo + 1);
}

function findCounters(stats, minFrames, claimed) {
    const counters = [];
    for (let byte = 0; byte < stats.maxLength; byte++) {
        const pairs = stats.pairs[byte];
        if (pairs < minFrames - 1) continue;
        const isCounter = index => stats.counterHits[byte * COUNTER_FIELDS.length + index] / pairs >= COUNTER_MIN_RATIO;
        const fields = isCounter(0) ? [0] : [1, 2].filter(isCounter);
        for (const index of fields) {
            const field = COUNTER_FIELDS[index];
            counters.push({ startBit: byte * 8 + field.shift, length: field.bits, byteOrder: "LittleEndian", kind: "counter" });
            for (let bit = 0; bit < field.bits; bit++) claimed[byte * 8 + field.shift + bit] = 1;
        }
    }
    return counters;
}

// Contiguous changing, unclaimed bits inside a single byte.
function findSegments(stats, claimed) {
    const segments = [];
    for (let byte = 0; byte < stats.maxLength; byte++) {
        let start = -1;
        for (let bit = 0; bit <= 8; bit++) {
            const index = byte * 8 + bit;
            const active = bit < 8 && stats.toggles[index] > 0 && !claimed[index];
            if (active && start < 0) start = bit;
            if (!active && start >= 0) {
                segments.push({ byte, lo: start, hi: bit - 1 });
                start = -1;
            }
        }
    }
    return segments;
}

// Decides whether `next` continues `last` as one multi-byte number, and in which byte order.
function linkOrder(stats, last, next) {
    if (next.byte !== last.byte + 1) return null;
    const lastRate = segmentRate(stats, last);
    const nextRate = segmentRate(stats, next);
    // Intel: higher address = more significant, so its boundary bit must toggle clearly less often.
    if (last.hi === 7 && next.lo === 0 && nextRate < lastRate &&
        bitRate(stats, next.byte * 8) <= LINK_RATE_FACTOR * bitRate(stats, last.byte * 8 + 7)) {
        return "LittleEndian";
    }
    // Motorola: higher address = less significant.
    if (last.lo === 0 && next.hi === 7 && lastRate < nextRate &&
        bitRate(stats, last.byte * 8) <= LINK_RATE_FACTOR * bitRate(stats, next.byte * 8 + 7)) {
        return "BigEndian";
    }
    return null;
}

function groupSegments(stats, segments) {
    const signals = [];
    let index = 0;
    while (index < segments.length) {
        const chain = [segments[index++]];
        let byteOrder = null;
        let length = chain[0].hi - chain[0].lo + 1;
        while (index < segments.length) {
            const next = segments[index];
            const order = linkOrder(stats, chain[chain.length - 1], next);
            const nextLength = next.hi - next.lo + 1;
            if (!order || (byteOrder && order !== byteOrder) || length + nextLength > MAX_SIGNAL_LENGTH) break;
            byteOrder = order;
            length += nextLength;
            chain.push(next);
            index++;
        }
        const first = chain[0];
        signals.push({
            startBit: byteOrder === "BigEndian" ? first.byte * 8 + first.hi : first.byte * 8 + first.lo,
            length,
            byteOrder: byteOrder ?? "LittleEndian",
            kind: "signal",
        });
    }
    return signals;
}

// Signed data crossing zero populates both ends of the raw range but leaves the middle empty.
function looksSigned(samples, signal) {
    if (signal.length < 2 || signal.length > 32) return false;
    const range = 2 ** signal.length;
    let low = 0;
    let high = 0;
    let middle = 0;
    let valid = 0;
    for (const data of samples) {
        const raw = extractRawValue(data, signal.startBit, signal.length, signal.byteOrder);
        if (typeof raw !== "number" || Number.isNaN(raw)) continue;
        valid++;
        const share = raw / range;
        if (share < 0.4) low++;
        else if (share > 0.6) high++;
        else middle++;
    }
    return valid > 0 && middle === 0 &&
        low / valid >= SIGNED_MIN_END_SHARE && high / valid >= SIGNED_MIN_END_SHARE;
}

export function formatDbcMessageId(numericId, isExtendedId) {
    return `0x${numericId.toString(16).toUpperCase().padStart(isExtendedId ? 8 : 3, "0")}`;
}

/**
 * Builds parser-shaped database data ({ messages, nodes }) from a unified log.
 * @returns {{ database: { messages: Array, nodes: string[] }, summary: Object }}
 */
export function inferDatabaseFromLog(log, options = {}) {
    if (!Array.isArray(log) || log.length === 0) {
        throw new TypeError("A loaded log is required to generate a database.");
    }
    const { minFrames, detectCounters } = normalizeGeneratorOptions(options);
    const statsList = Array.from(collectStats(log).values()).sort((left, right) =>
        Number(left.isExtendedId) - Number(right.isExtendedId) || left.numericId - right.numericId);

    const messages = [];
    let skippedIds = 0;
    for (const stats of statsList) {
        if (stats.frames < minFrames) {
            skippedIds++;
            continue;
        }
        const claimed = new Uint8Array(MAX_FRAME_BYTES * 8);
        const counters = detectCounters ? findCounters(stats, minFrames, claimed) : [];
        const found = [...counters, ...groupSegments(stats, findSegments(stats, claimed))]
            .sort((left, right) => left.startBit - right.startBit);
        if (found.length === 0) {
            skippedIds++;
            continue;
        }

        const id = formatDbcMessageId(stats.numericId, stats.isExtendedId);
        const signals = found.map((signal, index) => {
            const isSigned = signal.kind === "signal" && looksSigned(stats.samples, signal);
            const range = 2 ** signal.length;
            return {
                name: `${signal.kind === "counter" ? "Counter" : "Sig"}_${index + 1}`,
                startBit: signal.startBit,
                length: signal.length,
                byteOrder: signal.byteOrder,
                valueType: isSigned ? "Signed" : "Unsigned",
                scaling: 1,
                offset: 0,
                valueRange: isSigned ? [-range / 2, range / 2 - 1] : [0, range - 1],
                units: "",
                defaultValue: 0,
                description: `Inferred ${signal.kind} from log data.`,
            };
        });
        messages.push({
            id,
            isExtendedId: stats.isExtendedId,
            name: `MSG_${id.slice(2)}`,
            dlc: stats.maxLength,
            sender: SENDER,
            description: `Inferred from ${stats.frames} frame(s) in the log.`,
            signals,
        });
    }

    if (messages.length === 0) {
        throw new Error("No message with changing data and enough frames was found in the log.");
    }
    return {
        database: { messages, nodes: [SENDER] },
        summary: {
            messages: messages.length,
            signals: messages.reduce((total, message) => total + message.signals.length, 0),
            skippedIds,
        },
    };
}

const quoteDbcText = text => String(text).replace(/\\/g, "/").replace(/"/g, "'").replace(/[\r\n]+/g, " ");

function dbcNumericId(message) {
    const id = parseInt(message.id, 16);
    return message.isExtendedId ? id + 0x80000000 : id;
}

/** Serializes parser-shaped database data as DBC text that parseDBC() can read back. */
export function serializeDBC(database) {
    if (!Array.isArray(database?.messages)) {
        throw new TypeError("Database must contain a messages array.");
    }
    const lines = ['VERSION ""', "", "NS_ :", "", "BS_:", "", `BU_: ${(database.nodes ?? []).filter(node => node !== SENDER).join(" ")}`.trimEnd(), ""];
    const comments = [];
    for (const message of database.messages) {
        const numericId = dbcNumericId(message);
        lines.push(`BO_ ${numericId} ${message.name}: ${message.dlc} ${message.sender || SENDER}`);
        for (const signal of message.signals) {
            const [min, max] = signal.valueRange;
            lines.push(` SG_ ${signal.name} : ${signal.startBit}|${signal.length}@${signal.byteOrder === "BigEndian" ? 0 : 1}` +
                `${signal.valueType === "Signed" ? "-" : "+"} (${signal.scaling},${signal.offset}) [${min}|${max}] ` +
                `"${quoteDbcText(signal.units ?? "")}" ${SENDER}`);
            if (signal.description) comments.push(`CM_ SG_ ${numericId} ${signal.name} "${quoteDbcText(signal.description)}";`);
        }
        lines.push("");
        if (message.description) comments.push(`CM_ BO_ ${numericId} "${quoteDbcText(message.description)}";`);
    }
    return [...lines, ...comments, ""].join("\n");
}

export function downloadDbc(text, fileName = "generated.dbc") {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
