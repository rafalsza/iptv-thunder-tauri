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

    let response = client
        .get(&url)
        .header("Accept", "image/*,*/*")
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .send()
        .await
        .map_err(|e| e.to_string())?;

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

#[tauri::command]
async fn check_mpv_available() -> Result<bool, String> {
    Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_stronghold::Builder::new(|password| {
                // Simple 32-byte hash for Stronghold requirement
                // In production, use argon2 or similar for secure hashing
                let mut key = vec![0u8; 32];
                let pwd_bytes = password.as_bytes();
                for (i, byte) in pwd_bytes.iter().enumerate().take(32) {
                    key[i] = *byte;
                }
                key
            })
            .build(),
        )
        .plugin(tauri_plugin_libmpv::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![stalker_request, fetch_image, check_mpv_available])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
