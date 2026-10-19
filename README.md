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
- Relative ASC timestamps are plotted and exported as elapsed seconds instead of misleading 1970 calendar dates

## Known limitations

- TRC 1.2 is not supported; ASC CAN FD records are skipped.
- Parsing and plotting run on the main browser thread, so large accepted files can take time to load or plot.
- The delta cursor supports only the main subplot and primary Y axis; gear-panel limits apply to the three main Y axes, not subplot-specific axes.
- Integer signal samples outside JavaScript's exact integer range are skipped with a console warning rather than plotted with rounded values.
