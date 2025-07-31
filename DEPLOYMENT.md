# Deployment Guide

This guide covers building, packaging, and deploying the Meeting Recorder application for production use.

## Prerequisites for Deployment

### Code Signing Certificates

#### macOS
```bash
# For App Store distribution
# Requires Apple Developer Program membership ($99/year)
# Certificates needed:
# - Mac App Distribution
# - Mac Installer Distribution

# For direct distribution
# Requires Apple Developer ID
# Certificates needed:
# - Developer ID Application
# - Developer ID Installer
```

#### Windows
```bash
# Code signing certificate from trusted CA
# Options:
# - DigiCert
# - Sectigo (formerly Comodo)
# - GlobalSign
# - Self-signed (for testing only)
```

#### Linux
```bash
# GPG key for package signing
gpg --gen-key
gpg --export --armor your-email@example.com > public-key.asc
```

## Building for Production

### 1. Prepare the Build Environment

```bash
# Ensure clean state
npm run tauri clean
rm -rf node_modules package-lock.json
npm install

# Update dependencies
npm update
cd src-tauri
cargo update
cd ..

# Run tests (if available)
npm test
cd src-tauri
cargo test
cd ..
```

### 2. Configure Production Settings

#### Update Version Numbers

**package.json**:
```json
{
  "version": "1.0.0"
}
```

**src-tauri/Cargo.toml**:
```toml
[package]
version = "1.0.0"
```

**src-tauri/tauri.conf.json**:
```json
{
  "package": {
    "version": "1.0.0"
  }
}
```

#### Production Configuration

**src-tauri/tauri.conf.json**:
```json
{
  "tauri": {
    "bundle": {
      "identifier": "com.meeting-recorder.app",
      "category": "Productivity",
      "shortDescription": "AI-powered meeting recorder",
      "longDescription": "Record meetings with real-time AI transcription using Whisper",
      "copyright": "Copyright © 2024 Your Company",
      "licenseFile": "LICENSE",
      "targets": ["dmg", "app"],
      "macOS": {
        "minimumSystemVersion": "10.13",
        "signingIdentity": "Developer ID Application: Your Name (TEAM_ID)"
      },
      "windows": {
        "certificateThumbprint": "YOUR_CERTIFICATE_THUMBPRINT",
        "digestAlgorithm": "sha256",
        "timestampUrl": "http://timestamp.digicert.com"
      }
    }
  }
}
```

### 3. Build Production Bundles

```bash
# Build for current platform
npm run tauri build

# Build for specific platforms (if cross-compilation is set up)
npm run tauri build -- --target x86_64-apple-darwin
npm run tauri build -- --target aarch64-apple-darwin
npm run tauri build -- --target x86_64-pc-windows-msvc
npm run tauri build -- --target x86_64-unknown-linux-gnu
```

### 4. Build Output Locations

#### macOS
```
src-tauri/target/release/bundle/
├── dmg/
│   └── Meeting Recorder_1.0.0_x64.dmg
└── macos/
    └── Meeting Recorder.app/
```

#### Windows
```
src-tauri/target/release/bundle/
├── msi/
│   └── Meeting Recorder_1.0.0_x64_en-US.msi
└── nsis/
    └── Meeting Recorder_1.0.0_x64-setup.exe
```

#### Linux
```
src-tauri/target/release/bundle/
├── deb/
│   └── meeting-recorder_1.0.0_amd64.deb
├── rpm/
│   └── meeting-recorder-1.0.0-1.x86_64.rpm
└── appimage/
    └── meeting-recorder_1.0.0_amd64.AppImage
```

## Platform-Specific Deployment

### macOS Deployment

#### 1. Code Signing

```bash
# Sign the application
codesign --force --options runtime --sign "Developer ID Application: Your Name" \
  "src-tauri/target/release/bundle/macos/Meeting Recorder.app"

# Verify signing
codesign --verify --verbose "src-tauri/target/release/bundle/macos/Meeting Recorder.app"
spctl --assess --verbose "src-tauri/target/release/bundle/macos/Meeting Recorder.app"
```

#### 2. Notarization (Required for macOS 10.15+)

```bash
# Create a zip for notarization
ditto -c -k --keepParent "src-tauri/target/release/bundle/macos/Meeting Recorder.app" \
  "Meeting Recorder.zip"

# Submit for notarization
xcrun notarytool submit "Meeting Recorder.zip" \
  --apple-id "your-apple-id@example.com" \
  --password "app-specific-password" \
  --team-id "YOUR_TEAM_ID" \
  --wait

# Staple the notarization
xcrun stapler staple "src-tauri/target/release/bundle/macos/Meeting Recorder.app"
```

#### 3. DMG Creation

```bash
# Create DMG with custom background and layout
create-dmg \
  --volname "Meeting Recorder" \
  --volicon "src-tauri/icons/icon.icns" \
  --window-pos 200 120 \
  --window-size 800 400 \
  --icon-size 100 \
  --icon "Meeting Recorder.app" 200 190 \
  --hide-extension "Meeting Recorder.app" \
  --app-drop-link 600 185 \
  "Meeting Recorder_1.0.0.dmg" \
  "src-tauri/target/release/bundle/macos/"
```

#### 4. Distribution Options

**Direct Download**:
- Host DMG on your website
- Provide SHA256 checksum for verification
- Include installation instructions

**Mac App Store**:
- Use App Store Connect
- Follow App Store Review Guidelines
- Requires sandbox entitlements

### Windows Deployment

#### 1. Code Signing

```bash
# Sign the MSI installer
signtool sign /f "certificate.p12" /p "password" /t "http://timestamp.digicert.com" \
  "src-tauri/target/release/bundle/msi/Meeting Recorder_1.0.0_x64_en-US.msi"

# Verify signature
signtool verify /pa "src-tauri/target/release/bundle/msi/Meeting Recorder_1.0.0_x64_en-US.msi"
```

#### 2. Distribution Options

**Direct Download**:
- Host MSI on your website
- Provide installation instructions
- Include system requirements

**Microsoft Store**:
- Use Partner Center
- Convert to MSIX format
- Follow Microsoft Store policies

**Chocolatey**:
```powershell
# Create Chocolatey package
choco new meeting-recorder
# Edit package files
choco pack
choco push meeting-recorder.1.0.0.nupkg --source https://push.chocolatey.org/
```

### Linux Deployment

#### 1. Package Signing

```bash
# Sign DEB package
dpkg-sig --sign builder meeting-recorder_1.0.0_amd64.deb

# Sign RPM package
rpm --addsign meeting-recorder-1.0.0-1.x86_64.rpm
```

#### 2. Distribution Options

**APT Repository**:
```bash
# Set up repository structure
mkdir -p repo/dists/stable/main/binary-amd64
cp meeting-recorder_1.0.0_amd64.deb repo/dists/stable/main/binary-amd64/

# Create Packages file
cd repo
dpkg-scanpackages dists/stable/main/binary-amd64 /dev/null | gzip -9c > \
  dists/stable/main/binary-amd64/Packages.gz

# Create Release file
cd dists/stable
cat > Release << EOF
Origin: Your Repository
Label: Meeting Recorder
Suite: stable
Codename: stable
Architectures: amd64
Components: main
Description: Meeting Recorder Repository
EOF

# Sign Release file
gpg --clearsign -o InRelease Release
```

**Snap Store**:
```bash
# Create snapcraft.yaml
snapcraft init
# Edit snapcraft.yaml
snapcraft
snapcraft upload meeting-recorder_1.0.0_amd64.snap
```

**Flatpak**:
```bash
# Create flatpak manifest
flatpak-builder build-dir com.meeting-recorder.app.json
flatpak build-export repo build-dir
flatpak build-bundle repo meeting-recorder.flatpak com.meeting-recorder.app
```

## Continuous Integration/Deployment

### GitHub Actions

**.github/workflows/build.yml**:
```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        platform: [macos-latest, ubuntu-20.04, windows-latest]

    runs-on: ${{ matrix.platform }}

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: 18

    - name: Setup Rust
      uses: dtolnay/rust-toolchain@stable

    - name: Install dependencies (Ubuntu)
      if: matrix.platform == 'ubuntu-20.04'
      run: |
        sudo apt-get update
        sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.0-dev libayatana-appindicator3-dev librsvg2-dev

    - name: Install frontend dependencies
      run: npm install

    - name: Build application
      run: npm run tauri build

    - name: Upload artifacts
      uses: actions/upload-artifact@v3
      with:
        name: ${{ matrix.platform }}-build
        path: src-tauri/target/release/bundle/
```

### Automated Release

**.github/workflows/release.yml**:
```yaml
name: Release

on:
  workflow_run:
    workflows: ["Build and Release"]
    types:
      - completed

jobs:
  release:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}

    steps:
    - name: Download artifacts
      uses: actions/download-artifact@v3

    - name: Create Release
      uses: softprops/action-gh-release@v1
      with:
        files: |
          macos-latest-build/**/*.dmg
          windows-latest-build/**/*.msi
          ubuntu-20.04-build/**/*.deb
          ubuntu-20.04-build/**/*.AppImage
        generate_release_notes: true
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Security Considerations

### Code Signing Best Practices

1. **Certificate Security**:
   - Store certificates securely
   - Use hardware security modules (HSM) for production
   - Rotate certificates before expiration

2. **Build Environment**:
   - Use clean, isolated build environments
   - Verify all dependencies
   - Scan for vulnerabilities

3. **Distribution**:
   - Use HTTPS for all downloads
   - Provide checksums for verification
   - Sign all packages and installers

### Application Security

1. **Permissions**:
   - Request minimal required permissions
   - Document all permission usage
   - Regular security audits

2. **Updates**:
   - Implement secure update mechanism
   - Verify update signatures
   - Provide rollback capability

## Quality Assurance

### Pre-Release Testing

```bash
# Automated testing checklist
./scripts/test-all-platforms.sh

# Manual testing checklist
# - Fresh installation on clean systems
# - All features work as expected
# - Performance meets requirements
# - No memory leaks or crashes
# - Proper error handling
# - Accessibility compliance
```

### Beta Testing

1. **Internal Testing**:
   - Test on multiple devices
   - Different OS versions
   - Various hardware configurations

2. **External Beta**:
   - Limited user group
   - Feedback collection
   - Issue tracking and resolution

## Release Process

### 1. Pre-Release Checklist

- [ ] All tests passing
- [ ] Documentation updated
- [ ] Version numbers incremented
- [ ] Changelog updated
- [ ] Security scan completed
- [ ] Performance benchmarks met

### 2. Release Steps

```bash
# 1. Create release branch
git checkout -b release/v1.0.0

# 2. Update version numbers
# Edit package.json, Cargo.toml, tauri.conf.json

# 3. Build and test
npm run tauri build
# Test all platforms

# 4. Create git tag
git tag -a v1.0.0 -m "Release version 1.0.0"

# 5. Push to repository
git push origin v1.0.0

# 6. Create GitHub release
# Upload build artifacts
# Write release notes

# 7. Update distribution channels
# Website download links
# Package repositories
# App stores
```

### 3. Post-Release

- Monitor for issues
- Collect user feedback
- Plan next release
- Update documentation

## Monitoring and Analytics

### Crash Reporting

```rust
// Optional: Integrate crash reporting
// Use services like Sentry, Bugsnag, or custom solution
```

### Usage Analytics

```typescript
// Optional: Privacy-respecting analytics
// Track feature usage, performance metrics
// Always with user consent
```

### Update Mechanism

```rust
// Future: Implement auto-updater
// Use Tauri's updater plugin
// Secure signature verification
```

## Support and Maintenance

### User Support

1. **Documentation**:
   - User manual
   - FAQ section
   - Troubleshooting guide

2. **Support Channels**:
   - GitHub issues
   - Email support
   - Community forum

### Maintenance Schedule

- **Security updates**: As needed
- **Bug fixes**: Monthly
- **Feature updates**: Quarterly
- **Major releases**: Annually

## Legal Considerations

### Licensing

- Choose appropriate license (MIT, Apache, GPL, etc.)
- Include license file in distribution
- Respect third-party licenses

### Privacy Policy

- Document data collection practices
- Explain local processing
- User rights and controls

### Terms of Service

- Usage guidelines
- Liability limitations
- Support commitments

## Backup and Recovery

### Source Code

- Multiple repository mirrors
- Regular backups
- Version control best practices

### Build Artifacts

- Archive release builds
- Maintain build reproducibility
- Document build environments

### Certificates and Keys

- Secure storage
- Regular rotation
- Recovery procedures