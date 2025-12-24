"use client";
import { useState, useRef, useEffect } from 'react';
import { uploadToNostrBuild, UploadEmitter } from '@/lib/nostr/upload';
import { createImetaTag, processFileMetadata } from '@/lib/nostr/file-metadata';
import { useRelay } from '@/context/RelayProvider';
import { AnyNostrEvent } from '@/types/nostr';
import { KeyManager } from '@/lib/nostr/KeyManager';
import { publishEvent } from '@/lib/nostr/events';
import { useUserStore } from '@/store/useUserStore';

declare global {
  interface Window {
    nostr?: {
      getPublicKey: () => Promise<string>;
      signEvent: (event: any) => Promise<AnyNostrEvent>;
    };
  }
}

interface ComposeNoteProps { 
  replyTo?: string; 
  onSuccess?: (event: AnyNostrEvent) => void;
  includeFileMetadata?: boolean;
}
export default function ComposeNote({ replyTo, onSuccess, includeFileMetadata = true }: ComposeNoteProps = {}) {
  const { manager } = useRelay();
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [uploadingImages, setUploadingImages] = useState<{[key: string]: {progress: number, file: File, altText?: string}}>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Prompt for alt text for an image
  const promptForAltText = (fileId: string) => {
    const altText = window.prompt('Add alt text for this image (optional):', '');
    if (altText !== null) {
      setUploadingImages(prev => ({
        ...prev,
        [fileId]: { ...prev[fileId], altText }
      }));
    }
  };

  const addImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || []);
    setUploadError(null);
    
    fileList.forEach((file) => {
      const fileId = `${file.name}-${Date.now()}`;
      // Create progress emitter
      const emitter = new UploadEmitter();
      
      // Add file to uploading state with 0 progress
      setUploadingImages(prev => ({
        ...prev,
        [fileId]: { progress: 0, file }
      }));
      
      // For accessibility, prompt for alt text
      if (includeFileMetadata && file.type.startsWith('image/')) {
        promptForAltText(fileId);
      }
      
      // Track upload progress
      emitter.on('progress', (loaded, total) => {
        const percent = Math.round((loaded / total) * 100);
        setUploadingImages(prev => ({
          ...prev,
          [fileId]: { ...prev[fileId], progress: percent }
        }));
      });
      
      // Start upload with NIP-95
      uploadToNostrBuild(file, emitter)
        .then(async ({ url, thumbnail }) => {
          // Generate metadata if enabled
          let imetaTag: string[] | undefined;
          
          if (includeFileMetadata) {
            try {
              // Get the active account
              const { accounts, activeAccountId } = useUserStore.getState();
              const active = accounts.find(a => a.id === activeAccountId);
              
              if (active) {
                // Process file and generate NIP-92 metadata
                const fileMetadata = await processFileMetadata(
                  file,
                  { url, thumbnail },
                  active.pubkey,
                  { 
                    altText: uploadingImages[fileId]?.altText,
                    publishNip94Event: false // Don't publish separate event
                  }
                );
                
                imetaTag = fileMetadata.imetaTag;
                console.log('Generated NIP-92 imeta tag:', imetaTag);
              }
            } catch (err) {
              console.warn('Failed to generate file metadata:', err);
            }
          }
          
          // Add to images array along with metadata
          setImages(prev => [...prev, url]);
          
          // Remove from uploading state
          setUploadingImages(prev => {
            const newState = {...prev};
            delete newState[fileId];
            return newState;
          });
        })
        .catch((err) => {
          console.error('Upload failed:', err);
          setUploadError(`Failed to upload ${file.name}: ${err.message}`);
          // Remove from uploading state
          setUploadingImages(prev => {
            const newState = {...prev};
            delete newState[fileId];
            return newState;
          });
        });
    });
    
    // reset input so selecting the same file again works
    e.target.value = '';
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const publish = async () => {
    if ((!content.trim() && images.length === 0) || posting) return;
    if (Object.keys(uploadingImages).length > 0) {
      setUploadError('Please wait for all images to finish uploading');
      return;
    }
    try {
      setPosting(true);

      // Ensure an active account exists
      const { accounts, activeAccountId } = useUserStore.getState();
      const active = accounts.find(a => a.id === activeAccountId);
      if (!active) {
        alert('No active account selected.');
        return;
      }

      // Build content and prepare tags
      const tags: string[][] = replyTo ? [['e', replyTo]] : [];
      const contentLines = [content.trim()];
      
      // Add images with proper NIP-92 metadata
      if (includeFileMetadata && images.length > 0) {
        // For each image, generate imeta tag
        for (const imgUrl of images) {
          contentLines.push(`![image](${imgUrl})`);
          
          // Add basic imeta tag with URL and mime type
          // Note: We would normally have full metadata from the upload process
          // but here we're adding a basic tag for images that might be added directly
          const basicImeta = ['imeta', `url ${imgUrl}`, 'm image/jpeg'];
          tags.push(basicImeta);
        }
      } else {
        // Without metadata, just add image markdown
        contentLines.push(...images.map(img => `![image](${img})`));
      }
      
      const unsigned: any = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: contentLines.filter(Boolean).join('\n'),
        pubkey: active.pubkey,
      };

      let signed: AnyNostrEvent;
      try {
        signed = await KeyManager.signEvent(unsigned, active.pubkey);
      } catch (err: any) {
        alert(err.message || 'Failed to sign event.');
        return;
      }

      await publishEvent(signed, manager.getRelays());
      onSuccess?.(signed);
      setContent('');
      setImages([]);
    } catch (err) {
      console.error(err);
      alert('Failed to publish note');
    } finally {
      setPosting(false);
    }
  };

  // Auto-resize textarea as content grows
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(200, Math.max(80, textarea.scrollHeight))}px`;
    }
    setCharCount(content.length);
  }, [content]);
  
  // Clear error after 5 seconds
  useEffect(() => {
    if (uploadError) {
      const timer = setTimeout(() => setUploadError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [uploadError]);

  return (
    <div className="border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm overflow-hidden bg-white dark:bg-gray-800">
      <div className="p-3 space-y-2">
        <textarea
          ref={textareaRef}
          className="w-full bg-transparent outline-none resize-none min-h-[80px] text-sm py-1 focus:ring-0 focus:border-0"
          placeholder={replyTo ? "Write a reply..." : "What's on your mind?"}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        {/* Uploaded images */}
        {images.length > 0 && (
          <div className="grid gap-2 pb-2 grid-cols-2 sm:grid-cols-3">
            {images.map((src, i) => (
              <div key={i} className="relative group aspect-square">
                <img src={src} alt="upload" className="h-full w-full object-cover rounded-lg" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute -top-2 -right-2 bg-black/70 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600 opacity-80 group-hover:opacity-100 transition-opacity"
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        
        {/* Images being uploaded */}
        {Object.keys(uploadingImages).length > 0 && (
          <div className="grid gap-2 pb-2 grid-cols-2 sm:grid-cols-3">
            {Object.entries(uploadingImages).map(([id, { file }]) => (
              <div key={id} className="relative group aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-gray-200 dark:bg-gray-600 opacity-50">
                  {file.type.startsWith('image/') && URL.createObjectURL && (
                    <img 
                      src={URL.createObjectURL(file)} 
                      alt="uploading" 
                      className="w-full h-full object-cover opacity-50" 
                      onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                    />
                  )}
                </div>
                <div className="z-10 flex flex-col items-center justify-center p-2">
                  {/* Progress circle */}
                  <div className="relative">
                    {/* Background circle */}
                    <svg className="w-12 h-12" viewBox="0 0 36 36">
                      <circle 
                        cx="18" 
                        cy="18" 
                        r="16" 
                        fill="none" 
                        className="stroke-current text-gray-200 dark:text-gray-700" 
                        strokeWidth="2"
                      ></circle>
                      {/* Progress circle - animates around based on upload progress */}
                      <circle 
                        cx="18" 
                        cy="18" 
                        r="16" 
                        fill="none" 
                        className="stroke-current text-indigo-500" 
                        strokeWidth="2"
                        strokeDasharray={`${2 * Math.PI * 16}`}
                        strokeDashoffset={`${2 * Math.PI * 16 * (1 - (uploadingImages[id].progress / 100))}`}
                        strokeLinecap="round"
                        transform="rotate(-90 18 18)"
                      ></circle>
                    </svg>
                    {/* Percentage in middle */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{uploadingImages[id].progress}%</span>
                    </div>
                  </div>
                  <span className="text-xs mt-2 text-center font-medium text-indigo-600 dark:text-indigo-400 truncate max-w-full">
                    {file.name.length > 20 ? `${file.name.substring(0, 17)}...` : file.name}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* Error message if any */}
        {uploadError && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-2 rounded-lg text-sm">
            {uploadError}
          </div>
        )}
      </div>
      
      <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-2 flex justify-between items-center bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className={`${Object.keys(uploadingImages).length > 0 ? 'text-indigo-500 animate-pulse' : 'text-gray-500'} hover:text-indigo-600 bg-gray-100 dark:bg-gray-700 rounded-full p-1.5`}
            disabled={posting}
            title="Add image"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            ref={fileInput}
            onChange={addImage}
          />
          <span className="text-xs text-gray-400">{charCount > 0 ? `${charCount} chars` : ''}</span>
        </div>
        <button
          onClick={publish}
          disabled={posting || Object.keys(uploadingImages).length > 0 || (!content.trim() && images.length === 0)}
          className={`px-4 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50 transition-colors ${posting ? 'bg-indigo-700' : ''}`}
        >
          {posting ? 'Posting...' : (replyTo ? 'Reply' : 'Post')}
        </button>
      </div>
    </div>
  );
}
