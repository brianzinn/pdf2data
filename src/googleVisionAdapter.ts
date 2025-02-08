/* eslint-disable @typescript-eslint/consistent-type-definitions */
import { Row } from './extractPDF';
import { Nullable } from './types';

export type BoundingBox = {
  /**
   * [topLeft, topRight, bottomRight, bottomLeft]
   *
   *
   * A vertex represents a 2D point in the image.
   * NOTE: the normalized vertex coordinates are relative to the original image and range from 0 to 1.
   *
   * When a rotation of the bounding box is detected the rotation is represented as around the top-left corner as defined when the text is read in the 'natural' orientation.
   * For example:
   * when the text is horizontal it might look like:
   *  0 ------- 1
   *  |         |
   *  3 ------- 2
   * when it's rotated 180 degrees around the top-left corner it becomes:
   *  2 ------- 3
   *  |         |
   *  1 ------- 0
   * and the vertex order will still be (0, 1, 2, 3)."
   */
  normalizedVertices: [Vector2d, Vector2d, Vector2d, Vector2d];
};

/**
 * Enum to denote the type of break found. New line, space etc.
 */
export enum BreakType {
  /**
   * Unknown break label type.
   */
  UNKNOWN = 'UNKNOWN',
  /**
   * Regular space.
   */
  SPACE = 'SPACE',
  /**
   * Sure space (very wide).
   */
  SURE_SPACE = 'SURE_SPACE',
  /**
   * Line-wrapping break.
   */
  EOL_SURE_SPACE = 'EOL_SURE_SPACE',
  /**
   * End-line hyphen that is not present in text; does not co-occur with SPACE, LEADER_SPACE, or LINE_BREAK.
   */
  HYPHEN = 'HYPHEN',
  /**
   * Line break that ends a paragraph.
   */
  LINE_BREAK = 'LINE_BREAK',
}

export type WordSymbol = {
  property?: TextProperty;
  /**
   * The actual UTF-8 representation of the symbol.
   */
  text: string;
  confidence: number;
};

export type TextProperty = {
  detectedLanguages: {
    languageCode: string;
    confidence: number;
  }[];
  detectedBreak?: {
    /**
     * True if break prepends the element.
     */
    isPrefix?: boolean;
    /**
     * Detected break type.
     */
    type: BreakType;
  };
};

export type Word = {
  property?: TextProperty;
  boundingBox: BoundingBox;
  /**
   * List of symbols in the word. The order of the symbols follows the natural reading order.
   */
  symbols: WordSymbol[];
  confidence: number;
};

/**
 * Structural unit of text representing a number of words in certain order.
 */
export type Paragraph = {
  boundingBox: BoundingBox;
  /**
   * List of all words in this paragraph.
   */
  words: Word[];
  confidence: number;
};

export enum BlockType {
  /**
   * Unknown block type.
   */
  UNKNOWN = 'UNKNOWN',
  /**
   * Regular text block.
   */
  TEXT = 'TEXT',
  /**
   * Table block.
   */
  TABLE = 'TABLE',
  /**
   * Image block.
   */
  PICTURE = 'PICTURE',
  /**
   * Horizontal/vertical line box.
   */
  RULER = 'RULER',
  /**
   * Barcode block.
   */
  BARCODE = 'BARCODE',
}

/**
 * Logical element on the page.
 */
export type Block = {
  boundingBox: BoundingBox;
  /**
   * List of paragraphs in this block (if this blocks is of type text).
   */
  paragraphs: Paragraph[];
  /**
   * Detected block type (text, image etc) for this block.
   */
  blockType?: BlockType;
  confidence?: number;
};

export type PageContent = {
  /**
   * Additional information detected on the page.
   */
  property: TextProperty;
  /**
   * List of blocks of text, images etc on this page.
   */
  blocks: Block[];
  /**
   * Page width. For PDFs the unit is points. For images (including TIFFs) the unit is pixels.
   */
  width: number;
  /**
   * Page height. For PDFs the unit is points. For images (including TIFFs) the unit is pixels.
   */
  height: number;
  /**
   * Confidence of the OCR results on the page. Range [0, 1].
   */
  confidence: number;
};

export type PageResponse = {
  fullTextAnnotation: {
    pages: PageContent[];
    text: string;
  };
  context: {
    uri: string;
    pageNumber: number;
  };
};

export type BatchResponseGCV = {
  inputConfig: {
    gcsSource: {
      uri: string;
    };
    mimeType: string;
  };
  responses: PageResponse[];
};

export type KnownAngle = 0 | 90 | 180 | 270;

export type Vector2d = {
  x: number;
  y: number;
};

export type Size = {
  width: number;
  height: number;
};

/**
 * Each word is retrieved individually (via Page -> Block -> Paragraph -> Words).
 * We lose that hierarchy, but it's not used how we extract the data.
 */
export type IntermediateWord = {
  topLeftCoordinate: Vector2d;
  size: Size;
  word: string;
  knownAngle: KnownAngle;
  angle: number;
  /**
   * For debugging externally
   */
  gcvWord: Word;
};

/**
 * Google Cloud Vision output parsed into format suitable for easier row grouping/extraction to table format.
 */
export type IntermediateFormatPage = {
  pageNumber: number;
  size: Size;
  words: IntermediateWord[];
};

// export type Row = {
//   y: number;
//   items: ItemWithHorizontalPosition[];
// };

export type ItemWithHorizontalPosition = {
  /**
   * Used when applying transforms (with viewport)
   */
  height: number;
  /**
   * the words from google
   */
  text: string;
  /**
   * Basic calculation for x co-ordinate without transforms.
   */
  x: number;
  /**
   * Vertical co-ordinate without "merging" - Useful for potentially moving to a different veritical/row grouping.
   */
  y: number;
  /**
   * The page of original document (spanned results can supply their offset)
   */
  page: number;
  /**
   * Width on device
   */
  width: number;

  /**
   * Attach from GCV additional data to analyze for debugging.
   * It's a "Word" from google vision
   */
  _internal: Word;
};

/**
 * For us to build page layout.  Contains top-left position and width/height
 */
type PixelBoundingBox = {
  size: Size;
  topLeft: Vector2d;
  angle: number;
};

const findMedian = (arr: number[]): number => {
  arr.sort((a, b) => a - b);
  const middleIndex = Math.floor(arr.length / 2);

  if (arr.length % 2 === 0) {
    return (arr[middleIndex - 1] + arr[middleIndex]) / 2;
  } else {
    return arr[middleIndex];
  }
};

/**
 * NOTE: the "normalizedVectors" seem to be for the entire page (not within the containing paragraph/block)
 */
const getPixelBoundingBox = (
  boundingBox: BoundingBox,
  pageBoundingBox: PixelBoundingBox
): PixelBoundingBox => {
  const [topLeft, topRight, bottomRight, bottomLeft] =
    boundingBox.normalizedVertices;
  const minX = Math.min(topLeft.x, topRight.x, bottomRight.x, bottomLeft.x);
  const minY = Math.min(topLeft.y, topRight.y, bottomRight.y, bottomLeft.y);
  const topLeftCoordinate: Vector2d = {
    // NOTE: we could average top 2 for better approximation.  Will skew more with higher angles
    x: pageBoundingBox.topLeft.x + minX * pageBoundingBox.size.width,
    y: pageBoundingBox.topLeft.y + minY * pageBoundingBox.size.height,
  };

  const theta = getAngle(boundingBox);
  return {
    angle: theta,
    size: getSize(boundingBox, pageBoundingBox.size),
    topLeft: topLeftCoordinate,
  };

  // const [topLeftNormalized, topRightNormalized, bottomRightNormalized, bottomLeftNormalized] = boundingBox.normalizedVertices;

  // // TODO: get angle here and rotate each point around {0,0}

  // console.log(`found angle: ${theta.toFixed(2)}`);

  // // scale each normalized vertex by the page size
  // const topLeft = vectorToScreenSpace(topLeftNormalized, pageBoundingBox.size);
  // const topRight = vectorToScreenSpace(topRightNormalized, pageBoundingBox.size);
  // const bottomRight = vectorToScreenSpace(bottomRightNormalized, pageBoundingBox.size);
  // const bottomLeft = vectorToScreenSpace(bottomLeftNormalized, pageBoundingBox.size);

  // const topLeftR = rotate(topLeft, theta);
  // const topRightR = rotate(topRight, theta);
  // const bottomRightR = rotate(bottomRight, theta);
  // const bottomLeftR = rotate(bottomLeft, theta);

  // // this isn't great, but less worse than when not in screen space!
  // const minX = Math.min(topLeftR.x, topRightR.x, bottomRightR.x, bottomLeftR.x);
  // const minY = Math.min(topLeftR.y, topRightR.y, bottomRightR.y, bottomLeftR.y);
  // const topLeftCoordinate: Vector2d = {
  //   // we could average the top 2 for when on an angle
  //   x: pageBoundingBox.topLeft.x + (minX),
  //   y: pageBoundingBox.topLeft.y + (minY)
  // }

  // const dy = topLeft.y - bottomRight.y;
  // const dx = topLeft.x - bottomRight.x;

  // const result = {
  //   size: {
  //     height: Math.abs(dy),
  //     width: Math.abs(dx)
  //   },
  //   topLeft: topLeftCoordinate
  // }
  // return result;
};

const getSize = (boundingBox: BoundingBox, parentSize: Size): Size => {
  // choosing 2 diagonally across vertices (top-left to bottom-right) - assumes square shape:
  const dy =
    boundingBox.normalizedVertices[0].y * parentSize.height -
    boundingBox.normalizedVertices[2].y * parentSize.height;
  const dx =
    boundingBox.normalizedVertices[0].x * parentSize.width -
    boundingBox.normalizedVertices[2].x * parentSize.width;
  return {
    height: Math.abs(dy),
    width: Math.abs(dx),
  };
};

// some google text is off by 8°
const EPSILON = 10;

const getAngle = (boundingBox: BoundingBox): number => {
  const [topLeft, topRight] = boundingBox.normalizedVertices;
  const dy = topRight.y - topLeft.y;
  const dx = topRight.x - topLeft.x;

  const theta = Math.atan2(dy, dx); // rads
  return theta * (180 / Math.PI); // degrees
};

/**
 * Maintains within the document space (will rotate on axis to maintain within top-left of new space)
 */
const getKnownAngle = (
  boundingBox: BoundingBox,
  epsilon = EPSILON
): Nullable<KnownAngle> => {
  const [topLeft, topRight] = boundingBox.normalizedVertices;
  const dy = topRight.y - topLeft.y;
  const dx = topRight.x - topLeft.x;

  let theta = Math.atan2(dy, dx); // range (-PI, PI]
  theta *= 180 / Math.PI; // rads to degs, range (-180, 180]

  if (theta < (90 - epsilon)) {
    theta = 360 + theta; // range [0, 360)
  }

  if (theta < 0 - epsilon) {
    throw new Error(`negative theta exceeds epsilon: ${theta} < 0-${epsilon}`);
  }

  const knownAngles: KnownAngle[] = [0, 90, 180, 270];
  // we will coerce angles within this tolerance
  for (const knownAngle of knownAngles) {
    if (Math.abs(theta - knownAngle) < epsilon) {
      return knownAngle;
    }
  }

  // Error: Cannot convert 359.649 to one of {0,90,180,270}
  if (Math.abs(theta - 360) <= epsilon) {
    return 0;
  }

  // throw new Error(`Cannot convert ${theta.toFixed(3)} to one of {${knownAngles.join(',')}}`)
  return null;
};

/**
 * Simplified for 90 degree increments
 *
 * @param angle Something like 0°, 90°, 180°, 270°
 * @param coordinates
 * @returns
 */
// export const unrotate2d = (angle: KnownAngle, coordinates: Vector2d, size: Size): Vector2d => {
//   if (angle === 0) {
//     // no math needed...
//     return coordinates;
//   }

//   // 90° increment rotation don't need a matrix rotation
//   // const angleInRads = (Math.PI / 180) * (angle);
//   // const cos = Math.cos(angleInRads);
//   // const sin = Math.sin(angleInRads);

//   // let x = cos * coordinates.x - sin * coordinates.y;
//   // let y = sin * coordinates.x + cos * coordinates.y;

//   // we need to mirror these co-ordinates on x or y axis depending on rotation (keep in document space)
//   if (angle === 90) {
//     return {
//       x: coordinates.y, // only because intermediate is "from the top"... fix that.
//       y: size.width - coordinates.x // will sort higher "y-coordinate" is at top of page
//     };
//   }

//   throw new Error(`TODO: not able to rotate ${angle}°.`);
// }

/**
 * The "y" co-ordinate is actually distance from the "top" of the document.
 */
export const rotate = (
  vector: Vector2d,
  angleInDegrees: number,
  size: Size,
  worldCoordinatesShift: Vector2d
): Vector2d => {
  const angleInRadians =
    -angleInDegrees /* -VE for clockwise */ * (Math.PI / 180);

  const translate = {
    x: Math.round((size.width / 2) * 10) / 10,
    y: Math.round((size.height / 2) * 10) / 10,
  };
  // pivot point is in the middle
  const translatedToOrigin = {
    x: vector.x - translate.x,
    y: vector.y - translate.y,
  };

  // clockwise rotation
  // [x′]   [cosθ -sinθ][x]
  // [y′] = [sinθ  cosθ][y]
  // x′ = cosθ*x - sinθ*y
  // y′ = sinθ*x + cosθ*y
  const rotated = {
    x:
      Math.cos(angleInRadians) * translatedToOrigin.x -
      Math.sin(angleInRadians) * translatedToOrigin.y,
    y:
      Math.sin(angleInRadians) * translatedToOrigin.x +
      Math.cos(angleInRadians) * translatedToOrigin.y,
  };

  // translate back (and translate, if applicable, to new world-coordinates)
  return {
    x: rotated.x + translate.x + worldCoordinatesShift.x,
    y: rotated.y + translate.y + worldCoordinatesShift.y,
  };
};

export const getWorldCoordinatesShift = (
  knownAngle: KnownAngle,
  pageSize: Size
): Vector2d => {
  if (knownAngle === 90 || knownAngle === 270) {
    return {
      x: (pageSize.width - pageSize.height) / -2,
      y: (pageSize.height - pageSize.width) / -2,
    };
  }

  return {
    x: 0,
    y: 0,
  };
};

/**
 * converting to cm makes it easier to reason with breaking thresholds for table rows/columns
 * Easier to visually verify accuracy of calculations
 */
export const pointsToCentimeters = (points: number): number => {
  // Each point is 1/72 of an inch (or 72 points = 1 inch).
  return points * (1 / 72) * 2.54;
};

export const convertSizeToCM = (size: Size): Size => {
  return {
    height: pointsToCentimeters(size.height),
    width: pointsToCentimeters(size.width),
  };
};

export const convertVector2dToCM = (vector: Vector2d): Vector2d => {
  return {
    x: pointsToCentimeters(vector.x),
    y: pointsToCentimeters(vector.y),
  };
};

export const convertIntermediateFormat = (
  pageContents: IntermediateFormatPage[],
  rowGrouping: RowGrouping = { fractionalEpsilon: 1 }
): Row[] => {
  type MergedPageItems = Record<string, [ItemWithHorizontalPosition]>;

  let yAccumulator = 0;

  let groupingStartY: Nullable<number> = null;
  let lastY: Nullable<number> = null;

  const mergedPages = pageContents
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .reduce<MergedPageItems>((prev, cur) => {
      // for the grouping we need to sort when we are not using fixed grouping intervals (ie: fractionalEpsilon)
      cur.words
        // .map(word => {
        //   // rotate coordindates based on the angle
        //   // if we don't do this then the words on far right otherwise would drop to row below
        //   const { x, y} = word.topLeftCoordinate;
        //   const { angle, knownAngle} = word;
        //   const angleToUse = knownAngle - (angle + 360) % 360;
        //   if (angleToUse === 0) {
        //     console.log(` > keeping angle: 0.0° ${word.word.padEnd(10, ' ')} {${x.toFixed(2)}, ${y.toFixed(2)}}`)
        //     return word;
        //   }
        //   // tan theta = opp/adj.
        //   const angleInRadians = -angleToUse /* -VE for clockwise */ * (Math.PI / 180);
        //   const height = Math.tan(angleToUse) * x;
        //   const heightShift = (height * (angleToUse > 0 ? -1 : 1));
        //   console.log(` > angle ${angleToUse.toFixed(2)} -> shift: ${heightShift}`);
        //   // first get pivot point on left side of page.  angled down for negative angles
        //   const pivotPoint:Vector2d = {
        //     x: 0,
        //     y: x + heightShift
        //   };

        //   // translate for origin
        //   const fromOrigin: Vector2d = {
        //     x: x - pivotPoint.x,
        //     y: y - pivotPoint.y
        //   }

        //   const cos = Math.cos(angleInRadians);
        //   const sin = Math.sin(angleInRadians);
        //   const newX = cos * fromOrigin.x - sin * fromOrigin.y;
        //   const newY = sin * fromOrigin.x + cos * fromOrigin.y;
        //   word.topLeftCoordinate = {
        //     x: newX + pivotPoint.x,
        //     y: newY + pivotPoint.y
        //   }
        //   console.log(` > moving angle: ${angleToUse.toFixed(2)}° ${word.word.padEnd(10, ' ')} {${x.toFixed(2)}, ${y.toFixed(2)}} to {${word.topLeftCoordinate.x.toFixed(2)}, ${word.topLeftCoordinate.y.toFixed(2)}}`)

        //   return word;
        // })
        .sort((a, b) => a.topLeftCoordinate.y - b.topLeftCoordinate.y)
        .forEach((item) => {
          const pageHeightAndVectorY =
            yAccumulator + item.topLeftCoordinate.y;

          if (groupingStartY === null) {
            groupingStartY = pageHeightAndVectorY;
          }

          // console.log(`${item.topLeftCoordinate.y} -> '${item.word}'.  ${item.angle.toFixed(2)}°`)

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

          // const existingY = Object.keys(prev).find((y) => totalY === y);
          if (rowGroupingHorizontalKey in prev) {
            prev[rowGroupingHorizontalKey].push({
              height: item.size.height,
              page: cur.pageNumber,
              text: item.word,
              x: item.topLeftCoordinate.x,
              y: pageHeightAndVectorY,
              width: item.size.width,
              _internal: item.gcvWord,
            });
          } else {
            prev[rowGroupingHorizontalKey] = [
              {
                height: item.size.height,
                page: cur.pageNumber,
                text: item.word,
                x: item.topLeftCoordinate.x,
                y: pageHeightAndVectorY,
                width: item.size.width,
                _internal: item.gcvWord,
              },
            ];
          }

          lastY = pageHeightAndVectorY;
        });

      yAccumulator += cur.size.height;

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

  return rows;
}

/**
 * Converts coordinates also to pixels (assume 300 DPI)
 */
export const convertCloudVisionToIntermediateFormat = (
  input: BatchResponseGCV,
  rotateByKnownAngle = false,
): IntermediateFormatPage[] => {
  const myPages: IntermediateFormatPage[] = [];

  // the "context" page number takes into account the spanning of 20 pages per JSON file
  const pageResponsesSorted = input.responses.sort(
    (a, b) => a.context.pageNumber - b.context.pageNumber
  );
  for (const pageResponse of pageResponsesSorted) {
    // console.log('Page:', pageResponse.context.pageNumber);
    // if (pageResponse.context.pageNumber > 1) {
    //   console.log('stopping on page 1')
    //   break;
    // }

    const blockKnownAngles: KnownAngle[] = [];
    const myWords: IntermediateWord[] = [];

    for (const page of pageResponse.fullTextAnnotation.pages) {
      // console.log(`  > Page ${page.width}w ✕ ${page.height}h`);

      // NOTE: update to just use page size, which is used for normalized vectors to "screen space".
      const pagePixelBoundingBox: PixelBoundingBox = {
        angle: 0,
        size: {
          width: page.width,
          height: page.height,
        },
        topLeft: {
          x: 0,
          y: 0,
        },
      };

      for (const block of page.blocks) {
        // angle relative to page orientation
        const blockKnownAngle = getKnownAngle(block.boundingBox);
        if (blockKnownAngle === null) {
          // this may be handwriting ie: "2 PALLETS" at 58°.
          continue;
        }
        blockKnownAngles.push(blockKnownAngle);

        // const blockPixelBoundingBox = getPixelBoundingBox(block.boundingBox, pagePixelBoundingBox);
        // console.log(`> Block: ${blockKnownAngle}° -- ${block.blockType ?? 'no type'} - ${block.paragraphs.length}. {${blockPixelBoundingBox.topLeft.x.toFixed(2)},${blockPixelBoundingBox.topLeft.y.toFixed(2)}} ${blockPixelBoundingBox.size.width.toFixed(2)}w ✕ ${blockPixelBoundingBox.size.height.toFixed(2)}h`)
        for (const paragraph of block.paragraphs) {
          const paragraphKnownAngle = getKnownAngle(paragraph.boundingBox);
          const paragraphAngle = getAngle(paragraph.boundingBox);
          if (paragraphKnownAngle === null) {
            throw new Error(
              `Paragraph angle not a known angle: ${paragraphAngle.toFixed(2)}°`
            );
          }
          // const paragraphPixelBoundingBox = getPixelBoundingBox(paragraph.boundingBox, pagePixelBoundingBox);
          // console.log('vertices:', paragraph.boundingBox.normalizedVertices);
          // console.log(`   > Paragraph ${paragraph.words.length} word${block.paragraphs.length === 1 ? '' : 's'}`);
          // console.log(`     > {${paragraphPixelBoundingBox.topLeft.x.toFixed(2)},${paragraphPixelBoundingBox.topLeft.y.toFixed(2)}} ${paragraphPixelBoundingBox.size.width.toFixed(2)}w ✕ ${paragraphPixelBoundingBox.size.height.toFixed(2)}h`)
          const words: string[] = [];
          // console.log(` >> P >> ${paragraph.words.map(word => word.symbols.map(s => s.text).join('')).join("|")}`)

          for (const word of paragraph.words) {
            const wordPixelBoundingBox = getPixelBoundingBox(
              word.boundingBox,
              pagePixelBoundingBox
            );

            const probableWord = word.symbols.map((s) => s.text).join('');
            if (word.confidence < 0.6) {
              console.log(
                ` * '${probableWord}' low confidence ${word.confidence.toFixed(
                  1
                )}.`
              );
            }

            // for debugging:
            // if (probableWord.endsWith('6666655555555')) {
            //   console.log(`  > Word: '${probableWord}' ${wordPixelBoundingBox.topLeft}`);
            // }
            words.push(probableWord);
            const myWord: IntermediateWord = {
              angle: paragraphAngle,
              knownAngle: paragraphKnownAngle, // getKnownAngle(word.boundingBox) word angle has too much variance?
              size: convertSizeToCM(wordPixelBoundingBox.size),
              topLeftCoordinate: convertVector2dToCM(
                wordPixelBoundingBox.topLeft
              ),
              word: probableWord,
              gcvWord: word,
            };
            myWords.push(myWord);
          }
          // console.log(` > words: ${words.join('|')}`)
        }
      }
    }

    const medianKnownAngle = findMedian(myWords.map((w) => w.knownAngle));
    const medianAngle = findMedian(myWords.map((w) => w.angle));
    console.log(
      `Page: ${pageResponse.context.pageNumber}.  Known: ${medianKnownAngle} vs. angle: ${medianAngle.toFixed(2)}`
    );
    const sameAsMedian = myWords.reduce(
      (total, word) => (total += word.knownAngle === medianKnownAngle ? 1 : 0),
      0
    );
    const matchingAngle = sameAsMedian / myWords.length;
    console.log(
      ` > Page ${pageResponse.context.pageNumber
      } angle ${medianKnownAngle}° for ${(matchingAngle * 100).toFixed(
        1
      )}% (blocks)`
    );
    // const doRotation = medianKnownAngle !== 0 && matchingAngle > 0.8;
    // if (doRotation) {

    if (pageResponse.fullTextAnnotation.pages.length !== 1) {
      throw new Error(
        `Expecting 1 page - found ${pageResponse.fullTextAnnotation.pages.length} in "fullTextAnnotation"?`
      );
    }

    const worldCoordinatesShift = getWorldCoordinatesShift(
      medianKnownAngle as KnownAngle,
      pageResponse.fullTextAnnotation.pages[0]
    );

    myWords.forEach((myWord) => {
      // console.log(`> rotating ${myWord.word.padEnd(10, ' ')} angle: ${medianAngle.toFixed(2)} from: ${JSON.stringify(myWord.topLeftCoordinate)}`)
      myWord.topLeftCoordinate = rotate(
        myWord.topLeftCoordinate,
        rotateByKnownAngle ? medianKnownAngle : medianAngle,
        pageResponse.fullTextAnnotation.pages[0],
        worldCoordinatesShift
      );

      if (myWord.knownAngle === 90 || myWord.knownAngle === 270) {
        const tmp = myWord.size.width;
        myWord.size.width = myWord.size.height;
        myWord.size.height = tmp;
      }
    });
    //}

    const pageSize =
      /* doRotation && */ medianKnownAngle === 90 || medianKnownAngle === 270
        ? convertSizeToCM(pageResponse.fullTextAnnotation.pages[0])
        : convertSizeToCM({
          width: pageResponse.fullTextAnnotation.pages[0].width,
          height: pageResponse.fullTextAnnotation.pages[0].height,
        });

    myPages.push({
      pageNumber: pageResponse.context.pageNumber,
      words: myWords,
      size: pageSize,
    });
  }

  return myPages;
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
};
