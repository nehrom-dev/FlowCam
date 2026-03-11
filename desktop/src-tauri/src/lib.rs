use local_ip_address::local_ip;
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tokio::{
    net::TcpListener,
    sync::mpsc::{self, UnboundedSender},
};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use uuid::Uuid;

use futures_util::{SinkExt, StreamExt};

const SIGNALING_PORT: u16 = 31337;

#[derive(Default)]
struct SessionStore {
    current_session_id: String,
    peers: HashMap<String, SessionPeers>,
}

#[derive(Default)]
struct SessionPeers {
    desktop: Option<UnboundedSender<Message>>,
    phone: Option<UnboundedSender<Message>>,
}

#[derive(Clone)]
struct SharedState {
    store: Arc<Mutex<SessionStore>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PairingInfo {
    session_id: String,
    local_ip: String,
    port: u16,
    qr_payload: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct HelloMessage {
    #[allow(dead_code)]
    r#type: String,
    role: String,
    session_id: String,
}

fn current_local_ip() -> String {
    match local_ip() {
        Ok(ip) => ip.to_string(),
        Err(_) => "127.0.0.1".to_string(),
    }
}

fn next_pairing_info(state: &SharedState) -> PairingInfo {
    let mut store = state.store.lock().expect("state lock poisoned");
    store.current_session_id = Uuid::new_v4().to_string();
    let session_id = store.current_session_id.clone();

    let local_ip = current_local_ip();
    let qr_payload = format!(
        "flowcam://pair?host={}&port={}&session={}",
        local_ip, SIGNALING_PORT, session_id
    );

    PairingInfo {
        session_id,
        local_ip,
        port: SIGNALING_PORT,
        qr_payload,
    }
}

#[tauri::command]
fn get_pairing_info(state: tauri::State<'_, SharedState>) -> PairingInfo {
    let store = state.store.lock().expect("state lock poisoned");

    let session_id = if store.current_session_id.is_empty() {
        drop(store);
        return next_pairing_info(&state);
    } else {
        store.current_session_id.clone()
    };

    drop(store);

    let local_ip = current_local_ip();
    let qr_payload = format!(
        "flowcam://pair?host={}&port={}&session={}",
        local_ip, SIGNALING_PORT, session_id
    );

    PairingInfo {
        session_id,
        local_ip,
        port: SIGNALING_PORT,
        qr_payload,
    }
}

#[tauri::command]
fn reset_session(state: tauri::State<'_, SharedState>) -> PairingInfo {
    next_pairing_info(&state)
}

async fn run_signaling_server(state: SharedState) -> Result<(), String> {
    let listener = TcpListener::bind(("0.0.0.0", SIGNALING_PORT))
        .await
        .map_err(|e| format!("bind failed: {e}"))?;

    loop {
        let (stream, _) = listener
            .accept()
            .await
            .map_err(|e| format!("accept failed: {e}"))?;

        let shared = state.clone();

        tauri::async_runtime::spawn(async move {
            if let Err(error) = handle_socket(shared, stream).await {
                eprintln!("websocket connection error: {error}");
            }
        });
    }
}

async fn handle_socket(
    state: SharedState,
    stream: tokio::net::TcpStream,
) -> Result<(), String> {
    let ws_stream = accept_async(stream)
        .await
        .map_err(|e| format!("ws handshake failed: {e}"))?;

    let (mut writer, mut reader) = ws_stream.split();

    let first = reader
        .next()
        .await
        .ok_or_else(|| "missing hello message".to_string())
        .and_then(|msg| msg.map_err(|e| format!("read hello failed: {e}")))?;

    let text = first
        .to_text()
        .map_err(|_| "first websocket frame must be text".to_string())?;

    let hello: HelloMessage =
        serde_json::from_str(text).map_err(|e| format!("invalid hello payload: {e}"))?;

    if hello.r#type != "hello" {
        return Err("first message must be hello".to_string());
    }

    let role = hello.role.clone();
    let session_id = hello.session_id.clone();
    let (outgoing_tx, mut outgoing_rx) = mpsc::unbounded_channel::<Message>();

    {
        let mut store = state.store.lock().expect("state lock poisoned");
        let peers = store.peers.entry(session_id.clone()).or_default();

        match role.as_str() {
            "desktop" => peers.desktop = Some(outgoing_tx.clone()),
            "phone" => peers.phone = Some(outgoing_tx.clone()),
            _ => return Err("invalid role".to_string()),
        }
    }

    let writer_task = tauri::async_runtime::spawn(async move {
        while let Some(message) = outgoing_rx.recv().await {
            if writer.send(message).await.is_err() {
                break;
            }
        }
    });

    notify_other_peer(
        &state,
        &session_id,
        &role,
        serde_json::json!({
            "type": "peer-joined",
            "sessionId": session_id,
            "role": role
        })
        .to_string(),
    );

    while let Some(incoming) = reader.next().await {
        let incoming = incoming.map_err(|e| format!("read frame failed: {e}"))?;

        match incoming {
            Message::Text(payload) => {
                relay_to_other_peer(&state, &session_id, &role, Message::Text(payload));
            }
            Message::Binary(payload) => {
                relay_to_other_peer(&state, &session_id, &role, Message::Binary(payload));
            }
            Message::Close(_) => break,
            Message::Ping(payload) => {
                let _ = outgoing_tx.send(Message::Pong(payload));
            }
            Message::Pong(_) | Message::Frame(_) => {}
        }
    }

    {
        let mut store = state.store.lock().expect("state lock poisoned");

        if let Some(peers) = store.peers.get_mut(&session_id) {
            match role.as_str() {
                "desktop" => peers.desktop = None,
                "phone" => peers.phone = None,
                _ => {}
            }

            if peers.desktop.is_none() && peers.phone.is_none() {
                store.peers.remove(&session_id);
            }
        }
    }

    notify_other_peer(
        &state,
        &session_id,
        &role,
        serde_json::json!({
            "type": "peer-left",
            "sessionId": session_id,
            "role": role
        })
        .to_string(),
    );

    writer_task.abort();
    Ok(())
}

fn relay_to_other_peer(state: &SharedState, session_id: &str, from_role: &str, message: Message) {
    let store = state.store.lock().expect("state lock poisoned");

    if let Some(peers) = store.peers.get(session_id) {
        let target = if from_role == "desktop" {
            peers.phone.as_ref()
        } else {
            peers.desktop.as_ref()
        };

        if let Some(tx) = target {
            let _ = tx.send(message);
        }
    }
}

fn notify_other_peer(state: &SharedState, session_id: &str, from_role: &str, payload: String) {
    relay_to_other_peer(state, session_id, from_role, Message::Text(payload.into()));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared = SharedState {
        store: Arc::new(Mutex::new(SessionStore {
            current_session_id: Uuid::new_v4().to_string(),
            peers: HashMap::new(),
        })),
    };

    let signaling_state = shared.clone();

    tauri::Builder::default()
        .manage(shared)
        .setup(move |_app| {
            tauri::async_runtime::spawn(async move {
                if let Err(error) = run_signaling_server(signaling_state).await {
                    eprintln!("signaling server crashed: {error}");
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_pairing_info, reset_session])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}