# PlotLogger

PlotLogger is a browser-based CAN log signal plotter. Load a DBC or SYM database and an ASC, TRC, or BLF log, select signals, and inspect them in an interactive Plotly chart. Files are parsed locally in your browser and are not uploaded.

## Run the application

The app uses JavaScript modules, so serve the repository over HTTP rather than opening `index.html` directly:

```powershell
python -m http.server 8000
```

Open <http://localhost:8000> in a browser. Plotly and the BLF inflater are served from the repository; `npm install` is only needed to run the test suite.

## Run tests

```powershell
npm test
```

## Supported formats

- Databases: DBC and SYM
- Logs: ASC, TRC, and BLF
- BLF: classic CAN, CAN FD, CAN error frames, zlib-compressed containers, and multiple containers
- TRC 1.2 is explicitly rejected; other TRC versions are parsed according to their supported layouts
- ASC CAN FD records are skipped; classic data and remote frames are parsed
- Absolute ASC date lines are interpreted as UTC to keep timestamps consistent across formats
- Log channels are normalized to zero-based indices across ASC, TRC, and BLF
- Text logs (TRC/ASC, streamed line by line) are limited to 1 GiB and databases to 128 MiB; BLF files to 512 MiB, with a 256 MiB per-container and 512 MiB total decompressed-data limit
- Relative ASC timestamps are plotted and exported as elapsed seconds instead of misleading 1970 calendar dates; in `timestamps relative` mode the per-event gaps are summed into elapsed time
- ASC logs without a `date` line, and TRC logs that are V1.0 or have no `$STARTTIME`, are likewise shown as elapsed seconds
- ASC `date` lines in 12-hour form (`... 03:09:41.360 pm 2016`) are supported; an unreadable date header fails the load with a clear error

## Generate a database from a log

No database? Load a log, then click **Generate database from log** in the Start panel. The app infers messages and signals from how bits change between frames and makes the result the active database, so you can plot immediately. **Download .dbc** saves it as a DBC file. Generating while a database is loaded replaces it and clears the current plot (the dialog says so before you confirm).

- Options: minimum frames per ID (default 5) and rolling-counter detection.
- Per CAN ID (standard and extended kept apart): changing bits are grouped into signals, 8-bit bytes or 4-bit nibbles that increment by one per frame become `Counter_n`, neighbouring bytes are merged into one Intel or Motorola signal only when their toggle rates look like a single number, and signedness is guessed from the raw value distribution. Constant bits are left out, so a signal covers only the bits observed to change.
- Names are generic (`MSG_<id>`, `Sig_n`); scaling is 1, offset 0, units empty. Multiplexing, enumerations, scaling, units and senders cannot be recovered from a log.
- The result is a best guess: adjacent independent signals can be merged or split wrongly. Review it before relying on it.
- Processing is local, on the main thread.

## Known limitations

- TRC 1.2 is not supported; ASC CAN FD records are skipped.
- Parsing and plotting run on the main browser thread, so large accepted files can take time to load or plot.
- The delta cursor supports only the main subplot and primary Y axis; gear-panel limits apply to the three main Y axes, not subplot-specific axes.
- Generated databases are heuristic estimates (see above) and may need manual correction.
- Integer signal samples outside JavaScript's exact integer range are skipped with a console warning rather than plotted with rounded values.

## Shortcuts

The Shortcuts link opens the shortcuts page in an in-page dialog, so loaded data and plots are preserved. Ctrl-click (or middle-click) opens it in a new tab instead.
