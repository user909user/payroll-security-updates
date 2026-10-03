// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(not(debug_assertions))]
use std::path::PathBuf;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg(not(debug_assertions))]
/// Strip Windows `\\?\` verbatim prefix returned by the resource path API.
fn strip_verbatim(path: PathBuf) -> PathBuf {
    match path.to_string_lossy().strip_prefix(r"\\?\") {
        Some(rest) => PathBuf::from(rest),
        None => path,
    }
}

#[cfg(not(debug_assertions))]
fn backend_url(app: &tauri::App) -> Result<String, Box<dyn std::error::Error>> {
    let resource_dir = strip_verbatim(app.path().resource_dir()?);
    let config = std::fs::read_to_string(resource_dir.join("resources").join("backend-config.json"))?;
    let key = "\"backendUrl\"";
    let url = config
        .split_once(key)
        .and_then(|(_, rest)| rest.split_once(':'))
        .map(|(_, rest)| rest.trim())
        .and_then(|rest| rest.strip_prefix('"'))
        .and_then(|rest| rest.split_once('"').map(|(url, _)| url))
        .filter(|url| {
            url.starts_with("https://")
                && !url.contains('@')
                && !url.contains('?')
                && !url.contains('#')
        })
        .ok_or("backend-config.json must contain an HTTPS backendUrl")?;
    Ok(url.to_string())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(debug_assertions)]
            let url = "http://localhost:3000".to_string();

            #[cfg(not(debug_assertions))]
            let url = backend_url(app)?;

            let handle = app.handle().clone();
            WebviewWindowBuilder::new(&handle, "main", WebviewUrl::External(url.parse().unwrap()))
                .title("Payroll")
                .inner_size(1280.0, 800.0)
                .min_inner_size(360.0, 640.0)
                .center()
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Payroll")
        .run(|_, _| {});
}
