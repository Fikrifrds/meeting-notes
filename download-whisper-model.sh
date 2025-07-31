#!/bin/bash

# Download Whisper Model Script
# This script downloads the Whisper base.en model for transcription

echo "🎙️ Meeting Recorder - Whisper Model Downloader"
echo "=============================================="

# Create the models directory
MODELS_DIR="$HOME/Documents/MeetingRecordings/models"
mkdir -p "$MODELS_DIR"

echo "📁 Models directory: $MODELS_DIR"

# Check if model already exists
MODEL_FILE="$MODELS_DIR/ggml-base.en.bin"
if [ -f "$MODEL_FILE" ]; then
    echo "✅ Whisper model already exists at: $MODEL_FILE"
    echo "   File size: $(du -h "$MODEL_FILE" | cut -f1)"
    exit 0
fi

echo "📥 Downloading Whisper base.en model..."
echo "   This may take a few minutes depending on your internet connection."

# Download the model
curl -L -o "$MODEL_FILE" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"

# Check if download was successful
if [ $? -eq 0 ] && [ -f "$MODEL_FILE" ]; then
    echo "✅ Successfully downloaded Whisper model!"
    echo "   Location: $MODEL_FILE"
    echo "   File size: $(du -h "$MODEL_FILE" | cut -f1)"
    echo ""
    echo "🚀 You can now use the transcription feature in Meeting Recorder!"
    echo "   1. Click 'Initialize Whisper' in the app"
    echo "   2. Record your audio"
    echo "   3. Click 'Transcribe Audio' to get the text"
else
    echo "❌ Failed to download the Whisper model."
    echo "   Please check your internet connection and try again."
    echo "   You can also manually download from:"
    echo "   https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"
    echo "   And save it to: $MODEL_FILE"
    exit 1
fi