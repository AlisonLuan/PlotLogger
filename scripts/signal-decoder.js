import { extractRawValue } from "./helper.js";

export function frameKey(id, isExtendedId) {
    return `${parseInt(id, 16)}:${Boolean(isExtendedId)}`;
}

function rawEquals(value, expected) {
    if (typeof value === "bigint") {
        try {
            return value === BigInt(expected);
        } catch {
            return false;
        }
    }
    return Number.isFinite(value) && value === Number(expected);
}

function sanitizeUnit(unit) {
    return unit ? unit.replace(/[^\x20-\x7E°Ωμ]/g, "").trim() : "";
}

export function toSigned(value, bitLength) {
    if (typeof value === "bigint") {
        const signBit = 1n << BigInt(bitLength - 1);
        return value >= signBit ? value - (signBit << 1n) : value;
    }
    const signBit = 2 ** (bitLength - 1);
    return value >= signBit ? value - (2 ** bitLength) : value;
}

export function findSignalInDatabase(database, signalName, messageNameOrId) {
    if (!database?.messages) return null;
    for (const message of database.messages) {
        if (messageNameOrId &&
            message.name !== messageNameOrId &&
            message.id !== messageNameOrId) continue;
        const signal = message.signals.find(item => item.name === signalName);
        if (!signal) continue;
        return {
            ...signal,
            messageId: message.id,
            messageName: message.name,
            isExtendedId: message.isExtendedId ?? false,
            unit: signal.units
        };
    }
    return null;
}

export function processSelectedSignals(selectedSignals, log, database) {
    if (!Array.isArray(selectedSignals) || !Array.isArray(log)) {
        throw new TypeError("Selected signals and log data must be arrays.");
    }
    const framesById = new Map();
    for (const message of log) {
        if (message.isRemoteFrame || message.isErrorFrame) continue;
        const key = frameKey(message.id, message.isExtendedId);
        if (!framesById.has(key)) framesById.set(key, []);
        framesById.get(key).push(message);
    }

    const isRelativeTimestamp = log.length > 0 && log.every(message => message.isRelativeTimestamp === true);
    const processedLogs = [];
    for (const { signalName, messageId } of selectedSignals) {
        const signal = findSignalInDatabase(database, signalName, messageId);
        if (!signal) {
            console.warn(`Signal "${signalName}" in message "${messageId}" not found.`);
            continue;
        }
        const frames = framesById.get(frameKey(signal.messageId, signal.isExtendedId)) || [];
        const series = [];
        let warnedPrecision = false;
        for (const message of frames) {
            if (signal.isMultiplexed) {
                const muxValue = extractRawValue(
                    message.data,
                    signal.multiplexerStartBit,
                    signal.multiplexerLength,
                    signal.multiplexerByteOrder
                );
                const scalarMatch = signal.multiplexerValue !== undefined &&
                    rawEquals(muxValue, signal.multiplexerValue);
                const rangeMatch = signal.multiplexerRanges?.some(([minimum, maximum]) => {
                    const value = Number(muxValue);
                    return Number.isFinite(value) && value >= minimum && value <= maximum;
                });
                if (!scalarMatch && !rangeMatch) continue;
            }
            let rawValue = extractRawValue(message.data, signal.startBit, signal.length, signal.byteOrder);
            if (typeof rawValue === "number" && !Number.isFinite(rawValue)) continue;
            if (signal.valueType === "Signed") rawValue = toSigned(rawValue, signal.length);
            if (signal.valueType === "Float32" || signal.valueType === "Float64") {
                const view = new DataView(new ArrayBuffer(8));
                if (signal.valueType === "Float32") {
                    view.setUint32(0, Number(rawValue), false);
                    rawValue = view.getFloat32(0, false);
                } else {
                    view.setBigUint64(0, BigInt(rawValue), false);
                    rawValue = view.getFloat64(0, false);
                }
            }
            if (typeof rawValue === "bigint" &&
                (rawValue > BigInt(Number.MAX_SAFE_INTEGER) || rawValue < BigInt(Number.MIN_SAFE_INTEGER))) {
                if (!warnedPrecision) {
                    console.warn(`Skipping "${signalName}" samples that exceed JavaScript's exact integer range.`);
                    warnedPrecision = true;
                }
                continue;
            }
            const value = Number(rawValue) * (signal.scaling ?? 1) + (signal.offset ?? 0);
            if (Number.isFinite(value)) {
                const description = signal.valueDescriptions?.[String(rawValue)];
                series.push({
                    timestamp: message.timestamp,
                    value,
                    ...(description !== undefined && { description })
                });
            }
        }
        processedLogs.push({
            signalName,
            messageName: signal.messageName,
            messageId: signal.messageId,
            data: series,
            isRelativeTimestamp,
            unit: sanitizeUnit(signal.unit || ""),
            valueDescriptions: signal.valueDescriptions || {}
        });
    }
    return processedLogs;
}
