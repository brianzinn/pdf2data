import { v1, protos } from '@google-cloud/vision';

/**
 * Takes a location on a google cloud bucket and runs a google vision OCR on it.
 * Google seems to have the best text recognition, but postionally it's harder to work out than other OCR solutions.
 */
export const getTextAnnotations = async (
  bucketName: string,
  sourceFileBucketPath: string,
  resultsPath: string
): Promise<protos.google.cloud.vision.v1.IAsyncBatchAnnotateFilesResponse> => {
  const gcsSourceUri = `gs://${bucketName}/${sourceFileBucketPath}`;
  // where to store the results
  const gcsDestinationUri = `gs://${bucketName}/${resultsPath}/`;

  const inputConfig = {
    // Supported mime_types are: 'application/pdf' and 'image/tiff'
    mimeType: 'application/pdf',
    gcsSource: {
      uri: gcsSourceUri,
    },
  };
  const outputConfig = {
    gcsDestination: {
      uri: gcsDestinationUri,
    },
  };
  // TODO: try this instead of casting: protos.google.cloud.vision.v1.Feature.Type.DOCUMENT_TEXT_DETECTION
  const features = [
    { type: 'DOCUMENT_TEXT_DETECTION' },
  ] as protos.google.cloud.vision.v1.IFeature[];
  const request: protos.google.cloud.vision.v1.IAsyncBatchAnnotateFilesRequest =
    {
      requests: [
        {
          inputConfig: inputConfig,
          features: features,
          outputConfig: outputConfig,
        },
      ],
    };

  const client = new v1.ImageAnnotatorClient();
  const [operation] = await client.asyncBatchAnnotateFiles(request);
  const [filesResponse] = await operation.promise();
  return filesResponse;
};
