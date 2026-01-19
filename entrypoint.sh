#!/bin/bash

cd "$SERVER_HOME"

# Machine-id handling (needed for encrypted credential storage)
# Some systems (ZimaOS, CasaOS) can't mount /etc/machine-id:ro
# We persist it in server folder to survive container restarts
setup_machine_id() {
    local PERSISTENT_ID="$SERVER_HOME/.machine-id"
    
    # 1. Try to restore from persistent copy first
    if [ -f "$PERSISTENT_ID" ] && [ -s "$PERSISTENT_ID" ]; then
        echo "[HYTALE] Restoring machine-id from persistent storage..."
        cat "$PERSISTENT_ID" > /etc/machine-id
        chmod 444 /etc/machine-id
        return 0
    fi
    
    # 2. Check if host machine-id is valid (mounted)
    if [ -s /etc/machine-id ] && [ "$(wc -c < /etc/machine-id)" -ge 32 ]; then
        echo "[HYTALE] Using host machine-id..."
        cp /etc/machine-id "$PERSISTENT_ID"
        chmod 444 /etc/machine-id
        return 0
    fi
    
    # 3. Generate new machine-id
    echo "[HYTALE] Generating new machine-id..."
    
    # Try dbus-uuidgen first (most reliable)
    if command -v dbus-uuidgen &> /dev/null; then
        dbus-uuidgen > /etc/machine-id
    # Fallback to systemd-machine-id-setup
    elif command -v systemd-machine-id-setup &> /dev/null; then
        systemd-machine-id-setup
    # Last resort: generate from /proc
    else
        cat /proc/sys/kernel/random/uuid | tr -d '-' > /etc/machine-id
    fi
    
    # Verify and persist
    if [ -s /etc/machine-id ] && [ "$(wc -c < /etc/machine-id)" -ge 32 ]; then
        cp /etc/machine-id "$PERSISTENT_ID"
        chmod 444 /etc/machine-id
        echo "[HYTALE] Machine-id: $(cat /etc/machine-id)"
        return 0
    else
        echo "[HYTALE] WARNING: Failed to setup machine-id. Encrypted auth may not work."
        return 1
    fi
}

setup_machine_id

# Fix permissions on mounted volumes (runs as root)
chown -R hytale:hytale "$SERVER_HOME"

DOWNLOAD_FLAG="$SERVER_HOME/.download_attempted"
ARCH=$(uname -m)

# Check if files exist
if [ ! -f "HytaleServer.jar" ] || [ ! -f "Assets.zip" ]; then
    
    # Only attempt download once (skip on ARM64 - downloader is x64 only)
    if [ ! -f "$DOWNLOAD_FLAG" ] && [ "$AUTO_DOWNLOAD" = "true" ]; then
        if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
            echo "[HYTALE] Auto-download not available on ARM64. Please copy server files manually."
        elif command -v hytale-downloader &> /dev/null; then
            touch "$DOWNLOAD_FLAG"
            echo "[HYTALE] Server files not found. Attempting download..."
            hytale-downloader --download-path /tmp/hytale-game.zip 2>&1 || true
            
            if [ -f "/tmp/hytale-game.zip" ]; then
                echo "[HYTALE] Extracting..."
                unzip -o /tmp/hytale-game.zip -d /tmp/hytale-extract 2>/dev/null || true
                find /tmp/hytale-extract -name "HytaleServer.jar" -exec cp {} "$SERVER_HOME/" \; 2>/dev/null || true
                find /tmp/hytale-extract -name "Assets.zip" -exec cp {} "$SERVER_HOME/" \; 2>/dev/null || true
                rm -rf /tmp/hytale-game.zip /tmp/hytale-extract
                rm -f "$DOWNLOAD_FLAG"
                echo "[HYTALE] Download complete!"
            else
                echo "[HYTALE] Download failed (authentication required)."
            fi
        fi
    fi
fi

# If still missing, wait silently
if [ ! -f "HytaleServer.jar" ] || [ ! -f "Assets.zip" ]; then
    echo "[HYTALE] Waiting for files..."
    
    while true; do
        sleep 10
        if [ -f "HytaleServer.jar" ] && [ -f "Assets.zip" ]; then
            echo "[HYTALE] Files detected!"
            rm -f "$DOWNLOAD_FLAG"
            break
        fi
    done
fi

echo "[HYTALE] Starting server (RAM: ${JAVA_XMS}-${JAVA_XMX}, Port: ${BIND_PORT}/udp)"

# JVM flags
JAVA_FLAGS="-Xms${JAVA_XMS} -Xmx${JAVA_XMX}"

if [ "$USE_G1GC" = "true" ]; then
    JAVA_FLAGS="$JAVA_FLAGS \
        -XX:+UseG1GC \
        -XX:+ParallelRefProcEnabled \
        -XX:MaxGCPauseMillis=${MAX_GC_PAUSE_MILLIS:-200} \
        -XX:+UnlockExperimentalVMOptions \
        -XX:+DisableExplicitGC \
        -XX:G1NewSizePercent=${G1_NEW_SIZE_PERCENT:-30} \
        -XX:G1MaxNewSizePercent=${G1_MAX_NEW_SIZE_PERCENT:-40} \
        -XX:G1HeapRegionSize=${G1_HEAP_REGION_SIZE:-8M} \
        -XX:G1ReservePercent=20 \
        -XX:G1HeapWastePercent=5 \
        -XX:G1MixedGCCountTarget=4 \
        -XX:InitiatingHeapOccupancyPercent=15 \
        -XX:G1MixedGCLiveThresholdPercent=90 \
        -XX:G1RSetUpdatingPauseTimePercent=5 \
        -XX:SurvivorRatio=32 \
        -XX:+PerfDisableSharedMem \
        -XX:MaxTenuringThreshold=1"
fi

[ -f "HytaleServer.aot" ] && JAVA_FLAGS="$JAVA_FLAGS -XX:AOTCache=HytaleServer.aot"
[ -n "$JAVA_EXTRA_FLAGS" ] && JAVA_FLAGS="$JAVA_FLAGS $JAVA_EXTRA_FLAGS"

# Server args
SERVER_ARGS="--assets Assets.zip --bind ${BIND_ADDR}:${BIND_PORT}"
[ -n "$SERVER_EXTRA_ARGS" ] && SERVER_ARGS="$SERVER_ARGS $SERVER_EXTRA_ARGS"

# Command pipe for web panel
PIPE="/tmp/hytale-console"
rm -f "$PIPE"
mkfifo "$PIPE"
chmod 666 "$PIPE"

cleanup() {
    rm -f "$PIPE"
}
trap cleanup EXIT

# tail -f keeps pipe open, feeds stdin to java
tail -f "$PIPE" | gosu hytale java $JAVA_FLAGS -jar HytaleServer.jar $SERVER_ARGS
