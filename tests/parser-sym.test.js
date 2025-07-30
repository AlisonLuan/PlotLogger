import { parseSYM } from '../scripts/parser-sym.js';

describe('parseSYM', () => {

    test('parses different IDs combinations', () => {
        const content = `
            [Msg_1]
            ID=100h
            Type=Standard

            [Msg_2]
            ID=200h
            Type=Extended
            
            [Msg_3]
            ID=18ABCDEFh
            Type=Standard

            [Msg_4]
            ID=18AABBCCh
            Type=Extended
            Len=8
        `;
        
        const parsedData = parseSYM(content);

        expect(parsedData.messages).toHaveLength(4);

        const msg1 = parsedData.messages[0];
        expect(msg1.id).toBe('0x100');
        expect(msg1.name).toBe('Msg_1');
        expect(msg1.isExtendedId).toBe(false);

        const msg2 = parsedData.messages[1];
        expect(msg2.id).toBe('0x00000200');
        expect(msg2.name).toBe('Msg_2');
        expect(msg2.isExtendedId).toBe(true);

        const msg3 = parsedData.messages[2];
        expect(msg3.id).toBe('0x5EF');
        expect(msg3.name).toBe('Msg_3');
        expect(msg3.isExtendedId).toBe(false);

        const msg4 = parsedData.messages[3];
        expect(msg4.id).toBe('0x18AABBCC');
        expect(msg4.name).toBe('Msg_4');
        expect(msg4.isExtendedId).toBe(true);
    });


test('parses a minimal SYM content with one message and one signal', () => {
    const content = `
      [EngineMsg]
      ID=123h
      Type=Standard
      Len=8
      Sig="EngineSpeed" 0
      Sig="EngineSpeed" unsigned 2
    `;
    
    const parsedData = parseSYM(content);
    
    expect(parsedData.messages).toHaveLength(1);
    const msg = parsedData.messages[0];
    expect(msg.id).toBe('0x123');
    expect(msg.name).toBe('EngineMsg');
    expect(msg.dlc).toBe(8);
    expect(msg.sender).toBe('Unknown');
    expect(msg.isExtendedId).toBe(false);
    expect(msg.signals).toHaveLength(1);

    const sig = msg.signals[0];
    expect(sig.name).toBe('EngineSpeed');
    expect(sig.startBit).toBe(0);
    expect(sig.length).toBe(2);
    expect(sig.byteOrder).toBe('LittleEndian');
    expect(sig.valueType).toBe('Unsigned');
    expect(sig.scaling).toBe(1.0);
    expect(sig.offset).toBe(0.0);
    expect(sig.units).toBe('');
    expect(sig.valueRange).toEqual([0, 1]);
    expect(sig.valueDescriptions).toEqual({});
    
    // No nodes were found
    expect(parsedData.nodes).toEqual([]);
  });

test('handles enumerations and assigns them correctly to signals', () => {
    const content = `
      Enum=GearEnum("0"=Park,"1"=Reverse,"2"=Neutral,"3"=Drive)
      [TransmissionMsg]
      ID=200h
      Type=Standard
      Len=8
      Sig="GearPosition" 16
      Sig="GearPosition" unsigned 8 /e:GearEnum
    `;
    
    const parsedData = parseSYM(content);
    expect(parsedData.messages).toHaveLength(1);

    const msg = parsedData.messages[0];
    expect(msg.name).toBe('TransmissionMsg');
    expect(msg.id).toBe('0x200'); // 200 in decimal is 0xC8
    expect(msg.signals).toHaveLength(1);

    const gearSig = msg.signals[0];
    expect(gearSig.name).toBe('GearPosition');
    expect(gearSig.valueDescriptions).toMatchObject({
      '0': 'Park',
      '1': 'Reverse',
      '2': 'Neutral',
      '3': 'Drive',
    });
    expect(gearSig.startBit).toBe(16);
    expect(gearSig.length).toBe(8);
  });

  it('parses big-endian signals correctly', () => {
    const content = `
      Sig="BigSignal" unsigned 16 -m
      [TestMsg]
      ID=123h
      Type=Standard
      Len=4
      Sig="BigSignal" 0
    `;
    
    const parsedData = parseSYM(content);
    expect(parsedData.messages).toHaveLength(1);

    const msg = parsedData.messages[0];
    expect(msg.signals).toHaveLength(1);

    const bigSig = msg.signals[0];
    expect(bigSig.name).toBe('BigSignal');
    expect(bigSig.byteOrder).toBe('BigEndian');
    expect(bigSig.length).toBe(16);
  });

test('parses scaling, offset, min, max, and units', () => {
    const content = `
      Sig="ScaledSignal" unsigned 8 /f:0.5 /o:-10 /min:-100 /max:100 /u:"degC"
      [TestMsg]
      ID=7FFh
      Len=1
      Sig="ScaledSignal" 0
    `;
    
    const parsedData = parseSYM(content);
    expect(parsedData.messages).toHaveLength(1);

    const msg = parsedData.messages[0];
    const scaledSig = msg.signals.find(s => s.name === 'ScaledSignal');
    expect(scaledSig).toBeDefined();
    expect(scaledSig.scaling).toBe(0.5);
    expect(scaledSig.offset).toBe(-10);
    expect(scaledSig.valueRange).toEqual([-100, 100]);
    expect(scaledSig.units).toBe('degC');
  });

test('gracefully handles no messages or signals', () => {
    const content = `Enum=EmptyEnum("0"=None)`;
    const parsedData = parseSYM(content);

    expect(parsedData.messages).toHaveLength(0);
    expect(parsedData.nodes).toHaveLength(0);
  });

test('parses multiple messages and checks node creation if applicable', () => {
    // If your SYM doesn't explicitly define nodes, you might not get them. 
    // Suppose we have some lines referencing nodes
    const content = `
      [EngineMsg]
      ID=100h
      Type=Standard
      Len=8
      Sig="Speed" 0
      Sig="Speed" unsigned 8

      [BrakeMsg]
      ID=101h
      Type=Standard
      Len=8
      Sig="Pressure" 8
      Sig="Pressure" unsigned 8
    `;
    
    const parsedData = parseSYM(content);

    expect(parsedData.messages).toHaveLength(2);
    expect(parsedData.nodes).toHaveLength(0); 
    // Because we haven't assigned node/sender info in SYM, 
    // parseSYM doesn’t populate them by default
  });

  test('handles missing fields gracefully', () => {
      const content = `
        [IncompleteMsg]
        ID=
        Type=
      `;
      const parsedData = parseSYM(content);
      expect(parsedData.messages).toHaveLength(0);
  });

  test('rejects invalid ID formats', () => {
      const content = `
          [InvalidMsg]
          ID=XYZh
          Type=Standard
      `;
      const parsedData = parseSYM(content);
      expect(parsedData.messages).toHaveLength(0);
  });

  test('ignores case-insensitive Type and ID keys', () => {
      const content = `
          [CaseInsensitiveMsg]
          id=123h
          type=extended
      `;
      const parsedData = parseSYM(content);
      
      // The incorrectly formatted keys should be ignored, meaning no valid messages are parsed.
      expect(parsedData.messages).toHaveLength(0);
  });

  test('handles duplicate message names correctly', () => {
      const content = `
        [DuplicateMsg]
        ID=200h
        Type=Standard

        [DuplicateMsg]
        ID=200h
        Type=Standard
      `;
      const parsedData = parseSYM(content);
      expect(parsedData.messages).toHaveLength(1);
  });

  test('allows signals with excessive bit length (but may be limited to 64 bits in the future)', () => {
      const content = `
          [TestMsg]
          ID=300h
          Type=Standard
          Len=10
          Sig="BigSignal" 0
          Sig="BigSignal" unsigned 80
      `;

      const parsedData = parseSYM(content);

      // The signal should be parsed correctly for now, but this might be restricted to 64 bits later.
      expect(parsedData.messages).toHaveLength(1);
      expect(parsedData.messages[0].signals).toHaveLength(1);
      expect(parsedData.messages[0].signals[0].length).toBe(80);
  });

  test('handles empty or comment-only files gracefully', () => {
      const content = `
        // This is a comment
        # Another comment
      `;
      const parsedData = parseSYM(content);
      expect(parsedData.messages).toHaveLength(0);
  });

  test('parses message names with special characters', () => {
      const content = `
        [Msg_with-Special_Chars]
        ID=101h
        Type=Standard
        Len=1
      `;
      const parsedData = parseSYM(content);
      expect(parsedData.messages[0].name).toBe('Msg_with-Special_Chars');
  });

  test('applies default values to missing signal properties', () => {
      //   const content = `
      //     [TestMsg]
      //     ID=101h
      //     Type=Standard
      //     Len=1
      //     Sig="IncompleteSignal" 0
      //   `;
      // const parsedData = parseSYM(content);

      // expect(parsedData.messages).toHaveLength(1);
      // expect(parsedData.messages[0].signals).toHaveLength(1);

      // const sig = parsedData.messages[0].signals[0];

      // // Default values if missing
      // expect(sig.name).toBe('IncompleteSignal');
      // expect(sig.startBit).toBe(0); // Defaulted to 0 (was missing)
      // expect(sig.length).toBe(1); // Defaulted to 1 if missing
      // expect(sig.scaling).toBe(1.0); // Default scale factor
      // expect(sig.offset).toBe(0.0); // Default offset
      // expect(sig.units).toBe(''); // Default empty unit
      // expect(sig.byteOrder).toBe('LittleEndian'); // Assuming Little-Endian is the default
      // expect(sig.valueType).toBe('Unsigned'); // Assuming unsigned if not specified
      // expect(sig.valueRange).toEqual([]); // Empty array as default
  });

  test('parses test1.sym and returns the expected messages and signals', () => {
    // load the symbol file
      const content = `
        FormatVersion=6.0 // Do not edit this line!
        Title="Unbenannt"

        {SIGNALS}
        Sig=Signal1 unsigned 8 /max:1
        Sig=Signal2 unsigned 8 /max:1

        {SENDRECEIVE}

        [Symbol1]
        ID=123h
        Len=8
        Mux=Multiplexer1 0,1 0 
        Var=Variable1 unsigned 8,8 /max:1

        [Symbol1]
        Len=8
        Mux=Multiplexer2 0,1 1 
        Var=Variable1 unsigned 8,8 /max:1

        [Symbol2]
        ID=321h
        Len=8
        Mux=Multiplexer1 0,1 0 
        Sig=Signal1 8

        [Symbol2]
        Len=8
        Mux=Multiplexer2 0,1 1 
        Sig=Signal2 8

        [Symbol3]
        ID=222h
        Len=8
        Mux=Multiplexer1 0,16 1234h  -m
        Var=Variable1 unsigned 16,1

        [Symbol3_Copy]
        ID=223h
        Len=8
        Mux=Multiplexer1 0,16 1234h 
        Var=Variable1 unsigned 16,1
      `;

    const parsed = parseSYM(content);

    // we expect four messages in this file
    expect(parsed.messages).toHaveLength(4);

    // pick them off in order
    const [msg1, msg2, msg3, msg4] = parsed.messages;

    // --- Message 1 ---
    expect(msg1.name).toBe('Symbol1');
    expect(msg1.id).toBe('0x123');      // ID=123h in the file
    expect(msg1.dlc).toBe(8);           // Len=8
    expect(msg1.signals).toHaveLength(4);
    // check one of its signals
    expect(msg1.signals[0].name).toBe('Multiplexer1');
    expect(msg1.signals[0].startBit).toBe(0);
    expect(msg1.signals[0].length).toBe(1);

    // --- Message 2 ---
    expect(msg2.name).toBe('Symbol3');
    expect(msg2.id).toBe('0x222');
    expect(msg2.signals).toHaveLength(2);

    // --- Message 3 (duplicate name case) ---
    expect(msg3.name).toBe('Symbol3_Copy');
    expect(msg3.id).toBe('0x223');
    expect(msg3.signals).toHaveLength(2);

    // --- Message 4 ---
    expect(msg4.name).toBe('Symbol2');
    expect(msg4.id).toBe('0x321');
    expect(msg4.signals).toHaveLength(4);

    // no nodes are defined in this SYM
    expect(parsed.nodes).toEqual([]);
  });

  test('parses commentary from ID line correctly', () => {
    const content = `
      [Status_1]
      ID=18FF7844h // qwertweqrwr443214
      Type=Extended
      Len=8
      Sig=Status 0
    `;
    const parsedData = parseSYM(content);
    expect(parsedData.messages).toHaveLength(1);
    const msg = parsedData.messages[0];
    expect(msg.comment).toBe('qwertweqrwr443214');
  });

  test('does not add comment property when no commentary is provided', () => {
    const content = `
      [NoCommentMsg]
      ID=18FF7844h
      Type=Standard
      Len=8
    `;
    const parsedData = parseSYM(content);
    expect(parsedData.messages).toHaveLength(1);
    const msg = parsedData.messages[0];
    expect(msg.comment).toBeUndefined();
  });

  test('trims extra whitespace in commentary', () => {
    const content = `
      [TrimMsg]
      ID=18FF7844h   //   commentary with spaces    
      Type=Extended
      Len=8
    `;
    const parsedData = parseSYM(content);
    expect(parsedData.messages).toHaveLength(1);
    const msg = parsedData.messages[0];
    expect(msg.comment).toBe('commentary with spaces');
  });

  test('extracts signal descriptions from global SIGNALS block and applies them in messages', () => {
    const content = `
      FormatVersion=6.0 // Do not edit this line!
      Title="Test Database"

      {SENDRECEIVE}

      [Msg1]
      ID=000h // Symbol description
      Len=8
      Sig=TestSignal1 0
      Sig=TestSignal2 8

      {SIGNALS}
      Sig=TestSignal1 unsigned 8 /ln:"Label1" // Desc for TestSignal1
      Sig=TestSignal2 unsigned 8 /ln:"Label2" // Desc for TestSignal2
    `;
    const parsedData = parseSYM(content);
    expect(parsedData.messages).toHaveLength(1);
    const msg = parsedData.messages[0];
    expect(msg.signals).toHaveLength(2);

    const sig1 = msg.signals.find(s => s.name === 'TestSignal1');
    const sig2 = msg.signals.find(s => s.name === 'TestSignal2');

    expect(sig1).toBeDefined();
    expect(sig1.description).toBe('Desc for TestSignal1');

    expect(sig2).toBeDefined();
    expect(sig2.description).toBe('Desc for TestSignal2');
  });

  test('assigns an empty description when the global signal has no inline comment', () => {
    const content = `
      FormatVersion=6.0 // Do not edit this line!
      Title="Test Database"

      {SIGNALS}
      Sig=TestSignal1 unsigned 8 /ln:"Label1" // Desc exists
      Sig=TestSignal2 unsigned 8 /ln:"Label2"

      {SENDRECEIVE}

      [Msg1]
      ID=001h // Another symbol description
      Len=8
      Sig=TestSignal1 0
      Sig=TestSignal2 8
    `;
    const parsedData = parseSYM(content);
    expect(parsedData.messages).toHaveLength(1);
    const msg = parsedData.messages[0];
    expect(msg.signals).toHaveLength(2);

    const sig1 = msg.signals.find(s => s.name === 'TestSignal1');
    const sig2 = msg.signals.find(s => s.name === 'TestSignal2');

    expect(sig1).toBeDefined();
    expect(sig1.description).toBe('Desc exists');

    expect(sig2).toBeDefined();
    expect(sig2.description).toBe(''); // No inline comment provided
  });

  test('trims extra whitespace in the inline description', () => {
    const content = `
      FormatVersion=6.0 // Do not edit this line!
      Title="Test Database"

      {SIGNALS}
      Sig=TestSignal1 unsigned 8 /ln:"Label1" //    Desc with extra spaces    
      Sig=TestSignal2 unsigned 8 /ln:"Label2" //DescWithoutSpaces

      {SENDRECEIVE}

      [Msg1]
      ID=002h // Symbol description
      Len=8
      Sig=TestSignal1 0
      Sig=TestSignal2 8
    `;
    const parsedData = parseSYM(content);
    expect(parsedData.messages).toHaveLength(1);
    const msg = parsedData.messages[0];
    expect(msg.signals).toHaveLength(2);

    const sig1 = msg.signals.find(s => s.name === 'TestSignal1');
    const sig2 = msg.signals.find(s => s.name === 'TestSignal2');

    expect(sig1).toBeDefined();
    expect(sig1.description).toBe('Desc with extra spaces');

    expect(sig2).toBeDefined();
    expect(sig2.description).toBe('DescWithoutSpaces');
  });

  // Validates an enum with generic names and entries
  test('parses enumeration with generic entries', () => {
    const content = `
      Enum=EnumA(0="Zero", 1="One", 2="Two", 3="Three")
      [MsgA]
      ID=1h
      Type=Standard
      Len=8
      Sig="FieldA" 0
      Sig="FieldA" unsigned 2 /e:EnumA
    `;
    const parsedData = parseSYM(content);
    expect(parsedData.messages).toHaveLength(1);

    const sig = parsedData.messages[0].signals[0];
    expect(sig.name).toBe('FieldA');
    expect(sig.length).toBe(2);
    expect(sig.valueDescriptions).toMatchObject({
      '0': 'Zero',
      '1': 'One',
      '2': 'Two',
      '3': 'Three',
    });
  });

  // Validates that multi-line enum definitions are parsed with generic labels
  test('handles multi-line enumeration with generic labels', () => {
    const content = `
      Enum=EnumB(
        0="Label0", 1="Label1",
        2="Label2", 3="Label3",
        4="Label4", 5="Label5"
      )
      [MsgB]
      ID=10h
      Type=Standard
      Len=1
      Sig="FieldB" 0
      Sig="FieldB" unsigned 3 /e:EnumB
    `;
    const parsedData = parseSYM(content);
    expect(parsedData.messages).toHaveLength(1);

    const sig = parsedData.messages[0].signals[0];
    expect(sig.valueDescriptions['0']).toBe('Label0');
    expect(sig.valueDescriptions['3']).toBe('Label3');
    expect(sig.valueDescriptions['5']).toBe('Label5');
  });

  // Validates parsing of string-type signals with generic field names
  test('parses string signals generically', () => {
    const content = `
      {SIGNALS}
      Sig=FieldC string 12

      {SENDRECEIVE}
      [MsgC]
      ID=1Ah
      Type=Standard
      Len=8
      Sig=FieldC 0
    `;
    const parsedData = parseSYM(content);
    expect(parsedData.messages).toHaveLength(1);

    const sig = parsedData.messages[0].signals[0];
    expect(sig.name).toBe('FieldC');
    expect(sig.valueType).toBe('String');
    expect(sig.length).toBe(12);
    expect(sig.startBit).toBe(0);
  });

});