import { deepEqual } from "assert";
import { getPageContents, getRowsFromPageContents, type PageDetail, type Row } from "../src/extractPDF";
import { getFilePath } from "./common";

/**
 * OK, it's a bit contrived with a simple PDF, but this shows how to get the data in columnar format.
 * pdf2data library already puts everything into rows.
 */
describe("files/multi-page-header-footer.pdf tests", () => {

  const enum ParseState {
    LookingForEndOfPageHeader,
    LookingForTableHeader,
    SearchingRows,
  }

  interface DataType {
    age: number,
    job: string,
    name: string,
  }

  const multiPageHeaderParser = (rows: [Row[], PageDetail[]]): DataType[] => {
    let state = ParseState.LookingForEndOfPageHeader // start state

    const headerHorizontalCoordinates: Record<'age' | 'name' | 'job', null | number> = {
      age: null,
      name: null,
      job: null
    }

    const results: DataType[] = []
    for (const row of rows[0]) {
      switch (state) {
        case ParseState.LookingForEndOfPageHeader:
          if(row.items[0].text.startsWith('Company')) {
            // end of page header
            state = ParseState.LookingForTableHeader;
          }
          break;
        case ParseState.LookingForTableHeader:
          if(row.items.some(r => r.text.startsWith('Name'))) {
            headerHorizontalCoordinates.age = row.items.find(i => i.text.startsWith('Age'))?.x ?? null;
            headerHorizontalCoordinates.job = row.items.find(i => i.text.startsWith('Job'))?.x ?? null;
            headerHorizontalCoordinates.name = row.items.find(i => i.text.startsWith('Name'))?.x ?? null;

            if(Object.keys(headerHorizontalCoordinates).some(i => headerHorizontalCoordinates[i] === null)) {
              throw new Error('Header not found');
            }
            state = ParseState.SearchingRows;
          }
          break;
        case ParseState.SearchingRows:
          if (/Page \d+ of/.test(row.items.map(x => x.text).join(''))) {
            state = ParseState.LookingForEndOfPageHeader;
          } else {
            const getTextFrom = (startPos: number, endPos?: number) => {
              return row.items.filter(i => i.x >= startPos && (endPos === undefined || i.x < endPos))
                .map(i => i.text).join('').trim(); //.replace(/ +/g, ' ');
            }

            const age = getTextFrom(headerHorizontalCoordinates.age!, headerHorizontalCoordinates.job!);
            const result = {
              name: getTextFrom(0, headerHorizontalCoordinates.age!),
              age: parseInt(age.trim(), 10),
              job: getTextFrom(headerHorizontalCoordinates.job!),
            };
            results.push(result);
          }
          break;
      }
    }

    return results;
  }

  it("should match data rows only", async () => {
    const filePath = getFilePath('multi-page-header-footer.pdf');
    const pageContents = await getPageContents(filePath);

    const rows = getRowsFromPageContents(pageContents);
    const actual = multiPageHeaderParser(rows);
    const expected: DataType[] = [
      {
        name: "Dave B.",
        age: 20,
        job: "Student",
      },
      {
        name: "Jen J.",
        age: 25,
        job: "Not employed",
      },
      {
        name: "Steve A.",
        age: 23,
        job: "Software Engineer",
      },
      {
        name: "Alice B.",
        age: 27,
        job: "Investor",
      },
    ]
    deepEqual(expected, actual, 'expecting multi-page extracted skipping header/footer');
  });
});