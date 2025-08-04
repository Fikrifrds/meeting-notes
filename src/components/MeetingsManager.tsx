import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface Meeting {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  duration_seconds: number;
  audio_file_path?: string;
  transcript?: string;
  meeting_minutes?: string;
  language?: string;
  ai_provider?: string;
}

interface MeetingSegment {
  id: string;
  meeting_id: string;
  start_time: number;
  end_time: number;
  text: string;
  confidence?: number;
}

const MeetingsManager: React.FC = () => {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [segments, setSegments] = useState<MeetingSegment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newMeetingTitle, setNewMeetingTitle] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    format: 'md',
    include_transcript: true,
    include_audio: false,
    include_summary: true,
    include_segments: true,
  });
  const [isExporting, setIsExporting] = useState(false);

  // Audio player state
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    loadMeetings();
  }, []);

  useEffect(() => {
    if (selectedMeeting?.audio_file_path) {
      loadAudioFile(selectedMeeting.audio_file_path);
    } else {
      setAudioDataUrl(null);
    }
  }, [selectedMeeting]);

  useEffect(() => {
    if (selectedMeeting) {
      loadMeetingSegments(selectedMeeting.id);
    }
  }, [selectedMeeting]);

  const loadMeetings = async () => {
    setIsLoading(true);
    try {
      const allMeetings = await invoke<Meeting[]>('get_all_meetings');
      setMeetings(allMeetings);
      setError(null);
    } catch (error) {
      console.error('Failed to load meetings:', error);
      setError(`Failed to load meetings: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const searchMeetings = async () => {
    if (!searchQuery.trim()) {
      loadMeetings();
      return;
    }

    setIsLoading(true);
    try {
      const searchResults = await invoke<Meeting[]>('search_meetings', { 
        query: searchQuery 
      });
      setMeetings(searchResults);
      setError(null);
    } catch (error) {
      console.error('Failed to search meetings:', error);
      setError(`Failed to search meetings: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const createMeeting = async () => {
    if (!newMeetingTitle.trim()) {
      setError('Please enter a meeting title');
      return;
    }

    try {
      const meeting = await invoke<Meeting>('create_meeting', {
        title: newMeetingTitle,
        language: null
      });
      setMeetings(prev => [meeting, ...prev]);
      setNewMeetingTitle('');
      setShowCreateDialog(false);
      setError(null);
    } catch (error) {
      console.error('Failed to create meeting:', error);
      setError(`Failed to create meeting: ${error}`);
    }
  };

  const deleteMeeting = async (meetingId: string) => {
    if (!confirm('Are you sure you want to delete this meeting?')) {
      return;
    }

    try {
      await invoke('delete_meeting', { id: meetingId });
      setMeetings(prev => prev.filter(m => m.id !== meetingId));
      if (selectedMeeting?.id === meetingId) {
        setSelectedMeeting(null);
        setSegments([]);
      }
      setError(null);
    } catch (error) {
      console.error('Failed to delete meeting:', error);
      setError(`Failed to delete meeting: ${error}`);
    }
  };

  const startEditingMeeting = (meeting: Meeting) => {
    setEditingMeetingId(meeting.id);
    setEditingTitle(meeting.title);
  };

  const cancelEditingMeeting = () => {
    setEditingMeetingId(null);
    setEditingTitle('');
  };

  const updateMeetingTitle = async (meetingId: string) => {
    if (!editingTitle.trim()) {
      setError('Please enter a meeting title');
      return;
    }

    try {
      await invoke('update_meeting_title', {
        id: meetingId,
        title: editingTitle
      });
      
      setMeetings(prev => prev.map(m => 
        m.id === meetingId ? { ...m, title: editingTitle } : m
      ));
      
      if (selectedMeeting?.id === meetingId) {
        setSelectedMeeting(prev => prev ? { ...prev, title: editingTitle } : null);
      }
      
      setEditingMeetingId(null);
      setEditingTitle('');
      setError(null);
    } catch (error) {
      console.error('Failed to update meeting title:', error);
      setError(`Failed to update meeting title: ${error}`);
    }
  };

  const loadAudioFile = async (audioFilePath: string) => {
    try {
      const audioData = await invoke<number[]>('get_audio_file_data', {
        filePath: audioFilePath
      });
      
      const uint8Array = new Uint8Array(audioData);
      const blob = new Blob([uint8Array], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      setAudioDataUrl(url);
    } catch (error) {
      console.error('Failed to load audio file:', error);
      setAudioDataUrl(null);
    }
  };

  const loadMeetingSegments = async (meetingId: string) => {
    try {
      const meetingSegments = await invoke<MeetingSegment[]>('get_meeting_segments', {
        meetingId: meetingId
      });
      setSegments(meetingSegments);
    } catch (error) {
      console.error('Failed to load meeting segments:', error);
      setSegments([]);
    }
  };

  // Audio player functions
  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const jumpToSegment = (startTime: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = startTime;
      setCurrentTime(startTime);
      if (!isPlaying) {
        audioRef.current.play();
      }
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${remainingSeconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}s`;
    }
  };

  const exportMeeting = async () => {
    if (!selectedMeeting) {
      setError('No meeting selected for export');
      return;
    }

    setIsExporting(true);
    try {
      const result = await invoke<string>('export_meeting_data', {
        meetingId: selectedMeeting.id,
        options: exportOptions
      });
      
      console.log('Export successful:', result);
      setError(`✅ ${result}`);
      setShowExportDialog(false);
    } catch (error) {
      console.error('Export failed:', error);
      setError(`Failed to export meeting: ${error}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                📋 Meeting Manager
              </h1>
              <p className="text-gray-600 text-lg">
                Manage your recorded meetings, transcripts, and audio files
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">
                📁 Recordings stored in: <span className="font-mono">~/Documents/MeetingRecorder</span>
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Left Panel - Meetings List */}
          <div className="xl:col-span-1">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
              {/* Search and Create Header */}
              <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-800">
                    🎯 Meetings ({meetings.length})
                  </h2>
                  <button
                    onClick={() => setShowCreateDialog(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors font-medium"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    New Meeting
                  </button>
                </div>

                {/* Enhanced Search Bar */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Search meetings..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && searchMeetings()}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        loadMeetings();
                      }}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Meetings List */}
              <div className="max-h-96 overflow-y-auto">
                {isLoading ? (
                  <div className="p-8 text-center">
                    <div className="inline-flex items-center text-gray-500">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Loading meetings...
                    </div>
                  </div>
                ) : meetings.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <div className="mb-4">
                      <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No meetings found</h3>
                    <p className="text-gray-500">
                      {searchQuery ? 'Try a different search term' : 'Create your first meeting to get started'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {meetings.map((meeting) => (
                      <div
                        key={meeting.id}
                        onClick={() => setSelectedMeeting(meeting)}
                        className={`group p-4 hover:bg-gray-50 cursor-pointer transition-all duration-200 ${
                          selectedMeeting?.id === meeting.id 
                            ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-r-4 border-blue-500' 
                            : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            {editingMeetingId === meeting.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editingTitle}
                                  onChange={(e) => setEditingTitle(e.target.value)}
                                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                  autoFocus
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                      updateMeetingTitle(meeting.id);
                                    } else if (e.key === 'Escape') {
                                      cancelEditingMeeting();
                                    }
                                  }}
                                />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateMeetingTitle(meeting.id);
                                  }}
                                  className="p-2 text-green-600 hover:text-green-800 hover:bg-green-100 rounded-lg transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cancelEditingMeeting();
                                  }}
                                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            ) : (
                              <div>
                                <h3 className="font-semibold text-gray-900 truncate mb-1">
                                  {meeting.title}
                                </h3>
                                <div className="flex items-center gap-4 text-xs text-gray-500">
                                  <span className="flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    {formatDate(meeting.created_at)}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {formatDuration(meeting.duration_seconds)}
                                  </span>
                                  {meeting.audio_file_path && (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                      🎵 Audio
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                          {editingMeetingId !== meeting.id && (
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditingMeeting(meeting);
                                }}
                                className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-100 rounded-lg transition-colors"
                                title="Edit meeting title"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteMeeting(meeting.id);
                                }}
                                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-lg transition-colors"
                                title="Delete meeting"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel - Meeting Details */}
          <div className="xl:col-span-2">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                <h3 className="text-xl font-semibold text-gray-800">
                  📋 Meeting Details
                </h3>
              </div>
              
              <div className="p-6">
                {selectedMeeting ? (
                  <div className="space-y-6">
                    {/* Meeting Header */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-xl border border-blue-200">
                      <div className="flex items-center justify-between mb-4">
                        {editingMeetingId === selectedMeeting.id ? (
                          <div className="flex items-center gap-3 flex-1">
                            <input
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-semibold"
                              autoFocus
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  updateMeetingTitle(selectedMeeting.id);
                                } else if (e.key === 'Escape') {
                                  cancelEditingMeeting();
                                }
                              }}
                            />
                            <button
                              onClick={() => updateMeetingTitle(selectedMeeting.id)}
                              className="p-3 text-green-600 hover:text-green-800 hover:bg-green-100 rounded-xl transition-colors"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                            <button
                              onClick={cancelEditingMeeting}
                              className="p-3 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <>
                            <h2 className="text-2xl font-bold text-gray-900">
                              {selectedMeeting.title}
                            </h2>
                            <button
                              onClick={() => startEditingMeeting(selectedMeeting)}
                              className="p-3 text-blue-500 hover:text-blue-700 hover:bg-blue-100 rounded-xl transition-colors"
                              title="Edit meeting title"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center gap-2 text-gray-700">
                          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <div>
                            <p className="font-medium">Created</p>
                            <p className="text-gray-600">{formatDate(selectedMeeting.created_at)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-gray-700">
                          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div>
                            <p className="font-medium">Duration</p>
                            <p className="text-gray-600">{formatDuration(selectedMeeting.duration_seconds)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-gray-700">
                          <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                          </svg>
                          <div>
                            <p className="font-medium">Language</p>
                            <p className="text-gray-600">{selectedMeeting.language || 'Auto-detect'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-gray-700">
                          <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          <div>
                            <p className="font-medium">AI Provider</p>
                            <p className="text-gray-600">{selectedMeeting.ai_provider || 'Whisper'}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-3">
                      {selectedMeeting.audio_file_path && (
                        <button
                          onClick={togglePlayPause}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors font-medium"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {isPlaying ? (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m2 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            )}
                          </svg>
                          {isPlaying ? 'Pause Audio' : 'Play Audio'}
                        </button>
                      )}
                      <button 
                        onClick={() => setShowExportDialog(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl transition-colors font-medium"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Export Meeting
                      </button>
                    </div>

                    {/* Tabs */}
                    <div className="border-b border-gray-200">
                      <nav className="-mb-px flex space-x-8">
                        {[
                          { id: 'overview', name: 'Overview', icon: '📋' },
                          { id: 'transcript', name: 'Transcript', icon: '📝' },
                          { id: 'audio', name: 'Audio', icon: '🎵' },
                          { id: 'action-items', name: 'Action Items', icon: '✅' },
                          { id: 'notes', name: 'Notes', icon: '📝' }
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                              activeTab === tab.id
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                          >
                            <span className="inline-flex items-center gap-2">
                              <span>{tab.icon}</span>
                              {tab.name}
                            </span>
                          </button>
                        ))}
                      </nav>
                    </div>

                    {/* Tab Content */}
                    <div className="mt-4">
                      {activeTab === 'overview' && (
                        <div className="space-y-4">
                          {/* AI-Generated Summary */}
                          <div className="rounded-2xl p-4 text-black bg-white">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                </svg>
                              </div>
                              <h3 className="text-xl font-semibold">AI-Generated Summary</h3>
                            </div>
                            
                            {selectedMeeting.meeting_minutes ? (
                              <div className="space-y-3">
                                <div 
                                  className="text-gray-800 leading-normal prose max-w-none"
                                  dangerouslySetInnerHTML={{
                                    __html: selectedMeeting.meeting_minutes
                                      ?.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                      ?.replace(/\*(.*?)\*/g, '<em>$1</em>')
                                      ?.replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mt-2 mb-1">$1</h3>')
                                      ?.replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold mt-3 mb-2">$1</h2>')
                                      ?.replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>')
                                      ?.replace(/^- (.*$)/gm, '<li class="ml-4">$1</li>')
                                      ?.replace(/(<li.*?>.*?<\/li>)/gs, '<ul class="list-disc list-inside space-y-0.5 my-1">$1</ul>')
                                      ?.replace(/\n/g, '<br>')
                                  }}
                                />
                                
                                <div className="space-y-2">
                                  <h4 className="font-semibold text-base">Key Topics:</h4>
                                  <div className="flex flex-wrap gap-2">
                                    {['API Development', 'Mobile App', 'Progress Tracking'].map((topic) => (
                                      <span key={topic} className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                                        {topic}
                                      </span>
                                    ))}
                                  </div>
                                  
                                  <div className="flex items-center gap-4 text-sm">
                                    <span className="flex items-center gap-2">
                                      <span>Sentiment:</span>
                                      <span className="flex items-center gap-1">
                                        😊 <span className="font-medium">Positive</span>
                                      </span>
                                    </span>
                                    <span className="text-gray-400">|</span>
                                    <span className="flex items-center gap-2">
                                      <span>Energy:</span>
                                      <span className="font-medium">High</span>
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center py-6">
                                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                  </svg>
                                </div>
                                <p className="text-gray-600">No AI summary available yet</p>
                                <p className="text-gray-500 text-sm mt-1">Summary will be generated after transcription</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {activeTab === 'audio' && (
                        <div className="space-y-4">
                          {/* Audio Player */}
                          <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl p-4 border border-blue-200">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                                </svg>
                              </div>
                              <h3 className="text-xl font-semibold text-gray-800">🎵 Audio Recording</h3>
                              <span className="text-sm text-gray-500">High Quality • Synced with transcript</span>
                            </div>

                            {selectedMeeting.audio_file_path ? (
                              <div className="space-y-3">
                                <div className="text-sm text-gray-600 bg-white/50 rounded-lg p-3">
                                  <span className="font-medium">File:</span> {selectedMeeting.audio_file_path}
                                </div>

                                {audioDataUrl && (
                                  <div className="bg-white rounded-xl p-3 shadow-sm">
                                    <audio
                                      ref={audioRef}
                                      src={audioDataUrl}
                                      onTimeUpdate={handleTimeUpdate}
                                      onLoadedMetadata={handleLoadedMetadata}
                                      onPlay={() => setIsPlaying(true)}
                                      onPause={() => setIsPlaying(false)}
                                      className="hidden"
                                    />

                                    <div className="flex items-center gap-4">
                                      <button
                                        onClick={togglePlayPause}
                                        className="w-12 h-12 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center transition-colors"
                                      >
                                        {isPlaying ? (
                                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                        ) : (
                                          <svg className="w-6 h-6 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m2 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                        )}
                                      </button>

                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                          <span className="text-sm font-medium text-gray-700">
                                            {formatTime(currentTime)}
                                          </span>
                                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                                            <div 
                                              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                                            />
                                          </div>
                                          <span className="text-sm text-gray-500">
                                            {formatTime(duration)}
                                          </span>
                                        </div>
                                        <input
                                          type="range"
                                          min="0"
                                          max={duration || 0}
                                          value={currentTime}
                                          onChange={handleSeek}
                                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                                        />
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          id="sync-transcript"
                                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                          defaultChecked
                                        />
                                        <label htmlFor="sync-transcript" className="text-sm text-gray-700">
                                          Sync with transcript
                                        </label>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-center py-6">
                                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                                  </svg>
                                </div>
                                <p className="text-gray-600 font-medium">No audio recording available</p>
                                <p className="text-gray-500 text-sm mt-1">Audio will appear here after recording</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {activeTab === 'transcript' && (
                        <div className="space-y-4">
                          {selectedMeeting.transcript ? (
                            <div className="bg-gray-50 rounded-xl p-4">
                              <h3 className="text-lg font-semibold text-gray-800 mb-3">📝 Full Transcript</h3>
                              <div className="prose max-w-none">
                                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                                  {selectedMeeting.transcript}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-8">
                              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              </div>
                              <p className="text-gray-600 font-medium">No transcript available</p>
                              <p className="text-gray-500 text-sm mt-1">Transcript will appear here after processing</p>
                            </div>
                          )}

                          {segments.length > 0 && (
                            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                              <div className="p-4 bg-gray-50 border-b border-gray-200">
                                <h3 className="text-lg font-semibold text-gray-800">🎯 Transcript Segments</h3>
                              </div>
                              <div className="max-h-96 overflow-y-auto">
                                {segments.map((segment, index) => (
                                  <div
                                    key={segment.id}
                                    className="p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                                    onClick={() => jumpToSegment(segment.start_time)}
                                  >
                                    <div className="flex items-start gap-3">
                                      <div className="flex-shrink-0">
                                        <span className="inline-flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-600 rounded-full text-sm font-medium">
                                          {index + 1}
                                        </span>
                                      </div>
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                          <span className="text-sm font-medium text-blue-600">
                                            {formatTime(segment.start_time)} - {formatTime(segment.end_time)}
                                          </span>
                                          {segment.confidence && (
                                            <span className="text-xs text-gray-500">
                                              ({Math.round(segment.confidence * 100)}% confidence)
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-gray-700 leading-relaxed">
                                          {segment.text}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {activeTab === 'action-items' && (
                        <div className="text-center py-12">
                          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <p className="text-gray-600 font-medium">Action Items</p>
                          <p className="text-gray-500 text-sm mt-2">AI-extracted action items will appear here</p>
                        </div>
                      )}

                      {activeTab === 'notes' && (
                        <div className="text-center py-12">
                          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </div>
                          <p className="text-gray-600 font-medium">Meeting Notes</p>
                          <p className="text-gray-500 text-sm mt-2">Add your own notes and annotations here</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Select a Meeting</h3>
                    <p className="text-gray-500 max-w-md mx-auto">
                      Choose a meeting from the list to view its details, transcript, and audio recording.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Create Meeting Dialog */}
        {showCreateDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Create New Meeting</h3>
              <div className="space-y-4">
                <div>
                  <label htmlFor="meeting-title" className="block text-sm font-medium text-gray-700 mb-2">
                    Meeting Title
                  </label>
                  <input
                    id="meeting-title"
                    type="text"
                    value={newMeetingTitle}
                    onChange={(e) => setNewMeetingTitle(e.target.value)}
                    placeholder="Enter meeting title..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    autoFocus
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        createMeeting();
                      } else if (e.key === 'Escape') {
                        setShowCreateDialog(false);
                        setNewMeetingTitle('');
                      }
                    }}
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={createMeeting}
                    className="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors font-medium"
                  >
                    Create Meeting
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateDialog(false);
                      setNewMeetingTitle('');
                    }}
                    className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Export Meeting Dialog */}
        {showExportDialog && selectedMeeting && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-gray-900">Export Meeting</h3>
                <button
                  onClick={() => setShowExportDialog(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-2"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">📋 {selectedMeeting.title}</h4>
                  <p className="text-sm text-gray-600">Created: {formatDate(selectedMeeting.created_at)}</p>
                  <p className="text-sm text-gray-600">Duration: {formatDuration(selectedMeeting.duration_seconds)}</p>
                </div>

                {/* Export Format */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Export Format</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: 'md', label: 'Markdown', icon: '📝', desc: 'Rich formatting' },
                      { value: 'txt', label: 'Text', icon: '📄', desc: 'Plain text' },
                      { value: 'json', label: 'JSON', icon: '⚙️', desc: 'Structured data' }
                    ].map((format) => (
                      <label key={format.value} className="cursor-pointer">
                        <input
                          type="radio"
                          name="format"
                          value={format.value}
                          checked={exportOptions.format === format.value}
                          onChange={(e) => setExportOptions({...exportOptions, format: e.target.value})}
                          className="sr-only"
                        />
                        <div className={`p-3 rounded-lg border-2 text-center transition-colors ${
                          exportOptions.format === format.value
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <div className="text-lg mb-1">{format.icon}</div>
                          <div className="font-medium text-sm">{format.label}</div>
                          <div className="text-xs text-gray-500">{format.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Export Options */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Include in Export</label>
                  <div className="space-y-3">
                    {[
                      { key: 'include_transcript', label: 'Full Transcript', desc: 'Complete meeting transcript' },
                      { key: 'include_summary', label: 'AI Summary', desc: 'Generated meeting minutes' },
                      { key: 'include_segments', label: 'Transcript Segments', desc: 'Timestamped text segments' },
                      { key: 'include_audio', label: 'Audio File Info', desc: 'Audio file path and metadata' }
                    ].map((option) => (
                      <label key={option.key} className="flex items-start space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={exportOptions[option.key as keyof typeof exportOptions] as boolean}
                          onChange={(e) => setExportOptions({
                            ...exportOptions,
                            [option.key]: e.target.checked
                          })}
                          className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <div className="font-medium text-gray-900">{option.label}</div>
                          <div className="text-sm text-gray-500">{option.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={exportMeeting}
                    disabled={isExporting}
                    className="flex-1 px-4 py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white rounded-xl transition-colors font-medium flex items-center justify-center gap-2"
                  >
                    {isExporting ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Exporting...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Export Meeting
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setShowExportDialog(false)}
                    disabled={isExporting}
                    className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-700 rounded-xl transition-colors font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MeetingsManager;