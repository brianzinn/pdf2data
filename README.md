# pdf2data
PDF to data library

`npm i pdf2data`

> This library has no dependencies, except on `pdfjs-dist`

Simple library to convert PDF to data structures, typically tabular format.

There are libraries like pdf2json, but the structure isn't designed around processing row data.

The purpose of this library is to help group the PDF data into rows to extract data.

It is easy to work with side-by-side tables, skipping headers/footers and other custom logic.

I'll try to bring in some other work that takes OCR output from different sources to a similar structure. 

usage:
```Javascript
import { getPageContents, getRowsFromPageContents } from "pdf2data";

const pageContents = await getPageContents(filePath);
// `result` has the page contents in standard rows
const result = getRowsFromPageContents(pageContents);
```