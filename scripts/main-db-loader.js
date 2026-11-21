import { parseDBC } from './parser-dbc.js';
import { parseSYM } from './parser-sym.js';

const MAX_DATABASE_FILE_SIZE = 128 * 1024 * 1024;

const databaseHandler = {
    database: null,
    skippedSignals: 0, // signals dropped by the last buildUnifiedDatabase call, for UI feedback
    dropdownContent: {
        Sender: [],
    },

    resetDatabase() {
        this.database = null;
        this.skippedSignals = 0;
        this.dropdownContent = { Sender: [] };
    },

    isDatabaseLoaded() {
        return Array.isArray(this.database?.messages) && this.database.messages.length > 0;
    },

    async loadDatabase(file, isCurrent = () => true) {
        try {
            const parsedData = await this.parseFileDB(file);
            if (!isCurrent()) return null;
            if (!parsedData || !Array.isArray(parsedData.messages) || !Array.isArray(parsedData.nodes)) {
                throw new TypeError('Parsed database is missing messages or nodes.');
            }
            this.database = this.buildUnifiedDatabase(parsedData);
            this.extractDropdownContent();
            return this.database;
        } catch (error) {
            console.error(error);
            throw error;
        }
    },

    // Installs already-parsed database data (e.g. inferred from a log) as the active database.
    loadParsedDatabase(parsedData) {
        if (!parsedData || !Array.isArray(parsedData.messages) || !Array.isArray(parsedData.nodes)) {
            throw new TypeError('Parsed database is missing messages or nodes.');
        }
        this.resetDatabase();
        this.database = this.buildUnifiedDatabase(parsedData);
        this.extractDropdownContent();
        return this.database;
    },

    getDatabase() {
        return this.database;
    },

    getDropdownContent() {
        return this.dropdownContent;
    },

    extractDropdownContent() {
        if (!this.isDatabaseLoaded()) return;

        this.dropdownContent.Sender = Array.from(new Set(this.database.messages.map(message => message.sender)));
    },

    buildUnifiedDatabase(parsedData) {
        let skippedSignals = 0;
        // A signal the decoder could not read correctly is dropped here instead of breaking or misleading the plot.
        const hasValidBits = (sig) => Number.isInteger(sig.startBit) && sig.startBit >= 0 &&
            Number.isInteger(sig.length) && sig.length >= 1 && sig.length <= 64;
        const isMultiplexedSignal = (sig) => (sig.multiplexerValue !== undefined && sig.multiplexerValue !== null) ||
            Array.isArray(sig.multiplexerRanges);
        // Prefer the named multiplexer, else any valid one (previous fallback behavior).
        const findMux = (sig, msg) => {
            const muxes = msg.signals.filter(mux => mux.isMultiplexer && hasValidBits(mux));
            return muxes.find(mux => !sig.multiplexerName || mux.name === sig.multiplexerName) ?? muxes[0];
        };
        const isUsableSignal = (sig, msg) => {
            const floatLength = { Float32: 32, Float64: 64 }[sig.valueType];
            return hasValidBits(sig) &&
                (floatLength === undefined || sig.length === floatLength) &&
                (!isMultiplexedSignal(sig) || findMux(sig, msg) !== undefined);
        };
        const database = {
            messages: parsedData.messages.map((msg) => {
                return {
                    id: msg.id,
                    name: msg.name,
                    dlc: msg.dlc,
                    sender: msg.sender,
                    description: msg.comment ?? msg.description ?? '',
                    isExtendedId: msg.isExtendedId ?? false,
                    signals: msg.signals.filter((sig) => {
                        const usable = isUsableSignal(sig, msg);
                        if (!usable) skippedSignals++;
                        return usable;
                    }).map((sig) => {
                        const isMultiplexed = isMultiplexedSignal(sig);
                        const mux = isMultiplexed ? findMux(sig, msg) : null;

                        return {
                            name: sig.name,
                            ...(sig.multiplexerName && { multiplexerName: sig.multiplexerName }),
                            startBit: sig.startBit,
                            length: sig.length,
                            byteOrder: sig.byteOrder,
                            valueType: sig.valueType,
                            scaling: sig.scaling,
                            offset: sig.offset,
                            units: sig.units,
                            valueRange: sig.valueRange,
                            defaultValue: sig.defaultValue,
                            description: sig.description,
                            ...(sig.valueDescriptions && { valueDescriptions: sig.valueDescriptions }),

                            ...(sig.isMultiplexer && { isMultiplexer: true }),
                            ...(isMultiplexed && {
                                isMultiplexed: true,
                                multiplexerValue: sig.multiplexerValue,
                                ...(sig.multiplexerRanges && { multiplexerRanges: sig.multiplexerRanges }),
                                // Inherit the multiplexer signal definition from the matching mux (if any)
                                multiplexerStartBit: mux.startBit,
                                multiplexerLength: mux.length,
                                multiplexerByteOrder: mux.byteOrder,
                            }),
                        };
                    })
                };
            }),

            nodes: parsedData.nodes.map((node) => ({
                name: node,
                transmitMessages: parsedData.messages.filter((msg) => msg.sender === node).map((msg) => msg.name),
                receiveMessages: parsedData.messages
                    .filter((msg) => msg.signals.some(signal => signal.receivers?.includes(node)))
                    .map((msg) => msg.name),
            })),
        };
        this.skippedSignals = skippedSignals;
        if (skippedSignals > 0) {
            console.warn(`Skipped ${skippedSignals} signal(s) with an invalid bit layout, float size or missing multiplexer.`);
        }
        return database;
    },

    async parseFileDB(file) {
        if (file.size > MAX_DATABASE_FILE_SIZE) {
            throw new RangeError("Database files larger than 128 MiB are not supported.");
        }
        const fileExtension = file.name.split('.').pop().toLowerCase();
    
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
    
            reader.onload = function (event) {
                const fileContent = event.target.result;
    
                try {
                    document.body.style.cursor = 'wait'; // Switch cursor to wait

                    switch (fileExtension) {
                        case 'dbc':
                            resolve(parseDBC(fileContent));
                            break;
                        case 'sym':
                            resolve(parseSYM(fileContent));
                            break;
                        default:
                            reject(new Error('Unsupported file format.'));
                            console.warn('File format not supported!');
                            break;
                    }
                } catch (error) {
                    reject(error); 
                } finally {
                    document.body.style.cursor = 'default'; // Revert cursor to default
                }
            };
    
            reader.onerror = function () {
                reject(new Error("Error reading file."));
                console.warn('File format not supported!');
            };
    
            reader.readAsText(file, "windows-1252");
        });
    },
};

// Expose it globally for non-module scripts
window.databaseHandler = databaseHandler;

export default databaseHandler;
