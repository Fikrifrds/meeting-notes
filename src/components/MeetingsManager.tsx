import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  Play, 
  Pause, 
  Download, 
  Edit2, 
  Save, 
  X, 
  FileText, 
  MessageSquare, 
  Headphones,
  StickyNote,
  Clock,
  Globe,
  Bot,
  Calendar,
  TrendingUp,
  Heart,
  Search,
  Plus,
  Trash2,
  Info,
  Settings,
  File,
  Mic,
  Briefcase,
  CheckCircle,
  AlertCircle,
  Loader,
  Lightbulb,
  Music
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';

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

  // AI-generated metadata state
  const [parsedMetadata, setParsedMetadata] = useState<{
    keyTopics: string[];
    sentiment: string;
    energy: string;
    cleanedMinutes: string;
  } | null>(null);

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
      
      // Reset audio state when new file is loaded
      setCurrentTime(0);
      setIsPlaying(false);
    } catch (error) {
      console.error('Failed to load audio file:', error);
      setAudioDataUrl(null);
      setCurrentTime(0);
      setDuration(0);
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleAudioLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
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
    if (!seconds || isNaN(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
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

  const createMeeting = async () => {
    const title = newMeetingTitle.trim();
    
    // Validation
    if (!title) {
      setError('Please enter a meeting title');
      return;
    }
    
    if (title.length < 3) {
      setError('Meeting title must be at least 3 characters long');
      return;
    }
    
    if (title.length > 100) {
      setError('Meeting title must be less than 100 characters');
      return;
    }
    
    // Check for duplicate titles
    if (meetings.some(m => m.title.toLowerCase() === title.toLowerCase())) {
      setError('A meeting with this title already exists');
      return;
    }
    
    setIsLoading(true);
    try {
      const meeting = await invoke<Meeting>('create_meeting', {
        title: title,
        language: null
      });
      
      await loadMeetings();
      setSelectedMeeting(meeting);
      setShowCreateDialog(false);
      setNewMeetingTitle('');
      setError('✅ Meeting created successfully!');
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => setError(null), 3000);
    } catch (error) {
      console.error('Failed to create meeting:', error);
      setError(`Failed to create meeting: ${error}`);
    } finally {
      setIsLoading(false);
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
      
      // Auto-hide success message after 5 seconds
      setTimeout(() => setError(null), 5000);
    } catch (error) {
      console.error('Export failed:', error);
      setError(`Failed to export meeting: ${error}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Parse AI-generated metadata from meeting minutes
  const parseMetadata = (meetingMinutes: string) => {
    if (!meetingMinutes) {
      setParsedMetadata(null);
      return;
    }

    // Look for the metadata section at the end
    const metadataMatch = meetingMinutes.match(/---\s*\nKEY_TOPICS:\s*(.+)\s*\nSENTIMENT:\s*(.+)\s*\nENERGY:\s*(.+)\s*$/);
    
    if (metadataMatch) {
      const [, keyTopicsStr, sentiment, energy] = metadataMatch;
      const keyTopics = keyTopicsStr.split(',').map(topic => topic.trim()).filter(Boolean);
      
      // Remove the metadata section from the minutes for clean display
      const cleanedMinutes = meetingMinutes.replace(/---\s*\nKEY_TOPICS:[\s\S]*$/, '').trim();
      
      setParsedMetadata({
        keyTopics,
        sentiment: sentiment.trim(),
        energy: energy.trim(),
        cleanedMinutes
      });
    } else {
      // Fallback for older format or if parsing fails
      setParsedMetadata({
        keyTopics: ['Meeting Discussion', 'Team Collaboration'],
        sentiment: 'Positive',
        energy: 'Medium',
        cleanedMinutes: meetingMinutes
      });
    }
  };

  // Parse metadata when selected meeting changes
  useEffect(() => {
    if (selectedMeeting?.meeting_minutes) {
      parseMetadata(selectedMeeting.meeting_minutes);
    } else {
      setParsedMetadata(null);
    }
  }, [selectedMeeting?.meeting_minutes]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <Mic className="w-7 h-7 text-white" />
                </div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-purple-800 bg-clip-text text-transparent">
                  Meeting Studio
                </h1>
              </div>
              <p className="text-gray-600 text-lg font-medium">
                Your intelligent meeting companion - record, transcribe, and analyze with AI
              </p>
            </div>
            <div className="text-right">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white bg-opacity-60 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm">
                <Briefcase className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-600 font-mono">~/Documents/MeetingRecorder</span>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className={`mb-6 p-4 rounded-xl border backdrop-blur-sm ${
            error.startsWith('✅') 
              ? 'bg-green-50 border-green-200 text-green-700' 
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <div className="flex items-start gap-3">
              {error.startsWith('✅') ? (
                <CheckCircle className="w-5 h-5 mt-0.5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 mt-0.5 text-red-500" />
              )}
              <div className="flex-1">
                <p className="font-medium">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
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
                  <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-500" />
                    Meetings ({meetings.length})
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowCreateDialog(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      New Meeting
                    </button>
                    
                    {/* Test button for table rendering */}
                    <button
                      onClick={async () => {
                        try {
                          const testMeeting = await invoke<Meeting>('create_meeting', {
                            title: 'Test Meeting with Table',
                            language: 'en'
                          });
                          
                          const testMinutes = `# Meeting Summary

This is a test meeting to verify table rendering.

## Action Items

| Task | Assignee | Due Date | Status |
|------|----------|----------|--------|
| Review API documentation | John Doe | 2024-01-15 | In Progress |
| Update mobile app | Jane Smith | 2024-01-20 | Not Started |
| Test new features | Bob Johnson | 2024-01-18 | Completed |

## Budget Overview

| Category | Allocated | Spent | Remaining |
|----------|-----------|-------|-----------|
| Development | $50,000 | $35,000 | $15,000 |
| Marketing | $20,000 | $12,000 | $8,000 |
| Operations | $30,000 | $25,000 | $5,000 |

## Next Steps

- Review the action items table above
- Update budget allocations as needed
- Schedule follow-up meeting

---
KEY_TOPICS: API Development, Mobile App, Budget Planning
SENTIMENT: Positive
ENERGY: High`;

                          await invoke('save_meeting_minutes_to_database', {
                            meetingId: testMeeting.id,
                            meetingMinutes: testMinutes,
                            aiProvider: 'Test'
                          });
                          
                          setError('✅ Test meeting with tables created successfully!');
                          loadMeetings();
                        } catch (error) {
                          setError(`Failed to create test meeting: ${error}`);
                        }
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl transition-colors text-sm"
                    >
                      Test Table
                    </button>
                  </div>
                </div>

                {/* Enhanced Search Bar */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400" />
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
                      <X className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    </button>
                  )}
                </div>
              </div>

              {/* Meetings List */}
              <div className="max-h-96 overflow-y-auto">
                {isLoading ? (
                  <div className="space-y-4 p-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse">
                        <div className="flex items-center space-x-4">
                          <div className="w-10 h-10 bg-gray-200 rounded-xl"></div>
                          <div className="flex-1 space-y-2">
                            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="text-center py-4">
                      <div className="inline-flex items-center text-gray-500">
                        <Loader className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" />
                        Loading meetings...
                      </div>
                    </div>
                  </div>
                ) : meetings.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <div className="mb-4">
                      <FileText className="w-16 h-16 mx-auto text-gray-300" />
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
                                  <Save className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cancelEditingMeeting();
                                  }}
                                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div>
                                <h3 className="font-semibold text-gray-900 truncate mb-1">
                                  {meeting.title}
                                </h3>
                                <div className="flex items-center gap-4 text-xs text-gray-500">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {formatDate(meeting.created_at)}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatDuration(meeting.duration_seconds)}
                                  </span>
                                  {meeting.audio_file_path && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                      <Headphones className="w-3 h-3" />
                                      Audio
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
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteMeeting(meeting.id);
                                }}
                                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-lg transition-colors"
                                title="Delete meeting"
                              >
                                <Trash2 className="w-4 h-4" />
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
                <h3 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-500" />
                  Meeting Details
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
                              <Save className="w-5 h-5" />
                            </button>
                            <button
                              onClick={cancelEditingMeeting}
                              className="p-3 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                            >
                              <X className="w-5 h-5" />
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
                              <Edit2 className="w-5 h-5" />
                            </button>
                          </>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center gap-2 text-gray-700">
                          <Calendar className="w-4 h-4 text-blue-500" />
                          <div>
                            <p className="font-medium">Created</p>
                            <p className="text-gray-600">{formatDate(selectedMeeting.created_at)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-gray-700">
                          <Clock className="w-4 h-4 text-green-500" />
                          <div>
                            <p className="font-medium">Duration</p>
                            <p className="text-gray-600">{formatDuration(selectedMeeting.duration_seconds)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-gray-700">
                          <Globe className="w-4 h-4 text-purple-500" />
                          <div>
                            <p className="font-medium">Language</p>
                            <p className="text-gray-600">{selectedMeeting.language || 'Auto-detect'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-gray-700">
                          <Bot className="w-4 h-4 text-orange-500" />
                          <div>
                            <p className="font-medium">AI Provider</p>
                            <p className="text-gray-600">{selectedMeeting.ai_provider || 'Whisper'}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-3">
                      {selectedMeeting.audio_file_path && audioDataUrl && (
                        <div className="w-full space-y-3 p-4 bg-gray-50 rounded-xl">
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={handlePlayPause}
                              className="inline-flex items-center justify-center w-12 h-12 bg-blue-500 hover:bg-blue-600 text-white rounded-full transition-colors shadow-lg hover:shadow-xl"
                            >
                              {isPlaying ? (
                                <Pause className="w-6 h-6" />
                              ) : (
                                <Play className="w-6 h-6 ml-1" />
                              )}
                            </button>
                            <div className="flex-1">
                              <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                                <span className="font-medium">{formatTime(currentTime)}</span>
                                <span className="font-medium">{formatTime(duration)}</span>
                              </div>
                              <div className="relative">
                                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-150 ease-out"
                                    style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                                  ></div>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max={duration || 0}
                                  value={currentTime}
                                  onChange={handleSeek}
                                  className="absolute inset-0 w-full h-3 opacity-0 cursor-pointer"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 flex items-center gap-1">
                            <Headphones className="w-3 h-3" />
                            Audio Recording - Click and drag to seek
                          </div>
                        </div>
                      )}
                      <button 
                        onClick={() => setShowExportDialog(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl transition-colors font-medium"
                      >
                        <Download className="w-4 h-4" />
                        Export Meeting
                      </button>
                    </div>

                    {/* Tabs */}
                    <div className="border-b border-gray-200">
                      <nav className="-mb-px flex space-x-8">
                        {[
                          { id: 'overview', name: 'Overview', icon: FileText },
                          { id: 'transcript', name: 'Full Transcript', icon: MessageSquare },
                          { id: 'segments', name: 'Transcript Segments', icon: TrendingUp },
                          { id: 'audio', name: 'Audio', icon: Headphones },
                          { id: 'notes', name: 'Notes', icon: StickyNote }
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
                              <tab.icon className="w-4 h-4" />
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
                                <Lightbulb className="w-5 h-5 text-purple-600" />
                              </div>
                              <h3 className="text-xl font-semibold">AI-Generated Summary</h3>
                            </div>
                            
                            {selectedMeeting.meeting_minutes ? (
                              <div className="space-y-3">
                                <div className="text-gray-800 leading-normal prose prose-sm max-w-none prose-headings:text-gray-900 prose-h1:text-xl prose-h1:font-bold prose-h2:text-lg prose-h2:font-semibold prose-h3:text-base prose-h3:font-medium prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-900 prose-table:text-sm">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                      table: ({ children }) => (
                                        <div className="overflow-x-auto my-4">
                                          <table className="min-w-full divide-y divide-gray-200 border border-gray-300 rounded-lg">
                                            {children}
                                          </table>
                                        </div>
                                      ),
                                      thead: ({ children }) => (
                                        <thead className="bg-gray-50">
                                          {children}
                                        </thead>
                                      ),
                                      tbody: ({ children }) => (
                                        <tbody className="bg-white divide-y divide-gray-200">
                                          {children}
                                        </tbody>
                                      ),
                                      tr: ({ children }) => (
                                        <tr className="hover:bg-gray-50">
                                          {children}
                                        </tr>
                                      ),
                                      th: ({ children }) => (
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 last:border-r-0">
                                          {children}
                                        </th>
                                      ),
                                      td: ({ children }) => (
                                        <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200 last:border-r-0">
                                          {children}
                                        </td>
                                      ),
                                      code: ({ children, className }) => {
                                        const match = /language-(\w+)/.exec(className || '');
                                        return match ? (
                                          <SyntaxHighlighter
                                            style={tomorrow}
                                            language={match[1]}
                                            PreTag="div"
                                            className="rounded-lg text-sm"
                                          >
                                            {String(children).replace(/\n$/, '')}
                                          </SyntaxHighlighter>
                                        ) : (
                                          <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-sm font-mono">
                                            {children}
                                          </code>
                                        );
                                      }
                                    }}
                                  >
                                    {parsedMetadata?.cleanedMinutes || selectedMeeting.meeting_minutes}
                                  </ReactMarkdown>
                                </div>
                                
                                {parsedMetadata && (
                                  <div className="space-y-2">
                                    <h4 className="font-semibold text-base">Key Topics:</h4>
                                    <div className="flex flex-wrap gap-2">
                                      {parsedMetadata.keyTopics.map((topic) => (
                                        <span key={topic} className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                                          {topic}
                                        </span>
                                      ))}
                                    </div>
                                    
                                    <div className="flex items-center gap-4 text-sm">
                                      <span className="flex items-center gap-2">
                                        <span>Sentiment:</span>
                                        <span className="flex items-center gap-1">
                                           {parsedMetadata.sentiment === 'Positive' && <Heart className="w-4 h-4 text-green-500" />}
                                           {parsedMetadata.sentiment === 'Neutral' && <div className="w-4 h-4 bg-yellow-500 rounded-full"></div>}
                                           {parsedMetadata.sentiment === 'Negative' && <X className="w-4 h-4 text-red-500" />}
                                           <span className="font-medium">{parsedMetadata.sentiment}</span>
                                         </span>
                                      </span>
                                      <span className="text-gray-400">|</span>
                                      <span className="flex items-center gap-2">
                                        <span>Energy:</span>
                                        <span className="font-medium">{parsedMetadata.energy}</span>
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-center py-6">
                                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                  <Lightbulb className="w-6 h-6 text-gray-400" />
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
                                <Music className="w-5 h-5 text-white" />
                              </div>
                              <h3 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                                <Headphones className="w-5 h-5" />
                                Audio Recording
                              </h3>
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
                                          <Pause className="w-6 h-6" />
                                        ) : (
                                          <Play className="w-6 h-6 ml-1" />
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
                                  <Music className="w-6 h-6 text-gray-400" />
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
                              <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                                <MessageSquare className="w-5 h-5" />
                                Full Transcript
                              </h3>
                              <div className="prose max-w-none">
                                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                                  {selectedMeeting.transcript}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-8">
                              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <FileText className="w-6 h-6 text-gray-400" />
                              </div>
                              <p className="text-gray-600 font-medium">No transcript available</p>
                              <p className="text-gray-500 text-sm mt-1">Transcript will appear here after processing</p>
                            </div>
                          )}
                        </div>
                      )}

                      {activeTab === 'segments' && (
                        <div className="space-y-4">
                          {segments.length > 0 ? (
                            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                              <div className="p-4 bg-gray-50 border-b border-gray-200">
                                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                  <TrendingUp className="w-5 h-5" />
                                  Transcript Segments
                                </h3>
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
                          ) : (
                            <div className="text-center py-8">
                              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <TrendingUp className="w-6 h-6 text-gray-400" />
                              </div>
                              <p className="text-gray-600 font-medium">No transcript segments available</p>
                              <p className="text-gray-500 text-sm mt-1">Segments will appear here after processing</p>
                            </div>
                          )}
                        </div>
                      )}

                      {activeTab === 'notes' && (
                        <div className="text-center py-12">
                          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Edit2 className="w-8 h-8 text-yellow-500" />
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
                      <FileText className="w-10 h-10 text-gray-400" />
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

        {/* Create Meeting Dialog */}
        {showCreateDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-gray-900">Create New Meeting</h3>
                <button
                  onClick={() => setShowCreateDialog(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-2"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="meeting-title" className="block text-sm font-medium text-gray-700 mb-2">
                    Meeting Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="meeting-title"
                    type="text"
                    value={newMeetingTitle}
                    onChange={(e) => setNewMeetingTitle(e.target.value)}
                    placeholder="Enter meeting title..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    autoFocus
                    maxLength={100}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        createMeeting();
                      } else if (e.key === 'Escape') {
                        setShowCreateDialog(false);
                        setNewMeetingTitle('');
                      }
                    }}
                  />
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-xs text-gray-500">Minimum 3 characters required</p>
                    <p className="text-xs text-gray-500">{newMeetingTitle.length}/100</p>
                  </div>
                </div>
                
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">Pro Tip</p>
                      <p className="text-sm text-blue-700 mt-1">
                        Use descriptive titles like "Q1 Team Planning" or "Client Onboarding Call" for better organization.
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={createMeeting}
                    disabled={isLoading || !newMeetingTitle.trim()}
                    className="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white rounded-xl transition-colors font-medium"
                  >
                    {isLoading ? 'Creating...' : 'Create Meeting'}
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateDialog(false);
                      setNewMeetingTitle('');
                    }}
                    disabled={isLoading}
                    className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-700 rounded-xl transition-colors font-medium"
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
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {selectedMeeting.title}
                  </h4>
                  <p className="text-sm text-gray-600">Created: {formatDate(selectedMeeting.created_at)}</p>
                  <p className="text-sm text-gray-600">Duration: {formatDuration(selectedMeeting.duration_seconds)}</p>
                </div>

                {/* Export Format */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Export Format</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: 'md', label: 'Markdown', icon: MessageSquare, desc: 'Rich formatting' },
                      { value: 'txt', label: 'Text', icon: File, desc: 'Plain text' },
                      { value: 'json', label: 'JSON', icon: Settings, desc: 'Structured data' }
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
                          <div className="flex justify-center mb-1">
                            <format.icon className="w-5 h-5" />
                          </div>
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
                        <Loader className="animate-spin w-4 h-4" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
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
        
        {/* Hidden Audio Element */}
        {audioDataUrl && (
          <audio
            ref={audioRef}
            src={audioDataUrl}
            onTimeUpdate={handleAudioTimeUpdate}
            onLoadedMetadata={handleAudioLoadedMetadata}
            onEnded={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            className="hidden"
          />
        )}
      </div>
    </div>
  );
};

export default MeetingsManager;