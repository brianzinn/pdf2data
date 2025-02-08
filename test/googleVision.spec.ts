import fs from 'fs';

import { createMachina } from 'xmachina';
import { convertCloudVisionToIntermediateFormat, convertIntermediateFormat, Word } from '../src/googleVisionAdapter'
import { getFilePath } from './common'
import { ItemWithHorizontalPosition, Row } from '../src/extractPDF';
import { deepEqual } from 'assert';

describe("files/simple.pdf tests", () => {

  const getBatchResults = (filePath: string) => {
    const fileContents = fs.readFileSync(filePath, {
      encoding: 'utf8',
    });
    return JSON.parse(fileContents)
  }

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

  const multiPageHeaderParser = async (rows: Row[]): Promise<DataType[]> => {
    // this logs the parsing transitions
    // machina.subscribe((eventData) => console.log(`all: ${eventData.event} -> ${eventData.value.new}`));
    machina.start()
    const headerHorizontalCoordinates: Record<'age' | 'name' | 'job', null | number> = {
      age: null,
      name: null,
      job: null
    }

    const results: DataType[] = []
    for (const row of rows) {
      switch (machina.state.current) {
        case ParseState.LookingForEndOfPageHeader:
          if (row.items[0].text.startsWith('Company')) {
            await machina.transition(Transitions.EndOfPageHeaderFound);
          }
          break;
        case ParseState.LookingForTableHeader:
          if (row.items.some(r => r.text.startsWith('Name'))) {
            headerHorizontalCoordinates.age = row.items.find(i => i.text.startsWith('Age'))?.x ?? null;
            headerHorizontalCoordinates.job = row.items.find(i => i.text.startsWith('Job'))?.x ?? null;
            headerHorizontalCoordinates.name = row.items.find(i => i.text.startsWith('Name'))?.x ?? null;

            if (Object.keys(headerHorizontalCoordinates).some(i => headerHorizontalCoordinates[i] === null)) {
              throw new Error('Header not found');
            }
            await machina.transition(Transitions.TableHeaderFound);
          }
          break;
        case ParseState.SearchingRows:
          // the only difference from not OCR is we need to add a space
          if (/Page \d+ of/.test(row.items.map(x => x.text).join(' '))) {
            await machina.transition(Transitions.EndOfPageFound)
          } else {
            if(row.items.length < 3) {
              console.warn(` > skipping (not enough columns): ${row.items.map(i => i.text).join('|')}`)
              continue;
            }

            const getTextFrom = (startPos: number, endPos?: number, multipleTakeHighestConfidence = false) => {
              const matches = row.items.filter(i => i.x >= startPos && (endPos === undefined || i.x < endPos))

              // remove the lower confidence on matching "x" co-ordinates.
              type Match = (typeof matches)[number];
              type GoogleVisionRow = ItemWithHorizontalPosition & {
                _internal: Word
              }
              let dedupedMatches = matches.reduce<Match[]>((prev, cur) => {
                const alreadyExists = prev.find(p => p.x === cur.x);
                if (alreadyExists !== undefined) {
                  const existingConfidence = (alreadyExists as GoogleVisionRow)._internal.confidence;
                  const currentConfidence = (cur as GoogleVisionRow)._internal.confidence;
                  console.log(` > comparing confidence '${alreadyExists.text}' ${existingConfidence} vs. '${cur.text}' ${currentConfidence}`);
                  if (currentConfidence > existingConfidence) {
                    console.log(` > automatically choosing text: '${cur.text}'`);
                    prev = prev.filter(p => p.x !== alreadyExists.x);
                    prev.push(cur);
                  }
                } else {
                  prev.push(cur);
                }
                return prev;
              }, [])

              if (multipleTakeHighestConfidence && dedupedMatches.length > 0) {
                console.log(' > choosing highest confidence:');
                const highestConfidence = dedupedMatches.reduce<Match>((prev, cur) => {
                  if (prev === undefined) {
                    prev = cur;
                  } else {
                    const existingConfidence = (prev as GoogleVisionRow)._internal.confidence;
                    const currentConfidence = (cur as GoogleVisionRow)._internal.confidence;
                    console.log(` > comparing confidence '${prev.text}' ${existingConfidence} vs. '${cur.text}' ${currentConfidence}`);
                    if (currentConfidence > existingConfidence) {
                      prev = cur;
                    }
                  }
                  return prev;
                }, dedupedMatches[0]);
                dedupedMatches = [highestConfidence];
              }

              return dedupedMatches.map(i => i.text).join(' ').trim(); //.replace(/ +/g, ' ');
            }

            // google seems to have put "22" and "222" for some reason with lower confidence in the age.  Not sure if it is "23"!
            const age = getTextFrom(headerHorizontalCoordinates.age! - 1, headerHorizontalCoordinates.job! - 1, true);
            const result = {
              name: getTextFrom(0, headerHorizontalCoordinates.age! - 1),
              age: parseInt(age.trim(), 10),
              job: getTextFrom(headerHorizontalCoordinates.job! - 1),
            };
            results.push(result);
          }
          break;
      }
    }

    return results;
  }

  const EXPECTED: DataType[] = [
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

  const getActual = async (filePath: string): Promise<DataType[]> => {
    const batchResults = getBatchResults(filePath);
    const intermediateFormat = convertCloudVisionToIntermediateFormat(batchResults, true);
    const rows = convertIntermediateFormat(intermediateFormat, {
      minimumGap: 0.4,
      maximumBreakThreshold: 0.30,
    });
    const actual = await multiPageHeaderParser(rows);
    return actual;
  }

  it("should match rows - portrait no rotation", async () => {
    const filePath = getFilePath('/google-vision-results/multi-page-header-footer-scan_output-1-to-2.json');
    const actual = await getActual(filePath);
    deepEqual(EXPECTED, actual, 'expecting multi-page extracted skipping header/footer');
  })

  it("should match rows - portrait upside down 180°", async () => {
    const filePath = getFilePath('/google-vision-results/multi-page-header-footer-scan-upside-down_output-1-to-2.json');
    const actual = await getActual(filePath);
    deepEqual(EXPECTED, actual, 'expecting multi-page extracted skipping header/footer');
  })

  it("should match rows - landscape - rotated counter-clockwise", async () => {
    const filePath = getFilePath('/google-vision-results/multi-page-header-footer-scan-rotate-90-counterclockwise_output-1-to-2.json');
    const actual = await getActual(filePath);
    deepEqual(EXPECTED, actual, 'expecting multi-page extracted skipping header/footer');
  })

  it("should match rows - landscape - rotated counter-clockwise", async () => {
    const filePath = getFilePath('/google-vision-results/multi-page-header-footer-scan-rotate-90-clockwise_output-1-to-2.json');
    const actual = await getActual(filePath);
    deepEqual(EXPECTED, actual, 'expecting multi-page extracted skipping header/footer');
  })
})