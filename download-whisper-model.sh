#!/bin/bash

# Download Whisper Model Script
# This script downloads Whisper models for transcription with options for different accuracy levels

echo "🎙️ Meeting Recorder - Whisper Model Downloader"
echo "=============================================="

# Create the models directory
MODELS_DIR="$HOME/Documents/MeetingRecordings/models"
mkdir -p "$MODELS_DIR"

echo "📁 Models directory: $MODELS_DIR"

# Model options (using arrays for compatibility)
# Prioritizing multilingual models for Indonesian support
MODEL_KEYS=("large-v3" "medium" "small" "large-v3-turbo" "small.en" "medium.en" "base.en")
MODEL_URLS=("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin"
           "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin"
           "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"
           "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin" 
           "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin"
           "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin"
           "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin")
MODEL_DESCRIPTIONS=("🌍 Large V3 Multilingual (RECOMMENDED: Best for Indonesian)"
                    "🌍 Medium Multilingual (Good balance for Indonesian)"
                    "🌍 Small Multilingual (Faster, good for Indonesian)"
                    "⚡ Large V3 Turbo (English only - may hallucinate on Indonesian)"
                    "🎯 Small English (English only)"
                    "🏆 Medium English (English only)"
                    "📦 Base English (English only)")
MODEL_SIZES=("3.1GB" "1.5GB" "466MB" "1.5GB" "466MB" "1.5GB" "142MB")

# Function to download a model
download_model() {
    local model_key="$1"
    local index=-1
    
    # Find the index of the model
    for i in "${!MODEL_KEYS[@]}"; do
        if [[ "${MODEL_KEYS[$i]}" == "$model_key" ]]; then
            index=$i
            break
        fi
    done
    
    if [ $index -eq -1 ]; then
        echo "❌ Unknown model: $model_key"
        return 1
    fi
    
    local url="${MODEL_URLS[$index]}"
    local description="${MODEL_DESCRIPTIONS[$index]}"
    local size="${MODEL_SIZES[$index]}"
    local filename="ggml-${model_key}.bin"
    local filepath="$MODELS_DIR/$filename"
    
    echo ""
    echo "📥 Downloading $description"
    echo "   Size: $size"
    echo "   File: $filename"
    echo "   This may take a few minutes depending on your internet connection."
    
    if curl -L -o "$filepath" "$url"; then
        echo "✅ Download completed successfully!"
        echo "   Model saved to: $filepath"
        echo "   File size: $(du -h "$filepath" | cut -f1)"
        
        # Verify the file
        if [ -f "$filepath" ] && [ -s "$filepath" ]; then
            echo "✅ Model file verified and ready to use!"
            return 0
        else
            echo "❌ Error: Downloaded file appears to be empty or corrupted"
            rm -f "$filepath"
            return 1
        fi
    else
        echo "❌ Download failed for $filename"
        return 1
    fi
}

# Check for command line argument
if [ $# -eq 1 ]; then
    MODEL_CHOICE="$1"
else
    # Check if any model already exists
    for model_key in "${MODEL_KEYS[@]}"; do
        filename="ggml-${model_key}.bin"
        filepath="$MODELS_DIR/$filename"
        if [ -f "$filepath" ]; then
            echo "✅ Found existing model: $filename"
            echo "   File size: $(du -h "$filepath" | cut -f1)"
            echo "   Location: $filepath"
            echo ""
            echo "🎉 You're all set! The application will automatically use the best available model."
            exit 0
        fi
    done
    
    # No models found, show menu
    echo ""
    echo "🤔 No Whisper models found. Please choose which model to download:"
    echo ""
    echo "FOR INDONESIAN SUPPORT (RECOMMENDED):"
    echo "1) large-v3 (BEST) - Best accuracy for Indonesian (3.1GB)"
    echo "2) medium - Good balance for Indonesian (1.5GB)"
    echo "3) small - Faster, good for Indonesian (466MB)"
    echo ""
    echo "FOR ENGLISH ONLY:"
    echo "4) large-v3-turbo - Fast but may hallucinate on Indonesian (1.5GB)"
    echo "5) small.en - English only (466MB)"
    echo "6) medium.en - English only (1.5GB)"
    echo "7) base.en - English only (142MB)"
    echo "8) Download all models"
    echo ""
    read -p "Enter your choice (1-8): " choice
    
    case $choice in
        1) MODEL_CHOICE="large-v3" ;;
        2) MODEL_CHOICE="medium" ;;
        3) MODEL_CHOICE="small" ;;
        4) MODEL_CHOICE="large-v3-turbo" ;;
        5) MODEL_CHOICE="small.en" ;;
        6) MODEL_CHOICE="medium.en" ;;
        7) MODEL_CHOICE="base.en" ;;
        8) MODEL_CHOICE="all" ;;
        *) echo "❌ Invalid choice. Exiting."; exit 1 ;;
    esac
fi

# Function to check if model is valid
is_valid_model() {
    local model="$1"
    for key in "${MODEL_KEYS[@]}"; do
        if [[ "$key" == "$model" ]]; then
            return 0
        fi
    done
    return 1
}

# Download the selected model(s)
if [ "$MODEL_CHOICE" = "all" ]; then
    echo "📦 Downloading all models..."
    for model_key in "${MODEL_KEYS[@]}"; do
        download_model "$model_key"
    done
else
    if is_valid_model "$MODEL_CHOICE"; then
        download_model "$MODEL_CHOICE"
    else
        echo "❌ Invalid model choice: $MODEL_CHOICE"
        echo "   Valid options: ${MODEL_KEYS[*]}"
        exit 1
    fi
fi

echo ""
echo "🎉 Model download completed!"
echo "   The application will automatically use the best available model."
echo "   You can now start the Meeting Recorder application."