# pdf2data
PDF to data/tables library

`npm i pdf2data`

> This library has no dependencies, except on `pdfjs-dist`

Simple library to convert PDF to data structures, typically tabular format.  This will extra a PDF or OCR (google vision) into rows.

There are libraries like pdf2json, but the output structure isn't designed around processing row data.  There are also online machine learning trained OCR, but this is a sample project on how to obtain tabular data from PDF/TIFF from OCR, or a PDF directly.

The purpose of this library is to help group the data into rows to extract data.  You choose how the rows are grouped (columns).  This library is more useful if you are extracing documents in a known format.  It won't auto-detect and create tabular data.

It is easy to work with side-by-side tables, skipping headers/footers and other custom logic.

Best place to see how it works is to look at the tests + output.

usage:
```Javascript
import { getPageContents, getRowsFromPageContents } from "pdf2data";
// directly from a PDF
const pageContents = await getPageContents(filePath);
// `result` has the page contents in standard rows
const result = getRowsFromPageContents(pageContents);
```

```Javascript
// direct OCR file from google vision
const batchResults = getBatchResults(filePath);
// intermediate format is an interchangeable format that can be used for other OCR frameworks
const intermediateFormat = convertCloudVisionToIntermediateFormat(batchResults);
// `result` has the page contents in standard rows
const result = convertIntermediateFormat(intermediateFormat);
```