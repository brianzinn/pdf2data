import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { deepEqual } from "assert";
import { getPageContents, getRowsFromPageContents, type PageDetail, type Row } from "../src/extractPDF";

describe("Typescript usage suite", () => {

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const getFilePath = (fileName: string) => {
    const filePath = path.join(__dirname, 'files', fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Cannot find file: ${filePath}`);
    }
    return filePath;
  }

  const simpleParser = (rows: [Row[], PageDetail[]]) => {
    return rows[0].map(row => row.items.filter(i => !/^ *$/.test(i.text)).map(i => i.text))
  }

  it("should match 'simple.pdf'", async () => {
    const filePath = getFilePath('simple.pdf');
    const pageContents = await getPageContents(filePath);

    const rows = getRowsFromPageContents(pageContents);
    const data = simpleParser(rows);
    deepEqual([
      [
        "A1",
        "A2",
        "A3"
      ], [
        "B1",
        "B2",
        "B3"
      ], [
        "C1",
        "C2",
        "C3"
      ], [
        "D1",
        "D2",
        "D3"
      ]
    ], data, 'expecting simple match');
  });
});