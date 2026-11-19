import databaseHandler from "../scripts/main-db-loader.js";

describe('databaseHandler', () => {
  
    beforeEach(() => {
        // Reset the database state to avoid shared state between tests
        databaseHandler.resetDatabase();

        // Reset mocks to avoid lingering mock values from other tests
        jest.clearAllMocks();
    });

    test('resetDatabase() should reset database and dropdownContent', () => {
        // Set some initial data
        databaseHandler.database = { messages: [{ id: 1, name: 'Message 1' }] };
        databaseHandler.dropdownContent = { Sender: ['Sender 1'] };

        // Call resetDatabase
        databaseHandler.resetDatabase();

        // Assert database and dropdownContent are reset
        expect(databaseHandler.database).toBeNull();
        expect(databaseHandler.dropdownContent).toEqual({ Sender: [] });
    });

    test('isDatabaseLoaded() should return true if database is loaded', () => {
        // Set database as loaded
        databaseHandler.database = { messages: [{ id: 2 }] };
        
        // Check if database is loaded
        expect(databaseHandler.isDatabaseLoaded()).toBe(true);
    });

    test('isDatabaseLoaded() should return false if database is not loaded', () => {
        // Ensure no database is loaded
        databaseHandler.database = null;
        
        // Check if database is not loaded
        expect(databaseHandler.isDatabaseLoaded()).toBe(false);
    });

    test('extractDropdownContent() should extract dropdown content from messages', () => {
        // Set a mock database with messages
        databaseHandler.database = {
            messages: [
                { id: 4, name: 'Message 4', sender: 'Sender 4', signals: [{ name: 'Signal 4' }] },
                { id: 5, name: 'Message 5', sender: 'Sender 5', signals: [{ name: 'Signal 5' }] }
            ]
        };

        // Call extractDropdownContent
        databaseHandler.extractDropdownContent();

        // Ensure dropdownContent is updated correctly
        expect(databaseHandler.dropdownContent.Sender).toEqual(['Sender 4', 'Sender 5']);

        // Calling it again must not duplicate senders
        databaseHandler.extractDropdownContent();
        expect(databaseHandler.dropdownContent.Sender).toEqual(['Sender 4', 'Sender 5']);
    });

    test('buildUnifiedDatabase() drops signals the decoder cannot read correctly', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const sig = (name, extra = {}) => ({ name, startBit: 0, length: 8, ...extra });
            const database = databaseHandler.buildUnifiedDatabase({
                nodes: [],
                messages: [{
                    id: '0x100', name: 'M', dlc: 8, sender: 'S',
                    signals: [
                        sig('Good'),
                        sig('ZeroLength', { length: 0 }),
                        sig('TooLong', { length: 65 }),
                        sig('NegativeStart', { startBit: -1 }),
                        sig('ShortFloat', { length: 16, valueType: 'Float32' }),
                        sig('GoodFloat', { length: 32, valueType: 'Float32' }),
                        sig('NoMux', { multiplexerValue: 1 }),
                    ]
                }]
            });
            expect(database.messages[0].signals.map(signal => signal.name)).toEqual(['Good', 'GoodFloat']);
        } finally {
            warn.mockRestore();
        }
    });

    test('buildUnifiedDatabase() drops multiplexed signals whose multiplexer is unusable', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const database = databaseHandler.buildUnifiedDatabase({
                nodes: [],
                messages: [{
                    id: '0x100', name: 'M', dlc: 8, sender: 'S',
                    signals: [
                        { name: 'BadMux', startBit: 0, length: 0, isMultiplexer: true },
                        { name: 'A', startBit: 8, length: 8, multiplexerValue: 2 },
                    ]
                }]
            });
            expect(database.messages[0].signals).toEqual([]);
        } finally {
            warn.mockRestore();
        }
    });

    test('buildUnifiedDatabase() falls back to a valid multiplexer when the named one is missing', () => {
        const database = databaseHandler.buildUnifiedDatabase({
            nodes: [],
            messages: [{
                id: '0x100', name: 'M', dlc: 8, sender: 'S',
                signals: [
                    { name: 'Mux', startBit: 4, length: 4, isMultiplexer: true, byteOrder: 'BigEndian' },
                    { name: 'A', startBit: 8, length: 8, multiplexerValue: 2, multiplexerName: 'Other' },
                ]
            }]
        });
        expect(database.messages[0].signals[1]).toEqual(expect.objectContaining({ multiplexerStartBit: 4, multiplexerLength: 4 }));
    });

    test('buildUnifiedDatabase() uses the real multiplexer definition', () => {
        const database = databaseHandler.buildUnifiedDatabase({
            nodes: [],
            messages: [{
                id: '0x100', name: 'M', dlc: 8, sender: 'S',
                signals: [
                    { name: 'Mux', startBit: 4, length: 4, isMultiplexer: true, byteOrder: 'BigEndian' },
                    { name: 'A', startBit: 8, length: 8, multiplexerValue: 2 },
                ]
            }]
        });
        expect(database.messages[0].signals[1]).toEqual(expect.objectContaining({
            multiplexerStartBit: 4, multiplexerLength: 4, multiplexerByteOrder: 'BigEndian'
        }));
    });

    test('buildUnifiedDatabase() should format parsed data correctly', () => {
        const parsedData = {
            messages: [
                { id: 6, name: 'Message 6', dlc: 8, sender: 'Sender 6', signals: [{ name: 'Signal 6', startBit: 0, length: 8 }] }
            ],
            nodes: ['Node 6']
        };

        const unifiedDatabase = databaseHandler.buildUnifiedDatabase(parsedData);

        // Verify the unified database structure
        expect(unifiedDatabase).toEqual({
            //network: { protocol: "CAN", baudRate: 250000, messageCount: 1 },
            messages: expect.arrayContaining([expect.objectContaining({ id: 6, name: 'Message 6' })]),
            nodes: expect.arrayContaining([expect.objectContaining({ name: 'Node 6' })]),
        });
    });
/*
    test('parseFileDB() should resolve for a .dbc file with realistic data', async () => {
        // Realistic mock content for a .dbc file
        const mockDBCContent1 = `
            VERSION "1.0"
            BO_ 123 Message1: 8 Sender1
            SG_ Signal1 : 0|8@1+ (1,0) [0|255] "units" Sender1
            SG_ Signal2 : 8|8@1+ (1,0) [0|255] "units" Sender1
        `;
    
        // Create a mock file with the realistic .dbc content
        const mockFile1 = new File([mockDBCContent1], "test1.dbc", { type: "text/plain" });
    
        // Mock parsed data to match the .dbc content
        const mockParsedData1 = {
            messages: [
                {
                    id: 123,
                    name: "Message1",
                    dlc: 8,
                    sender: "Sender1",
                    signals: [
                        { name: "Signal1", startBit: 0, length: 8, byteOrder: "Intel", valueType: "signed", scaling: 1, offset: 0, units: "units", valueRange: [0, 255], defaultValue: 0 },
                        { name: "Signal2", startBit: 8, length: 8, byteOrder: "Intel", valueType: "signed", scaling: 1, offset: 0, units: "units", valueRange: [0, 255], defaultValue: 0 }
                    ]
                }
            ],
            nodes: ["Sender1"]
        };
    
        // Reset the database to avoid state leakage from previous tests
        databaseHandler.resetDatabase();
    
        // Mock the parseDBC function to resolve with the mockParsedData
        //global.parseDBC = jest.fn().mockResolvedValue(mockParsedData1);
    
        // Mock FileReader to simulate file reading
        global.FileReader = jest.fn().mockImplementation(() => ({
            readAsText: jest.fn(),
            onload: jest.fn(),
            onerror: jest.fn(),
        }));
    
        // Call parseFileDB and expect it to resolve with the mockParsedData
        await expect(databaseHandler.parseFileDB(mockFile1)).resolves.toEqual(mockParsedData1);
    });*/
  

    test('loadDatabase() should load a database and set the data', async () => {
        // Realistic mock content for a .dbc file
        const mockDBCContent = `
            VERSION "1.0"
            BO_ 123 Message1: 8 Sender1
            SG_ Signal1 : 0|8@1+ (1,0) [0|255] "units" Sender1
            SG_ Signal2 : 8|8@1+ (1,0) [0|255] "units" Sender1
            `;
        // Mock the internal methods for selecting and parsing a file
        const mockFile = new File([mockDBCContent], "test.dbc", { type: "text/plain" });
        const mockParsedData = {
            messages: [
                {
                    id: 123,
                    name: "Message1",
                    dlc: 8,
                    sender: "Sender1",
                    signals: [
                        { name: "Signal1", startBit: 0, length: 8, byteOrder: "Intel", valueType: "signed", scaling: 1, offset: 0, units: "units", valueRange: [0, 255], defaultValue: 0 },
                        { name: "Signal2", startBit: 8, length: 8, byteOrder: "Intel", valueType: "signed", scaling: 1, offset: 0, units: "units", valueRange: [0, 255], defaultValue: 0 }
                    ]
                }
            ],
            nodes: ["Sender1"]
        };

        // Mock `selectFileDB` to resolve with the mock file
        databaseHandler.selectFileDB = jest.fn().mockResolvedValue(mockFile);
        // Mock `parseFileDB` to resolve with mock parsed data
        databaseHandler.parseFileDB = jest.fn().mockResolvedValue(mockParsedData);

        // Call loadDatabase
        const database = await databaseHandler.loadDatabase();

        // Ensure the database is loaded correctly
        expect(databaseHandler.isDatabaseLoaded()).toBe(true);
        expect(databaseHandler.getDatabase()).toEqual(expect.objectContaining({
            //: expect.any(Object),
            messages: expect.arrayContaining([expect.objectContaining({ id: 123 })]),
        }));
    });

});
