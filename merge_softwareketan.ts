import * as fs from 'fs';

const filePath = 'C:\\Users\\prath\\.gemini\\antigravity\\brain\\c538ab16-e5c8-4a90-923f-dd246004d561\\scratch\\extracted_softwareketan_Developers__Invoice_58_.json';

if (fs.existsSync(filePath)) {
  const fileData = fs.readFileSync(filePath, 'utf-8');
  const arr = JSON.parse(fileData);
  
  if (Array.isArray(arr) && arr.length > 1 && !arr[0].buyerName) {
    console.log("Merging softwareketan Developers JSON objects...");
    const merged: any = {};
    
    for (const obj of arr) {
      for (const [key, val] of Object.entries(obj)) {
        // For lineItems or pages, we don't want to overwrite if we already have it with values
        if (Array.isArray(val) && merged[key] && merged[key].length > 0) {
          continue;
        }
        // For string fields, if we already have a value and this value is extremely long (like OCR text dump), prefer the cleaner shorter value
        if (typeof val === 'string' && merged[key] && val.length > 150 && merged[key].length < 100) {
          continue;
        }
        merged[key] = val;
      }
    }
    
    fs.writeFileSync(filePath, JSON.stringify([merged], null, 2));
    console.log("Merged successfully!");
  } else {
    console.log("JSON is already merged or not in expected format.");
  }
} else {
  console.error("File not found!");
}
