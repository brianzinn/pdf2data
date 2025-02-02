import { deepEqual } from "assert";
import { getPageContents, getRowsFromPageContents, type PageDetail, type Row } from "../src/extractPDF";
import { getFilePath } from "./common";

describe("files/simple.pdf tests", () => {

  const simpleParser = (rows: [Row[], PageDetail[]]) => {
    return rows[0].map(row => row.items.filter(i => !/^ *$/.test(i.text)).map(i => i.text))
  }

  it("should match rows", async () => {
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