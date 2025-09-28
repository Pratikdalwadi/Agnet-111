import { useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface TextChunk {
  id: string;
  text: string;
  pageNumber: number;
  geometry: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface PageData {
  pageNumber: number;
  imageUrl: string;
  textChunks: TextChunk[];
}

interface PDFProcessorProps {
  file: File;
  onProcessingComplete: (pages: PageData[]) => void;
  onProgressUpdate: (progress: number) => void;
  onError?: (error: string) => void;
}

const PDFProcessor = ({ file, onProcessingComplete, onProgressUpdate, onError }: PDFProcessorProps) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentProcessingPage, setCurrentProcessingPage] = useState<number>(0);
  const [allPages, setAllPages] = useState<PageData[]>([]);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setCurrentProcessingPage(1);
    setAllPages([]);
    onProgressUpdate(10);
  }, [onProgressUpdate]);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF document load error:', error);
    onError?.('Failed to load PDF document. Please ensure the file is a valid PDF.');
  }, [onError]);

  const onPageLoadSuccess = useCallback(async (page: any) => {
    try {
      const pageNum = currentProcessingPage;
      const progressBase = ((pageNum - 1) / numPages) * 80 + 10; // 10% base + 80% for all pages
      const pageProgressStep = 80 / numPages / 4; // Divide each page into 4 steps
      
      onProgressUpdate(progressBase + pageProgressStep);
      
      // Get page dimensions with higher scale for better quality
      const scale = 2;
      const viewport = page.getViewport({ scale });
      
      // Create canvas to render PDF page as image
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      if (!context) {
        throw new Error('Failed to get canvas context');
      }
      
      onProgressUpdate(progressBase + pageProgressStep * 2);
      
      // Render PDF page to canvas
      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise;
      
      onProgressUpdate(progressBase + pageProgressStep * 3);
      
      // Convert canvas to image URL
      const imageUrl = canvas.toDataURL('image/png', 0.95);
      
      // Extract text content with positions
      const textContent = await page.getTextContent();
      
      if (!textContent || !textContent.items) {
        console.warn(`No text content found in page ${pageNum}`);
      }
      
      const textChunks: TextChunk[] = [];
      let chunkIndex = 0;
      
      if (textContent && textContent.items) {
        textContent.items.forEach((item: any) => {
          if (item.str && item.str.trim().length > 0 && item.transform && item.width && item.height) {
            const originalViewport = page.getViewport({ scale: 1 });
            
            const x = (item.transform[4] / originalViewport.width) * 100;
            const y = ((originalViewport.height - item.transform[5] - item.height) / originalViewport.height) * 100;
            const w = (item.width / originalViewport.width) * 100;
            const h = (item.height / originalViewport.height) * 100;
            
            if (x >= 0 && y >= 0 && w > 0 && h > 0 && x < 100 && y < 100 && 
                x + w <= 100 && y + h <= 100) {
              textChunks.push({
                id: `page-${pageNum}-chunk-${chunkIndex++}`,
                text: item.str.trim(),
                pageNumber: pageNum,
                geometry: { x, y, w, h }
              });
            }
          }
        });
      }
      
      // Group nearby text chunks for better readability
      const groupedChunks = groupNearbyTextChunks(textChunks);
      
      const pageData: PageData = {
        pageNumber: pageNum,
        imageUrl,
        textChunks: groupedChunks
      };
      
      setAllPages(prev => {
        const updated = [...prev, pageData].sort((a, b) => a.pageNumber - b.pageNumber);
        
        // Check if we've processed all pages
        if (updated.length === numPages) {
          onProgressUpdate(100);
          onProcessingComplete(updated);
        } else {
          // Move to next page
          setCurrentProcessingPage(pageNum + 1);
          onProgressUpdate(progressBase + pageProgressStep * 4);
        }
        
        return updated;
      });
      
    } catch (error) {
      console.error(`Error processing PDF page ${currentProcessingPage}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during PDF processing';
      onError?.(errorMessage);
    }
  }, [currentProcessingPage, numPages, onProcessingComplete, onProgressUpdate, onError]);

  const onPageLoadError = useCallback((error: Error) => {
    console.error(`PDF page ${currentProcessingPage} load error:`, error);
    onError?.(`Failed to load PDF page ${currentProcessingPage}. The PDF file may be corrupted or encrypted.`);
  }, [currentProcessingPage, onError]);

  // Group nearby text chunks for better readability
  const groupNearbyTextChunks = (chunks: TextChunk[]): TextChunk[] => {
    if (chunks.length === 0) return [];
    
    const sortedChunks = [...chunks].sort((a, b) => {
      const yDiff = a.geometry.y - b.geometry.y;
      if (Math.abs(yDiff) < 1) {
        return a.geometry.x - b.geometry.x;
      }
      return yDiff;
    });
    
    const grouped: TextChunk[] = [];
    const lineThreshold = 2;
    const wordThreshold = 5;
    
    sortedChunks.forEach((chunk, index) => {
      if (index === 0) {
        grouped.push({ ...chunk });
        return;
      }
      
      const lastGroup = grouped[grouped.length - 1];
      const verticalDistance = Math.abs(chunk.geometry.y - lastGroup.geometry.y);
      const horizontalDistance = chunk.geometry.x - (lastGroup.geometry.x + lastGroup.geometry.w);
      
      const onSameLine = verticalDistance < lineThreshold;
      const closeHorizontally = horizontalDistance >= 0 && horizontalDistance < wordThreshold;
      
      if (onSameLine && closeHorizontally) {
        lastGroup.text += ' ' + chunk.text;
        lastGroup.geometry.w = chunk.geometry.x + chunk.geometry.w - lastGroup.geometry.x;
        lastGroup.geometry.h = Math.max(lastGroup.geometry.h, chunk.geometry.h);
      } else {
        grouped.push({ ...chunk });
      }
    });
    
    return grouped;
  };

  // Only render the current page being processed
  if (currentProcessingPage > 0 && currentProcessingPage <= numPages) {
    return (
      <div className="hidden">
        <Document
          file={file}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={<div>Loading PDF...</div>}
          error={<div>Error loading PDF</div>}
        >
          <Page
            key={currentProcessingPage}
            pageNumber={currentProcessingPage}
            onLoadSuccess={onPageLoadSuccess}
            onLoadError={onPageLoadError}
            loading={<div>Rendering page {currentProcessingPage}...</div>}
            error={<div>Error rendering page {currentProcessingPage}</div>}
          />
        </Document>
      </div>
    );
  }

  return (
    <div className="hidden">
      <Document
        file={file}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={onDocumentLoadError}
        loading={<div>Loading PDF...</div>}
        error={<div>Error loading PDF</div>}
      />
    </div>
  );
};

export default PDFProcessor;