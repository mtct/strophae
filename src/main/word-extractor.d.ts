// Minimal typing for word-extractor (no bundled or @types declarations).
declare module 'word-extractor' {
  class Document {
    getBody(): string;
    getHeaders(): string;
    getFootnotes(): string;
    getEndnotes(): string;
  }
  export default class WordExtractor {
    extract(source: string | Buffer): Promise<Document>;
  }
}
