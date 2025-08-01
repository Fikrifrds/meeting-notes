use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use std::path::PathBuf;
use chrono::{DateTime, Utc};
use whisper_rs::{WhisperContext, WhisperContextParameters};
use std::thread;
use std::sync::mpsc;
use std::time::Duration;
use serde::{Deserialize, Serialize};


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
            chunk_size: 16000 * 30, // 30 seconds at 16kHz
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
    
    let host = cpal::default_host();
    let mut input_devices = Vec::new();
    let mut output_devices = Vec::new();
    
    // Get default devices for comparison
    let default_input = host.default_input_device();
    let default_output = host.default_output_device();
    
    // Get input devices
    let inputs = host.input_devices()
        .map_err(|e| format!("Failed to enumerate input devices: {}", e))?;
    
    for device in inputs {
        match device.name() {
            Ok(name) => {
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
            Err(_) => {
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
    let models_dir = home_dir.join("Documents").join("MeetingRecordings").join("models");
    std::fs::create_dir_all(&models_dir).map_err(|e| e.to_string())?;
    
    let model_path = models_dir.join("ggml-base.en.bin");
    
    if !model_path.exists() {
        return Err(format!(
            "Whisper model not found at: {}\nPlease download ggml-base.en.bin from https://huggingface.co/ggerganov/whisper.cpp/tree/main", 
            model_path.display()
        ));
    }
    
    // Initialize Whisper context
    let ctx_params = WhisperContextParameters::default();
    let ctx = WhisperContext::new_with_params(&model_path.to_string_lossy(), ctx_params)
        .map_err(|e| format!("Failed to initialize Whisper: {}", e))?;
    
    *whisper_context = Some(ctx);
    Ok("Whisper initialized successfully".to_string())
}

#[tauri::command]
async fn transcribe_audio(state: State<'_, AudioState>, audio_path: String) -> Result<String, String> {
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
        match transcribe_with_whisper(ctx, &audio_data) {
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

fn transcribe_with_whisper(ctx: &WhisperContext, audio_data: &[f32]) -> Result<String, String> {
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
    params.set_language(Some("en")); // Set to English (can be made configurable)
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
async fn start_recording(state: State<'_, AudioState>, app_handle: AppHandle) -> Result<String, String> {
    let mut is_recording = state.is_recording.lock().map_err(|e| e.to_string())?;
    let mut start_time = state.start_time.lock().map_err(|e| e.to_string())?;
    let mut output_path = state.output_path.lock().map_err(|e| e.to_string())?;
    let mut recording_data = state.recording_data.lock().map_err(|e| e.to_string())?;
    
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
    
    Ok(format!("Recording started: {}", file_path.display()))
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
    println!("Using microphone: {}", mic_name);
    
    // Get microphone configuration
    let mic_config = mic_device.default_input_config()
        .map_err(|e| format!("Failed to get microphone config: {}. Please check microphone permissions.", e))?;
    
    println!("Microphone config: {:?}", mic_config);
    
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
        // Auto-detect system audio device (original logic)
        let auto_device = host.output_devices()
            .map_err(|e| format!("Failed to enumerate output devices: {}", e))?
            .find(|device| {
                if let Ok(name) = device.name() {
                    // Look for system audio/loopback devices
                    name.to_lowercase().contains("loopback") || 
                    name.to_lowercase().contains("system") ||
                    name.to_lowercase().contains("stereo mix") ||
                    name.to_lowercase().contains("what u hear")
                } else {
                    false
                }
            });
        
        // If no dedicated loopback device, try to use default output as input (macOS specific)
        auto_device.or_else(|| {
            // On macOS, we might need to use a different approach
            host.input_devices().ok()?.find(|device| {
                if let Ok(name) = device.name() {
                    name.to_lowercase().contains("soundflower") ||
                    name.to_lowercase().contains("blackhole") ||
                    name.to_lowercase().contains("loopback")
                } else {
                    false
                }
            })
        })
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
                                match transcribe_with_whisper(ctx, &chunk) {
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

#[tauri::command]
async fn stop_recording(state: State<'_, AudioState>) -> Result<String, String> {
    let mut is_recording = state.is_recording.lock().map_err(|e| e.to_string())?;
    let mut start_time = state.start_time.lock().map_err(|e| e.to_string())?;
    let output_path = state.output_path.lock().map_err(|e| e.to_string())?;
    let recording_data = state.recording_data.lock().map_err(|e| e.to_string())?;
    
    if !*is_recording {
        return Err("Not currently recording".to_string());
    }
    
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
        
        Ok(format!("Recording stopped and saved: {}", path.display()))
    } else {
        Ok("Recording stopped".to_string())
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
    let output_dir = home_dir.join("Documents").join("MeetingRecordings");
    
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
async fn generate_meeting_minutes(transcript: String) -> Result<String, String> {
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

    // Create the prompt for meeting minutes
    let system_prompt = r#"You are an expert meeting assistant. Transform the following meeting transcript into well-structured meeting minutes. Include:

1. **Meeting Summary** - Brief overview of the meeting
2. **Key Discussion Points** - Main topics discussed
3. **Decisions Made** - Any decisions or conclusions reached
4. **Action Items** - Tasks assigned with responsible parties (if mentioned)
5. **Next Steps** - Follow-up actions or future meetings

Format the output in clear, professional language with proper headings and bullet points. If specific names or roles aren't mentioned, use generic terms like "Participant A", "Team Member", etc."#;

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
    
    // Add simple metadata header
    let now = chrono::Utc::now();
    let formatted_minutes = format!(
        "# Meeting Minutes\n\n**Generated:** {}\n**Source:** Audio Transcript\n\n---\n\n{}",
        now.format("%Y-%m-%d %H:%M:%S UTC"),
        meeting_minutes
    );

    Ok(formatted_minutes)
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
    let output_dir = home_dir.join("Documents").join("MeetingRecordings");
    
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

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AudioState::default())
        .invoke_handler(tauri::generate_handler![
            start_recording, 
            stop_recording, 
            save_files,
            save_transcript_to_file,
            get_audio_devices,
            set_audio_devices,
            get_selected_devices,
            initialize_whisper,
            transcribe_audio,
            enable_realtime_transcription,
            disable_realtime_transcription,
            get_recording_status,
            generate_meeting_minutes,
            save_meeting_minutes,
            get_gain_settings,
            set_gain_settings,
            greet
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
