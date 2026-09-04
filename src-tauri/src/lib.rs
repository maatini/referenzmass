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
#[serde(rename_all = "camelCase")]
pub struct ProjectState {
    /// Optional path to the source image (for future use)
    pub image_path: Option<String>,
    /// Current calibration, if one has been set
    pub calibration: Option<CalibrationState>,
    /// All measurement lines drawn by the user
    pub measurements: Vec<MeasurementState>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct PointState {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
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
    /// Pixel start of the line reference (line calibration)
    #[serde(default)]
    pub reference_start: Option<PointState>,
    /// Pixel end of the line reference (line calibration)
    #[serde(default)]
    pub reference_end: Option<PointState>,
    /// Four image-plane corners (plane calibration)
    #[serde(default)]
    pub plane_points: Vec<PointState>,
    /// Known real-world width (line: reference length; plane: rectangle width)
    #[serde(default)]
    pub real_width: Option<f64>,
    /// Known real-world height (plane calibration)
    #[serde(default)]
    pub real_height: Option<f64>,
}

fn default_calib_type() -> String {
    "line".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
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
                ..Default::default()
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
                ..Default::default()
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

    /// Frontend `persistence.ts` sends camelCase (`imagePath`, `calibType`, `startX`).
    /// Without `rename_all = "camelCase"` the IPC payload is dropped or fields default.
    #[test]
    fn serialized_project_state_uses_camel_case_keys() {
        let original = ProjectState {
            image_path: Some("/photos/part.jpg".to_string()),
            calibration: Some(CalibrationState {
                calib_type: "line".to_string(),
                scale: 0.02,
                unit: "cm".to_string(),
                homography: None,
                ..Default::default()
            }),
            measurements: vec![MeasurementState {
                id: "m1".to_string(),
                start_x: 120.0,
                start_y: 340.0,
                end_x: 480.0,
                end_y: 340.0,
                real_length: 8.41,
                unit: "cm".to_string(),
                label: "Fensterbreite".to_string(),
                notes: "Holzrahmen".to_string(),
            }],
        };

        let value = serde_json::to_value(&original).expect("serialize");
        let obj = value.as_object().expect("object");

        assert!(
            obj.contains_key("imagePath"),
            "expected camelCase imagePath, got keys: {:?}",
            obj.keys().collect::<Vec<_>>()
        );
        assert!(
            !obj.contains_key("image_path"),
            "snake_case image_path must not appear in JSON"
        );

        let calib = obj["calibration"].as_object().expect("calibration object");
        assert!(calib.contains_key("calibType"), "expected calibType, got {:?}", calib.keys().collect::<Vec<_>>());
        assert!(!calib.contains_key("calib_type"));

        let meas = obj["measurements"][0].as_object().expect("measurement object");
        assert!(meas.contains_key("startX"));
        assert!(meas.contains_key("realLength"));
        assert!(!meas.contains_key("start_x"));
        assert!(!meas.contains_key("real_length"));
    }

    #[test]
    fn deserializes_frontend_camel_case_json() {
        let json = r#"{
            "imagePath": "/photos/part.jpg",
            "calibration": {
                "calibType": "line",
                "scale": 0.02,
                "unit": "cm",
                "homography": null
            },
            "measurements": [
                {
                    "id": "m1",
                    "startX": 120.0,
                    "startY": 340.0,
                    "endX": 480.0,
                    "endY": 340.0,
                    "realLength": 8.41,
                    "unit": "cm",
                    "label": "Fensterbreite",
                    "notes": "Holzrahmen"
                }
            ]
        }"#;

        let loaded: ProjectState =
            serde_json::from_str(json).expect("frontend camelCase JSON must deserialize");
        assert_eq!(loaded.image_path.as_deref(), Some("/photos/part.jpg"));
        let calib = loaded.calibration.expect("calibration");
        assert_eq!(calib.calib_type, "line");
        assert_eq!(calib.scale, 0.02);
        assert_eq!(loaded.measurements[0].start_x, 120.0);
        assert_eq!(loaded.measurements[0].real_length, 8.41);
    }

    #[test]
    fn deserializes_line_fixture_with_reference_geometry() {
        let json = include_str!("../../fixtures/project-line.camelCase.json");
        let loaded: ProjectState = serde_json::from_str(json).expect("line fixture");
        let calib = loaded.calibration.expect("calibration");
        assert_eq!(
            calib.reference_start,
            Some(PointState {
                x: 100.0,
                y: 200.0
            })
        );
        assert_eq!(
            calib.reference_end,
            Some(PointState {
                x: 600.0,
                y: 200.0
            })
        );
        assert_eq!(calib.real_width, Some(10.0));
        assert!(calib.plane_points.is_empty());
        assert_eq!(loaded.measurements[0].label, "Fensterbreite");
    }

    #[test]
    fn deserializes_plane_fixture_with_four_points() {
        let json = include_str!("../../fixtures/project-plane.camelCase.json");
        let loaded: ProjectState = serde_json::from_str(json).expect("plane fixture");
        let calib = loaded.calibration.expect("calibration");
        assert_eq!(calib.calib_type, "plane");
        assert_eq!(calib.plane_points.len(), 4);
        assert_eq!(calib.real_width, Some(4.0));
        assert_eq!(calib.real_height, Some(3.0));
        assert!(calib.homography.as_ref().is_some_and(|h| h.len() == 9));
    }

    #[test]
    fn roundtrip_preserves_reference_geometry() {
        let original = ProjectState {
            image_path: Some("/photos/part.jpg".to_string()),
            calibration: Some(CalibrationState {
                calib_type: "line".to_string(),
                scale: 0.02,
                unit: "cm".to_string(),
                homography: None,
                reference_start: Some(PointState { x: 100.0, y: 200.0 }),
                reference_end: Some(PointState { x: 600.0, y: 200.0 }),
                plane_points: vec![],
                real_width: Some(10.0),
                real_height: None,
            }),
            measurements: vec![],
        };

        let json = serde_json::to_string(&original).unwrap();
        let loaded: ProjectState = serde_json::from_str(&json).unwrap();
        assert_eq!(loaded, original);

        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        let calib = value["calibration"].as_object().unwrap();
        assert!(calib.contains_key("referenceStart"));
        assert!(calib.contains_key("realWidth"));
        assert!(!calib.contains_key("reference_start"));
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
