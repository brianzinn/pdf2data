import { deepEqual } from "assert";
import { createMachina } from 'xmachina';
import { getPageContents, getRowsFromPageContents, type PageDetail, type Row } from "../src/extractPDF";
import { getFilePath } from "./common";

/**
 * Same as "multi-page-header.spec.ts", but using a state machine.
 * Not needed here, but for more complex documents state machines
 * can simplify parsing and even a state machine inside a state can be helpful.
 *
 * This library puts it into rows.
 */
describe("files/multi-page-header-footer.pdf tests with State Machine", () => {
  const enum ParseState {
    LookingForEndOfPageHeader = "LookingForEndOfPageHeader",
    LookingForTableHeader = "LookingForTableHeader",
    SearchingRows = "SearchingRows",
  }

  const enum Transitions {
    EndOfPageHeaderFound = "EndOfPageHeaderFound",
    TableHeaderFound = "TableHeaderFound",
    EndOfPageFound = "EndOfPageFound"
  }

  const machina = createMachina<ParseState, Transitions>(ParseState.LookingForEndOfPageHeader)
    .addState(ParseState.LookingForEndOfPageHeader, {
      on: Transitions.EndOfPageHeaderFound,
      nextState: ParseState.LookingForTableHeader,
    })
    .addState(ParseState.LookingForTableHeader, {
      on: Transitions.TableHeaderFound,
      nextState: ParseState.SearchingRows
    })
    .addState(ParseState.SearchingRows, {
      on: Transitions.EndOfPageFound,
      nextState: ParseState.LookingForEndOfPageHeader
    }).build();

  interface DataType {
    age: number,
    job: string,
    name: string,
  }

  const multiPageHeaderParser = async (rows: [Row[], PageDetail[]]): Promise<DataType[]> => {
    // this logs the parsing transitions
    machina.subscribe((eventData) => console.log(`all: ${eventData.event} -> ${eventData.value.new}`));
    machina.start()
    const headerHorizontalCoordinates: Record<'age' | 'name' | 'job', null | number> = {
      age: null,
      name: null,
      job: null
    }

    const results: DataType[] = []
    for (const row of rows[0]) {
      switch (machina.state.current) {
        case ParseState.LookingForEndOfPageHeader:
          if(row.items[0].text.startsWith('Company')) {
            await machina.transition(Transitions.EndOfPageHeaderFound);
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
            await machina.transition(Transitions.TableHeaderFound);
          }
          break;
        case ParseState.SearchingRows:
          if (/Page \d+ of/.test(row.items.map(x => x.text).join(''))) {
            await machina.transition(Transitions.EndOfPageFound)
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

  it("should match data rows only with State Machine", async () => {
    const filePath = getFilePath('multi-page-header-footer.pdf');
    const pageContents = await getPageContents(filePath);

    const rows = getRowsFromPageContents(pageContents);
    const actual = await multiPageHeaderParser(rows);
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