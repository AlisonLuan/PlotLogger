import { parseDBC } from '../scripts/parser-dbc.js';

/**
 * @file parser-dbc.test.js
 * Test suite for the parseDBC function in parser-dbc.js (renamed to parseDBC).
 */
describe('parseDBC', () => {

    test('parses different ID combinations', () => {
        const dbcContent = `
          BO_ 256 Msg_1: 8 Vector__XXX
          BO_ 2147484160 Msg_2: 8 Vector__XXX
          BO_ 413912559 Msg_3: 8 Vector__XXX
          BO_ 2561326028 Msg_4: 8 Vector__XXX
        `;
        
        const parsedData = parseDBC(dbcContent);        

        // We expect 4 messages
        expect(parsedData.messages).toHaveLength(4);
      
        // 1) ID=0x100, Standard
        const msg1 = parsedData.messages[0];
        expect(msg1.id).toBe('0x100');
        expect(msg1.name).toBe('Msg_1');
        expect(msg1.isExtendedId).toBe(false);
      
        // 2) ID=0x200, Extended
        const msg2 = parsedData.messages[1];
        expect(msg2.id).toBe('0x00000200'); 
        expect(msg2.name).toBe('Msg_2');
        expect(msg2.isExtendedId).toBe(true);
      
        // 3) ID=0x18ABCDEF, Standard (custom truncation to 0x5EF if that’s your parser’s behavior)
        const msg3 = parsedData.messages[2];
        expect(msg3.id).toBe('0x5EF');
        expect(msg3.name).toBe('Msg_3');
        expect(msg3.isExtendedId).toBe(false);
      
        // 4) ID=0x18AABBCC, Extended
        const msg4 = parsedData.messages[3];
        expect(msg4.id).toBe('0x18AABBCC');
        expect(msg4.name).toBe('Msg_4');
        expect(msg4.isExtendedId).toBe(true);
      });

    test('parses a minimal DBC content with one message and one signal', () => {
        // A minimal DBC snippet for a single message & signal
        const dbcContent = `
        BO_ 256 EngineMsg: 8 ECU
        SG_ Speed : 0|8@1+ (1,0) [0|255] "km/h" Vector__XXX
        `;

        const parsedData = parseDBC(dbcContent);

        expect(parsedData.messages).toHaveLength(1);
        const msg = parsedData.messages[0];
        expect(msg.id).toBe('0x100'); // or 0x64 if your parser converts to hex
        expect(msg.name).toBe('EngineMsg');
        expect(msg.dlc).toBe(8);
        expect(msg.sender).toBe('ECU');
        expect(msg.isExtendedId).toBe(false); // Basic standard ID in DBC snippet

        expect(msg.signals).toHaveLength(1);
        const sig = msg.signals[0];
        expect(sig.name).toBe('Speed');
        expect(sig.startBit).toBe(0);
        expect(sig.length).toBe(8);
        expect(sig.byteOrder).toBe('LittleEndian'); 
        expect(sig.valueType).toBe('Unsigned'); // `+` indicates unsigned
        expect(sig.scaling).toBe(1);
        expect(sig.offset).toBe(0);
        expect(sig.units).toBe('km/h');
        expect(sig.valueRange).toEqual([0, 255]);
        expect(sig.valueDescriptions).toEqual({});
    });

    test('handles enumerations (VAL_ or VAL_TABLE_) if the DBC has them', () => {
        const dbcContent = `
        BO_ 512 TransmissionMsg: 8 TCU
        SG_ GearPos : 16|8@0+ (1,0) [0|5] "" Vector__XXX
        
        VAL_ 512 GearPos 0 "Park" 1 "Reverse" 2 "Neutral" 3 "Drive" 4 "Low" 5 "2";
        
        `;

        const parsedData = parseDBC(dbcContent);

        expect(parsedData.messages).toHaveLength(1);
        const msg = parsedData.messages[0];
        expect(msg.name).toBe('TransmissionMsg');
        expect(msg.id).toBe('0x200');

        expect(msg.signals).toHaveLength(1);
        const gearSig = msg.signals[0];
        expect(gearSig.name).toBe('GearPos');
        expect(gearSig.valueDescriptions).toEqual({
        0: 'Park',
        1: 'Reverse',
        2: 'Neutral',
        3: 'Drive',
        4: 'Low',
        5: '2',
        });
        expect(gearSig.startBit).toBe(16);
        expect(gearSig.length).toBe(8);
    });

    test('parses extended IDs correctly if present', () => {
        const dbcContent = `
        BO_ 2147614719 ExtendedMsg: 8 Vector__XXX
        SG_ SignalExt : 0|16@1+ (1,0) [0|65535] "" Vector__XXX
        `;

        const parsedData = parseDBC(dbcContent);
        expect(parsedData.messages).toHaveLength(1);

        const msg = parsedData.messages[0];
        expect(msg.id).toBe('0x0001FFFF');
        expect(msg.isExtendedId).toBe(true); 
        expect(msg.signals).toHaveLength(1);

        const extSig = msg.signals[0];
        expect(extSig.name).toBe('SignalExt');
        expect(extSig.length).toBe(16);
    });

    test('parses scaling, offset, min, max, and units from the DBC notation', () => {
        const dbcContent = `
        BO_ 300 TempMsg: 8 Sensor
        SG_ Temperature : 0|8@0- (0.5,-40) [-40|215] "degC" Vector__XXX
        `;
        
        const parsedData = parseDBC(dbcContent);
        expect(parsedData.messages).toHaveLength(1);

        const msg = parsedData.messages[0];
        const tempSig = msg.signals.find(s => s.name === 'Temperature');
        expect(tempSig).toBeDefined();
        expect(tempSig.scaling).toBe(0.5);
        expect(tempSig.offset).toBe(-40);
        expect(tempSig.valueRange).toEqual([-40, 215]);
        expect(tempSig.units).toBe('degC');
        // The `-` in `0|8@0-` might indicate Intel byte order, so adjust your checks accordingly.
    });

    test('handles no messages gracefully', () => {
        const dbcContent = `
        NS_ : 
        BS_:
        `;
        const parsedData = parseDBC(dbcContent);

        expect(parsedData.messages).toHaveLength(0);
        expect(parsedData.nodes).toEqual([]);
    });

    test('parses multiple messages and checks node or sender info', () => {
        const dbcContent = `
        BO_ 100 EngineMsg: 8 PCM
        SG_ Speed : 0|8@1+ (1,0) [0|255] "km/h" Vector__XXX

        BO_ 101 BrakeMsg: 8 ABS
        SG_ Pressure : 8|8@1+ (0.5,0) [0|127.5] "bar" Vector__XXX
        `;

        const parsedData = parseDBC(dbcContent);
        expect(parsedData.messages).toHaveLength(2);

        const engineMsg = parsedData.messages[0];
        expect(engineMsg.sender).toBe('PCM');
        expect(engineMsg.signals[0].name).toBe('Speed');

        const brakeMsg = parsedData.messages[1];
        expect(brakeMsg.sender).toBe('ABS');
        expect(brakeMsg.signals[0].name).toBe('Pressure');
    });

    test('handles missing or malformed fields gracefully', () => {
        const dbcContent = `
        BO_ 300 IncompleteMsg:
        SG_ Signal : 0|
        `;
        expect(() => parseDBC(dbcContent)).not.toThrow();
    });

    test('rejects invalid ID formats', () => {
        const dbcContent = `
            BO_ XYZ InvalidMsg: 8 ECU
        `;
    
        const parsedData = parseDBC(dbcContent);
    
        // Expect no messages to be parsed if the ID format is invalid
        expect(parsedData.messages).toHaveLength(0);
    });
    

    test('handles no messages gracefully', () => {
        const dbcContent = `NS_ : BS_:`;  
        const parsedData = parseDBC(dbcContent);

        expect(parsedData.messages).toHaveLength(0);
        expect(parsedData.nodes).toEqual([]);
    });

    test('parses multiple messages and checks node or sender info', () => {
        const dbcContent = `
        BO_ 100 EngineMsg: 8 PCM
        SG_ Speed : 0|8@1+ (1,0) [0|255] "km/h" Vector__XXX

        BO_ 101 BrakeMsg: 8 ABS
        SG_ Pressure : 8|8@1+ (0.5,0) [0|127.5] "bar" Vector__XXX
        `;

        const parsedData = parseDBC(dbcContent);
        expect(parsedData.messages).toHaveLength(2);

        const engineMsg = parsedData.messages[0];
        expect(engineMsg.sender).toBe('PCM');
        expect(engineMsg.signals[0].name).toBe('Speed');

        const brakeMsg = parsedData.messages[1];
        expect(brakeMsg.sender).toBe('ABS');
        expect(brakeMsg.signals[0].name).toBe('Pressure');
    });

    test('parses message descriptions correctly', () => {
        const dbcContent = `
            BO_ 100 EngineMsg: 8 PCM
            CM_ BO_ 100 "Engine message description";
    
            BO_ 101 BrakeMsg: 8 ABS
            CM_ BO_ 101 "Brake message description";
        `;
    
        const parsedData = parseDBC(dbcContent);
        expect(parsedData.messages).toHaveLength(2);
    
        const engineMsg = parsedData.messages[0];
        expect(engineMsg.description).toBe('Engine message description');
    
        const brakeMsg = parsedData.messages[1];
        expect(brakeMsg.description).toBe('Brake message description');
    });    

    test('parses message descriptions correctly when comments are after frames', () => {
        const dbcContent = `
            BO_ 100 EngineMsg: 8 PCM
            BO_ 101 BrakeMsg: 8 ABS
            CM_ BO_ 100 "Engine message description";
            CM_ BO_ 101 "Brake message description";
        `;
    
        const parsedData = parseDBC(dbcContent);
        expect(parsedData.messages).toHaveLength(2);
    
        // Find messages by name so we don't depend on order or key formatting
        const engineMsg = parsedData.messages.find(msg => msg.name === 'EngineMsg');
        const brakeMsg = parsedData.messages.find(msg => msg.name === 'BrakeMsg');
    
        expect(engineMsg.description).toBe('Engine message description');
        expect(brakeMsg.description).toBe('Brake message description');
    });
    
    test('parses signal description correctly when comment is after frame', () => {
        const dbcContent = `
            BO_ 123 TestFrame: 8 NODE
            SG_ Temperature : 0|8@1+ (1,0) [0|255] "°C"
            CM_ SG_ 123 Temperature "Test signal description";
        `;
    
        const parsedData = parseDBC(dbcContent);
        expect(parsedData.messages).toHaveLength(1);
    
        const msg = parsedData.messages[0];
        expect(msg.signals).toHaveLength(1);
    
        const signal = msg.signals[0];
        expect(signal.name).toBe('Temperature');
        expect(signal.description).toBe('Test signal description');
    });
    
    test('parses both frame and signal descriptions correctly when comments are after frames', () => {
        const dbcContent = `
            BO_ 456 AnotherFrame: 8 NODE2
            SG_ Pressure : 0|8@1+ (1,0) [0|255] "bar"
            CM_ BO_ 456 "Test frame description for pressure";
            CM_ SG_ 456 Pressure "Test signal description for pressure";
        `;
    
        const parsedData = parseDBC(dbcContent);
        expect(parsedData.messages).toHaveLength(1);
    
        const msg = parsedData.messages[0];
        expect(msg.description).toBe('Test frame description for pressure');
    
        expect(msg.signals).toHaveLength(1);
        const signal = msg.signals[0];
        expect(signal.name).toBe('Pressure');
        expect(signal.description).toBe('Test signal description for pressure');
    });
    

});