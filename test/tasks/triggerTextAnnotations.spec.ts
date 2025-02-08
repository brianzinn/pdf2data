import { config } from "dotenv";
import { getTextAnnotations } from "./googleVision";

describe.skip("task - create google vision annotations", () => {

  it.skip("annotate file in bucket", async () => {
    config({
      path: './test/tasks/.env',
      override: true,
    })
    const fileName = 'multi-page-header-footer-scan-upside-down.pdf';
    const rootPath = '/tests';
    const fullBucketPath = `${rootPath}/${fileName}`;

    if (fileName.indexOf('.') === -1) {
      throw new Error(
        `Cannot create folder when filename has no extension: '${fileName}'`
      );
    }

    const fileNameWithoutExtension = fileName.substring(
      0,
      fileName.lastIndexOf('.')
    );
    const resultsPath = `${rootPath}/${fileNameWithoutExtension}`;
    const bucketName = process.env.BUCKET_NAME!;
    const results = await getTextAnnotations(
      bucketName,
      fullBucketPath,
      resultsPath
    );
    console.log('got results', JSON.stringify(results));
  });
});