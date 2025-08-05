#!/bin/bash

# Script to move existing recordings to the new folder structure
# From: ~/Documents/MeetingRecordings
# To: ~/Documents/MeetingRecorder/MeetingRecordings

OLD_DIR="$HOME/Documents/MeetingRecordings"
NEW_DIR="$HOME/Documents/MeetingRecorder/MeetingRecordings"

echo "🔄 Moving recordings to new folder structure..."

# Check if old directory exists
if [ ! -d "$OLD_DIR" ]; then
    echo "✅ No old recordings directory found at $OLD_DIR"
    echo "📁 Creating new directory structure at $NEW_DIR"
    mkdir -p "$NEW_DIR"
    mkdir -p "$NEW_DIR/models"
    exit 0
fi

# Create new directory structure
echo "📁 Creating new directory: $NEW_DIR"
mkdir -p "$NEW_DIR"

# Move all files from old to new location
echo "📦 Moving files from $OLD_DIR to $NEW_DIR"
if [ "$(ls -A "$OLD_DIR" 2>/dev/null)" ]; then
    mv "$OLD_DIR"/* "$NEW_DIR/" 2>/dev/null || true
    echo "✅ Files moved successfully"
else
    echo "ℹ️  No files to move"
fi

# Remove old directory if empty
if [ -d "$OLD_DIR" ] && [ ! "$(ls -A "$OLD_DIR" 2>/dev/null)" ]; then
    rmdir "$OLD_DIR"
    echo "🗑️  Removed empty old directory"
fi

echo "✅ Migration complete!"
echo "📁 New recordings location: $NEW_DIR"

# List contents of new directory
if [ -d "$NEW_DIR" ]; then
    echo ""
    echo "📋 Contents of new directory:"
    ls -la "$NEW_DIR"
fi