"use client";

import React, { useState } from 'react';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface ImageZoomModalProps {
  imageUrl: string;
  altText?: string;
  onClose: () => void;
  imageUrls?: string[];
  currentIndex?: number;
  onNavigate?: (newIndex: number) => void;
}

export default function ImageZoomModal({ 
  imageUrl, 
  altText = "Image", 
  onClose, 
  imageUrls = [], 
  currentIndex = 0,
  onNavigate
}: ImageZoomModalProps) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });

  const handleZoomClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomLevel(zoomLevel >= 2 ? 1 : zoomLevel + 0.5);
  };

  const handleDragStart = (e: React.MouseEvent) => {
    if (zoomLevel > 1) {
      setIsDragging(true);
      setDragPosition({
        x: e.clientX,
        y: e.clientY
      });
    }
  };

  const handleDragMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    // Calculate drag difference
    const dx = e.clientX - dragPosition.x;
    const dy = e.clientY - dragPosition.y;
    
    // Update drag position
    setDragPosition({
      x: e.clientX,
      y: e.clientY
    });
    
    // Update scroll position of container
    const container = e.currentTarget.parentElement;
    if (container) {
      container.scrollLeft -= dx;
      container.scrollTop -= dy;
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center animate-fade-in overflow-hidden"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-4xl mx-auto px-4 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setZoomLevel(1);
            onClose();
          }}
          className="absolute top-4 right-4 text-white rounded-full p-2 bg-black/50 hover:bg-black/70 transition-colors z-10"
          aria-label="Close zoom view"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
        
        <div className="relative mx-auto overflow-hidden">
          <div 
            className={`relative overflow-auto max-h-[70vh] flex justify-center items-center ${isDragging ? 'cursor-grabbing' : zoomLevel > 1 ? 'cursor-grab' : ''} no-scrollbar`}
          >
            <img
              src={imageUrl}
              alt={altText}
              onClick={handleZoomClick}
              onMouseDown={handleDragStart}
              onMouseMove={handleDragMove}
              onMouseUp={handleDragEnd}
              onMouseLeave={handleDragEnd}
              style={{
                transform: `scale(${zoomLevel})`,
                transition: isDragging ? 'none' : 'transform 0.3s ease-out',
                cursor: zoomLevel < 2 ? 'zoom-in' : 'zoom-out',
                maxWidth: '100%',
                transformOrigin: 'center center',
              }}
              className="rounded-lg shadow-2xl"
            />
          </div>
        </div>
        
        {/* Navigation overlay for multi-image galleries */}
        {imageUrls.length > 1 && (
          <>
            <button 
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors z-20"
              onClick={(e) => {
                e.stopPropagation();
                if (onNavigate) {
                  const newIndex = currentIndex === 0 ? imageUrls.length - 1 : currentIndex - 1;
                  onNavigate(newIndex);
                }
              }}
              aria-label="Previous image"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <button 
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors z-20"
              onClick={(e) => {
                e.stopPropagation();
                if (onNavigate) {
                  const newIndex = currentIndex === imageUrls.length - 1 ? 0 : currentIndex + 1;
                  onNavigate(newIndex);
                }
              }}
              aria-label="Next image"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </>
        )}
        
        <div className="text-center mt-4 text-white">
          {imageUrls.length > 1 && (
            <p className="text-gray-300 text-sm">Image {currentIndex + 1} of {imageUrls.length}</p>
          )}
          <p className="text-sm text-white/70 mt-1">
            {zoomLevel < 2 ? 'Click image to zoom in' : 'Click to zoom out or drag to pan'}
          </p>
        </div>
      </div>
    </div>
  );
}
