import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { TextItem } from 'pdfjs-dist/types/src/display/api';
import { Nullable } from './types';

export type PageContents = {
  pageNumber: number;
  pageHeight: number;
  styles: Record<string, string>;
  data: {
    fontName: string;
    height: number;
    text: string;
    transform: number[];
    vector: {
      x: number;
      y: number;
    };
    width: number;
  }[];
};

export const getPageContents = async (
  pathOrBuffer: string | Buffer
): Promise<PageContents[]> => {
  // console.log('dir', __dirname);

  // Some PDFs need external cmaps.
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const NODE_MODULES_PATH = path.join(__dirname, '../node_modules');
  const CMAP_URL = path.join(NODE_MODULES_PATH, '/pdfjs-dist/cmaps/');
  const CMAP_PACKED = true;

  // Where the standard fonts are located.
  const STANDARD_FONT_DATA_URL = path.join(
    NODE_MODULES_PATH,
    'pdfjs-dist/standard_fonts/'
  );

  const data =
    typeof pathOrBuffer === 'string'
      ? new Uint8Array(fs.readFileSync(pathOrBuffer))
      : pathOrBuffer.buffer; // .buffer is a Uint8Array;

  const { getDocument } = await import('pdfjs-dist');
  const loadingTask = getDocument({
    data,
    cMapUrl: CMAP_URL,
    cMapPacked: CMAP_PACKED,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    // fontExtraProperties: true,
  });

  const doc = await loadingTask.promise;
  const numPages = doc.numPages;

  const getPage = async (
    doc: PDFDocumentProxy,
    pageNumber: number
  ): Promise<PageContents> => {
    const pageProxy = await doc.getPage(pageNumber);
    // user space units [x1, y1, x2, y2].
    const userSpaceViewPort = pageProxy.view;
    const pageHeight = userSpaceViewPort[3];

    const textContent = await pageProxy.getTextContent();
    const { items, styles } = textContent;

    // the operator list and find the setFillColor op that precedes the text op at that point.
    // after reviewing the complexities of getTextContent decided to not try to
    // work out the background colors from shapes.  Was not entirely necessary anyway.
    /* const pdfOperatorList = */ await pageProxy.getOperatorList(); // to populate commonObjs for font retrieval

    // const opsTree = await getOperationsTree(pdfOperatorList, pageProxy);
    // TODO: it is more than rounding alone they differ (would expect 0.05 to work)
    // const ROUNDED_EPSILON = 0.5;
    // for(const opsTextItem of opsTree.texts) {
    //   if (opsTextItem.str === '' || /^\s+$/.test(opsTextItem.str)) {
    //     console.log(`skipping whitespace item: '${opsTextItem.str}'`);
    //     continue;
    //   }

    //   const matches = items.filter(item => 'str' in item && item.str === opsTextItem.str) as TextItem[];
    //   if(matches.length === 1) {
    //     opsTextItem.width = matches[0].width;
    //     checkHeight(opsTextItem, matches[0]);
    //   } else if (matches.length > 1) {
    //     // filter even further by location.
    //     // x: item.transform[4], // transformation-matrix
    //     // y: item.transform[5]
    //     const sameLocationMatches = matches.filter(match =>
    //       Math.abs(match.transform[4] - opsTextItem.transform[4]) < ROUNDED_EPSILON
    //       &&
    //       Math.abs(match.transform[5] - opsTextItem.transform[5]) < ROUNDED_EPSILON
    //     );
    //     if (sameLocationMatches.length === 1) {
    //       opsTextItem.width = sameLocationMatches[0].width;
    //       checkHeight(opsTextItem, sameLocationMatches[0]);
    //     } else {
    //       console.error(`no exact match found by {x,y} '${opsTextItem.str}'.`)
    //     }
    //   } else {
    //     console.error(`zero matches found '${opsTextItem.str}'.`)
    //   }
    // }

    const namedStyles: Record<string, string> = {};
    // styles also have 'ascent', 'descent', 'vertical' (boolean) and font-family (ie: 'sans-serif')
    for (const fontName in styles) {
      const font = pageProxy.commonObjs.get(fontName);
      // has also bbox, fontMatrix, type, etc.
      namedStyles[fontName] = font.name;
    }
    pageProxy.cleanup();

    /**
     * In a PDF document, the location (0, 0) is at the bottom left corner of the PDF page.
     * The x axis extends horizontally to the right and y axis extends vertically upward.
     * A page point represents a point in page coordinates.
     *
     * A PDF page may have a rotation associated with it. The coordinate (0, 0) may no longer correspond to the bottom left corner of the page.
     * For a page rotated 90 degrees clockwise (0, 0) is now at the top left corner of the viewport.
     */
    // const rectanglesWithColor = opsTree.rects.filter(rect => rect.color !== null);

    // const data = opsTree.texts.map(item => {
    //   const vector: Vector2 = {
    //     x: item.transform[4], // transformation-matrix
    //     y: pageHeight - item.transform[5]
    //   }

    //   // it's a bit naive - if the top left corner is inside the rectangle.
    //   // we should maybe check properly bbox overlaps, since the "text"
    //   // has a height and width as well.
    //   const overlappingRects = rectanglesWithColor.filter(rect =>
    //     vector.x >= rect.topLeft.x && vector.x <= (rect.topLeft.x + rect.width)
    //     &&
    //     vector.y >= rect.topLeft.y && vector.y <= (rect.topLeft.y + rect.height)
    //   )

    //   if (overlappingRects.length > 0) {
    //     console.log('found overlap rectangles');
    //   }

    //   return {
    //     height: item.height,
    //     text: item.str,
    //     vector,
    //     transform: item.transform,
    //     fontName: item.fontName,
    //     width: item.width,
    //     rects: overlappingRects,
    //   }
    // })

    const data = (items as TextItem[]).map((item) => {
      return {
        height: item.height,
        text: item.str,
        vector: {
          x: item.transform[4], // transformation-matrix
          y: pageHeight - item.transform[5],
        },
        transform: item.transform,
        fontName: item.fontName,
        width: item.width,
      };
    });

    return {
      pageNumber,
      pageHeight,
      styles: namedStyles,
      data,
    };
  };

  const pageContents: PageContents[] = [];
  for (let i = 1; i <= numPages; i++) {
    const textContent = await getPage(doc, i);

    pageContents.push(textContent);
  }

  return pageContents;
};

export type ItemWithHorizontalPosition = {
  /**
   * Not useful, but at least you can see if it changes.  Not available from OCR.
   */
  fontName?: string;
  /**
   * Used when applying transforms (with viewport)
   */
  height: number;
  /**
   * the "str" from pdf-js
   */
  text: string;
  /**
   * We are not applying proper transformations.  We just take the original { x,y } co-ordinates without taking into account the viewport (for now):
   *
   * Translations are specified as [ 1 0 0 1 tx ty ], where tx and ty are the distances to translate the origin of the coordinate system in the horizontal and vertical dimensions, respectively.
   * Scaling is obtained by [sx 0 0 sy 0 0]. This scales the coordinates so that 1 unit in the horizontal and vertical dimensions of the new coordinate system is the same size as sx and sy units, respectively, in the previous coordinate system.
   * Rotations are produced by [cos θ sin θ −sin θ cos θ 0 0], which has the effect of rotating the coordinate system axes by an angle θ counterclockwise.
   * Skew is specified by [1 tan α tan β 1 0 0], which skews the x axis by an angle α and the y axis by an angle β.
   *
   * The transformation between two coordinate systems is represented by a 3-by-3 transformation matrix written as
   *
   * [ed: pretend this is a matrix]
   *
   * +---+---+---+
   * | a | b | 0 |
   * +---+---+---+
   * | c | d | 0 |
   * +---+---+---+
   * | e | f | 1 |
   * +---+---+---+
   *
   * Because a transformation matrix has only six elements that can be changed, it is usually specified in PDF as the six-element array [a b c d e f].
   * https://github.com/mozilla/pdf.js/issues/5643
   * 
   * TODO: make required and provide from OCR intermediate format.
   */
  transform?: number[];
  /**
   * Basic calculation for x co-ordinate without transforms.
   */
  x: number;
  /**
   * Vertical co-ordinate without "merging" - Useful for potentially moving to a different veritical/row grouping.
   */
  y: number;
  /**
   * The page of original document
   */
  page: number;
  /**
   * Width on device
   */
  width: number;
};

export type Row = {
  y: number;
  items: ItemWithHorizontalPosition[];
};

export type RowGrouping =
  | {
      /**
       * Often not a good algorithm, since it may not actually group very well.   Row grouping uses "arbitrary" horizontal breakpoints.
       * NOTE: internally toFixed(...) does bankers rounding and those horizontal co-ordinates are used.
       * Works well for many documents, though.
       */
      fractionalEpsilon: number;
    }
  | {
      /**
       * Start a new grouping if vertical gap (between consecutive Y co-ordinates) spans more than minimum distance
       */
      minimumGap: number;
      /**
       * Put future rows even with continuous minimum gap to new group when exceeding the maximum break threshold
       */
      maximumBreakThreshold: number;
    };

export type PageDetail = {
  pageNumber: number;
  styles: Record<string, string>;
};

export const getRowsFromPageContents = (
  pageContents: PageContents[],
  rowGrouping: RowGrouping = { fractionalEpsilon: 1 }
): [Row[], PageDetail[]] => {
  type MergedPageItems = Record<string, [ItemWithHorizontalPosition]>;

  let yAccumulator = 0;

  let groupingStartY: Nullable<number> = null;
  let lastY: Nullable<number> = null;

  const pages = pageContents.map((page) => ({
    pageNumber: page.pageNumber,
    styles: page.styles,
  }));

  const mergedPages = pageContents
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .reduce<MergedPageItems>((prev, cur) => {
      // for the grouping we need to sort when we are not using fixed grouping intervals (ie: fractionalEpsilon)
      cur.data
        .sort((a, b) => a.vector.y - b.vector.y)
        .forEach((item) => {
          const pageHeightAndVectorY = yAccumulator + item.vector.y;

          if (groupingStartY === null) {
            groupingStartY = pageHeightAndVectorY;
          }

          if ('maximumBreakThreshold' in rowGrouping) {
            //
            if (
              pageHeightAndVectorY - groupingStartY >
              rowGrouping.maximumBreakThreshold
            ) {
              groupingStartY = pageHeightAndVectorY;
            }
            //
            if (
              lastY !== null &&
              pageHeightAndVectorY - lastY > rowGrouping.minimumGap
            ) {
              groupingStartY = pageHeightAndVectorY;
            }
          }

          const rowGroupingHorizontalKey =
            'fractionalEpsilon' in rowGrouping
              ? pageHeightAndVectorY.toFixed(rowGrouping.fractionalEpsilon)
              : groupingStartY.toFixed(5);

          const pageDetail = pages.find((p) => p.pageNumber === cur.pageNumber);
          const fontName =
            pageDetail === undefined ? '??' : pageDetail.styles[item.fontName];
          // const existingY = Object.keys(prev).find((y) => totalY === y);
          if (rowGroupingHorizontalKey in prev) {
            prev[rowGroupingHorizontalKey].push({
              fontName,
              height: item.height,
              page: cur.pageNumber,
              text: item.text,
              transform: item.transform,
              x: item.vector.x,
              y: pageHeightAndVectorY,
              width: item.width,
            });
          } else {
            prev[rowGroupingHorizontalKey] = [
              {
                fontName,
                height: item.height,
                page: cur.pageNumber,
                text: item.text,
                transform: item.transform,
                x: item.vector.x,
                y: pageHeightAndVectorY,
                width: item.width,
              },
            ];
          }

          lastY = pageHeightAndVectorY;
        });

      yAccumulator += cur.pageHeight;

      return prev;
    }, {});

  const rows = Object.keys(mergedPages)
    .map<Row>((yPosition) => ({
      y: Number(yPosition),
      items: mergedPages[yPosition],
    }))
    .sort((a, b) => a.y - b.y);

  // sort left to right
  rows.forEach((row) => {
    row.items.sort((a, b) => a.x - b.x);
  });

  return [rows, pages];
};
