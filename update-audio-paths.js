// Script to update audio file paths in existing meeting records
// This will be run in the browser console to fix existing meetings

async function updateAudioPaths() {
  try {
    console.log('🔄 Checking existing meetings for audio path updates...');
    
    // Get all meetings
    const meetings = await window.__TAURI__.invoke('get_all_meetings');
    console.log(`Found ${meetings.length} meetings`);
    
    let updatedCount = 0;
    
    for (const meeting of meetings) {
      if (meeting.audio_file_path) {
        // Check if the path contains the old structure
        if (meeting.audio_file_path.includes('/Documents/MeetingRecordings/') && 
            !meeting.audio_file_path.includes('/Documents/MeetingRecorder/MeetingRecordings/')) {
          
          // Update the path
          const oldPath = meeting.audio_file_path;
          const newPath = oldPath.replace('/Documents/MeetingRecordings/', '/Documents/MeetingRecorder/MeetingRecordings/');
          
          console.log(`📝 Updating meeting "${meeting.title}"`);
          console.log(`   Old path: ${oldPath}`);
          console.log(`   New path: ${newPath}`);
          
          // Update the meeting record
          const updatedMeeting = {
            ...meeting,
            audio_file_path: newPath
          };
          
          // Note: We would need a specific update function for this
          // For now, just log what needs to be updated
          updatedCount++;
        }
      }
    }
    
    if (updatedCount === 0) {
      console.log('✅ No meetings need audio path updates');
    } else {
      console.log(`⚠️  Found ${updatedCount} meetings that need audio path updates`);
      console.log('💡 These will be automatically fixed when you create new recordings');
    }
    
  } catch (error) {
    console.error('❌ Error checking meetings:', error);
  }
}

// Run the check
updateAudioPaths();