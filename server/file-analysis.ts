// import * as pdfParse from 'pdf-parse'; // Temporarily disabled due to module issue
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { createWorker } from 'tesseract.js';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';

export interface FileAnalysisResult {
  content: string;
  metadata: {
    pageCount?: number;
    wordCount?: number;
    fileType: string;
    originalName: string;
    size: number;
  };
  summary?: string;
}

export class FileAnalysisService {
  private static instance: FileAnalysisService;
  private ocrWorker: Awaited<ReturnType<typeof createWorker>> | null = null;

  static getInstance(): FileAnalysisService {
    if (!FileAnalysisService.instance) {
      FileAnalysisService.instance = new FileAnalysisService();
    }
    return FileAnalysisService.instance;
  }

  private async initOCRWorker() {
    if (!this.ocrWorker) {
      this.ocrWorker = await createWorker('eng');
    }
    return this.ocrWorker;
  }

  async analyzeFile(buffer: Buffer, fileName: string, mimeType: string): Promise<FileAnalysisResult> {
    try {
      const fileType = await fileTypeFromBuffer(buffer);
      const detectedMime = fileType?.mime || mimeType;

      let content = '';
      let metadata: FileAnalysisResult['metadata'] = {
        fileType: detectedMime,
        originalName: fileName,
        size: buffer.length
      };

      switch (detectedMime) {
        case 'application/pdf':
          // PDF analysis temporarily disabled due to library issue
          content = 'PDF analysis temporarily unavailable. Please use another file format.';
          metadata.pageCount = 0;
          break;

        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        case 'application/msword':
          content = await this.extractFromWord(buffer);
          break;

        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        case 'application/vnd.ms-excel':
          content = await this.extractFromExcel(buffer);
          break;

        case 'image/jpeg':
        case 'image/png':
        case 'image/gif':
        case 'image/webp':
        case 'image/bmp':
          content = await this.extractFromImage(buffer);
          break;

        case 'text/plain':
          content = buffer.toString('utf-8');
          break;

        default:
          // Try to extract as text for unknown formats
          try {
            content = buffer.toString('utf-8');
            // Validate if it's readable text
            if (content.includes('\0') || content.match(/[\x00-\x08\x0E-\x1F\x7F]/)) {
              throw new Error('Binary file detected');
            }
          } catch {
            throw new Error(`Unsupported file type: ${detectedMime}`);
          }
      }

      // Calculate word count
      metadata.wordCount = content.split(/\s+/).filter(word => word.length > 0).length;

      return {
        content: content.trim(),
        metadata,
        summary: this.generateSummary(content, detectedMime)
      };
    } catch (error) {
      throw new Error(`Failed to analyze file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Temporarily disabled due to pdf-parse library issues
  // private async extractFromPDF(buffer: Buffer): Promise<{ content: string; pageCount: number }> {
  //   try {
  //     const data = await pdfParse(buffer);
  //     return {
  //       content: data.text,
  //       pageCount: data.numpages
  //     };
  //   } catch (error) {
  //     throw new Error(`PDF extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  //   }
  // }

  private async extractFromWord(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      throw new Error(`Word document extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async extractFromExcel(buffer: Buffer): Promise<string> {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      let content = '';
      
      workbook.SheetNames.forEach((sheetName, index) => {
        const worksheet = workbook.Sheets[sheetName];
        const sheetData = XLSX.utils.sheet_to_txt(worksheet);
        content += `\n--- Sheet ${index + 1}: ${sheetName} ---\n${sheetData}\n`;
      });

      return content.trim();
    } catch (error) {
      throw new Error(`Excel extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async extractFromImage(buffer: Buffer): Promise<string> {
    try {
      // Convert image to a format suitable for OCR
      const processedImage = await sharp(buffer)
        .greyscale()
        .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();

      const worker = await this.initOCRWorker();
      const { data: { text } } = await worker.recognize(processedImage);
      
      return text;
    } catch (error) {
      throw new Error(`OCR extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateSummary(content: string, fileType: string): string {
    const wordCount = content.split(/\s+/).length;
    const charCount = content.length;
    
    let typeDescription = 'document';
    if (fileType.includes('pdf')) typeDescription = 'PDF document';
    else if (fileType.includes('word') || fileType.includes('document')) typeDescription = 'Word document';
    else if (fileType.includes('sheet') || fileType.includes('excel')) typeDescription = 'Excel spreadsheet';
    else if (fileType.includes('image')) typeDescription = 'image with extracted text';
    else if (fileType.includes('text')) typeDescription = 'text file';

    return `This ${typeDescription} contains ${wordCount} words and ${charCount} characters of content.`;
  }

  async cleanup() {
    if (this.ocrWorker) {
      await this.ocrWorker.terminate();
      this.ocrWorker = null;
    }
  }
}

export const fileAnalysisService = FileAnalysisService.getInstance();