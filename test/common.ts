import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getFilePath = (fileName: string) => {
  const filePath = path.join(__dirname, 'files', fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Cannot find file: ${filePath}`);
  }
  return filePath;
}