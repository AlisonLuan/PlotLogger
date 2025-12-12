import { parseDBC } from './parser-dbc.js';
import { parseSYM } from './parser-sym.js';

const databaseHandler = {
    database: null,
    dropdownContent: {
        ID: [],
        MsgName: [],
        Sender: [],
        Signal: [],
    },

    resetDatabase() {
        this.database = null;
        this.dropdownContent = { ID: [], MsgName: [], Sender: [], Signal: [] };
    },

    isDatabaseLoaded() {
        return this.database?.messages ? true : false;
    },

    async loadDatabase(file) {
        try {
            const parsedData = await this.parseFileDB(file);
            this.database = this.buildUnifiedDatabase(parsedData);
            this.extractDropdownContent();
            return this.database;
        } catch (error) {
            console.error(error);
            throw new Error('Error loading database file.');
        }
    },

    getDatabase() {
        return this.database;
    },

    getDropdownContent() {
        return this.dropdownContent;
    },

    extractDropdownContent() {
        if (!this.isDatabaseLoaded()) return;

        this.database.messages.forEach((message) => {
            this.addUnique(this.dropdownContent.ID, message.id);
            this.addUnique(this.dropdownContent.MsgName, message.name);
            this.addUnique(this.dropdownContent.Sender, message.sender);
            message.signals.forEach((signal) => {
                this.addUnique(this.dropdownContent.Signal, signal.name);
            });
        });
    },

    addUnique(array, value) {
        if (!array.includes(value)) {
            array.push(value);
        }
    },

    buildUnifiedDatabase(parsedData) {
        return {
            messages: parsedData.messages.map((msg) => {
                return {
                    id: msg.id,
                    name: msg.name,
                    dlc: msg.dlc,
                    sender: msg.sender,
                    description: msg.comment,
                    signals: msg.signals.map((sig) => {
                        const isMultiplexed = sig.multiplexerValue !== undefined && sig.multiplexerValue !== null;
                        const matchingMux = isMultiplexed
                            ? msg.signals.find(mux =>
                                mux.isMultiplexer &&
                                (sig.multiplexerName ? mux.name === sig.multiplexerName : true)
                              )
                            : null;
                        const fallbackMux = msg.signals.find(mux => mux.isMultiplexer);

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
                                // Inherit the multiplexer signal definition from the matching mux (if any)
                                multiplexerStartBit: matchingMux?.startBit ?? fallbackMux?.startBit ?? 0,
                                multiplexerLength: matchingMux?.length ?? fallbackMux?.length ?? 8,
                                multiplexerByteOrder: matchingMux?.byteOrder ?? fallbackMux?.byteOrder ?? 'LittleEndian',
                            }),
                        };
                    })
                };
            }),

            nodes: parsedData.nodes.map((node) => ({
                name: node,
                transmitMessages: parsedData.messages.filter((msg) => msg.sender === node).map((msg) => msg.name),
                receiveMessages: parsedData.messages.filter((msg) => msg.sender !== node).map((msg) => msg.name),
            })),
        };
    },

    async parseFileDB(file) {
        const fileExtension = file.name.split('.').pop();
    
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
