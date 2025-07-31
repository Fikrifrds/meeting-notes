use std::sync::{Arc, Mutex};
use tauri::State;
use std::path::PathBuf;
use chrono::{DateTime, Utc};

#[derive(Debug)]
pub struct AudioState {
    is_recording: Arc<Mutex<bool>>,
    start_time: Arc<Mutex<Option<DateTime<Utc>>>>,
    output_path: Arc<Mutex<Option<PathBuf>>>,
}

impl Default for AudioState {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioState {
    pub fn new() -> Self {
        Self {
            is_recording: Arc::new(Mutex::new(false)),
            start_time: Arc::new(Mutex::new(None)),
            output_path: Arc::new(Mutex::new(None)),
        }
    }
}

#[tauri::command]
async fn start_recording(state: State<'_, AudioState>) -> Result<String, String> {
    let mut is_recording = state.is_recording.lock().map_err(|e| e.to_string())?;
    let mut start_time = state.start_time.lock().map_err(|e| e.to_string())?;
    let mut output_path = state.output_path.lock().map_err(|e| e.to_string())?;
    
    if *is_recording {
        return Err("Already recording".to_string());
    }
    
    // Set up output path
    let home_dir = dirs::home_dir().ok_or("Could not find home directory")?;
    let recordings_dir = home_dir.join("Documents").join("MeetingRecordings");
    std::fs::create_dir_all(&recordings_dir).map_err(|e| e.to_string())?;
    
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let file_path = recordings_dir.join(format!("recording_{}.wav", timestamp));
    
    *output_path = Some(file_path.clone());
    *start_time = Some(chrono::Utc::now());
    *is_recording = true;
    
    Ok(format!("Recording started: {}", file_path.display()))
}

#[tauri::command]
async fn stop_recording(state: State<'_, AudioState>) -> Result<String, String> {
    let mut is_recording = state.is_recording.lock().map_err(|e| e.to_string())?;
    let mut start_time = state.start_time.lock().map_err(|e| e.to_string())?;
    
    if !*is_recording {
        return Err("Not currently recording".to_string());
    }
    
    *is_recording = false;
    *start_time = None;
    
    Ok("Recording stopped".to_string())
}

#[tauri::command]
async fn save_files(state: State<'_, AudioState>) -> Result<String, String> {
    let output_path = state.output_path.lock().map_err(|e| e.to_string())?;
    
    if let Some(path) = output_path.as_ref() {
        Ok(format!("Files saved to: {}", path.display()))
    } else {
        Err("No recording to save".to_string())
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AudioState::default())
        .invoke_handler(tauri::generate_handler![start_recording, stop_recording, save_files, greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
