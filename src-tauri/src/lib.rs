/// Simple IPC health-check command for Module 1 baseline.
#[tauri::command]
fn ping() -> String {
    "pong".to_string()
}

// ============================================================================
// Module 5: Persistence Slice - Project State
// ============================================================================

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProjectState {
    /// Optional path to the source image (for future use)
    pub image_path: Option<String>,
    /// Current calibration, if one has been set
    pub calibration: Option<CalibrationState>,
    /// All measurement lines drawn by the user
    pub measurements: Vec<MeasurementState>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CalibrationState {
    /// Calibration type: "line" or "plane"
    #[serde(default = "default_calib_type")]
    pub calib_type: String,
    /// Real-world units per pixel (e.g. 0.02 means 0.02 cm/px)
    pub scale: f64,
    /// The unit the scale is expressed in ("mm", "cm", or "m")
    pub unit: String,
    /// 3x3 homography matrix (9 elements), only present for plane calibration
    #[serde(default)]
    pub homography: Option<Vec<f64>>,
}

fn default_calib_type() -> String {
    "line".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MeasurementState {
    pub id: String,
    pub start_x: f64,
    pub start_y: f64,
    pub end_x: f64,
    pub end_y: f64,
    /// Real-world length in the calibration's unit
    pub real_length: f64,
    pub unit: String,
    /// User-assigned label (e.g. "Fensterbreite")
    #[serde(default)]
    pub label: String,
    /// Free-form notes
    #[serde(default)]
    pub notes: String,
}

/// Saves the current project state to disk as pretty-printed JSON.
#[tauri::command]
fn save_project(path: String, state: ProjectState) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&state)
        .map_err(|e| format!("Failed to serialize project state: {}", e))?;

    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write project file at '{}': {}", path, e))?;

    Ok(())
}

/// Loads a project state from a JSON file on disk.
#[tauri::command]
fn load_project(path: String) -> Result<ProjectState, String> {
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read project file at '{}': {}", path, e))?;

    let state: ProjectState = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to deserialize project state: {}", e))?;

    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::path::PathBuf;

    #[test]
    fn test_ping_command_returns_pong() {
        assert_eq!(ping(), "pong");
    }

    /// Module 5 vertical slice test:
    /// Round-trip a realistic ProjectState (line calibration) through save/load using a temp file.
    #[test]
    fn test_project_state_roundtrip_line_calibration() {
        // Create a realistic mock project state
        let original = ProjectState {
            image_path: Some("/Users/test/photos/part.jpg".to_string()),
            calibration: Some(CalibrationState {
                calib_type: "line".to_string(),
                scale: 0.0234,
                unit: "cm".to_string(),
                homography: None,
            }),
            measurements: vec![
                MeasurementState {
                    id: "m1".to_string(),
                    start_x: 120.0,
                    start_y: 340.0,
                    end_x: 480.0,
                    end_y: 340.0,
                    real_length: 8.41,
                    unit: "cm".to_string(),
                    label: "Fensterbreite".to_string(),
                    notes: "Holzrahmen".to_string(),
                },
                MeasurementState {
                    id: "m2".to_string(),
                    start_x: 200.0,
                    start_y: 500.0,
                    end_x: 200.0,
                    end_y: 720.0,
                    real_length: 5.15,
                    unit: "cm".to_string(),
                    label: "".to_string(),
                    notes: "".to_string(),
                },
            ],
        };

        // Create a unique temp file path
        let mut temp_path: PathBuf = env::temp_dir();
        temp_path.push(format!(
            "referenzmass_test_project_{}.json",
            std::process::id()
        ));

        // Ensure we clean up even if the test panics
        let cleanup = || {
            let _ = std::fs::remove_file(&temp_path);
        };

        // Save
        let save_result = save_project(temp_path.to_string_lossy().to_string(), original.clone());
        assert!(save_result.is_ok(), "save_project failed: {:?}", save_result);

        // Load
        let load_result = load_project(temp_path.to_string_lossy().to_string());
        assert!(load_result.is_ok(), "load_project failed: {:?}", load_result);

        let loaded = load_result.unwrap();

        // Assert round-trip equality
        assert_eq!(loaded, original);

        // Cleanup
        cleanup();
    }

    /// Round-trip a ProjectState with plane calibration (homography) through save/load.
    #[test]
    fn test_project_state_roundtrip_plane_calibration() {
        let original = ProjectState {
            image_path: Some("/Users/test/photos/floorplan.jpg".to_string()),
            calibration: Some(CalibrationState {
                calib_type: "plane".to_string(),
                scale: 0.015,
                unit: "m".to_string(),
                homography: Some(vec![
                    0.98, -0.02, 10.0,
                    0.01, 0.97, 5.0,
                    -0.0001, 0.0002, 1.0,
                ]),
            }),
            measurements: vec![
                MeasurementState {
                    id: "m-plane-1".to_string(),
                    start_x: 100.0,
                    start_y: 200.0,
                    end_x: 400.0,
                    end_y: 200.0,
                    real_length: 4.5,
                    unit: "m".to_string(),
                    label: "Raumbreite".to_string(),
                    notes: "Wohnzimmer".to_string(),
                },
            ],
        };

        let mut temp_path: PathBuf = env::temp_dir();
        temp_path.push(format!(
            "referenzmass_test_project_plane_{}.json",
            std::process::id()
        ));

        let cleanup = || {
            let _ = std::fs::remove_file(&temp_path);
        };

        let save_result = save_project(temp_path.to_string_lossy().to_string(), original.clone());
        assert!(save_result.is_ok(), "save_project failed: {:?}", save_result);

        let load_result = load_project(temp_path.to_string_lossy().to_string());
        assert!(load_result.is_ok(), "load_project failed: {:?}", load_result);

        let loaded = load_result.unwrap();
        assert_eq!(loaded, original);

        // Verify plane-specific fields
        let calib = loaded.calibration.unwrap();
        assert_eq!(calib.calib_type, "plane");
        assert!(calib.homography.is_some());
        assert_eq!(calib.homography.unwrap().len(), 9);

        cleanup();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![ping, save_project, load_project])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
