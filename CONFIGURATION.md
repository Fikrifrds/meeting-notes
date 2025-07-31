# Configuration Reference

This document provides a comprehensive reference for all configuration files in the Meeting Recorder application.

## Tauri Configuration (`src-tauri/tauri.conf.json`)

### Complete Configuration

```json
{
  "$schema": "../node_modules/@tauri-apps/cli/schema.json",
  "build": {
    "beforeBuildCommand": "npm run build",
    "beforeDevCommand": "npm run dev",
    "devPath": "http://localhost:1420",
    "distDir": "../dist"
  },
  "package": {
    "productName": "Meeting Recorder",
    "version": "0.1.0"
  },
  "tauri": {
    "allowlist": {
      "all": false,
      "shell": {
        "all": false,
        "open": true
      }
    },
    "bundle": {
      "active": true,
      "category": "DeveloperTool",
      "copyright": "",
      "deb": {
        "depends": []
      },
      "externalBin": [],
      "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.icns",
        "icons/icon.ico"
      ],
      "identifier": "com.meeting-recorder.app",
      "longDescription": "",
      "macOS": {
        "entitlements": null,
        "exceptionDomain": "",
        "frameworks": [],
        "providerShortName": null,
        "signingIdentity": null
      },
      "resources": [],
      "shortDescription": "",
      "targets": "all",
      "windows": {
        "certificateThumbprint": null,
        "digestAlgorithm": "sha256",
        "timestampUrl": ""
      }
    },
    "security": {
      "csp": "default-src 'self'; img-src 'self' asset: https://asset.localhost"
    },
    "updater": {
      "active": false
    },
    "windows": [
      {
        "fullscreen": false,
        "height": 600,
        "resizable": true,
        "title": "Meeting Recorder",
        "width": 800
      }
    ],
    "plugins": {
      "opener": {
        "requireLiteralLeadingDot": false
      }
    }
  }
}
```

### Key Configuration Sections

#### Build Configuration
- **beforeDevCommand**: Command to run before starting development
- **devPath**: URL for development server
- **distDir**: Directory containing built frontend files

#### Package Information
- **productName**: Display name of the application
- **version**: Application version (follows semantic versioning)

#### Security Settings
- **CSP**: Content Security Policy for web content
- **allowlist**: Permissions for Tauri APIs

#### Window Configuration
- **width/height**: Default window dimensions
- **resizable**: Whether window can be resized
- **title**: Window title bar text

#### Plugin Configuration
- **opener**: File/URL opening capabilities
- **requireLiteralLeadingDot**: Security setting for file paths

## Capabilities Configuration (`src-tauri/capabilities/default.json`)

### Complete Configuration

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": [
    "main"
  ],
  "permissions": [
    "core:default",
    "core:app:default",
    "core:event:default",
    "core:window:default",
    "core:app:allow-app-hide",
    "core:app:allow-app-show",
    "opener:default"
  ]
}
```

### Permission Explanations

#### Core Permissions
- **core:default**: Basic Tauri functionality
- **core:app:default**: Application lifecycle management
- **core:event:default**: Event system access
- **core:window:default**: Window management

#### Specific Permissions
- **core:app:allow-app-hide**: Hide application window
- **core:app:allow-app-show**: Show application window
- **opener:default**: Open files and URLs

## Vite Configuration (`vite.config.ts`)

### Complete Configuration

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
```

### Key Settings

#### Development Server
- **port**: Fixed port 1420 (required by Tauri)
- **strictPort**: Fail if port is unavailable
- **clearScreen**: Prevent clearing terminal output

#### File Watching
- **ignored**: Exclude `src-tauri` from hot reload watching

## TypeScript Configuration

### Main Configuration (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### Node Configuration (`tsconfig.node.json`)

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

## Rust Configuration (`src-tauri/Cargo.toml`)

### Complete Configuration

```toml
[package]
name = "meeting-recorder"
version = "0.1.0"
description = "A Tauri App"
authors = ["you"]
license = ""
repository = ""
edition = "2021"

# See more keys and their definitions at https://doc.rust-lang.org/cargo/reference/manifest.html

[build-dependencies]
tauri-build = { version = "2.0", features = [] }

[dependencies]
tauri = { version = "2.0", features = ["shell-open"] }
tauri-plugin-opener = "2.0"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1.0", features = ["full"] }
cpal = "0.15"
hound = "3.5"
whisper-rs = { version = "0.10.0", features = ["metal"] }
chrono = { version = "0.4", features = ["serde"] }

[features]
# This feature is used for production builds or when `devPath` points to the filesystem
# DO NOT REMOVE!!
custom-protocol = ["tauri/custom-protocol"]
```

### Key Dependencies

#### Tauri Core
- **tauri**: Main framework with shell-open feature
- **tauri-plugin-opener**: File/URL opening plugin
- **tauri-build**: Build-time dependencies

#### Audio Processing
- **cpal**: Cross-platform audio library
- **hound**: WAV file handling
- **whisper-rs**: AI transcription with Metal acceleration

#### Utilities
- **tokio**: Async runtime
- **serde**: Serialization/deserialization
- **chrono**: Date/time handling

## Package Configuration (`package.json`)

### Complete Configuration

```json
{
  "name": "meeting-recorder",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-opener": "^2.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/react": "^18.2.15",
    "@types/react-dom": "^18.2.7",
    "@vitejs/plugin-react": "^4.0.3",
    "typescript": "^5.0.2",
    "vite": "^4.4.4"
  }
}
```

### Key Dependencies

#### Runtime Dependencies
- **@tauri-apps/api**: Tauri frontend bindings
- **@tauri-apps/plugin-opener**: Opener plugin frontend
- **react**: Frontend framework
- **react-dom**: React DOM rendering

#### Development Dependencies
- **@tauri-apps/cli**: Tauri CLI tools
- **typescript**: Type checking
- **vite**: Build tool and dev server
- **@vitejs/plugin-react**: React support for Vite

## VS Code Configuration (`.vscode/extensions.json`)

### Recommended Extensions

```json
{
  "recommendations": [
    "tauri-apps.tauri-vscode",
    "rust-lang.rust-analyzer"
  ]
}
```

### Extension Benefits
- **tauri-vscode**: Tauri-specific development features
- **rust-analyzer**: Advanced Rust language support

## Environment Variables

### Development Environment

```bash
# Rust compilation optimization
export CARGO_INCREMENTAL=1
export CARGO_BUILD_JOBS=4

# Logging levels
export RUST_LOG=debug
export TAURI_DEBUG=true

# Platform-specific optimizations (macOS)
export CARGO_TARGET_X86_64_APPLE_DARWIN_LINKER=clang
export CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER=clang
```

### Production Environment

```bash
# Optimize for release builds
export CARGO_PROFILE_RELEASE_LTO=true
export CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1
export CARGO_PROFILE_RELEASE_PANIC=abort
```

## Configuration Validation

### Checking Configuration

```bash
# Validate Tauri configuration
npm run tauri info

# Check TypeScript configuration
npx tsc --noEmit

# Validate Rust configuration
cd src-tauri
cargo check

# Verify all dependencies
npm audit
cargo audit
```

### Common Configuration Issues

#### Port Conflicts
```bash
# Check if port 1420 is available
lsof -i :1420

# Kill conflicting processes
pkill -f "1420"
```

#### Permission Issues
```bash
# Reset Tauri permissions (macOS)
tccutil reset All com.meeting-recorder.app

# Check file permissions
ls -la ~/Documents/MeetingRecordings/
```

#### Dependency Issues
```bash
# Update all dependencies
npm update
cd src-tauri
cargo update
```

## Security Considerations

### Content Security Policy
- Restricts resource loading to prevent XSS attacks
- Allows local assets and specific domains
- Should be updated when adding external resources

### Tauri Permissions
- Follow principle of least privilege
- Only enable required permissions
- Regularly audit permission usage

### File System Access
- Limit file access to necessary directories
- Validate file paths and extensions
- Use Tauri's secure file APIs

## Performance Tuning

### Development Performance
```toml
# In Cargo.toml, add optimization for dependencies
[profile.dev.package."*"]
opt-level = 2
```

### Production Performance
```toml
# In Cargo.toml, optimize release builds
[profile.release]
lto = true
codegen-units = 1
panic = "abort"
```

### Bundle Size Optimization
```json
// In tauri.conf.json, exclude unnecessary files
{
  "tauri": {
    "bundle": {
      "resources": [],
      "externalBin": []
    }
  }
}
```

## Troubleshooting Configuration

### Configuration File Validation
1. **JSON Syntax**: Use JSON validators for `.json` files
2. **TOML Syntax**: Use TOML validators for `.toml` files
3. **TypeScript**: Run `tsc --noEmit` to check types

### Common Fixes
```bash
# Reset to default configuration
git checkout HEAD -- src-tauri/tauri.conf.json

# Regenerate lock files
rm package-lock.json src-tauri/Cargo.lock
npm install
cd src-tauri && cargo build
```

### Configuration Backup
```bash
# Backup working configuration
cp src-tauri/tauri.conf.json src-tauri/tauri.conf.json.backup
cp package.json package.json.backup
cp src-tauri/Cargo.toml src-tauri/Cargo.toml.backup
```