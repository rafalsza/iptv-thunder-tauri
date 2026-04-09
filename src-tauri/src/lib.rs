// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
async fn stalker_request(
    url: String,
    method: String,
    headers: Option<Vec<String>>,
    body: Option<String>,
) -> Result<String, String> {
    use reqwest;

    let client = reqwest::Client::new();

    let http_method = match method.as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        _ => return Err("Invalid method".to_string()),
    };

    let mut request = client.request(http_method, &url);

    // Extract MAC from URL query parameters with proper URL decoding
    let mut mac_address = String::new();

    if let Some(mac_start) = url.find("mac=") {
        let mac_end = url[mac_start..]
            .find('&')
            .map(|i| i + mac_start)
            .unwrap_or(url.len());
        let mac_param = &url[mac_start..mac_end];
        mac_address = mac_param.trim_start_matches("mac=").to_string();
        mac_address = mac_address.replace("%3A", ":").replace("%3D", "=");
    }

    if mac_address.is_empty() {
        if let Some(cmd_start) = url.find("cmd=") {
            let cmd_end = url[cmd_start..]
                .find('&')
                .map(|i| i + cmd_start)
                .unwrap_or(url.len());
            let cmd_param = url[cmd_start..cmd_end].to_string();
            
            if let Some(mac_idx) = cmd_param.find("mac%3D") {
                let mac_start = mac_idx + 6;
                let mac_end = cmd_param[mac_start..].find("%26").unwrap_or(cmd_param.len());
                let mac_encoded = &cmd_param[mac_start..mac_start+mac_end];
                mac_address = mac_encoded.replace("%3A", ":");
            }
            else if let Some(mac_idx) = cmd_param.find("mac=") {
                let mac_start = mac_idx + 4;
                let mac_end = cmd_param[mac_start..].find(&['&', '%'][..]).unwrap_or(cmd_param.len());
                mac_address = cmd_param[mac_start..mac_start+mac_end].to_string();
            }
        }
    }

    let mut cookies: Vec<String> = Vec::new();
    
    if !mac_address.is_empty() {
        cookies.push(format!("mac={}", mac_address));
    }
    
    // Add headers from frontend
    let mut token = String::new();
    if let Some(ref headers_list) = headers {
        for header in headers_list {
            if header.starts_with("Authorization: Bearer ") {
                token = header
                    .trim_start_matches("Authorization: Bearer ")
                    .trim()
                    .to_string();
            }
            if let Some((key, value)) = header.split_once(':') {
                request = request.header(key.trim(), value.trim());
            }
        }
    }
    
    if !token.is_empty() {
        cookies.push(format!("stb_token={}", token));
    }
    
    cookies.push("stb_lang=en".to_string());
    cookies.push("timezone=Europe%2FWarsaw".to_string());
    
    let cookie_string = cookies.join("; ");
    request = request.header("Cookie", &cookie_string);

    // Add required Stalker headers
    request = request.header("Referer", &url);
    request = request.header("X-Requested-With", "XMLHttpRequest");
    request = request.header("Accept", "*/*");
    request = request.header("Accept-Language", "en-US,en;q=0.9");

    // Add body if provided
    if let Some(request_body) = body {
        request = request.body(request_body);
    }

    let response = request.send().await.map_err(|e| e.to_string())?;
    let response_text = response.text().await.map_err(|e| e.to_string())?;

    Ok(response_text)
}

#[tauri::command]
async fn fetch_image(url: String, timeout: u64) -> Result<serde_json::Value, String> {
    use reqwest;
    use serde_json::json;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(timeout))
        .build()
        .map_err(|e| e.to_string())?;

    let response_result = client
        .get(&url)
        .header("Accept", "image/*,*/*")
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .send()
        .await;

    match response_result {
        Ok(response) => {
            let status = response.status().as_u16();
            let headers: std::collections::HashMap<String, String> = response
                .headers()
                .iter()
                .filter_map(|(k, v)| {
                    v.to_str().ok().map(|s| (k.to_string(), s.to_string()))
                })
                .collect();

            let bytes = response.bytes().await.map_err(|e| e.to_string())?;
            let body: Vec<u8> = bytes.to_vec();

            Ok(json!({
                "status": status,
                "headers": headers,
                "body": body
            }))
        }
        Err(e) => {
            // Return error as 0 status so frontend can handle it gracefully
            // This prevents throwing errors for expected failures (404s, DNS failures, etc.)
            Ok(json!({
                "status": 0,
                "headers": {},
                "body": [],
                "error": e.to_string()
            }))
        }
    }
}

#[tauri::command]
async fn check_mpv_available() -> Result<bool, String> {
    Ok(true)
}

// ExoPlayer commands - on Android these invoke the native Kotlin plugin
// On desktop these are stubs (desktop uses libmpv instead)
#[tauri::command]
async fn exoplayer_play(url: String) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        // On Android, this command is handled by the ExoPlayerPlugin Kotlin class
        Ok(serde_json::json!({"success": true, "url": url}))
    }
    #[cfg(not(target_os = "android"))]
    {
        // Desktop uses libmpv, not ExoPlayer
        Ok(serde_json::json!({"success": false, "error": "ExoPlayer is Android only"}))
    }
}

#[tauri::command]
async fn exoplayer_pause() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({"success": true}))
}

#[tauri::command]
async fn exoplayer_resume() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({"success": true}))
}

#[tauri::command]
async fn exoplayer_stop() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({"success": true}))
}

#[tauri::command]
async fn exoplayer_seek(position: i64) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({"success": true, "position": position}))
}

#[tauri::command]
async fn exoplayer_set_speed(speed: f32) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({"success": true, "speed": speed}))
}

#[tauri::command]
async fn exoplayer_get_position() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({"position": 0, "duration": 0, "is_playing": false}))
}

#[tauri::command]
async fn exoplayer_is_playing() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({"is_playing": false}))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg_attr(target_os = "android", allow(unused_mut))]
    let mut builder = tauri::Builder::default();

    // Desktop-only plugins (stronghold and libmpv not available on Android)
    #[cfg(not(target_os = "android"))]
    {
        builder = builder
            .plugin(
                tauri_plugin_stronghold::Builder::new(|password| {
                    let mut key = vec![0u8; 32];
                    let pwd_bytes = password.as_bytes();
                    for (i, byte) in pwd_bytes.iter().enumerate().take(32) {
                        key[i] = *byte;
                    }
                    key
                })
                .build(),
            )
            .plugin(tauri_plugin_libmpv::init());
    }

    builder
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            stalker_request,
            fetch_image,
            check_mpv_available,
            // Android ExoPlayer commands
            exoplayer_play,
            exoplayer_pause,
            exoplayer_resume,
            exoplayer_stop,
            exoplayer_seek,
            exoplayer_set_speed,
            exoplayer_get_position,
            exoplayer_is_playing
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
