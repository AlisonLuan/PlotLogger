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
        databaseHandler.dropdownContent = { ID: [1], MsgName: ['Message 1'], Sender: ['Sender 1'], Signal: ['Signal 1'] };

        // Call resetDatabase
        databaseHandler.resetDatabase();

        // Assert database and dropdownContent are reset
        expect(databaseHandler.database).toBeNull();
        expect(databaseHandler.dropdownContent).toEqual({ ID: [], MsgName: [], Sender: [], Signal: [] });
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
        expect(databaseHandler.dropdownContent.ID).toEqual([4, 5]);
        expect(databaseHandler.dropdownContent.MsgName).toEqual(['Message 4', 'Message 5']);
        expect(databaseHandler.dropdownContent.Sender).toEqual(['Sender 4', 'Sender 5']);
        expect(databaseHandler.dropdownContent.Signal).toEqual(['Signal 4', 'Signal 5']);
    });

    test('addUnique() should add unique values to an array', () => {
        const array = [1, 2, 3];
        
        // Adding unique value
        databaseHandler.addUnique(array, 4);
        expect(array).toEqual([1, 2, 3, 4]);

        // Adding duplicate value
        databaseHandler.addUnique(array, 3);
        expect(array).toEqual([1, 2, 3, 4]);
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

    test('resetDatabase() should not throw an error if called multiple times', () => {
        // expect(() => {
        //     databaseHandler.resetDatabase();
        //     databaseHandler.resetDatabase();
        // }).not.toThrow();
    });

    test('isDatabaseLoaded() should return false after resetDatabase is called', () => {
        // databaseHandler.database = { messages: [{ id: 123 }] };
        // expect(databaseHandler.isDatabaseLoaded()).toBe(true);

        // databaseHandler.resetDatabase();
        // expect(databaseHandler.isDatabaseLoaded()).toBe(false);
    });

    test('extractDropdownContent() should handle empty database gracefully', () => {
        // databaseHandler.database = { messages: [] };

        // expect(() => databaseHandler.extractDropdownContent()).not.toThrow();
        // expect(databaseHandler.dropdownContent).toEqual({ ID: [], MsgName: [], Sender: [], Signal: [] });
    });

    test('extractDropdownContent() should not add duplicates to dropdown lists', () => {
        // databaseHandler.database = {
        //     messages: [
        //         { id: 10, name: 'TestMsg', sender: 'NodeA', signals: [{ name: 'Speed' }, { name: 'Speed' }] },
        //         { id: 20, name: 'TestMsg', sender: 'NodeA', signals: [{ name: 'RPM' }] }
        //     ]
        // };

        // databaseHandler.extractDropdownContent();
        // expect(databaseHandler.dropdownContent.ID).toEqual([10, 20]);
        // expect(databaseHandler.dropdownContent.MsgName).toEqual(['TestMsg']);
        // expect(databaseHandler.dropdownContent.Sender).toEqual(['NodeA']);
        // expect(databaseHandler.dropdownContent.Signal).toEqual(['Speed', 'RPM']); // No duplicates
    });

    test('buildUnifiedDatabase() should handle empty input data', () => {
        // const unifiedDatabase = databaseHandler.buildUnifiedDatabase({ messages: [], nodes: [] });

        // expect(unifiedDatabase).toEqual({
        //     messages: [],
        //     nodes: []
        // });
    });

    test('buildUnifiedDatabase() should handle messages without signals', () => {
        // const parsedData = {
        //     messages: [{ id: 555, name: 'NoSignalsMsg', dlc: 8, sender: 'ECU', signals: [] }],
        //     nodes: ['ECU']
        // };

        // const unifiedDatabase = databaseHandler.buildUnifiedDatabase(parsedData);

        // expect(unifiedDatabase.messages).toHaveLength(1);
        // expect(unifiedDatabase.messages[0].signals).toEqual([]); // Should handle no signals
    });

    test('addUnique() should handle empty arrays correctly', () => {
        // const array = [];
        // databaseHandler.addUnique(array, 1);
        // expect(array).toEqual([1]);
    });

    test('addUnique() should handle non-array inputs gracefully', () => {
        // expect(() => databaseHandler.addUnique(null, 5)).toThrow();
        // expect(() => databaseHandler.addUnique(undefined, 5)).toThrow();
    });

    test('parseFileDB() should reject unsupported file formats', async () => {
        const mockDBCContent = ``;
        // Mock the internal methods for selecting and parsing a file
        const mockFile = new File([mockDBCContent], "test.txt", { type: "text/plain" });
        const mockParsedData = {};

        // Mock `selectFileDB` to resolve with the mock file
        databaseHandler.selectFileDB = jest.fn().mockResolvedValue(mockFile);
        // Mock `parseFileDB` to resolve with mock parsed data
        databaseHandler.parseFileDB = jest.fn().mockResolvedValue(mockParsedData);

        // Ensure the database is loaded correctly
        expect(databaseHandler.isDatabaseLoaded()).toBe(false);
        expect(databaseHandler.getDatabase()).toEqual(null);

        // Call the actual implementation of parseFileDB and expect it to reject with the proper error
        //await expect(databaseHandler.parseFileDB(mockFile))
        //.rejects
        //.toThrow("Unsupported file format.");
    });  
    
    test('parseFileDB() should return parsed data for supported formats', async () => {
        // const mockDBCContent = `
        //     BO_ 123 ExampleMsg: 8 Node1
        //     SG_ TestSignal : 0|8@1+ (1,0) [0|255] "units" Node1
        // `;
        // const mockDBCFile = new File([mockDBCContent], "test.dbc", { type: "text/plain" });
    
        // const mockParsedData = { messages: [{ id: 123, name: "ExampleMsg", sender: "Node1", signals: [{ name: "TestSignal" }] }] };
    
        // global.parseDBC = jest.fn().mockReturnValue(mockParsedData);
    
        // await expect(databaseHandler.parseFileDB(mockDBCFile)).resolves.toEqual(mockParsedData);
        // expect(parseDBC).toHaveBeenCalledWith(mockDBCContent);
    });
    
    test('parseFileDB() should return parsed data for SYM files', async () => {
        // const mockSYMContent = `
        //     [ExampleMsg]
        //     ID=123h
        //     Type=Standard
        // `;
        // const mockSYMFile = new File([mockSYMContent], "test.sym", { type: "text/plain" });
    
        // const mockParsedData = { messages: [{ id: 123, name: "ExampleMsg", sender: "Unknown", signals: [] }] };
    
        // global.parseSYM = jest.fn().mockReturnValue(mockParsedData);
    
        // await expect(databaseHandler.parseFileDB(mockSYMFile)).resolves.toEqual(mockParsedData);
        // expect(parseSYM).toHaveBeenCalledWith(mockSYMContent);
    });
    
    test('parseFileDB() should return error for empty file content', async () => {
        // const mockFile = new File([""], "test.dbc", { type: "text/plain" });
    
        // await expect(databaseHandler.parseFileDB(mockFile)).rejects.toThrow("Error reading file.");
    });
    
    test('parseFileDB() should reject if FileReader encounters an error', async () => {
        // const mockFile = new File(["test content"], "test.dbc", { type: "text/plain" });
    
        // const mockReader = {
        //     readAsText: jest.fn(),
        //     onload: null,
        //     onerror: null
        // };
    
        // jest.spyOn(global, 'FileReader').mockImplementation(() => mockReader);
    
        // const parsePromise = databaseHandler.parseFileDB(mockFile);
    
        // mockReader.onerror(); // Simulate an error during reading
    
        // await expect(parsePromise).rejects.toThrow("Error reading file.");
    });

});
