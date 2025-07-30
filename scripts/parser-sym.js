/**
 * Parses the SYM file content into structured data matching parser-dbc output.
 * @param {string} content - The raw SYM file content.
 * @returns {{ messages: Array, nodes: Array }} - Parsed messages and nodes.
 */
export function parseSYM(content) {
  const lines = content.split('\n').map(l => l.trim());
  const messages = [];
  const nodes = new Set();
  const signalsDefs = {};
  const enumerations = {};
  let currentMuxName = null;
  let currentMuxValue = null;

  // 1) Extract multi-line enums
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('Enum=')) continue;
    let accum = line;
    while (!accum.includes(')') && i < lines.length - 1) {
      i++;
      accum += ' ' + lines[i];
    }
    const m = accum.match(/^Enum=([^()]+)\(([^)]+)\)$/);
    if (!m) continue;
    const enumName = m[1].trim();
    const entries = m[2]
      .split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/)
      .map(p => p.trim())
      .filter(Boolean);
    const map = {};
    for (const p of entries) {
      const [k, v] = p.split('=').map(x => x.trim().replace(/^"|"$/g, ''));
      map[k] = v;
    }
    enumerations[enumName] = map;
  }

  // 2) Global signal definitions
  let section = '';
  for (const line of lines) {
    if (line.startsWith('{')) {
      section = line.replace(/[{}]/g, '').toUpperCase();
      continue;
    }
    if (section !== 'SIGNALS') continue;
    const sigMatch = line.match(/^Sig=(?:"([^"]+)"|(\S+))\s+(\w+)\s+(\d+)(?:\s+(-m))?/);
    if (!sigMatch) continue;
    const [, quotedName, bareName, rawTypeRaw, lenRaw, muxFlag] = sigMatch;
    const name = quotedName || bareName;
    const rawType = rawTypeRaw.toLowerCase();
    const length = parseInt(lenRaw, 10);
    //m == Motorola (BigEndian), otherwise Intel (LittleEndian)
    const byteOrder = muxFlag ? 'BigEndian' : 'LittleEndian';
    const valueType =
      rawType === 'string' ? 'String' :
        rawType === 'unsigned' ? 'Unsigned' :
          'Signed';

    signalsDefs[name] = {
      name,
      length,
      byteOrder,
      valueType,
      scaling: 1.0,
      offset: 0.0,
      valueRange: [0, 1],
      units: '',
      description: '',
      valueDescriptions: {},
      defaultValue: 0,
      isMultiplexer: false // templates are never mux-selectors
    };

    const attrs = line.match(
      /\/[fo]:(-?\d+(\.\d+)?)|\/min:(-?\d+(\.\d+)?)|\/max:(-?\d+(\.\d+)?)|\/u:"([^"]+)"|\/e:([^\s]+)|\/d:(-?\d+(\.\d+)?)|\/p:"([^"]*)"/g
    ) || [];
    for (const attr of attrs) {
      if (attr.startsWith('/f:')) signalsDefs[name].scaling = parseFloat(attr.slice(3));
      if (attr.startsWith('/o:')) signalsDefs[name].offset = parseFloat(attr.slice(3));
      if (attr.startsWith('/min:')) signalsDefs[name].valueRange[0] = parseFloat(attr.slice(5));
      if (attr.startsWith('/max:')) signalsDefs[name].valueRange[1] = parseFloat(attr.slice(5));
      if (attr.startsWith('/u:')) signalsDefs[name].units = attr.slice(3).replace(/"/g, '');
      if (attr.startsWith('/e:')) {
        const en = attr.slice(3);
        if (enumerations[en]) signalsDefs[name].valueDescriptions = { ...enumerations[en] };
      }
    }

    const desc = line.match(/\/\/\s*(.*)$/);
    if (desc) signalsDefs[name].description = desc[1].trim();
  }

  const msgMap = {};
  const muxValues = {};
  let current = null;
  const pendingInstances = {};        // { [msgName]: { [sigName]: [startBit, …] } }

  for (const line of lines) {

    if (line.startsWith('{')) {
      section = line.replace(/[{}]/g, '').toUpperCase();
      continue;
    }

    if (section === 'SENDRECEIVE') {
      // e.g. lines like "SymName ECU1 ECU2"
      const m = line.match(/^(\w+)\s+(\w+(?:\s+\w+)*)$/);
      if (m) {
        const [, msgName, ecus] = m;
        msgMap[msgName].sender = ecus.split(/\s+/)[0];       // primary sender
        ecus.split(/\s+/).forEach(e => nodes.add(e));        // collect all nodes
      }
    }

    const hdr = line.match(/^\[(.+)\]$/);
    if (hdr) {
      const msgName = hdr[1].replace(/"/g, '');
      pendingInstances[msgName] = {};  // reset pending for this message
      current = msgMap[msgName];
      if (!msgMap[msgName]) {
        msgMap[msgName] = {
          id: null, rawId: null, isExtendedId: false,
          name: msgName, dlc: null, sender: 'Unknown',
          comment: undefined, signals: []
        };
        muxValues[msgName] = {};     // ← initialize here
      }
      current = msgMap[msgName];
      currentMuxName = null;
      currentMuxValue = null;
      if (!messages.includes(current)) messages.push(current);
      continue;
    }
    
    // —————— Inline signal‐template in a message ——————
    const defm = line.match(
      /^Sig="?([^"\s]+)"?\s+(\w+)\s+(\d+)(?:\s+(-m))?(.*)$/
    );
    if (defm) {
      const [, nm, rawTypeRaw, lenRaw, endianFlag, rest] = defm;
      // only treat this as a template if the 2nd token isn't a plain bit-offset
      if (!/^\d+$/.test(rawTypeRaw)) {
        const name       = nm;
        const rawType    = rawTypeRaw.toLowerCase();
        const length     = parseInt(lenRaw, 10);
        const byteOrder  = endianFlag ? 'BigEndian' : 'LittleEndian';
        const valueType  = rawType === 'string'   ? 'String'
                          : rawType === 'unsigned' ? 'Unsigned'
                                                    : 'Signed';
        // initialize or augment the global template
        signalsDefs[name] = {
          name,
          length,
          byteOrder,
          valueType,
          scaling: 1.0,
          offset: 0.0,
          valueRange: [0, 1],
          units: '',
          description: '',
          valueDescriptions: {},
          defaultValue: 0,
          isMultiplexer: false
        };
        
        // copy any /f:, /o:, /min:, /max:, /u:, /e:, /d:, /p: attrs
        const attrs = rest.match(
          /\/[fo]:(-?\d+(\.\d+)?)|\/min:(-?\d+(\.\d+)?)|\/max:(-?\d+(\.\d+)?)|\/u:"([^"]+)"|\/e:([^\s]+)|\/d:(-?\d+(\.\d+)?)|\/p:"([^"]*)"/g
        ) || [];
        for (const attr of attrs) {
          if (attr.startsWith('/f:'))   signalsDefs[name].scaling     = parseFloat(attr.slice(3));
          if (attr.startsWith('/o:'))   signalsDefs[name].offset      = parseFloat(attr.slice(3));
          if (attr.startsWith('/min:')) signalsDefs[name].valueRange[0] = parseFloat(attr.slice(5));
          if (attr.startsWith('/max:')) signalsDefs[name].valueRange[1] = parseFloat(attr.slice(5));
          if (attr.startsWith('/u:'))   signalsDefs[name].units       = attr.slice(3).replace(/"/g, '');
          if (attr.startsWith('/e:')) {
            const en = attr.slice(3);
            if (enumerations[en]) signalsDefs[name].valueDescriptions = { ...enumerations[en] };
          }
        }
        // capture a trailing // comment
        const d = rest.match(/\/\/\s*(.*)$/);
        if (d) signalsDefs[name].description = d[1].trim();

        if (current && pendingInstances[current.name]) {
          const pending = pendingInstances[current.name][nm] || [];
          for (const sbRaw of pending) {
            const sb  = parseInt(sbRaw, 10);
            const def = signalsDefs[nm];
            const bo  = def.byteOrder;
            current.signals.push({
              name:               def.name,
              startBit:           sb,
              length:             def.length,
              byteOrder:          bo,
              valueType:          def.valueType,
              scaling:            def.scaling,
              offset:             def.offset,
              valueRange:         [...def.valueRange],
              units:              def.units,
              description:        def.description,
              valueDescriptions:  { ...def.valueDescriptions },
              defaultValue:       def.defaultValue,
              multiplexerValue:   currentMuxValue,
              isMultiplexed:      currentMuxValue != null
            });
          }
          // clear out the queue
          pendingInstances[current.name][nm] = [];
        }
      }
      continue;
    }

    if (!current) continue;

    const idm = line.match(/^ID=([0-9A-Fa-f]+)h(?:\s*\/\/\s*(.*))?$/);
    if (idm) {
      const raw = parseInt(idm[1], 16);
      current.rawId = raw;
      const masked = raw & 0x7FF;
      current.id = '0x' + masked.toString(16).toUpperCase();
      current.isExtendedId = false;
      if (idm[2]) current.comment = idm[2].trim();
      continue;
    }

    const tm = line.match(/^Type=(Standard|Extended)$/);
    if (tm && current.rawId != null) {
      const isExt = tm[1] === 'Extended';
      current.isExtendedId = isExt;
      const mask = isExt ? 0x1FFFFFFF : 0x7FF;
      const masked = current.rawId & mask;
      current.id = isExt
        ? '0x' + masked.toString(16).toUpperCase().padStart(8, '0')
        : '0x' + masked.toString(16).toUpperCase();
      continue;
    }

    const lm = line.match(/^Len=(\d+)$/);
    if (lm) {
      current.dlc = parseInt(lm[1], 10);
      continue;
    }

    const muxm = line.match(
      // 1: name     2: startBit  3: length  4: hexValue    5: optional "-m"
      /^Mux\s*=\s*(\w+)\s+(\d+)\s*,\s*(\d+)\s+([0-9A-Fa-f]+)(?:h)?(?:\s+(-m))?$/
    );
    if (muxm) {
      const [, baseName, sb, ln, hv, mSuffix] = muxm;
      const mname = baseName;
      const isMotorola  = Boolean(mSuffix);
      const startBit = parseInt(sb, 10);
      const length = parseInt(ln, 10);
      // strip trailing “h” if present
      let rawHex = hv.replace(/h$/i, '');
      // if odd-length, pad with leading zero so match(/../g) works
      if (rawHex.length % 2 === 1) rawHex = '0' + rawHex;
      // split into bytes (or empty array if somehow still no match)
      const bytes = rawHex.match(/../g) || [];
      // reverse byte order, or fall back to rawHex
      const revHex = bytes.length ? bytes.reverse().join('') : rawHex;
      const value = parseInt(revHex, 16);

      // store the raw Mux value
      muxValues[current.name][mname] = value;

      currentMuxName = mname;
      currentMuxValue = value;

      // ensure the definition object exists
      if (!signalsDefs[mname]) signalsDefs[mname] = {};

      // update definition
      signalsDefs[mname].name = mname;
      signalsDefs[mname].startBit = startBit;
      signalsDefs[mname].length = length;
      signalsDefs[mname].byteOrder = 'LittleEndian';// isMotorola ? 'BigEndian' : 'LittleEndian';
      signalsDefs[mname].isMultiplexer = true;

      current.signals.push({ ...signalsDefs[mname] });

      continue;
    }

    const vrm = line.match(/^Var=([^ ]+)\s+(\w+)\s+(\d+),(\d+)(?:\s+(-m))?(.*)$/);
    if (vrm) {
      const [, vname, rawTypeRaw, sb, ln, endianFlag, rest] = vrm;
      const startBit = parseInt(sb, 10);
      const length = parseInt(ln, 10);
      const rt = rawTypeRaw.toLowerCase();
      const valueType = rt === 'string' ? 'String' : rt === 'unsigned' ? 'Unsigned' : 'Signed';
      const mv = currentMuxValue;
      // use the current Mux context
      const muxSignal = currentMuxName ? signalsDefs[currentMuxName] : null;

      if (signalsDefs[vname]?.isMultiplexer) {
        signalsDefs[vname].startBit = startBit;
        signalsDefs[vname].length = length;
        signalsDefs[vname].byteOrder = 'LittleEndian'; // fixed
      }

      const sig = {
        name: vname,
        startBit,
        length,
        byteOrder: endianFlag ? 'BigEndian' : 'LittleEndian',
        valueType,
        scaling: 1.0,
        offset: 0.0,
        valueRange: [0, 1],
        units: '',
        description: '',
        valueDescriptions: {},
        defaultValue: 0,
        multiplexerValue: mv,
        isMultiplexed: mv !== null && mv !== undefined,
        ...(mv !== undefined && muxSignal && {
          multiplexerStartBit: muxSignal.startBit,
          multiplexerLength: muxSignal.length,
          multiplexerByteOrder: 'LittleEndian'//muxSignal.byteOrder
        })
      };

      const attrs2 = rest.match(/\/[fo]:(-?\d+(\.\d+)?)|\/min:(-?\d+(\.\d+)?)|\/max:(-?\d+(\.\d+)?)|\/u:"([^"]+)"|\/e:([^\s]+)|\/d:(-?\d+(\.\d+)?)|\/p:"([^"]*)"/g) || [];
      for (const attr of attrs2) {
        if (attr.startsWith('/f:')) sig.scaling = parseFloat(attr.slice(3));
        if (attr.startsWith('/o:')) sig.offset = parseFloat(attr.slice(3));
        if (attr.startsWith('/min:')) sig.valueRange[0] = parseFloat(attr.slice(5));
        if (attr.startsWith('/max:')) sig.valueRange[1] = parseFloat(attr.slice(5));
        if (attr.startsWith('/u:')) sig.units = attr.slice(3).replace(/"/g, '');
        if (attr.startsWith('/e:')) {
          const en = attr.slice(3);
          if (enumerations[en]) sig.valueDescriptions = { ...enumerations[en] };
        }
      }
      const localDesc = rest.match(/\/\/\s*(.*)$/);
      if (localDesc) sig.description = localDesc[1].trim();
      current.signals.push(sig);
      continue;
    }
    
    const srm = line.match(/^Sig="?([^"\s]+)"?\s+(\d+)(?:\s+(-m))?$/);
    if (srm) {
      const [, nm, sbRaw, endianFlag] = srm;
      const sb = parseInt(sbRaw, 10);
      const def = signalsDefs[nm];
      // if we have no template yet, buffer and skip
      if (!def) {
        pendingInstances[current.name][nm] = pendingInstances[current.name][nm] || [];
        pendingInstances[current.name][nm].push(sbRaw);
        continue;
      }
      const bo  = endianFlag ? 'BigEndian' : def.byteOrder;
      const mv = currentMuxValue;
      const muxSignal = currentMuxName ? signalsDefs[currentMuxName] : null;

      if (def) {
        if (def.isMultiplexer) {
          def.startBit = sb;
          def.byteOrder = 'BigEndian';
        }

        current.signals.push({
          name: def.name,
          startBit: sb,
          length: def.length,
          byteOrder: bo,
          valueType: def.valueType,
          scaling: def.scaling,
          offset: def.offset,
          valueRange: [...def.valueRange],
          units: def.units,
          description: def.description,
          valueDescriptions: { ...def.valueDescriptions },
          defaultValue: def.defaultValue,
          multiplexerValue: mv,
          isMultiplexed: mv !== null && mv !== undefined,
          ...(mv !== null && muxSignal && {
            multiplexerStartBit: muxSignal.startBit,
            multiplexerLength: muxSignal.length,
            multiplexerByteOrder: 'LittleEndian' // muxSignal.byteOrder
          })
        });
      }
      continue;
    }
  }

  const clean = messages.filter(m => m.id != null);
  clean.sort((a, b) => parseInt(a.id, 16) - parseInt(b.id, 16));

  return { messages: clean, nodes: Array.from(nodes) };
}