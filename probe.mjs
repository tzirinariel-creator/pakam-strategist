import { extractText, getDocumentProxy } from "unpdf";
import fs from "node:fs";
const f = "/Users/Ariel/Downloads/ידיעון פכמ מעודכן תשפז מבחנים ומטלות.pdf";
const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(f)));
const { text, totalPages } = await extractText(pdf, { mergePages: true });
console.log("pages:", totalPages, "chars:", text.length);
console.log(text);
