import React from 'react';

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  segments: TranscriptionSegment[];
  full_text: string;
}

interface TranscriptionSegmentsProps {
  result: TranscriptionResult | null;
  isLoading?: boolean;
}

const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 100);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
};

const TranscriptionSegments: React.FC<TranscriptionSegmentsProps> = ({ result, isLoading = false }) => {
  if (isLoading) {
    return (
      <div className="bg-gray-50 rounded-xl p-6 min-h-[200px] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Processing transcription...</p>
        </div>
      </div>
    );
  }

  if (!result || result.segments.length === 0) {
    return (
      <div className="bg-gray-50 rounded-xl p-12 text-center">
        <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl text-gray-400">🎙️</span>
        </div>
        <h3 className="text-lg font-medium text-gray-600 mb-2">No transcript available yet</h3>
        <p className="text-gray-500">Start recording and transcribe to see segments with timestamps</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <div className="flex items-center justify-between text-sm text-blue-800">
          <span className="font-medium">📊 Transcription Summary</span>
          <div className="flex space-x-4">
            <span>{result.segments.length} segments</span>
            <span>{formatTime(result.segments[result.segments.length - 1]?.end || 0)} total</span>
          </div>
        </div>
      </div>

      {/* Segments */}
      <div className="bg-gray-50 rounded-xl p-6 max-h-[500px] overflow-y-auto">
        <div className="space-y-4">
          {result.segments.map((segment, index) => (
            <div 
              key={index} 
              className="bg-white rounded-lg p-4 border border-gray-200 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 text-sm font-medium">{index + 1}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                      {formatTime(segment.start)} - {formatTime(segment.end)}
                    </span>
                    <span className="ml-2 text-gray-500">
                      ({(segment.end - segment.start).toFixed(1)}s)
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-gray-800 leading-relaxed pl-11">
                {segment.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Full Text View Toggle */}
      <details className="bg-white rounded-lg border border-gray-200">
        <summary className="p-4 cursor-pointer hover:bg-gray-50 font-medium text-gray-700">
          📄 View Full Text (Click to expand)
        </summary>
        <div className="p-4 pt-0 border-t border-gray-100">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
              {result.full_text}
            </p>
          </div>
        </div>
      </details>
    </div>
  );
};

export default TranscriptionSegments;