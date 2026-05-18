use rusqlite::{params, Connection};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use thiserror::Error;

const SCHEMA_VERSION: i32 = 2;
const KEYRING_SERVICE: &str = "ch.besi94.besmir";
const KEYRING_USER: &str = "sync-token";
const KEYRING_DB_KEY_USER: &str = "sqlite-key";

#[derive(Debug, Error)]
enum DesktopError {
    #[error("path resolution failed")]
    PathResolution,
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("keyring error: {0}")]
    Keyring(#[from] keyring::Error),
}

impl serde::Serialize for DesktopError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Serialize)]
struct LocalStoreStatus {
    database_path: String,
    schema_version: i32,
    pending_outbox_count: i64,
    open_conflict_count: i64,
}

#[tauri::command]
fn init_local_store(
    app: AppHandle,
    device_id: String,
    user_id: Option<String>,
) -> Result<LocalStoreStatus, DesktopError> {
    let database_path = database_path(&app)?;
    if let Some(parent) = database_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let connection = Connection::open(&database_path)?;
    apply_database_key(&connection)?;
    run_migrations(&connection)?;
    connection.execute(
        "insert into device_state (id, user_id, schema_version)
         values (?1, ?2, ?3)
         on conflict(id) do update set user_id = excluded.user_id, schema_version = excluded.schema_version",
        params![device_id, user_id, SCHEMA_VERSION],
    )?;

    status_from_connection(&connection, database_path)
}

#[tauri::command]
fn get_local_store_status(app: AppHandle) -> Result<LocalStoreStatus, DesktopError> {
    let database_path = database_path(&app)?;
    let connection = Connection::open(&database_path)?;
    apply_database_key(&connection)?;
    run_migrations(&connection)?;
    status_from_connection(&connection, database_path)
}

#[tauri::command]
fn save_auth_token(token: String) -> Result<(), DesktopError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)?;
    entry.set_password(&token)?;
    Ok(())
}

#[tauri::command]
fn load_auth_token() -> Result<Option<String>, DesktopError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn database_path(app: &AppHandle) -> Result<PathBuf, DesktopError> {
    let app_data_dir = app.path().app_data_dir().map_err(|_| DesktopError::PathResolution)?;
    Ok(app_data_dir.join("planner.sqlite"))
}

fn apply_database_key(connection: &Connection) -> Result<(), DesktopError> {
    let key = database_key()?;
    // This is a no-op on plain SQLite and activates encryption when linked against SQLCipher.
    connection.pragma_update(None, "key", key)?;
    Ok(())
}

fn database_key() -> Result<String, DesktopError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_DB_KEY_USER)?;
    match entry.get_password() {
        Ok(key) => Ok(key),
        Err(keyring::Error::NoEntry) => {
            let key = uuid::Uuid::new_v4().to_string();
            entry.set_password(&key)?;
            Ok(key)
        }
        Err(error) => Err(error.into()),
    }
}

fn run_migrations(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.pragma_update(None, "journal_mode", "WAL")?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.execute_batch(
        r#"
        create table if not exists schema_migrations (
          version integer primary key,
          applied_at text not null
        );

        create table if not exists device_state (
          id text primary key,
          user_id text,
          schema_version integer not null,
          created_at text not null default (datetime('now')),
          updated_at text not null default (datetime('now'))
        );

        create table if not exists employees (
          id text primary key,
          data text not null,
          created_at text not null,
          updated_at text not null,
          deleted_at text,
          version_hlc text not null,
          device_id text not null,
          user_id text,
          field_versions_json text not null
        );

        create table if not exists clients (
          id text primary key,
          data text not null,
          created_at text not null,
          updated_at text not null,
          deleted_at text,
          version_hlc text not null,
          device_id text not null,
          user_id text,
          field_versions_json text not null
        );

        create table if not exists appointments (
          id text primary key,
          employee_id text,
          data text not null,
          created_at text not null,
          updated_at text not null,
          deleted_at text,
          version_hlc text not null,
          device_id text not null,
          user_id text,
          field_versions_json text not null
        );

        create table if not exists planner_settings (
          id text primary key,
          data text not null,
          created_at text not null,
          updated_at text not null,
          deleted_at text,
          version_hlc text not null,
          device_id text not null,
          user_id text,
          field_versions_json text not null
        );

        create table if not exists sync_outbox (
          op_id text primary key,
          entity text not null,
          record_id text not null,
          operation text not null,
          payload_json text not null,
          base_version text,
          attempt_count integer not null default 0,
          next_attempt_at text,
          status text not null default 'pending',
          created_at text not null,
          updated_at text not null
        );

        create table if not exists sync_cursor (
          id text primary key,
          cursor text,
          updated_at text not null
        );

        create table if not exists sync_conflicts (
          id text primary key,
          entity text not null,
          record_id text not null,
          field_name text not null,
          local_value_json text,
          server_value_json text,
          chosen_value_json text,
          strategy text not null,
          op_id text not null,
          status text not null,
          created_at text not null,
          resolved_at text
        );

        insert or ignore into schema_migrations (version, applied_at)
        values (1, datetime('now'));

        insert or ignore into schema_migrations (version, applied_at)
        values (2, datetime('now'));

        pragma user_version = 2;
        "#,
    )?;
    Ok(())
}

fn status_from_connection(
    connection: &Connection,
    database_path: PathBuf,
) -> Result<LocalStoreStatus, DesktopError> {
    let schema_version = connection.query_row("pragma user_version", [], |row| row.get(0))?;
    let pending_outbox_count = connection.query_row(
        "select count(*) from sync_outbox where status = 'pending'",
        [],
        |row| row.get(0),
    )?;
    let open_conflict_count = connection.query_row(
        "select count(*) from sync_conflicts where status = 'open'",
        [],
        |row| row.get(0),
    )?;

    Ok(LocalStoreStatus {
        database_path: database_path.to_string_lossy().to_string(),
        schema_version,
        pending_outbox_count,
        open_conflict_count,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            init_local_store,
            get_local_store_status,
            save_auth_token,
            load_auth_token
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
