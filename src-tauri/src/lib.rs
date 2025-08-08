use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use std::path::PathBuf;
use chrono::{DateTime, Utc, Timelike};
use whisper_rs::{WhisperContext, WhisperContextParameters};
use std::thread;
use std::sync::mpsc;
use std::time::Duration;
use serde::{Deserialize, Serialize};
use ollama_rs::{Ollama, generation::completion::request::GenerationRequest};
use uuid;

mod database;
use database::{Database, Meeting, MeetingSegment};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionSegment {
    pub start: f32,
    pub end: f32,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionResult {
    pub segments: Vec<TranscriptionSegment>,
    pub full_text: String,
}


pub struct AudioState {
    is_recording: Arc<Mutex<bool>>,
    start_time: Arc<Mutex<Option<DateTime<Utc>>>>,
    output_path: Arc<Mutex<Option<PathBuf>>>,
    whisper_context: Arc<Mutex<Option<WhisperContext>>>,
    recording_data: Arc<Mutex<Vec<f32>>>,
    // Real-time transcription
    is_realtime_enabled: Arc<Mutex<bool>>,
    transcript_sender: Arc<Mutex<Option<mpsc::Sender<String>>>>,
    chunk_size: usize, // 30 seconds worth of samples at 16kHz
    // New fields for improved audio handling
    mic_data: Arc<Mutex<Vec<f32>>>,
    system_data: Arc<Mutex<Vec<f32>>>,
    mixed_data: Arc<Mutex<Vec<f32>>>,
    target_sample_rate: u32,
    app_handle: Arc<Mutex<Option<AppHandle>>>,
    // Audio gain settings
    mic_gain: Arc<Mutex<f32>>,
    system_gain: Arc<Mutex<f32>>,
    // Device selection
    selected_mic_device: Arc<Mutex<Option<String>>>,
    selected_system_device: Arc<Mutex<Option<String>>>,
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
            whisper_context: Arc::new(Mutex::new(None)),
            recording_data: Arc::new(Mutex::new(Vec::new())),
            is_realtime_enabled: Arc::new(Mutex::new(false)),
            transcript_sender: Arc::new(Mutex::new(None)),
            chunk_size: 16000 * 10, // 30 seconds at 16kHz
            // Initialize new fields
            mic_data: Arc::new(Mutex::new(Vec::new())),
            system_data: Arc::new(Mutex::new(Vec::new())),
            mixed_data: Arc::new(Mutex::new(Vec::new())),
            target_sample_rate: 16000,
            app_handle: Arc::new(Mutex::new(None)),
            // Initialize gain settings with improved default values
            mic_gain: Arc::new(Mutex::new(2.5)),
            system_gain: Arc::new(Mutex::new(1.5)),
            // Device selection
            selected_mic_device: Arc::new(Mutex::new(None)),
            selected_system_device: Arc::new(Mutex::new(None)),
        }
    }
}

pub struct DatabaseState {
    db: Arc<Mutex<Option<Database>>>,
}

impl DatabaseState {
    pub fn new() -> Self {
        Self {
            db: Arc::new(Mutex::new(None)),
        }
    }

    pub fn initialize(&self) -> Result<(), String> {
        let home_dir = dirs::home_dir()
            .ok_or("Could not find home directory")?;
        
        let app_dir = home_dir.join("Documents").join("MeetingRecorder");
        std::fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create app directory: {}", e))?;
        
        let db_path = app_dir.join("meetings.db");
        println!("📁 Initializing database at: {:?}", db_path);
        
        let database = Database::new(db_path)
            .map_err(|e| format!("Failed to initialize database: {}", e))?;
        
        let mut db_guard = self.db.lock().map_err(|e| e.to_string())?;
        *db_guard = Some(database);
        
        println!("✅ Database initialized successfully");
        Ok(())
    }

    pub fn get_db(&self) -> Result<std::sync::MutexGuard<Option<Database>>, String> {
        self.db.lock().map_err(|e| e.to_string())
    }
}

impl Default for DatabaseState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Serialize, Deserialize)]
struct AudioDevice {
    name: String,
    is_default: bool,
    device_type: String, // "input" or "output"
}

#[derive(Serialize, Deserialize)]
struct AudioDevices {
    input_devices: Vec<AudioDevice>,
    output_devices: Vec<AudioDevice>,
}

#[tauri::command]
async fn get_audio_devices() -> Result<AudioDevices, String> {
    use cpal::traits::{DeviceTrait, HostTrait};
    
    println!("🎤 Starting audio device enumeration...");
    let host = cpal::default_host();
    let mut input_devices = Vec::new();
    let mut output_devices = Vec::new();
    
    // Get default devices for comparison
    let default_input = host.default_input_device();
    let default_output = host.default_output_device();
    
    if let Some(ref device) = default_input {
        if let Ok(name) = device.name() {
            println!("🎤 Default input device: {}", name);
        }
    } else {
        println!("⚠️ No default input device found");
    }
    
    if let Some(ref device) = default_output {
        if let Ok(name) = device.name() {
            println!("🔊 Default output device: {}", name);
        }
    } else {
        println!("⚠️ No default output device found");
    }
    
    // Get input devices
    let inputs = host.input_devices()
        .map_err(|e| format!("Failed to enumerate input devices: {}", e))?;
    
    for device in inputs {
        match device.name() {
            Ok(name) => {
                println!("🎤 Found input device: {}", name);
                
                // Check if device supports input
                match device.default_input_config() {
                    Ok(config) => {
                        println!("  ✅ Config: {:?}", config);
                    }
                    Err(e) => {
                        println!("  ❌ Config error: {}", e);
                    }
                }
                
                let is_default = if let Some(ref default_device) = default_input {
                    if let Ok(default_name) = default_device.name() {
                        name == default_name
                    } else {
                        false
                    }
                } else {
                    false
                };
                
                input_devices.push(AudioDevice {
                    name,
                    is_default,
                    device_type: "input".to_string(),
                });
            }
            Err(e) => {
                println!("❌ Failed to get device name: {}", e);
                input_devices.push(AudioDevice {
                    name: "Unknown Input Device".to_string(),
                    is_default: false,
                    device_type: "input".to_string(),
                });
            }
        }
    }
    
    // Get output devices (for system audio capture)
    let outputs = host.output_devices()
        .map_err(|e| format!("Failed to enumerate output devices: {}", e))?;
    
    for device in outputs {
        match device.name() {
            Ok(name) => {
                let is_default = if let Some(ref default_device) = default_output {
                    if let Ok(default_name) = default_device.name() {
                        name == default_name
                    } else {
                        false
                    }
                } else {
                    false
                };
                
                // Check if this device supports input (for loopback)
                if device.default_input_config().is_ok() {
                    output_devices.push(AudioDevice {
                        name: format!("{} (System Audio)", name),
                        is_default,
                        device_type: "output".to_string(),
                    });
                }
            }
            Err(_) => {}
        }
    }
    
    // Also check for dedicated loopback devices in input devices
    let loopback_inputs = host.input_devices()
        .map_err(|e| format!("Failed to enumerate input devices for loopback: {}", e))?;
    
    for device in loopback_inputs {
        if let Ok(name) = device.name() {
            let name_lower = name.to_lowercase();
            if name_lower.contains("loopback") || 
               name_lower.contains("stereo mix") ||
               name_lower.contains("what u hear") ||
               name_lower.contains("soundflower") ||
               name_lower.contains("blackhole") {
                output_devices.push(AudioDevice {
                    name: format!("{} (Loopback)", name),
                    is_default: false,
                    device_type: "loopback".to_string(),
                });
            }
        }
    }
    
    if input_devices.is_empty() {
        return Err("No audio input devices found. Please check your microphone connection.".to_string());
    }
    
    Ok(AudioDevices {
        input_devices,
        output_devices,
    })
}

#[tauri::command]
async fn enable_realtime_transcription(state: State<'_, AudioState>) -> Result<String, String> {
    let mut is_realtime = state.is_realtime_enabled.lock().map_err(|e| e.to_string())?;
    let whisper_context = state.whisper_context.lock().map_err(|e| e.to_string())?;
    
    if whisper_context.is_none() {
        return Err("Whisper not initialized. Please call initialize_whisper first.".to_string());
    }
    
    *is_realtime = true;
    Ok("Real-time transcription enabled".to_string())
}

#[tauri::command]
async fn disable_realtime_transcription(state: State<'_, AudioState>) -> Result<String, String> {
    let mut is_realtime = state.is_realtime_enabled.lock().map_err(|e| e.to_string())?;
    *is_realtime = false;
    Ok("Real-time transcription disabled".to_string())
}

#[tauri::command]
async fn get_recording_status(state: State<'_, AudioState>) -> Result<String, String> {
    let is_recording = state.is_recording.lock().map_err(|e| e.to_string())?;
    let start_time = state.start_time.lock().map_err(|e| e.to_string())?;
    let recording_data = state.recording_data.lock().map_err(|e| e.to_string())?;
    
    if *is_recording {
        if let Some(start) = *start_time {
            let duration = chrono::Utc::now().signed_duration_since(start);
            let seconds = duration.num_seconds();
            let samples = recording_data.len();
            Ok(format!("Recording: {}s, {} samples", seconds, samples))
        } else {
            Ok("Recording: Starting...".to_string())
        }
    } else {
        Ok("Not recording".to_string())
    }
}

#[tauri::command]
async fn initialize_whisper(state: State<'_, AudioState>) -> Result<String, String> {
    let mut whisper_context = state.whisper_context.lock().map_err(|e| e.to_string())?;
    
    if whisper_context.is_some() {
        return Ok("Whisper already initialized".to_string());
    }
    
    // Try to find a Whisper model file
    let home_dir = dirs::home_dir().ok_or("Could not find home directory")?;
    let models_dir = home_dir.join("Documents").join("MeetingRecorder").join("MeetingRecordings").join("models");
    std::fs::create_dir_all(&models_dir).map_err(|e| e.to_string())?;
    
    // Try multiple model options in order of preference
    // Note: Prioritizing multilingual models for better Indonesian support
    // Turbo model has issues with non-English languages (hallucinations)
    let model_options = [
        ("ggml-large-v3-turbo.bin", "Large V3 Turbo (Fast, supports Indonesian with language param)"),
        ("ggml-large-v3.bin", "Large V3 Multilingual (RECOMMENDED: Best for Indonesian)"),
        ("ggml-medium.bin", "Medium Multilingual (Good balance for Indonesian)"),
        ("ggml-small.bin", "Small Multilingual (Faster, good for Indonesian)"),
        ("ggml-small.en.bin", "Small English (English only)"),
        ("ggml-base.en.bin", "Base English (English only)"),
        ("ggml-medium.en.bin", "Medium English (English only)"),
    ];
    
    let mut model_path = None;
    let mut model_info = String::new();
    
    for (filename, description) in &model_options {
        let path = models_dir.join(filename);
        if path.exists() {
            model_path = Some(path);
            model_info = format!("Using {}: {}", filename, description);
            break;
        }
    }
    
    let model_path = model_path.ok_or_else(|| {
        format!(
            "No Whisper model found. Please download one of these models to {}:\n\
            FOR INDONESIAN SUPPORT (RECOMMENDED):\n\
            1. ggml-large-v3.bin (Best accuracy for Indonesian)\n\
            2. ggml-medium.bin (Good balance for Indonesian)\n\
            3. ggml-small.bin (Faster, good for Indonesian)\n\n\
            FOR ENGLISH ONLY:\n\
            4. ggml-large-v3-turbo.bin (Fast but may hallucinate on Indonesian)\n\
            5. ggml-small.en.bin (English only)\n\n\
            Download from: https://huggingface.co/ggerganov/whisper.cpp/tree/main", 
            models_dir.display()
        )
    })?;
    
    println!("🎙️ {}", model_info);
    
    // Initialize Whisper context
    let ctx_params = WhisperContextParameters::default();
    let ctx = WhisperContext::new_with_params(&model_path.to_string_lossy(), ctx_params)
        .map_err(|e| format!("Failed to initialize Whisper: {}", e))?;
    
    *whisper_context = Some(ctx);
    Ok("Whisper initialized successfully".to_string())
}

#[tauri::command]
async fn transcribe_audio(state: State<'_, AudioState>, audio_path: String, language: Option<String>) -> Result<String, String> {
    let whisper_context = state.whisper_context.lock().map_err(|e| e.to_string())?;
    
    if whisper_context.is_none() {
        return Err("Whisper not initialized. Please call initialize_whisper first.".to_string());
    }
    
    // Check if audio file exists
    if !std::path::Path::new(&audio_path).exists() {
        return Err(format!("Audio file not found: {}", audio_path));
    }
    
    // Load and validate audio file
    let audio_data = match load_audio_file(&audio_path) {
        Ok(data) => data,
        Err(e) => return Err(format!("Failed to process audio file: {}", e))
    };
    
    // Perform actual transcription
    if let Some(ref ctx) = *whisper_context {
        match transcribe_with_whisper(ctx, &audio_data, language.as_deref()) {
            Ok(transcript) => {
                let duration = audio_data.len() as f32 / 16000.0;
                Ok(format!(
                    "📁 File: {}\n⏱️ Duration: {:.2}s\n🔊 Samples: {}\n\n📝 Transcript:\n{}",
                    audio_path, duration, audio_data.len(), transcript
                ))
            }
            Err(e) => Err(format!("Transcription failed: {}", e))
        }
    } else {
        Err("Whisper context not available".to_string())
    }
}

#[tauri::command]
async fn transcribe_audio_with_segments(state: State<'_, AudioState>, audio_path: String, language: Option<String>) -> Result<TranscriptionResult, String> {
    let whisper_context = state.whisper_context.lock().map_err(|e| e.to_string())?;
    
    if whisper_context.is_none() {
        return Err("Whisper not initialized. Please call initialize_whisper first.".to_string());
    }
    
    // Check if audio file exists
    if !std::path::Path::new(&audio_path).exists() {
        return Err(format!("Audio file not found: {}", audio_path));
    }
    
    // Load and validate audio file
    let audio_data = match load_audio_file(&audio_path) {
        Ok(data) => data,
        Err(e) => return Err(format!("Failed to process audio file: {}", e))
    };
    
    // Perform actual transcription with segments
    if let Some(ref ctx) = *whisper_context {
        match transcribe_with_whisper_segments(ctx, &audio_data, language.as_deref()) {
            Ok(result) => Ok(result),
            Err(e) => Err(format!("Transcription failed: {}", e))
        }
    } else {
        Err("Whisper context not available".to_string())
    }
}

// Audio processing helper functions
fn resample_audio(input: &[f32], input_rate: u32, output_rate: u32) -> Vec<f32> {
    if input_rate == output_rate {
        return input.to_vec();
    }
    
    let ratio = input_rate as f64 / output_rate as f64;
    let output_len = (input.len() as f64 / ratio) as usize;
    let mut output = Vec::with_capacity(output_len);
    
    for i in 0..output_len {
        let src_index = (i as f64 * ratio) as usize;
        if src_index < input.len() {
            // Linear interpolation for better quality
            let next_index = (src_index + 1).min(input.len() - 1);
            let fraction = (i as f64 * ratio) - src_index as f64;
            let sample = input[src_index] * (1.0 - fraction as f32) + input[next_index] * fraction as f32;
            output.push(sample);
        }
    }
    
    output
}

fn convert_i16_to_f32(input: &[i16]) -> Vec<f32> {
    input.iter().map(|&sample| sample as f32 / 32768.0).collect()
}

fn convert_to_mono(input: &[f32], channels: u16) -> Vec<f32> {
    if channels == 1 {
        return input.to_vec();
    }
    
    let mut mono = Vec::with_capacity(input.len() / channels as usize);
    for chunk in input.chunks(channels as usize) {
        let sum: f32 = chunk.iter().sum();
        mono.push(sum / channels as f32);
    }
    mono
}

fn mix_audio_streams(mic_data: &[f32], system_data: &[f32], mic_gain: f32, system_gain: f32) -> Vec<f32> {
    let max_len = mic_data.len().max(system_data.len());
    let mut mixed = Vec::with_capacity(max_len);
    
    for i in 0..max_len {
        let mic_sample = mic_data.get(i).copied().unwrap_or(0.0) * mic_gain;
        let system_sample = system_data.get(i).copied().unwrap_or(0.0) * system_gain;
        
        // Mix with soft clipping to prevent distortion
        let mixed_sample = mic_sample + system_sample;
        let clipped = if mixed_sample > 1.0 {
            1.0 - (1.0 / (1.0 + (mixed_sample - 1.0)))
        } else if mixed_sample < -1.0 {
            -1.0 + (1.0 / (1.0 + (-mixed_sample - 1.0)))
        } else {
            mixed_sample
        };
        
        mixed.push(clipped);
    }
    
    mixed
}

fn transcribe_with_whisper(ctx: &WhisperContext, audio_data: &[f32], language: Option<&str>) -> Result<String, String> {
    use whisper_rs::{FullParams, SamplingStrategy};
    
    let _duration = audio_data.len() as f32 / 16000.0;
    
    // Check if audio is too short
    if audio_data.len() < 1600 { // Less than 0.1 seconds at 16kHz
        return Ok("(Audio too short for transcription)".to_string());
    }
    
    // Create a new state for this transcription
    let mut state = ctx.create_state()
        .map_err(|e| format!("Failed to create Whisper state: {}", e))?;
    
    // Set up parameters for transcription
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    
    // Configure parameters for better transcription
    params.set_n_threads(4); // Use 4 threads for faster processing
    params.set_translate(false); // Don't translate, keep original language
    
    // Set language parameter - use provided language or auto-detect
    params.set_language(language);
    
    params.set_print_progress(false); // Don't print progress to console
    params.set_print_realtime(false); // Don't print realtime output
    params.set_print_timestamps(false); // Don't print timestamps
    
    // Run the transcription
    state.full(params, audio_data)
        .map_err(|e| format!("Whisper transcription failed: {}", e))?;
    
    // Get the number of segments
    let num_segments = state.full_n_segments()
        .map_err(|e| format!("Failed to get segment count: {}", e))?;
    
    if num_segments == 0 {
        return Ok("(No speech detected)".to_string());
    }
    
    // Collect all transcribed text
    let mut full_text = String::new();
    
    for i in 0..num_segments {
        match state.full_get_segment_text(i) {
            Ok(text) => {
                if !full_text.is_empty() {
                    full_text.push(' ');
                }
                full_text.push_str(&text);
            }
            Err(e) => {
                eprintln!("Warning: Failed to get segment {} text: {}", i, e);
            }
        }
    }
    
    // Clean up the text (remove extra whitespace)
    let cleaned_text = full_text.trim().to_string();
    
    if cleaned_text.is_empty() {
        Ok("(No speech detected)".to_string())
    } else {
        Ok(cleaned_text)
    }
}

fn transcribe_with_whisper_segments(ctx: &WhisperContext, audio_data: &[f32], language: Option<&str>) -> Result<TranscriptionResult, String> {
    use whisper_rs::{FullParams, SamplingStrategy};
    
    let _duration = audio_data.len() as f32 / 16000.0;
    
    // Check if audio is too short
    if audio_data.len() < 1600 { // Less than 0.1 seconds at 16kHz
        return Ok(TranscriptionResult {
            segments: vec![],
            full_text: "(Audio too short for transcription)".to_string(),
        });
    }
    
    // Create a new state for this transcription
    let mut state = ctx.create_state()
        .map_err(|e| format!("Failed to create Whisper state: {}", e))?;
    
    // Set up parameters for transcription
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    
    // Configure parameters for better transcription
    params.set_n_threads(4); // Use 4 threads for faster processing
    params.set_translate(false); // Don't translate, keep original language
    
    // Set language parameter - use provided language or auto-detect
    params.set_language(language);
    
    params.set_print_progress(false); // Don't print progress to console
    params.set_print_realtime(false); // Don't print realtime output
    params.set_print_timestamps(false); // Don't print timestamps to console
    
    // Run the transcription
    state.full(params, audio_data)
        .map_err(|e| format!("Whisper transcription failed: {}", e))?;
    
    // Get the number of segments
    let num_segments = state.full_n_segments()
        .map_err(|e| format!("Failed to get segment count: {}", e))?;
    
    if num_segments == 0 {
        return Ok(TranscriptionResult {
            segments: vec![],
            full_text: "(No speech detected)".to_string(),
        });
    }
    
    // Collect segments with timestamps
    let mut segments = Vec::new();
    let mut full_text = String::new();
    
    for i in 0..num_segments {
        // Get segment text
        let text = match state.full_get_segment_text(i) {
            Ok(text) => text.trim().to_string(),
            Err(e) => {
                eprintln!("Warning: Failed to get segment {} text: {}", i, e);
                continue;
            }
        };
        
        // Skip empty segments
        if text.is_empty() {
            continue;
        }
        
        // Get segment timestamps (in centiseconds, convert to seconds)
        let start_time = match state.full_get_segment_t0(i) {
            Ok(t) => t as f32 / 100.0, // Convert centiseconds to seconds
            Err(e) => {
                eprintln!("Warning: Failed to get segment {} start time: {}", i, e);
                0.0
            }
        };
        
        let end_time = match state.full_get_segment_t1(i) {
            Ok(t) => t as f32 / 100.0, // Convert centiseconds to seconds
            Err(e) => {
                eprintln!("Warning: Failed to get segment {} end time: {}", i, e);
                start_time + 1.0 // Default to 1 second duration
            }
        };
        
        // Add to segments
        segments.push(TranscriptionSegment {
            start: start_time,
            end: end_time,
            text: text.clone(),
        });
        
        // Build full text
        if !full_text.is_empty() {
            full_text.push(' ');
        }
        full_text.push_str(&text);
    }
    
    // Clean up the full text
    let cleaned_text = full_text.trim().to_string();
    let final_text = if cleaned_text.is_empty() {
        "(No speech detected)".to_string()
    } else {
        cleaned_text
    };
    
    Ok(TranscriptionResult {
        segments,
        full_text: final_text,
    })
}

fn calculate_audio_duration(path: &str) -> Result<i64, String> {
    let reader = hound::WavReader::open(path)
        .map_err(|e| format!("Failed to open audio file: {}", e))?;
    
    let spec = reader.spec();
    let duration_seconds = reader.duration() as f64 / spec.sample_rate as f64;
    
    Ok(duration_seconds.round() as i64)
}

fn load_audio_file(path: &str) -> Result<Vec<f32>, String> {
    let mut reader = hound::WavReader::open(path)
        .map_err(|e| format!("Failed to open audio file: {}", e))?;
    
    let spec = reader.spec();
    
    // Convert to f32 samples normalized to [-1, 1]
    let samples: Result<Vec<f32>, _> = match spec.sample_format {
        hound::SampleFormat::Float => {
            reader.samples::<f32>().collect()
        }
        hound::SampleFormat::Int => {
            match spec.bits_per_sample {
                16 => {
                    reader.samples::<i16>()
                        .map(|s| s.map(|sample| sample as f32 / i16::MAX as f32))
                        .collect()
                }
                32 => {
                    reader.samples::<i32>()
                        .map(|s| s.map(|sample| sample as f32 / i32::MAX as f32))
                        .collect()
                }
                _ => return Err("Unsupported bit depth".to_string()),
            }
        }
    };
    
    let mut audio_data = samples.map_err(|e| format!("Failed to read samples: {}", e))?;
    
    // Convert to mono if stereo
    if spec.channels == 2 {
        audio_data = audio_data
            .chunks(2)
            .map(|chunk| (chunk[0] + chunk[1]) / 2.0)
            .collect();
    }
    
    // Resample to 16kHz if needed (Whisper expects 16kHz)
    if spec.sample_rate != 16000 {
        // Simple resampling (not ideal but works for basic cases)
        let ratio = spec.sample_rate as f32 / 16000.0;
        let new_len = (audio_data.len() as f32 / ratio) as usize;
        let mut resampled = Vec::with_capacity(new_len);
        
        for i in 0..new_len {
            let src_idx = (i as f32 * ratio) as usize;
            if src_idx < audio_data.len() {
                resampled.push(audio_data[src_idx]);
            }
        }
        audio_data = resampled;
    }
    
    Ok(audio_data)
}

#[tauri::command]
async fn start_recording(
    state: State<'_, AudioState>, 
    db_state: State<'_, DatabaseState>,
    app_handle: AppHandle
) -> Result<serde_json::Value, String> {
    let mut is_recording = state.is_recording.lock().map_err(|e| e.to_string())?;
    let mut start_time = state.start_time.lock().map_err(|e| e.to_string())?;
    let mut output_path = state.output_path.lock().map_err(|e| e.to_string())?;
    let mut recording_data = state.recording_data.lock().map_err(|e| e.to_string())?;
    
    if *is_recording {
        return Err("Already recording".to_string());
    }
    
    // Create a meeting first to get the ID
    db_state.initialize().ok();
    let db_guard = db_state.get_db()?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    
    let current_date = chrono::Local::now();
    let meeting_title = format!("Meeting {}", current_date.format("%Y-%m-%d %H:%M:%S"));
    
    let meeting = db.create_meeting(meeting_title, None)
        .map_err(|e| format!("Failed to create meeting: {}", e))?;
    
    println!("✅ Created meeting with ID: {}", meeting.id);
    
    // Set up output path using meeting ID
    let home_dir = dirs::home_dir().ok_or("Could not find home directory")?;
    let recordings_dir = home_dir.join("Documents").join("MeetingRecorder").join("MeetingRecordings");
    std::fs::create_dir_all(&recordings_dir).map_err(|e| e.to_string())?;
    
    let file_path = recordings_dir.join(format!("recording_{}.wav", meeting.id));
    
    *output_path = Some(file_path.clone());
    *start_time = Some(chrono::Utc::now());
    *is_recording = true;
    recording_data.clear();
    
    // Store app handle for event emission
    {
        let mut app_handle_guard = state.app_handle.lock().map_err(|e| e.to_string())?;
        *app_handle_guard = Some(app_handle);
    }
    
    // Start actual audio recording in a separate thread
    let recording_data_clone = state.recording_data.clone();
    let is_recording_clone = state.is_recording.clone();
    let whisper_context_clone = state.whisper_context.clone();
    let is_realtime_clone = state.is_realtime_enabled.clone();
    let app_handle_clone = state.app_handle.clone();
    let chunk_size = state.chunk_size;
    
    let mic_gain_clone = state.mic_gain.clone();
    let system_gain_clone = state.system_gain.clone();
    let selected_mic_clone = state.selected_mic_device.clone();
    let selected_system_clone = state.selected_system_device.clone();
    
    thread::spawn(move || {
        if let Err(e) = start_audio_capture_with_realtime(
            recording_data_clone, 
            is_recording_clone,
            whisper_context_clone,
            is_realtime_clone,
            app_handle_clone,
            chunk_size,
            mic_gain_clone,
            system_gain_clone,
            selected_mic_clone,
            selected_system_clone,
        ) {
            eprintln!("Audio capture error: {}", e);
        }
    });
    
    // Return both the message and meeting info
    let result = serde_json::json!({
        "message": format!("Recording started: {}", file_path.display()),
        "meeting_id": meeting.id,
        "audio_file_path": file_path.to_string_lossy().to_string()
    });
    
    Ok(result)
}

fn start_audio_capture_with_realtime(
    recording_data: Arc<Mutex<Vec<f32>>>,
    is_recording: Arc<Mutex<bool>>,
    whisper_context: Arc<Mutex<Option<WhisperContext>>>,
    is_realtime_enabled: Arc<Mutex<bool>>,
    app_handle: Arc<Mutex<Option<AppHandle>>>,
    chunk_size: usize,
    mic_gain: Arc<Mutex<f32>>,
    system_gain: Arc<Mutex<f32>>,
    selected_mic_device: Arc<Mutex<Option<String>>>,
    selected_system_device: Arc<Mutex<Option<String>>>,
) -> Result<(), String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    
    let host = cpal::default_host();
    let target_sample_rate = 16000u32; // Whisper's preferred sample rate
    
    // Get microphone device (use selected device or default)
    let selected_mic_name = selected_mic_device.lock().map_err(|e| e.to_string())?.clone();
    let mic_device = if let Some(ref device_name) = selected_mic_name {
        // Find the device by name
        host.input_devices()
            .map_err(|e| format!("Failed to enumerate input devices: {}", e))?
            .find(|device| {
                if let Ok(name) = device.name() {
                    // Remove "(Default)" suffix if present for comparison
                    let clean_name = name.replace(" (Default)", "");
                    let clean_selected = device_name.replace(" (Default)", "");
                    clean_name == clean_selected
                } else {
                    false
                }
            })
            .ok_or_else(|| format!("Selected microphone device '{}' not found", device_name))?
    } else {
        host.default_input_device()
            .ok_or_else(|| "No microphone device available. Please check your microphone connection.".to_string())?
    };
    
    let mic_name = mic_device.name().unwrap_or_else(|_| "Unknown Microphone".to_string());
    println!("🎤 Using microphone: {}", mic_name);
    
    // Get microphone configuration
    let mic_config = mic_device.default_input_config()
        .map_err(|e| format!("Failed to get microphone config: {}. Please check microphone permissions.", e))?;
    
    println!("🎤 Microphone config: {:?}", mic_config);
    println!("🎤 Sample rate: {} Hz, Channels: {}, Format: {:?}", 
             mic_config.sample_rate().0, mic_config.channels(), mic_config.sample_format());
    
    let mic_sample_rate = mic_config.sample_rate().0;
    let mic_channels = mic_config.channels();
    
    // Get system audio device (use selected device or auto-detect)
    let selected_system_name = selected_system_device.lock().map_err(|e| e.to_string())?.clone();
    let system_device = if let Some(ref device_name) = selected_system_name {
        // Find the selected system device
        let clean_selected = device_name
            .replace(" (System Audio)", "")
            .replace(" (Loopback)", "")
            .replace(" (Default)", "");
        
        // First try output devices
        let output_device = host.output_devices()
            .map_err(|e| format!("Failed to enumerate output devices: {}", e))?
            .find(|device| {
                if let Ok(name) = device.name() {
                    let clean_name = name.replace(" (Default)", "");
                    clean_name == clean_selected
                } else {
                    false
                }
            });
        
        // If not found in outputs, try input devices (for loopback devices)
        output_device.or_else(|| {
            host.input_devices().ok()?.find(|device| {
                if let Ok(name) = device.name() {
                    let clean_name = name.replace(" (Default)", "");
                    clean_name == clean_selected
                } else {
                    false
                }
            })
        })
    } else {
        // Auto-detect system audio device - PRIORITIZE BLACKHOLE/LOOPBACK DEVICES
        println!("🔍 Auto-detecting system audio device...");
        
        // First priority: Look for dedicated loopback devices in INPUT devices
        let loopback_device = host.input_devices().ok().and_then(|mut devices| {
            devices.find(|device| {
                if let Ok(name) = device.name() {
                    let name_lower = name.to_lowercase();
                    let is_loopback = name_lower.contains("blackhole") ||
                                    name_lower.contains("soundflower") ||
                                    name_lower.contains("loopback") ||
                                    name_lower.contains("virtual");
                    if is_loopback {
                        println!("✅ Found dedicated loopback device: {}", name);
                    }
                    is_loopback
                } else {
                    false
                }
            })
        });
        
        // Second priority: Look for system audio devices in OUTPUT devices
        let system_device = loopback_device.or_else(|| {
            host.output_devices().ok().and_then(|mut devices| {
                devices.find(|device| {
                    if let Ok(name) = device.name() {
                        let name_lower = name.to_lowercase();
                        let is_system = name_lower.contains("system") ||
                                      name_lower.contains("stereo mix") ||
                                      name_lower.contains("what u hear");
                        if is_system {
                            println!("⚠️ Using output device for system audio: {}", name);
                        }
                        is_system
                    } else {
                        false
                    }
                })
            })
        });
        
        if system_device.is_none() {
            println!("❌ No dedicated system audio device found. Install BlackHole for better system audio capture.");
        }
        
        system_device
    };
    
    // Shared buffers for audio data
    let mic_buffer = Arc::new(Mutex::new(Vec::<f32>::new()));
    let system_buffer = Arc::new(Mutex::new(Vec::<f32>::new()));
    
    // Clone references for closures
    let mic_buffer_clone = mic_buffer.clone();
    let system_buffer_clone = system_buffer.clone();
    let is_recording_mic = is_recording.clone();
    let is_recording_system = is_recording.clone();
    let mic_name_clone = mic_name.clone();
    
    // Start microphone capture
    let mic_stream = match mic_config.sample_format() {
        cpal::SampleFormat::F32 => {
            mic_device.build_input_stream(
                &mic_config.into(),
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    if let Ok(is_rec) = is_recording_mic.lock() {
                        if *is_rec {
                            if let Ok(mut buffer) = mic_buffer_clone.lock() {
                                // Convert to mono and resample if needed
                                let mono_data = convert_to_mono(data, mic_channels);
                                
                                // Calculate audio level for debugging
                                let max_level = mono_data.iter().map(|x| x.abs()).fold(0.0f32, f32::max);
                                if max_level > 0.01 { // Only log if there's significant audio
                                    println!("🎤 Mic audio level: {:.3} (samples: {})", max_level, mono_data.len());
                                }
                                
                                let resampled = if mic_sample_rate != target_sample_rate {
                                    resample_audio(&mono_data, mic_sample_rate, target_sample_rate)
                                } else {
                                    mono_data
                                };
                                buffer.extend_from_slice(&resampled);
                            }
                        }
                    }
                },
                move |err| eprintln!("Microphone error on '{}': {}", mic_name_clone, err),
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            mic_device.build_input_stream(
                &mic_config.into(),
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    if let Ok(is_rec) = is_recording_mic.lock() {
                        if *is_rec {
                            if let Ok(mut buffer) = mic_buffer_clone.lock() {
                                // Convert I16 to F32, then to mono and resample
                                let f32_data = convert_i16_to_f32(data);
                                let mono_data = convert_to_mono(&f32_data, mic_channels);
                                let resampled = if mic_sample_rate != target_sample_rate {
                                    resample_audio(&mono_data, mic_sample_rate, target_sample_rate)
                                } else {
                                    mono_data
                                };
                                buffer.extend_from_slice(&resampled);
                            }
                        }
                    }
                },
                move |err| eprintln!("Microphone error on '{}': {}", mic_name_clone, err),
                None,
            )
        }
        _ => return Err(format!("Unsupported microphone sample format: {:?}", mic_config.sample_format())),
    }.map_err(|e| format!("Failed to build microphone stream: {}", e))?;
    
    // Start system audio capture if available
    let system_stream = if let Some(sys_device) = system_device {
        let sys_name = sys_device.name().unwrap_or_else(|_| "Unknown System Audio".to_string());
        println!("Using system audio: {}", sys_name);
        
        let sys_config = sys_device.default_input_config()
            .map_err(|e| format!("Failed to get system audio config: {}", e))?;
        
        println!("System audio config: {:?}", sys_config);
        
        let sys_sample_rate = sys_config.sample_rate().0;
        let sys_channels = sys_config.channels();
        let sys_name_clone = sys_name.clone();
        
        let stream = match sys_config.sample_format() {
            cpal::SampleFormat::F32 => {
                sys_device.build_input_stream(
                    &sys_config.into(),
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        if let Ok(is_rec) = is_recording_system.lock() {
                            if *is_rec {
                                if let Ok(mut buffer) = system_buffer_clone.lock() {
                                    // Convert to mono and resample if needed
                                    let mono_data = convert_to_mono(data, sys_channels);
                                    let resampled = if sys_sample_rate != target_sample_rate {
                                        resample_audio(&mono_data, sys_sample_rate, target_sample_rate)
                                    } else {
                                        mono_data
                                    };
                                    buffer.extend_from_slice(&resampled);
                                }
                            }
                        }
                    },
                    move |err| eprintln!("System audio error on '{}': {}", sys_name_clone, err),
                    None,
                )
            }
            cpal::SampleFormat::I16 => {
                sys_device.build_input_stream(
                    &sys_config.into(),
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        if let Ok(is_rec) = is_recording_system.lock() {
                            if *is_rec {
                                if let Ok(mut buffer) = system_buffer_clone.lock() {
                                    // Convert I16 to F32, then to mono and resample
                                    let f32_data = convert_i16_to_f32(data);
                                    let mono_data = convert_to_mono(&f32_data, sys_channels);
                                    let resampled = if sys_sample_rate != target_sample_rate {
                                        resample_audio(&mono_data, sys_sample_rate, target_sample_rate)
                                    } else {
                                        mono_data
                                    };
                                    buffer.extend_from_slice(&resampled);
                                }
                            }
                        }
                    },
                    move |err| eprintln!("System audio error on '{}': {}", sys_name_clone, err),
                    None,
                )
            }
            _ => return Err(format!("Unsupported system audio sample format: {:?}", sys_config.sample_format())),
        }.map_err(|e| format!("Failed to build system audio stream: {}", e))?;
        
        Some(stream)
    } else {
        println!("No system audio device found. Recording microphone only.");
        println!("To record system audio on macOS, install BlackHole or Soundflower.");
        None
    };
    
    // Start streams
    mic_stream.play().map_err(|e| format!("Failed to start microphone stream: {}", e))?;
    if let Some(ref stream) = system_stream {
        stream.play().map_err(|e| format!("Failed to start system audio stream: {}", e))?;
    }
    
    // Audio mixing and processing thread
    let recording_data_clone = recording_data.clone();
    let is_recording_mixer = is_recording.clone();
    let mic_buffer_mixer = mic_buffer.clone();
    let system_buffer_mixer = system_buffer.clone();
    let mic_gain_mixer = mic_gain.clone();
    let system_gain_mixer = system_gain.clone();
    
    thread::spawn(move || {
        let mut last_mic_len = 0;
        let mut last_system_len = 0;
        
        loop {
            thread::sleep(Duration::from_millis(100)); // Mix every 100ms
            
            // Check if still recording
            if let Ok(is_rec) = is_recording_mixer.lock() {
                if !*is_rec {
                    break;
                }
            }
            
            // Get current audio data
            let (mic_data, system_data) = {
                let mic_guard = mic_buffer_mixer.lock().unwrap();
                let system_guard = system_buffer_mixer.lock().unwrap();
                
                let new_mic_data = if mic_guard.len() > last_mic_len {
                    mic_guard[last_mic_len..].to_vec()
                } else {
                    Vec::new()
                };
                
                let new_system_data = if system_guard.len() > last_system_len {
                    system_guard[last_system_len..].to_vec()
                } else {
                    Vec::new()
                };
                
                last_mic_len = mic_guard.len();
                last_system_len = system_guard.len();
                
                (new_mic_data, new_system_data)
            };
            
            // Mix audio streams if we have new data
            if !mic_data.is_empty() || !system_data.is_empty() {
                // Get current gain settings
                let mic_gain_val = mic_gain_mixer.lock().map(|g| *g).unwrap_or_else(|_| {
                    eprintln!("Failed to lock mic gain, using default");
                    2.5
                });
                let system_gain_val = system_gain_mixer.lock().map(|g| *g).unwrap_or_else(|_| {
                    eprintln!("Failed to lock system gain, using default");
                    1.5
                });
                
                // Mix with configurable gains for better volume control
                let mixed = mix_audio_streams(&mic_data, &system_data, mic_gain_val, system_gain_val);
                
                // Add to main recording buffer
                if let Ok(mut recording) = recording_data_clone.lock() {
                    recording.extend_from_slice(&mixed);
                }
            }
        }
    });
    
    // Real-time transcription processing thread
    let recording_data_rt = recording_data.clone();
    let is_recording_rt = is_recording.clone();
    let whisper_context_rt = whisper_context.clone();
    let is_realtime_rt = is_realtime_enabled.clone();
    let app_handle_rt = app_handle.clone();
    
    thread::spawn(move || {
        let mut last_processed = 0;
        
        loop {
            thread::sleep(Duration::from_secs(5)); // Check every 5 seconds
            
            // Check if still recording
            if let Ok(is_rec) = is_recording_rt.lock() {
                if !*is_rec {
                    break;
                }
            }
            
            // Check if real-time is enabled
            let realtime_enabled = if let Ok(rt) = is_realtime_rt.lock() {
                *rt
            } else {
                continue;
            };
            
            if !realtime_enabled {
                continue;
            }
            
            // Process new audio chunks
            if let Ok(recording) = recording_data_rt.lock() {
                let current_len = recording.len();
                
                // If we have enough new data for a chunk
                if current_len >= last_processed + chunk_size {
                    let chunk_end = last_processed + chunk_size;
                    let chunk: Vec<f32> = recording[last_processed..chunk_end].to_vec();
                    
                    // Transcribe chunk in background
                    let whisper_ctx = whisper_context_rt.clone();
                    let app_handle_chunk = app_handle_rt.clone();
                    thread::spawn(move || {
                        if let Ok(ctx_guard) = whisper_ctx.lock() {
                            if let Some(ref ctx) = *ctx_guard {
                                match transcribe_with_whisper(ctx, &chunk, None) {
                                    Ok(transcript) => {
                                        println!("Real-time transcript: {}", transcript);
                                        // Send to frontend via event
                                        if let Ok(app_guard) = app_handle_chunk.lock() {
                                            if let Some(ref app) = *app_guard {
                                                let _ = app.emit("realtime-transcript", &transcript);
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        eprintln!("Real-time transcription error: {}", e);
                                    }
                                }
                            }
                        }
                    });
                    
                    last_processed = chunk_end;
                }
            }
        }
    });
    
    // Keep the streams alive while recording
    loop {
        thread::sleep(Duration::from_millis(100));
        if let Ok(is_rec) = is_recording.lock() {
            if !*is_rec {
                break;
            }
        }
    }
    
    Ok(())
}

fn start_audio_capture(
    recording_data: Arc<Mutex<Vec<f32>>>,
    is_recording: Arc<Mutex<bool>>,
) -> Result<(), String> {
    // Fallback to simple audio capture without real-time features
    start_audio_capture_with_realtime(
        recording_data,
        is_recording,
        Arc::new(Mutex::new(None)),
        Arc::new(Mutex::new(false)),
        Arc::new(Mutex::new(None)),
        0,
        Arc::new(Mutex::new(2.5)), // Default mic gain
        Arc::new(Mutex::new(1.5)), // Default system gain
        Arc::new(Mutex::new(None)), // No selected mic device
        Arc::new(Mutex::new(None))  // No selected system device
    )
}

#[derive(Serialize, Deserialize)]
pub struct RecordingResult {
    pub success: bool,
    pub message: String,
    pub audio_file_path: Option<String>,
    pub duration_seconds: i64,
    pub sample_count: usize,
}

#[tauri::command]
async fn stop_recording(state: State<'_, AudioState>) -> Result<RecordingResult, String> {
    let mut is_recording = state.is_recording.lock().map_err(|e| e.to_string())?;
    let mut start_time = state.start_time.lock().map_err(|e| e.to_string())?;
    let output_path = state.output_path.lock().map_err(|e| e.to_string())?;
    let recording_data = state.recording_data.lock().map_err(|e| e.to_string())?;
    
    if !*is_recording {
        return Err("Not currently recording".to_string());
    }
    
    // Calculate recording duration
    let end_time = chrono::Utc::now();
    let duration_seconds = if let Some(start) = *start_time {
        end_time.signed_duration_since(start).num_seconds()
    } else {
        0
    };
    
    *is_recording = false;
    *start_time = None;
    
    // Save the recorded audio to file
    if let Some(path) = output_path.as_ref() {
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 16000, // Whisper expects 16kHz
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        
        let mut writer = hound::WavWriter::create(path, spec)
            .map_err(|e| format!("Failed to create WAV file: {}", e))?;
        
        for &sample in recording_data.iter() {
            let sample_i16 = (sample * i16::MAX as f32) as i16;
            writer.write_sample(sample_i16)
                .map_err(|e| format!("Failed to write sample: {}", e))?;
        }
        
        writer.finalize()
            .map_err(|e| format!("Failed to finalize WAV file: {}", e))?;
        
        println!("✅ Recording saved: {} (Duration: {}s, Samples: {})", 
                 path.display(), duration_seconds, recording_data.len());
        
        Ok(RecordingResult {
            success: true,
            message: format!("Recording stopped and saved successfully (Duration: {}s)", duration_seconds),
            audio_file_path: Some(path.to_string_lossy().to_string()),
            duration_seconds,
            sample_count: recording_data.len(),
        })
    } else {
        Ok(RecordingResult {
            success: false,
            message: "Recording stopped but no file path available".to_string(),
            audio_file_path: None,
            duration_seconds,
            sample_count: recording_data.len(),
        })
    }
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
async fn save_transcript_to_file(transcript: String, filename: Option<String>) -> Result<String, String> {
    use std::fs;
    use std::io::Write;
    
    if transcript.trim().is_empty() {
        return Err("No transcript content to save".to_string());
    }
    
    // Create the output directory
    let home_dir = dirs::home_dir()
        .ok_or("Could not find home directory")?;
    let output_dir = home_dir.join("Documents").join("MeetingRecorder").join("MeetingRecordings");
    
    fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Failed to create output directory: {}", e))?;
    
    // Generate filename if not provided
    let file_name = filename.unwrap_or_else(|| {
        let now = chrono::Utc::now();
        format!("meeting_{}.txt", now.format("%Y-%m-%d_%H-%M-%S"))
    });
    
    let file_path = output_dir.join(&file_name);
    
    // Write transcript to file
    let mut file = fs::File::create(&file_path)
        .map_err(|e| format!("Failed to create transcript file: {}", e))?;
    
    // Add metadata header
    let now = chrono::Utc::now();
    let header = format!(
        "Meeting Transcript\nGenerated: {}\nFile: {}\n{}\n\n",
        now.format("%Y-%m-%d %H:%M:%S UTC"),
        file_name,
        "=".repeat(50)
    );
    
    file.write_all(header.as_bytes())
        .map_err(|e| format!("Failed to write header to transcript file: {}", e))?;
    
    file.write_all(transcript.as_bytes())
        .map_err(|e| format!("Failed to write transcript to file: {}", e))?;
    
    Ok(format!("Transcript saved to: {}", file_path.display()))
}

#[tauri::command]
async fn save_uploaded_audio(file_name: String, file_data: Vec<u8>) -> Result<String, String> {
    use std::fs;
    use std::io::Write;
    
    // Create the output directory
    let home_dir = dirs::home_dir()
        .ok_or("Could not find home directory")?;
    let output_dir = home_dir.join("Documents").join("MeetingRecorder").join("MeetingRecordings");
    
    fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Failed to create output directory: {}", e))?;
    
    // Generate a unique filename with timestamp
    let now = chrono::Utc::now();
    let file_extension = std::path::Path::new(&file_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("wav");
    
    let unique_filename = format!("uploaded_{}_{}.{}", 
        now.format("%Y%m%d_%H%M%S"), 
        uuid::Uuid::new_v4().to_string()[..8].to_string(),
        file_extension
    );
    
    let file_path = output_dir.join(&unique_filename);
    
    // Write the uploaded file data
    let mut file = fs::File::create(&file_path)
        .map_err(|e| format!("Failed to create uploaded audio file: {}", e))?;
    
    file.write_all(&file_data)
        .map_err(|e| format!("Failed to write uploaded audio data: {}", e))?;
    
    println!("📁 Uploaded audio file saved: {}", file_path.display());
    
    Ok(file_path.to_string_lossy().to_string())
}

// OpenAI API structures
#[derive(Serialize, Deserialize)]
struct OpenAIMessage {
    role: String,
    content: String,
}

#[derive(Serialize, Deserialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
}

#[derive(Serialize, Deserialize)]
struct OpenAIChoice {
    message: OpenAIMessage,
    finish_reason: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct TokenDetails {
    cached_tokens: Option<u32>,
    audio_tokens: Option<u32>,
    reasoning_tokens: Option<u32>,
    accepted_prediction_tokens: Option<u32>,
    rejected_prediction_tokens: Option<u32>,
}

#[derive(Serialize, Deserialize)]
struct Usage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
    prompt_tokens_details: Option<TokenDetails>,
    completion_tokens_details: Option<TokenDetails>,
}

#[derive(Serialize, Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
    usage: Option<Usage>,
}

#[tauri::command]
async fn get_gain_settings(state: State<'_, AudioState>) -> Result<(f32, f32), String> {
    let mic_gain = state.mic_gain.lock().map_err(|e| e.to_string())?;
    let system_gain = state.system_gain.lock().map_err(|e| e.to_string())?;
    Ok((*mic_gain, *system_gain))
}

#[tauri::command]
async fn set_audio_devices(
    state: State<'_, AudioState>, 
    mic_device: Option<String>, 
    system_device: Option<String>
) -> Result<String, String> {
    if let Some(mic) = mic_device {
        let mut selected_mic = state.selected_mic_device.lock().map_err(|e| e.to_string())?;
        *selected_mic = Some(mic);
    }
    
    if let Some(system) = system_device {
        let mut selected_system = state.selected_system_device.lock().map_err(|e| e.to_string())?;
        *selected_system = Some(system);
    }
    
    Ok("Audio devices updated successfully".to_string())
}

#[tauri::command]
async fn get_selected_devices(state: State<'_, AudioState>) -> Result<(Option<String>, Option<String>), String> {
    let mic_device = state.selected_mic_device.lock().map_err(|e| e.to_string())?;
    let system_device = state.selected_system_device.lock().map_err(|e| e.to_string())?;
    Ok((mic_device.clone(), system_device.clone()))
}

#[tauri::command]
async fn test_microphone_access() -> Result<String, String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    
    println!("🧪 Testing microphone access...");
    let host = cpal::default_host();
    
    // Try to get default input device
    let device = host.default_input_device()
        .ok_or_else(|| "No default input device found".to_string())?;
    
    let name = device.name().unwrap_or_else(|_| "Unknown Device".to_string());
    println!("🎤 Testing device: {}", name);
    
    // Try to get configuration
    let config = device.default_input_config()
        .map_err(|e| format!("Failed to get device config (permission issue?): {}", e))?;
    
    println!("✅ Device config obtained: {:?}", config);
    
    // Try to build a test stream (this will trigger permission request if needed)
    let test_stream = device.build_input_stream(
        &config.into(),
        move |_data: &[f32], _: &cpal::InputCallbackInfo| {
            // Test callback - do nothing
        },
        move |err| {
            println!("❌ Stream error: {}", err);
        },
        None,
    ).map_err(|e| format!("Failed to build test stream: {}", e))?;
    
    println!("✅ Test stream created successfully");
    
    // Try to start the stream
    test_stream.play().map_err(|e| format!("Failed to start test stream: {}", e))?;
    
    println!("✅ Test stream started successfully");
    
    // Let it run for a moment
    std::thread::sleep(std::time::Duration::from_millis(100));
    
    drop(test_stream);
    println!("✅ Test stream stopped");
    
    Ok(format!("Microphone access test successful for device: {}", name))
}

#[tauri::command]
async fn test_audio_system() -> Result<String, String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    
    println!("🧪 Testing complete audio system...");
    let host = cpal::default_host();
    let mut test_results = Vec::new();
    
    // Test 1: Microphone Access
    println!("📋 Test 1: Microphone Access");
    let mic_result = match host.default_input_device() {
        Some(device) => {
            let name = device.name().unwrap_or_else(|_| "Unknown Device".to_string());
            match device.default_input_config() {
                Ok(config) => {
                    println!("✅ Microphone: {} - Config: {:?}", name, config);
                    format!("✅ Microphone: {} ({}Hz, {} channels)", name, config.sample_rate().0, config.channels())
                }
                Err(e) => {
                    let error = format!("❌ Microphone config error: {}", e);
                    println!("{}", error);
                    error
                }
            }
        }
        None => {
            let error = "❌ No microphone device found".to_string();
            println!("{}", error);
            error
        }
    };
    test_results.push(mic_result);
    
    // Test 2: System Audio Detection (BlackHole/Loopback)
    println!("📋 Test 2: System Audio Detection");
    let mut system_audio_found = false;
    let mut system_result = String::new();
    
    // Check for loopback devices in input devices
    if let Ok(input_devices) = host.input_devices() {
        for device in input_devices {
            if let Ok(name) = device.name() {
                let name_lower = name.to_lowercase();
                if name_lower.contains("blackhole") || name_lower.contains("soundflower") || 
                   name_lower.contains("loopback") || name_lower.contains("virtual") {
                    if let Ok(config) = device.default_input_config() {
                        system_result = format!("✅ System Audio: {} ({}Hz, {} channels)", name, config.sample_rate().0, config.channels());
                        println!("{}", system_result);
                        system_audio_found = true;
                        break;
                    }
                }
            }
        }
    }
    
    if !system_audio_found {
        system_result = "⚠️ No dedicated system audio device (BlackHole) found. Install BlackHole for system audio capture.".to_string();
        println!("{}", system_result);
    }
    test_results.push(system_result);
    
    // Test 3: Audio Stream Creation
    println!("📋 Test 3: Audio Stream Creation");
    let stream_result = if let Some(mic_device) = host.default_input_device() {
        match mic_device.default_input_config() {
            Ok(config) => {
                match mic_device.build_input_stream(
                    &config.into(),
                    |_data: &[f32], _: &cpal::InputCallbackInfo| {},
                    |err| println!("Stream error: {}", err),
                    None,
                ) {
                    Ok(stream) => {
                        match stream.play() {
                            Ok(_) => {
                                std::thread::sleep(std::time::Duration::from_millis(50));
                                drop(stream);
                                let result = "✅ Audio stream creation and playback successful".to_string();
                                println!("{}", result);
                                result
                            }
                            Err(e) => {
                                let error = format!("❌ Stream playback failed: {}", e);
                                println!("{}", error);
                                error
                            }
                        }
                    }
                    Err(e) => {
                        let error = format!("❌ Stream creation failed: {}", e);
                        println!("{}", error);
                        error
                    }
                }
            }
            Err(e) => {
                let error = format!("❌ Config error: {}", e);
                println!("{}", error);
                error
            }
        }
    } else {
        let error = "❌ No microphone for stream test".to_string();
        println!("{}", error);
        error
    };
    test_results.push(stream_result);
    
    // Test 4: Audio Permissions
    println!("📋 Test 4: Audio Permissions");
    let permission_result = if cfg!(target_os = "macos") {
        "ℹ️ macOS: Audio permissions managed by system. If issues persist, check System Preferences > Security & Privacy > Microphone".to_string()
    } else {
        "ℹ️ Audio permissions vary by OS. Ensure microphone access is granted.".to_string()
    };
    println!("{}", permission_result);
    test_results.push(permission_result);
    
    // Summary
    let success_count = test_results.iter().filter(|r| r.starts_with("✅")).count();
    let warning_count = test_results.iter().filter(|r| r.starts_with("⚠️")).count();
    let error_count = test_results.iter().filter(|r| r.starts_with("❌")).count();
    
    let summary = format!(
        "🎯 Audio System Test Complete\n\n{}\n\n📊 Summary: {} passed, {} warnings, {} errors",
        test_results.join("\n"),
        success_count,
        warning_count,
        error_count
    );
    
    println!("\n{}", summary);
    Ok(summary)
}

#[tauri::command]
async fn set_gain_settings(state: State<'_, AudioState>, mic_gain: f32, system_gain: f32) -> Result<(), String> {
    // Validate gain values (prevent extremely high values that could cause distortion)
    if mic_gain < 0.0 || mic_gain > 10.0 {
        return Err("Microphone gain must be between 0.0 and 10.0".to_string());
    }
    if system_gain < 0.0 || system_gain > 10.0 {
        return Err("System gain must be between 0.0 and 10.0".to_string());
    }
    
    let mut mic_gain_guard = state.mic_gain.lock().map_err(|e| e.to_string())?;
    let mut system_gain_guard = state.system_gain.lock().map_err(|e| e.to_string())?;
    
    *mic_gain_guard = mic_gain;
    *system_gain_guard = system_gain;
    
    println!("Updated gain settings - Mic: {}, System: {}", mic_gain, system_gain);
    Ok(())
}

#[tauri::command]
async fn generate_meeting_minutes(transcript: String, language: Option<String>) -> Result<String, String> {
    // Load environment variables
    dotenv::dotenv().ok();
    
    let api_key = std::env::var("OPENAI_API_KEY")
        .map_err(|_| "OPENAI_API_KEY not found in environment variables. Please add it to your .env file.".to_string())?;
    
    let model = std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-4o-mini".to_string());
    let max_tokens = std::env::var("OPENAI_MAX_TOKENS")
        .unwrap_or_else(|_| "2000".to_string())
        .parse::<u32>()
        .unwrap_or(2000);
    let temperature = std::env::var("OPENAI_TEMPERATURE")
        .unwrap_or_else(|_| "0.3".to_string())
        .parse::<f32>()
        .unwrap_or(0.3);

    if transcript.trim().is_empty() {
        return Err("No transcript provided for meeting minutes generation".to_string());
    }

    // Create the prompt for meeting minutes with language awareness
    let language_instruction = match language.as_deref() {
        Some("id") => "Generate the meeting minutes in Indonesian (Bahasa Indonesia). Use professional Indonesian business language.",
        Some("es") => "Generate the meeting minutes in Spanish. Use professional Spanish business language.",
        Some("fr") => "Generate the meeting minutes in French. Use professional French business language.",
        Some("de") => "Generate the meeting minutes in German. Use professional German business language.",
        Some("it") => "Generate the meeting minutes in Italian. Use professional Italian business language.",
        Some("pt") => "Generate the meeting minutes in Portuguese. Use professional Portuguese business language.",
        Some("nl") => "Generate the meeting minutes in Dutch. Use professional Dutch business language.",
        Some("ru") => "Generate the meeting minutes in Russian. Use professional Russian business language.",
        Some("ja") => "Generate the meeting minutes in Japanese. Use professional Japanese business language.",
        Some("ko") => "Generate the meeting minutes in Korean. Use professional Korean business language.",
        Some("zh") => "Generate the meeting minutes in Chinese. Use professional Chinese business language.",
        Some("ar") => "Generate the meeting minutes in Arabic. Use professional Arabic business language.",
        Some("hi") => "Generate the meeting minutes in Hindi. Use professional Hindi business language.",
        Some("tr") => "Generate the meeting minutes in Turkish. Use professional Turkish business language.",
        Some("en") | _ => "Generate the meeting minutes in English. Use professional English business language.",
    };

    let system_prompt = format!(r#"You are an expert meeting assistant. Transform the following meeting transcript into well-structured meeting minutes. {}

Include the following sections:

1. **Meeting Summary** - Brief overview of the meeting
2. **Key Discussion Points** - Main topics discussed
3. **Decisions Made** - Any decisions or conclusions reached
4. **Action Items** - Tasks assigned with responsible parties (if mentioned)
5. **Next Steps** - Follow-up actions or future meetings

Format the output in clear, professional language with proper headings and bullet points. Use markdown formatting including:
- **Bold text** for emphasis
- Bullet points for lists
- Tables for structured data (use proper markdown table syntax with | separators)
- Code blocks for technical content

When presenting structured information like action items, deadlines, or data comparisons, use markdown tables with this format:
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data 1   | Data 2   | Data 3   |

If specific names or roles aren't mentioned, use generic terms like "Participant A", "Team Member", etc. Maintain the same language throughout the entire document.

IMPORTANT: End your response with exactly this format:
---
KEY_TOPICS: [comma-separated list of 3-5 topics]
SENTIMENT: [Positive/Neutral/Negative]
ENERGY: [High/Medium/Low]"#, language_instruction);

    let user_prompt = format!("Please generate meeting minutes from this transcript:\n\n{}", transcript);

    // Prepare the OpenAI request
    let request = OpenAIRequest {
        model,
        messages: vec![
            OpenAIMessage {
                role: "system".to_string(),
                content: system_prompt.to_string(),
            },
            OpenAIMessage {
                role: "user".to_string(),
                content: user_prompt,
            },
        ],
        max_tokens: Some(max_tokens),
        temperature: Some(temperature),
    };

    // Make the API call
    let client = reqwest::Client::new();
    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to send request to OpenAI: {}", e))?;

    if !response.status().is_success() {
        let status_code = response.status();
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("OpenAI API error ({}): {}", status_code, error_text));
    }

    // Get response text first for debugging
    let response_text = response.text().await
        .map_err(|e| format!("Failed to get response text: {}", e))?;
    
    // Try to parse the JSON response
    let openai_response: OpenAIResponse = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse OpenAI response: {}. Response was: {}", e, response_text))?;

    if openai_response.choices.is_empty() {
        return Err("No response from OpenAI".to_string());
    }

    let meeting_minutes = &openai_response.choices[0].message.content;
    
    Ok(meeting_minutes.to_string())
}

#[tauri::command]
async fn generate_meeting_minutes_ollama(transcript: String, language: Option<String>) -> Result<String, String> {
    // Load environment variables
    dotenv::dotenv().ok();
    
    // Get Ollama configuration from environment variables
    let ollama_host = std::env::var("OLLAMA_HOST").unwrap_or_else(|_| "http://localhost:11434".to_string());
    let ollama_model = std::env::var("OLLAMA_MODEL").unwrap_or_else(|_| "llama3.1:8b".to_string());

    if transcript.trim().is_empty() {
        return Err("No transcript provided for meeting minutes generation".to_string());
    }

    // Create the prompt for meeting minutes with language awareness
    let language_instruction = match language.as_deref() {
        Some("id") => "Generate the meeting minutes in Indonesian (Bahasa Indonesia). Use professional Indonesian business language.",
        Some("es") => "Generate the meeting minutes in Spanish. Use professional Spanish business language.",
        Some("fr") => "Generate the meeting minutes in French. Use professional French business language.",
        Some("de") => "Generate the meeting minutes in German. Use professional German business language.",
        Some("it") => "Generate the meeting minutes in Italian. Use professional Italian business language.",
        Some("pt") => "Generate the meeting minutes in Portuguese. Use professional Portuguese business language.",
        Some("nl") => "Generate the meeting minutes in Dutch. Use professional Dutch business language.",
        Some("ru") => "Generate the meeting minutes in Russian. Use professional Russian business language.",
        Some("ja") => "Generate the meeting minutes in Japanese. Use professional Japanese business language.",
        Some("ko") => "Generate the meeting minutes in Korean. Use professional Korean business language.",
        Some("zh") => "Generate the meeting minutes in Chinese. Use professional Chinese business language.",
        Some("ar") => "Generate the meeting minutes in Arabic. Use professional Arabic business language.",
        Some("hi") => "Generate the meeting minutes in Hindi. Use professional Hindi business language.",
        Some("tr") => "Generate the meeting minutes in Turkish. Use professional Turkish business language.",
        Some("en") | _ => "Generate the meeting minutes in English. Use professional English business language.",
    };

    let system_prompt = format!(r#"You are an expert meeting assistant. Transform the following meeting transcript into well-structured meeting minutes. {}

Include the following sections:

1. **Meeting Summary** - Brief overview of the meeting
2. **Key Discussion Points** - Main topics discussed
3. **Decisions Made** - Any decisions or conclusions reached
4. **Action Items** - Tasks assigned with responsible parties (if mentioned)
5. **Next Steps** - Follow-up actions or future meetings

Format the output in clear, professional language with proper headings and bullet points. If specific names or roles aren't mentioned, use generic terms like "Participant A", "Team Member", etc. Maintain the same language throughout the entire document.

IMPORTANT: End your response with exactly this format:
---
KEY_TOPICS: [comma-separated list of 3-5 topics]
SENTIMENT: [Positive/Neutral/Negative]
ENERGY: [High/Medium/Low]"#, language_instruction);

    let full_prompt = format!("{}\n\nPlease generate meeting minutes from this transcript:\n\n{}", system_prompt, transcript);

    // Initialize Ollama client
    let ollama = Ollama::try_new(ollama_host)
        .map_err(|e| format!("Failed to create Ollama client: {}", e))?;

    // Create generation request
    let request = GenerationRequest::new(ollama_model, full_prompt);

    // Make the API call to Ollama
    let response = ollama.generate(request).await
        .map_err(|e| format!("Failed to generate meeting minutes with Ollama: {}", e))?;

    let meeting_minutes = response.response;
    
    Ok(meeting_minutes)
}

#[tauri::command]
async fn save_meeting_minutes(meeting_minutes: String, filename: Option<String>) -> Result<String, String> {
    use std::fs;
    use std::io::Write;
    
    if meeting_minutes.trim().is_empty() {
        return Err("No meeting minutes content to save".to_string());
    }
    
    // Create the output directory
    let home_dir = dirs::home_dir()
        .ok_or("Could not find home directory")?;
    let output_dir = home_dir.join("Documents").join("MeetingRecorder").join("MeetingRecordings");
    
    fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Failed to create output directory: {}", e))?;
    
    // Generate filename if not provided
    let file_name = filename.unwrap_or_else(|| {
        let now = chrono::Utc::now();
        format!("meeting_minutes_{}.md", now.format("%Y-%m-%d_%H-%M-%S"))
    });
    
    let file_path = output_dir.join(&file_name);
    
    // Write meeting minutes to file
    let mut file = fs::File::create(&file_path)
        .map_err(|e| format!("Failed to create meeting minutes file: {}", e))?;
    
    file.write_all(meeting_minutes.as_bytes())
        .map_err(|e| format!("Failed to write meeting minutes to file: {}", e))?;
    
    Ok(format!("Meeting minutes saved to: {}", file_path.display()))
}

// Database Commands

#[tauri::command]
async fn initialize_database(db_state: State<'_, DatabaseState>) -> Result<String, String> {
    db_state.initialize()?;
    Ok("Database initialized successfully".to_string())
}

#[tauri::command]
async fn create_meeting(
    db_state: State<'_, DatabaseState>,
    title: String,
    language: Option<String>
) -> Result<Meeting, String> {
    let db_guard = db_state.get_db()?;
    let db = db_guard.as_ref()
        .ok_or("Database not initialized")?;
    
    let meeting = db.create_meeting(title, language)
        .map_err(|e| format!("Failed to create meeting: {}", e))?;
    
    Ok(meeting)
}

#[tauri::command]
async fn test_save_audio_path(
    db_state: State<'_, DatabaseState>
) -> Result<String, String> {
    let test_audio_path = "/Users/test/audio.wav";
    let test_title = "Test Meeting";
    
    println!("🧪 Testing save_transcript_to_database with audio path: {}", test_audio_path);
    
    let result = save_transcript_to_database(
        db_state,
        test_title.to_string(),
        "Test transcript".to_string(),
        vec![],
        None,
        Some(test_audio_path.to_string())
    ).await?;
    
    println!("🧪 Test result - Meeting ID: {}, Audio Path: {:?}", result.id, result.audio_file_path);
    
    Ok(format!("Test completed. Meeting ID: {}, Audio Path: {:?}", result.id, result.audio_file_path))
}

#[tauri::command]
async fn update_meeting(
    db_state: State<'_, DatabaseState>,
    meeting: Meeting
) -> Result<String, String> {
    let db_guard = db_state.get_db()?;
    let db = db_guard.as_ref()
        .ok_or("Database not initialized")?;
    
    db.update_meeting(&meeting)
        .map_err(|e| format!("Failed to update meeting: {}", e))?;
    
    Ok("Meeting updated successfully".to_string())
}

#[tauri::command]
async fn update_meeting_title(
    db_state: State<'_, DatabaseState>,
    id: String,
    title: String
) -> Result<String, String> {
    let db_guard = db_state.get_db()?;
    let db = db_guard.as_ref()
        .ok_or("Database not initialized")?;
    
    // Get the existing meeting
    let mut meeting = db.get_meeting(&id)
        .map_err(|e| format!("Failed to get meeting: {}", e))?
        .ok_or("Meeting not found")?;
    
    // Update the title
    meeting.title = title;
    
    // Save the updated meeting
    db.update_meeting(&meeting)
        .map_err(|e| format!("Failed to update meeting title: {}", e))?;
    
    Ok("Meeting title updated successfully".to_string())
}

#[tauri::command]
async fn update_meeting_transcript(
    db_state: State<'_, DatabaseState>,
    meeting_id: String,
    title: String,
    transcript: String,
    segments: Vec<TranscriptionSegment>,
    language: Option<String>,
    audio_file_path: Option<String>
) -> Result<Meeting, String> {
    // Debug logging
    println!("🔍 update_meeting_transcript called with:");
    println!("   meeting_id: {}", meeting_id);
    println!("   title: {}", title);
    println!("   transcript length: {}", transcript.len());
    println!("   segments count: {}", segments.len());
    println!("   language: {:?}", language);
    println!("   audio_file_path: {:?}", audio_file_path);
    
    // Initialize database if not already done
    db_state.initialize().ok();
    
    let db_guard = db_state.get_db()?;
    let db = db_guard.as_ref()
        .ok_or("Database not initialized")?;
    
    // Get the existing meeting
    let mut meeting = db.get_meeting(&meeting_id)
        .map_err(|e| format!("Failed to get meeting: {}", e))?
        .ok_or("Meeting not found")?;
    
    // Calculate duration from segments or audio file
    let duration_seconds = if !segments.is_empty() {
        // Use the end time of the last segment as total duration
        segments.iter().map(|s| s.end as i64).max().unwrap_or(0)
    } else if let Some(ref audio_path) = audio_file_path {
        // Try to get duration from audio file
        calculate_audio_duration(audio_path).unwrap_or(0)
    } else {
        0
    };
    
    // Update meeting with transcript, audio file path, and duration
    meeting.title = title;
    meeting.transcript = Some(transcript);
    meeting.audio_file_path = audio_file_path.clone();
    meeting.duration_seconds = Some(duration_seconds);
    meeting.language = language;
    
    println!("🔍 Before update_meeting:");
    println!("   meeting.id: {}", meeting.id);
    println!("   meeting.audio_file_path: {:?}", meeting.audio_file_path);
    println!("   meeting.duration_seconds: {:?}", meeting.duration_seconds);
    
    db.update_meeting(&meeting)
        .map_err(|e| format!("Failed to update meeting with transcript: {}", e))?;
    
    println!("✅ Meeting updated successfully");
    
    // Clear existing segments and add new ones
    db.delete_meeting_segments(&meeting_id)
        .map_err(|e| format!("Failed to delete existing segments: {}", e))?;
    
    // Add new segments to the meeting
    for segment in segments {
        let meeting_segment = MeetingSegment {
            id: uuid::Uuid::new_v4().to_string(),
            meeting_id: meeting.id.clone(),
            start_time: segment.start as f64,
            end_time: segment.end as f64,
            text: segment.text,
            confidence: None,
        };
        
        db.add_meeting_segment(&meeting_segment)
            .map_err(|e| format!("Failed to add meeting segment: {}", e))?;
    }
    
    Ok(meeting)
}

#[tauri::command]
async fn save_transcript_to_database(
    db_state: State<'_, DatabaseState>,
    title: String,
    transcript: String,
    segments: Vec<TranscriptionSegment>,
    language: Option<String>,
    audio_file_path: Option<String>
) -> Result<Meeting, String> {
    // Debug logging
    println!("🔍 save_transcript_to_database called with:");
    println!("   title: {}", title);
    println!("   transcript length: {}", transcript.len());
    println!("   segments count: {}", segments.len());
    println!("   language: {:?}", language);
    println!("   audio_file_path: {:?}", audio_file_path);
    
    // Initialize database if not already done
    db_state.initialize().ok();
    
    let db_guard = db_state.get_db()?;
    let db = db_guard.as_ref()
        .ok_or("Database not initialized")?;
    
    // Create a new meeting
    let mut meeting = db.create_meeting(title, language)
        .map_err(|e| format!("Failed to create meeting: {}", e))?;
    
    // Calculate duration from segments or audio file
    let duration_seconds = if !segments.is_empty() {
        // Use the end time of the last segment as total duration
        segments.iter().map(|s| s.end as i64).max().unwrap_or(0)
    } else if let Some(ref audio_path) = audio_file_path {
        // Try to get duration from audio file
        calculate_audio_duration(audio_path).unwrap_or(0)
    } else {
        0
    };
    
    // Update meeting with transcript, audio file path, and duration
    meeting.transcript = Some(transcript);
    meeting.audio_file_path = audio_file_path.clone();
    meeting.duration_seconds = Some(duration_seconds);
    
    println!("🔍 Before update_meeting:");
    println!("   meeting.id: {}", meeting.id);
    println!("   meeting.audio_file_path: {:?}", meeting.audio_file_path);
    println!("   meeting.duration_seconds: {:?}", meeting.duration_seconds);
    
    db.update_meeting(&meeting)
        .map_err(|e| format!("Failed to update meeting with transcript: {}", e))?;
    
    println!("✅ Meeting updated successfully");
    
    // Add segments to the meeting
    for segment in segments {
        let meeting_segment = MeetingSegment {
            id: uuid::Uuid::new_v4().to_string(),
            meeting_id: meeting.id.clone(),
            start_time: segment.start as f64,
            end_time: segment.end as f64,
            text: segment.text,
            confidence: None,
        };
        
        db.add_meeting_segment(&meeting_segment)
            .map_err(|e| format!("Failed to add meeting segment: {}", e))?;
    }
    
    Ok(meeting)
}

#[tauri::command]
async fn save_meeting_minutes_to_database(
    db_state: State<'_, DatabaseState>,
    meeting_id: String,
    meeting_minutes: String,
    ai_provider: String
) -> Result<String, String> {
    let db_guard = db_state.get_db()?;
    let db = db_guard.as_ref()
        .ok_or("Database not initialized")?;
    
    // Get the existing meeting
    let mut meeting = db.get_meeting(&meeting_id)
        .map_err(|e| format!("Failed to get meeting: {}", e))?
        .ok_or("Meeting not found")?;
    
    // Update meeting with minutes
    meeting.meeting_minutes = Some(meeting_minutes);
    meeting.ai_provider = Some(ai_provider);
    
    db.update_meeting(&meeting)
        .map_err(|e| format!("Failed to update meeting with minutes: {}", e))?;
    
    Ok("Meeting minutes saved to database successfully".to_string())
}

#[tauri::command]
async fn get_meeting(
    db_state: State<'_, DatabaseState>,
    id: String
) -> Result<Option<Meeting>, String> {
    let db_guard = db_state.get_db()?;
    let db = db_guard.as_ref()
        .ok_or("Database not initialized")?;
    
    let meeting = db.get_meeting(&id)
        .map_err(|e| format!("Failed to get meeting: {}", e))?;
    
    Ok(meeting)
}

#[tauri::command]
async fn get_all_meetings(
    db_state: State<'_, DatabaseState>
) -> Result<Vec<Meeting>, String> {
    let db_guard = db_state.get_db()?;
    let db = db_guard.as_ref()
        .ok_or("Database not initialized")?;
    
    let meetings = db.get_all_meetings()
        .map_err(|e| format!("Failed to get meetings: {}", e))?;
    
    Ok(meetings)
}

#[tauri::command]
async fn delete_meeting(
    db_state: State<'_, DatabaseState>,
    id: String
) -> Result<String, String> {
    let db_guard = db_state.get_db()?;
    let db = db_guard.as_ref()
        .ok_or("Database not initialized")?;
    
    // First, get the meeting to retrieve the audio file path
    let meeting = db.get_meeting(&id)
        .map_err(|e| format!("Failed to get meeting: {}", e))?;
    
    if let Some(meeting) = meeting {
        // Delete the audio file if it exists
        if let Some(audio_file_path) = &meeting.audio_file_path {
            if !audio_file_path.is_empty() {
                let audio_path = std::path::Path::new(audio_file_path);
                if audio_path.exists() {
                    match std::fs::remove_file(audio_path) {
                        Ok(_) => println!("✅ Deleted audio file: {}", audio_file_path),
                        Err(e) => {
                            // Log the error but don't fail the entire operation
                            println!("⚠️ Failed to delete audio file {}: {}", audio_file_path, e);
                        }
                    }
                } else {
                    println!("ℹ️ Audio file not found: {}", audio_file_path);
                }
            }
        }
    }
    
    // Delete the meeting from the database
    db.delete_meeting(&id)
        .map_err(|e| format!("Failed to delete meeting: {}", e))?;
    
    Ok("Meeting and associated files deleted successfully".to_string())
}

#[tauri::command]
async fn search_meetings(
    db_state: State<'_, DatabaseState>,
    query: String
) -> Result<Vec<Meeting>, String> {
    let db_guard = db_state.get_db()?;
    let db = db_guard.as_ref()
        .ok_or("Database not initialized")?;
    
    let meetings = db.search_meetings(&query)
        .map_err(|e| format!("Failed to search meetings: {}", e))?;
    
    Ok(meetings)
}

#[tauri::command]
async fn add_meeting_segment(
    db_state: State<'_, DatabaseState>,
    meeting_id: String,
    start_time: f64,
    end_time: f64,
    text: String,
    confidence: Option<f64>
) -> Result<String, String> {
    let db_guard = db_state.get_db()?;
    let db = db_guard.as_ref()
        .ok_or("Database not initialized")?;
    
    let segment = MeetingSegment {
        id: uuid::Uuid::new_v4().to_string(),
        meeting_id,
        start_time,
        end_time,
        text,
        confidence,
    };
    
    db.add_meeting_segment(&segment)
        .map_err(|e| format!("Failed to add meeting segment: {}", e))?;
    
    Ok("Meeting segment added successfully".to_string())
}

#[tauri::command]
async fn get_meeting_segments(
    db_state: State<'_, DatabaseState>,
    meeting_id: String
) -> Result<Vec<MeetingSegment>, String> {
    let db_guard = db_state.get_db()?;
    let db = db_guard.as_ref()
        .ok_or("Database not initialized")?;
    
    let segments = db.get_meeting_segments(&meeting_id)
        .map_err(|e| format!("Failed to get meeting segments: {}", e))?;
    
    Ok(segments)
}

#[tauri::command]
async fn get_audio_file_data(file_path: String) -> Result<Vec<u8>, String> {
    use std::fs;
    
    // Read the audio file
    let audio_data = fs::read(&file_path)
        .map_err(|e| format!("Failed to read audio file: {}", e))?;
    
    Ok(audio_data)
}

#[derive(Serialize, Deserialize)]
pub struct AudioQualityInfo {
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub duration_seconds: f64,
    pub file_size_bytes: u64,
    pub bitrate_kbps: u32,
}

#[tauri::command]
async fn get_audio_quality_info(file_path: String) -> Result<AudioQualityInfo, String> {
    use std::fs;
    
    if !std::path::Path::new(&file_path).exists() {
        return Err("Audio file not found".to_string());
    }
    
    let metadata = fs::metadata(&file_path)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;
    
    let reader = hound::WavReader::open(&file_path)
        .map_err(|e| format!("Failed to open audio file: {}", e))?;
    
    let spec = reader.spec();
    let duration_seconds = reader.duration() as f64 / spec.sample_rate as f64;
    let file_size_bytes = metadata.len();
    
    // Calculate bitrate (bits per second / 1000 for kbps)
    let bitrate_kbps = if duration_seconds > 0.0 {
        ((file_size_bytes * 8) as f64 / duration_seconds / 1000.0) as u32
    } else {
        0
    };
    
    Ok(AudioQualityInfo {
        sample_rate: spec.sample_rate,
        channels: spec.channels,
        bits_per_sample: spec.bits_per_sample,
        duration_seconds,
        file_size_bytes,
        bitrate_kbps,
    })
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ExportOptions {
    pub format: String, // "pdf", "txt", "json", "md"
    pub include_transcript: bool,
    pub include_audio: bool,
    pub include_summary: bool,
    pub include_segments: bool,
}

#[tauri::command]
async fn export_meeting_data(
    db_state: State<'_, DatabaseState>,
    meeting_id: String,
    options: ExportOptions
) -> Result<String, String> {
    let db_guard = db_state.get_db()?;
    let db = db_guard.as_ref()
        .ok_or("Database not initialized")?;
    
    // Get meeting data
    let meeting = db.get_meeting(&meeting_id)
        .map_err(|e| format!("Failed to get meeting: {}", e))?
        .ok_or("Meeting not found")?;
    
    let segments = if options.include_segments {
        db.get_meeting_segments(&meeting_id)
            .map_err(|e| format!("Failed to get meeting segments: {}", e))?
    } else {
        Vec::new()
    };
    
    // Create export directory
    let home_dir = dirs::home_dir()
        .ok_or("Could not find home directory")?;
    let export_dir = home_dir.join("Documents").join("MeetingRecorder").join("exports");
    std::fs::create_dir_all(&export_dir)
        .map_err(|e| format!("Failed to create export directory: {}", e))?;
    
    // Generate filename
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let safe_title = meeting.title.chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' { c } else { '_' })
        .collect::<String>()
        .replace(' ', "_");
    
    let filename = format!("{}_{}.{}", safe_title, timestamp, options.format);
    let file_path = export_dir.join(&filename);
    
    match options.format.as_str() {
        "txt" => export_as_txt(&meeting, &segments, &options, &file_path)?,
        "json" => export_as_json(&meeting, &segments, &options, &file_path)?,
        "md" => export_as_markdown(&meeting, &segments, &options, &file_path)?,
        _ => return Err(format!("Unsupported export format: {}", options.format)),
    }
    
    Ok(format!("Meeting data exported to: {}", file_path.display()))
}

fn export_as_txt(
    meeting: &Meeting,
    segments: &[MeetingSegment],
    options: &ExportOptions,
    file_path: &std::path::Path
) -> Result<(), String> {
    use std::fs::File;
    use std::io::Write;
    
    let mut file = File::create(file_path)
        .map_err(|e| format!("Failed to create export file: {}", e))?;
    
    // Header
    writeln!(file, "MEETING EXPORT").map_err(|e| format!("Write error: {}", e))?;
    writeln!(file, "==============").map_err(|e| format!("Write error: {}", e))?;
    writeln!(file).map_err(|e| format!("Write error: {}", e))?;
    writeln!(file, "Title: {}", meeting.title).map_err(|e| format!("Write error: {}", e))?;
    writeln!(file, "Date: {}", meeting.created_at).map_err(|e| format!("Write error: {}", e))?;
    writeln!(file, "Duration: {} seconds", meeting.duration_seconds.unwrap_or(0)).map_err(|e| format!("Write error: {}", e))?;
    if let Some(lang) = &meeting.language {
        writeln!(file, "Language: {}", lang).map_err(|e| format!("Write error: {}", e))?;
    }
    if let Some(provider) = &meeting.ai_provider {
        writeln!(file, "AI Provider: {}", provider).map_err(|e| format!("Write error: {}", e))?;
    }
    writeln!(file).map_err(|e| format!("Write error: {}", e))?;
    
    // Summary/Minutes
    if options.include_summary {
        if let Some(minutes) = &meeting.meeting_minutes {
            writeln!(file, "AI MEETING SUMMARY").map_err(|e| format!("Write error: {}", e))?;
            writeln!(file, "==================").map_err(|e| format!("Write error: {}", e))?;
            writeln!(file, "{}", minutes).map_err(|e| format!("Write error: {}", e))?;
            writeln!(file).map_err(|e| format!("Write error: {}", e))?;
        }
    }
    
    // Transcript
    if options.include_transcript {
        if let Some(transcript) = &meeting.transcript {
            writeln!(file, "FULL TRANSCRIPT").map_err(|e| format!("Write error: {}", e))?;
            writeln!(file, "===============").map_err(|e| format!("Write error: {}", e))?;
            writeln!(file, "{}", transcript).map_err(|e| format!("Write error: {}", e))?;
            writeln!(file).map_err(|e| format!("Write error: {}", e))?;
        }
    }
    
    // Segments
    if options.include_segments && !segments.is_empty() {
        writeln!(file, "TRANSCRIPT SEGMENTS").map_err(|e| format!("Write error: {}", e))?;
        writeln!(file, "===================").map_err(|e| format!("Write error: {}", e))?;
        for (i, segment) in segments.iter().enumerate() {
            writeln!(file, "[{}] {:.2}s - {:.2}s: {}", 
                     i + 1, segment.start_time, segment.end_time, segment.text).map_err(|e| format!("Write error: {}", e))?;
        }
        writeln!(file).map_err(|e| format!("Write error: {}", e))?;
    }
    
    // Audio info
    if options.include_audio {
        if let Some(audio_path) = &meeting.audio_file_path {
            writeln!(file, "AUDIO FILE").map_err(|e| format!("Write error: {}", e))?;
            writeln!(file, "==========").map_err(|e| format!("Write error: {}", e))?;
            writeln!(file, "File: {}", audio_path).map_err(|e| format!("Write error: {}", e))?;
        }
    }
    
    Ok(())
}

fn export_as_json(
    meeting: &Meeting,
    segments: &[MeetingSegment],
    options: &ExportOptions,
    file_path: &std::path::Path
) -> Result<(), String> {
    use std::fs::File;
    use std::io::Write;
    use serde_json::json;
    
    let mut export_data = json!({
        "meeting": {
            "id": meeting.id,
            "title": meeting.title,
            "created_at": meeting.created_at,
            "updated_at": meeting.updated_at,
            "duration_seconds": meeting.duration_seconds,
            "language": meeting.language,
            "ai_provider": meeting.ai_provider
        },
        "export_timestamp": chrono::Utc::now().to_rfc3339(),
        "export_options": options
    });
    
    if options.include_transcript {
        export_data["transcript"] = json!(meeting.transcript);
    }
    
    if options.include_summary {
        export_data["meeting_minutes"] = json!(meeting.meeting_minutes);
    }
    
    if options.include_audio {
        export_data["audio_file_path"] = json!(meeting.audio_file_path);
    }
    
    if options.include_segments && !segments.is_empty() {
        export_data["segments"] = json!(segments);
    }
    
    let mut file = File::create(file_path)
        .map_err(|e| format!("Failed to create export file: {}", e))?;
    
    let json_string = serde_json::to_string_pretty(&export_data)
        .map_err(|e| format!("Failed to serialize JSON: {}", e))?;
    
    file.write_all(json_string.as_bytes())
        .map_err(|e| format!("Failed to write JSON file: {}", e))?;
    
    Ok(())
}

fn export_as_markdown(
    meeting: &Meeting,
    segments: &[MeetingSegment],
    options: &ExportOptions,
    file_path: &std::path::Path
) -> Result<(), String> {
    use std::fs::File;
    use std::io::Write;
    
    let mut file = File::create(file_path)
        .map_err(|e| format!("Failed to create export file: {}", e))?;
    
    // Header
    writeln!(file, "# {}", meeting.title).map_err(|e| format!("Write error: {}", e))?;
    writeln!(file).map_err(|e| format!("Write error: {}", e))?;
    writeln!(file, "**Date:** {}", meeting.created_at).map_err(|e| format!("Write error: {}", e))?;
    writeln!(file, "**Duration:** {} seconds", meeting.duration_seconds.unwrap_or(0)).map_err(|e| format!("Write error: {}", e))?;
    if let Some(lang) = &meeting.language {
        writeln!(file, "**Language:** {}", lang).map_err(|e| format!("Write error: {}", e))?;
    }
    if let Some(provider) = &meeting.ai_provider {
        writeln!(file, "**AI Provider:** {}", provider).map_err(|e| format!("Write error: {}", e))?;
    }
    writeln!(file).map_err(|e| format!("Write error: {}", e))?;
    writeln!(file, "---").map_err(|e| format!("Write error: {}", e))?;
    writeln!(file).map_err(|e| format!("Write error: {}", e))?;
    
    // Summary/Minutes
    if options.include_summary {
        if let Some(minutes) = &meeting.meeting_minutes {
            writeln!(file, "## AI Meeting Summary").map_err(|e| format!("Write error: {}", e))?;
            writeln!(file).map_err(|e| format!("Write error: {}", e))?;
            writeln!(file, "{}", minutes).map_err(|e| format!("Write error: {}", e))?;
            writeln!(file).map_err(|e| format!("Write error: {}", e))?;
        }
    }
    
    // Transcript
    if options.include_transcript {
        if let Some(transcript) = &meeting.transcript {
            writeln!(file, "## Full Transcript").map_err(|e| format!("Write error: {}", e))?;
            writeln!(file).map_err(|e| format!("Write error: {}", e))?;
            writeln!(file, "{}", transcript).map_err(|e| format!("Write error: {}", e))?;
            writeln!(file).map_err(|e| format!("Write error: {}", e))?;
        }
    }
    
    // Segments
    if options.include_segments && !segments.is_empty() {
        writeln!(file, "## Transcript Segments").map_err(|e| format!("Write error: {}", e))?;
        writeln!(file).map_err(|e| format!("Write error: {}", e))?;
        for (i, segment) in segments.iter().enumerate() {
            writeln!(file, "### Segment {}", i + 1).map_err(|e| format!("Write error: {}", e))?;
            writeln!(file, "**Time:** {:.2}s - {:.2}s", segment.start_time, segment.end_time).map_err(|e| format!("Write error: {}", e))?;
            writeln!(file, "{}", segment.text).map_err(|e| format!("Write error: {}", e))?;
            writeln!(file).map_err(|e| format!("Write error: {}", e))?;
        }
    }
    
    // Audio info
    if options.include_audio {
        if let Some(audio_path) = &meeting.audio_file_path {
            writeln!(file, "## Audio File").map_err(|e| format!("Write error: {}", e))?;
            writeln!(file).map_err(|e| format!("Write error: {}", e))?;
            writeln!(file, "**File Path:** `{}`", audio_path).map_err(|e| format!("Write error: {}", e))?;
        }
    }
    
    Ok(())
}

#[tauri::command]
async fn debug_meeting_audio_paths(
    db_state: State<'_, DatabaseState>
) -> Result<String, String> {
    // Initialize database if not already done
    db_state.initialize().ok();
    
    let db_guard = db_state.get_db()?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    
    // Get all meetings
    let meetings = db.get_all_meetings()
        .map_err(|e| format!("Failed to get meetings: {}", e))?;
    
    let mut debug_info = Vec::new();
    debug_info.push(format!("Found {} meetings in database:", meetings.len()));
    
    for (i, meeting) in meetings.iter().enumerate() {
        let audio_status = match &meeting.audio_file_path {
            Some(path) => {
                // Check if file exists
                if std::path::Path::new(path).exists() {
                    format!("✅ Audio file exists: {}", path)
                } else {
                    format!("❌ Audio file missing: {}", path)
                }
            },
            None => "⚠️ No audio path stored".to_string()
        };
        
        debug_info.push(format!(
            "{}. Meeting: '{}' (ID: {}) - {}",
            i + 1,
            meeting.title,
            &meeting.id[..8],
            audio_status
        ));
    }
    
    Ok(debug_info.join("\n"))
}

#[tauri::command]
async fn update_audio_file_paths(
    db_state: State<'_, DatabaseState>
) -> Result<String, String> {
    // Initialize database if not already done
    db_state.initialize().ok();
    
    let db_guard = db_state.get_db()?;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    
    // Get all meetings
    let meetings = db.get_all_meetings()
        .map_err(|e| format!("Failed to get meetings: {}", e))?;
    
    // Get the recordings directory
    let home_dir = dirs::home_dir()
        .ok_or("Could not find home directory")?;
    let recordings_dir = home_dir.join("Documents").join("MeetingRecorder").join("MeetingRecordings");
    
    if !recordings_dir.exists() {
        return Ok("No recordings directory found".to_string());
    }
    
    // Read all audio files in the directory
    let audio_files: Vec<_> = std::fs::read_dir(&recordings_dir)
        .map_err(|e| format!("Failed to read recordings directory: {}", e))?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.extension()?.to_str()? == "wav" {
                Some(path)
            } else {
                None
            }
        })
        .collect();
    
    let mut updated_count = 0;
    let mut matched_count = 0;
    
    let mut debug_info = Vec::new();
    debug_info.push(format!("=== AUDIO FILE MATCHING DEBUG ==="));
    debug_info.push(format!("Found {} meetings to process", meetings.len()));
    debug_info.push(format!("Found {} audio files to scan", audio_files.len()));
    
    // Show first few audio files for debugging
    debug_info.push(format!("\nFirst 5 audio files:"));
    for (i, audio_file) in audio_files.iter().take(5).enumerate() {
        if let Some(filename) = audio_file.file_name().and_then(|n| n.to_str()) {
            debug_info.push(format!("  {}. {}", i + 1, filename));
        }
    }
    
    for mut meeting in meetings {
        // Skip if already has audio path
        if meeting.audio_file_path.is_some() && !meeting.audio_file_path.as_ref().unwrap().is_empty() {
            continue;
        }
        
        // Try to find matching audio file based on creation time
        // Convert meeting time to UTC for comparison (audio files might be in UTC)
        let meeting_utc = meeting.created_at.with_timezone(&chrono::Utc);
        let meeting_date = meeting.created_at.format("%Y%m%d").to_string();
        let meeting_hour = meeting_utc.hour();
        let meeting_minute = meeting_utc.minute();
        let meeting_second = meeting_utc.second();
        
        debug_info.push(format!("\n--- Processing Meeting: {} ---", meeting.title));
        debug_info.push(format!("Meeting date: {}", meeting_date));
        debug_info.push(format!("Meeting time (local): {:02}:{:02}:{:02}", meeting.created_at.hour(), meeting.created_at.minute(), meeting.created_at.second()));
        debug_info.push(format!("Meeting time (UTC): {:02}:{:02}:{:02}", meeting_hour, meeting_minute, meeting_second));
        debug_info.push(format!("Meeting created_at: {}", meeting.created_at));
        
        // Look for audio files that match the date and are close in time
        let mut best_match: Option<std::path::PathBuf> = None;
        let mut best_time_diff = i64::MAX;
        let mut candidates_found = 0;
        
        for audio_file in &audio_files {
            if let Some(filename) = audio_file.file_name().and_then(|n| n.to_str()) {
                // Parse filename like "recording_20250804_233559.wav"
                if filename.starts_with("recording_") && filename.contains(&meeting_date) {
                    candidates_found += 1;
                    debug_info.push(format!("  Candidate: {}", filename));
                    
                    // Extract time from filename
                    let parts: Vec<&str> = filename.split('_').collect();
                    if parts.len() >= 3 {
                        let file_time_str = parts[2].replace(".wav", "");
                        
                        // Parse HHMMSS format
                        if file_time_str.len() == 6 {
                            if let (Ok(file_hour), Ok(file_minute), Ok(file_second)) = (
                                file_time_str[0..2].parse::<u32>(),
                                file_time_str[2..4].parse::<u32>(),
                                file_time_str[4..6].parse::<u32>()
                            ) {
                                // Calculate time difference in seconds
                                let meeting_total_seconds = (meeting_hour * 3600 + meeting_minute * 60 + meeting_second) as i64;
                                let file_total_seconds = (file_hour * 3600 + file_minute * 60 + file_second) as i64;
                                let time_diff = (meeting_total_seconds - file_total_seconds).abs();
                                
                                debug_info.push(format!("    File time: {:02}:{:02}:{:02}, diff: {} seconds", file_hour, file_minute, file_second, time_diff));
                                
                                if time_diff < best_time_diff {
                                    best_time_diff = time_diff;
                                    best_match = Some(audio_file.clone());
                                }
                            }
                        }
                    }
                }
            }
        }
        
        debug_info.push(format!("  Found {} candidates for date {}", candidates_found, meeting_date));
        
        // If we found a match within reasonable time range (e.g., 30 minutes = 1800 seconds)
        if let Some(matched_file) = best_match {
            debug_info.push(format!("  Best match: {} (diff: {} seconds)", matched_file.file_name().unwrap().to_str().unwrap(), best_time_diff));
            
            if best_time_diff < 1800 {
                meeting.audio_file_path = Some(matched_file.to_string_lossy().to_string());
                
                // Update the meeting in the database
                db.update_meeting(&meeting)
                    .map_err(|e| format!("Failed to update meeting {}: {}", meeting.id, e))?;
                
                updated_count += 1;
                matched_count += 1;
                debug_info.push(format!("  ✅ MATCHED and updated!"));
            } else {
                debug_info.push(format!("  ❌ Time difference too large ({}s > 1800s)", best_time_diff));
            }
        } else {
            debug_info.push(format!("  ❌ No matching audio file found"));
        }
    }
    
    debug_info.push(format!("\n=== SUMMARY ==="));
    debug_info.push(format!("Scanned {} audio files, matched and updated {} meetings with audio paths", audio_files.len(), updated_count));
    
    Ok(debug_info.join("\n"))
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
        .manage(DatabaseState::default())
        .invoke_handler(tauri::generate_handler![
            start_recording, 
            stop_recording, 
            save_files,
            save_transcript_to_file,
            save_uploaded_audio,
            get_audio_devices,
            set_audio_devices,
            get_selected_devices,
            test_microphone_access,
            test_audio_system,
            initialize_whisper,
            transcribe_audio,
            transcribe_audio_with_segments,
            enable_realtime_transcription,
            disable_realtime_transcription,
            get_recording_status,
            generate_meeting_minutes,
            generate_meeting_minutes_ollama,
            save_meeting_minutes,
            get_gain_settings,
            set_gain_settings,
            // Database commands
            initialize_database,
            create_meeting,
            update_meeting,
            update_meeting_title,
            get_meeting,
            get_all_meetings,
            delete_meeting,
            search_meetings,
            add_meeting_segment,
            get_meeting_segments,
            save_transcript_to_database,
            update_meeting_transcript,
            save_meeting_minutes_to_database,
            get_audio_file_data,
            get_audio_quality_info,
            export_meeting_data,
            debug_meeting_audio_paths,
            update_audio_file_paths,
            test_save_audio_path,
            greet
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
