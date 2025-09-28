import { useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import PDFProcessor, { PageData } from './PDFProcessor';
import DocumentViewer from './DocumentViewer';
import TextSearch from './TextSearch';

const PDFViewer = () => {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>('');
  const [selectedChunk, setSelectedChunk] = useState<string>('');
  const { toast } = useToast();

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setPages([]);
      setCurrentPage(1);
      setSelectedChunk('');
      setError('');
      setIsProcessing(true);
      setProgress(0);
      
      toast({
        title: "Processing PDF",
        description: "Extracting text and generating images...",
      });
    } else {
      setError('Please select a valid PDF file.');
      toast({
        title: "Invalid File",
        description: "Please select a valid PDF file.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleProcessingComplete = useCallback((processedPages: PageData[]) => {
    setPages(processedPages);
    setIsProcessing(false);
    setCurrentPage(1);
    
    const totalChunks = processedPages.reduce((sum, page) => sum + page.textChunks.length, 0);
    
    toast({
      title: "Processing Complete",
      description: `Successfully processed ${processedPages.length} pages with ${totalChunks} text regions.`,
    });
  }, [toast]);

  const handleProgressUpdate = useCallback((newProgress: number) => {
    setProgress(newProgress);
  }, []);

  const handleError = useCallback((errorMessage: string) => {
    setError(errorMessage);
    setIsProcessing(false);
    setProgress(0);
    
    toast({
      title: "Processing Error",
      description: errorMessage,
      variant: "destructive",
    });
  }, [toast]);

  const handleChunkClick = useCallback((chunkId: string) => {
    setSelectedChunk(selectedChunk === chunkId ? '' : chunkId);
  }, [selectedChunk]);

  const handleChunkSelect = useCallback((chunkId: string) => {
    if (chunkId) {
      // Find the page containing this chunk
      const targetPage = pages.find(page => 
        page.textChunks.some(chunk => chunk.id === chunkId)
      );
      
      if (targetPage && targetPage.pageNumber !== currentPage) {
        setCurrentPage(targetPage.pageNumber);
      }
    }
    
    setSelectedChunk(chunkId);
  }, [pages, currentPage]);

  const resetViewer = () => {
    setFile(null);
    setPages([]);
    setCurrentPage(1);
    setSelectedChunk('');
    setError('');
    setIsProcessing(false);
    setProgress(0);
  };

  return (
    <div className="min-h-screen bg-viewer-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <FileText className="w-8 h-8 text-pdf-primary" />
            <h1 className="text-3xl font-bold text-foreground">PDF Text Extractor</h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Upload a PDF document to extract and search through all text content with interactive highlighting
          </p>
        </div>

        {/* File Upload */}
        {!file && (
          <Card className="max-w-2xl mx-auto p-8 bg-viewer-surface border-viewer-border border-2 border-dashed">
            <div className="text-center">
              <Upload className="w-16 h-16 mx-auto mb-6 text-pdf-primary" />
              <h3 className="text-xl font-semibold mb-4">Upload PDF Document</h3>
              <p className="text-muted-foreground mb-6">
                Select a PDF file to extract text and generate interactive previews
              </p>
              
              <div className="relative">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={isProcessing}
                />
                <Button 
                  size="lg" 
                  className="bg-pdf-primary hover:bg-pdf-primary/90 text-pdf-primary-foreground"
                  disabled={isProcessing}
                >
                  <Upload className="w-5 h-5 mr-2" />
                  Choose PDF File
                </Button>
              </div>
              
              <p className="text-sm text-muted-foreground mt-4">
                Supports multi-page PDFs with text content
              </p>
            </div>
          </Card>
        )}

        {/* Processing Status */}
        {isProcessing && (
          <Card className="max-w-2xl mx-auto p-6 bg-viewer-surface border-viewer-border">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 relative">
                <div className="w-12 h-12 border-4 border-pdf-primary/20 border-t-pdf-primary rounded-full animate-spin"></div>
              </div>
              <h3 className="text-lg font-semibold mb-2">Processing PDF...</h3>
              <p className="text-muted-foreground mb-4">
                Extracting text from all pages and generating interactive previews
              </p>
              
              <div className="space-y-2">
                <Progress value={progress} className="w-full" />
                <p className="text-sm text-muted-foreground">
                  {progress < 10 && "Loading document..."}
                  {progress >= 10 && progress < 30 && "Processing pages..."}
                  {progress >= 30 && progress < 70 && "Extracting text content..."}
                  {progress >= 70 && progress < 90 && "Applying OCR for better accuracy..."}
                  {progress >= 90 && "Finalizing text regions..."}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Error Display */}
        {error && (
          <Alert className="max-w-2xl mx-auto mb-6 border-destructive/50 bg-destructive/10">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="ml-2">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Main Content */}
        {pages.length > 0 && (
          <div className="space-y-6">
            {/* Success Status */}
            <Card className="max-w-2xl mx-auto p-4 bg-pdf-accent/10 border-pdf-accent/20">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-pdf-accent" />
                <div>
                  <p className="font-semibold text-pdf-accent">Processing Complete!</p>
                  <p className="text-sm text-muted-foreground">
                    Successfully processed {pages.length} page{pages.length !== 1 ? 's' : ''} with{' '}
                    {pages.reduce((sum, page) => sum + page.textChunks.length, 0)} text regions
                    {pages.some(page => page.textChunks.some(chunk => chunk.id.includes('ocr'))) && (
                      <span className="inline-flex items-center gap-1 ml-2 text-pdf-primary">
                        <span>•</span>
                        <span className="font-medium">OCR Enhanced</span>
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetViewer}
                  className="ml-auto hover:bg-pdf-accent/10"
                >
                  Upload New File
                </Button>
              </div>
            </Card>

            {/* Main Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Document Viewer */}
              <div className="lg:col-span-2">
                <DocumentViewer
                  pages={pages}
                  highlightedChunk={selectedChunk}
                  onChunkClick={handleChunkClick}
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                />
              </div>

              {/* Text Search Panel */}
              <div className="lg:col-span-1">
                <TextSearch
                  pages={pages}
                  onChunkSelect={handleChunkSelect}
                  selectedChunk={selectedChunk}
                />
              </div>
            </div>
          </div>
        )}

        {/* PDF Processor */}
        {file && isProcessing && (
          <PDFProcessor
            file={file}
            onProcessingComplete={handleProcessingComplete}
            onProgressUpdate={handleProgressUpdate}
            onError={handleError}
          />
        )}
      </div>
    </div>
  );
};

export default PDFViewer;