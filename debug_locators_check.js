import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.resolve(__dirname, 'src/config/locators.json');
console.log('Reading file:', filePath);

if (!fs.existsSync(filePath)) {
    console.error('File not found!');
    process.exit(1);
}

const buffer = fs.readFileSync(filePath);
console.log('File size:', buffer.length);
console.log('First 20 bytes (hex):', buffer.subarray(0, 20).toString('hex'));
console.log('First 20 chars:', buffer.subarray(0, 20).toString('utf8'));

try {
    const content = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(content);
    console.log('JSON parse successful');
    console.log('Keys:', Object.keys(json));
    console.log('Gigantti keys:', Object.keys(json.gigantti));
    console.log('navLink:', json.gigantti.navLink);
} catch (e) {
    console.error('JSON parse failed:', e.message);
}
