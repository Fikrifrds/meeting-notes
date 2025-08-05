use rusqlite::{Connection, Result, params};
use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Meeting {
    pub id: String,
    pub title: String,
    pub created_at: DateTime<Local>,
    pub updated_at: DateTime<Local>,
    pub duration_seconds: Option<i64>,
    pub audio_file_path: Option<String>,
    pub transcript: Option<String>,
    pub meeting_minutes: Option<String>,
    pub language: Option<String>,
    pub ai_provider: Option<String>, // "openai" or "ollama"
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MeetingSegment {
    pub id: String,
    pub meeting_id: String,
    pub start_time: f64,
    pub end_time: f64,
    pub text: String,
    pub confidence: Option<f64>,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        let db = Database { conn };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> Result<()> {
        // Create meetings table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS meetings (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                duration_seconds INTEGER,
                audio_file_path TEXT,
                transcript TEXT,
                meeting_minutes TEXT,
                language TEXT,
                ai_provider TEXT
            )",
            [],
        )?;

        // Create meeting_segments table for detailed transcription segments
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS meeting_segments (
                id TEXT PRIMARY KEY,
                meeting_id TEXT NOT NULL,
                start_time REAL NOT NULL,
                end_time REAL NOT NULL,
                text TEXT NOT NULL,
                confidence REAL,
                FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Create indexes for better performance
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_meetings_created_at ON meetings(created_at)",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_segments_meeting_id ON meeting_segments(meeting_id)",
            [],
        )?;

        Ok(())
    }

    pub fn create_meeting(&self, title: String, language: Option<String>) -> Result<Meeting> {
        let id = Uuid::new_v4().to_string();
        let now = Local::now();
        
        let meeting = Meeting {
            id: id.clone(),
            title,
            created_at: now,
            updated_at: now,
            duration_seconds: None,
            audio_file_path: None,
            transcript: None,
            meeting_minutes: None,
            language,
            ai_provider: None,
        };

        self.conn.execute(
            "INSERT INTO meetings (id, title, created_at, updated_at, language) 
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                meeting.id,
                meeting.title,
                meeting.created_at.to_rfc3339(),
                meeting.updated_at.to_rfc3339(),
                meeting.language
            ],
        )?;

        Ok(meeting)
    }

    pub fn update_meeting(&self, meeting: &Meeting) -> Result<()> {
        let updated_at = Local::now();
        
        println!("🔍 Database update_meeting called with:");
        println!("   id: {}", meeting.id);
        println!("   title: {}", meeting.title);
        println!("   audio_file_path: {:?}", meeting.audio_file_path);
        println!("   duration_seconds: {:?}", meeting.duration_seconds);
        
        let rows_affected = self.conn.execute(
            "UPDATE meetings SET 
                title = ?1,
                updated_at = ?2,
                duration_seconds = ?3,
                audio_file_path = ?4,
                transcript = ?5,
                meeting_minutes = ?6,
                language = ?7,
                ai_provider = ?8
             WHERE id = ?9",
            params![
                meeting.title,
                updated_at.to_rfc3339(),
                meeting.duration_seconds,
                meeting.audio_file_path,
                meeting.transcript,
                meeting.meeting_minutes,
                meeting.language,
                meeting.ai_provider,
                meeting.id
            ],
        )?;

        println!("✅ Database update completed, rows affected: {}", rows_affected);
        Ok(())
    }

    pub fn get_meeting(&self, id: &str) -> Result<Option<Meeting>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, created_at, updated_at, duration_seconds, 
                    audio_file_path, transcript, meeting_minutes, language, ai_provider
             FROM meetings WHERE id = ?1"
        )?;

        let meeting_iter = stmt.query_map([id], |row| {
            Ok(Meeting {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(2)?)
                    .map_err(|e| rusqlite::Error::InvalidColumnType(2, "created_at".to_string(), rusqlite::types::Type::Text))?
                    .with_timezone(&Local),
                updated_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(3)?)
                    .map_err(|e| rusqlite::Error::InvalidColumnType(3, "updated_at".to_string(), rusqlite::types::Type::Text))?
                    .with_timezone(&Local),
                duration_seconds: row.get(4)?,
                audio_file_path: row.get(5)?,
                transcript: row.get(6)?,
                meeting_minutes: row.get(7)?,
                language: row.get(8)?,
                ai_provider: row.get(9)?,
            })
        })?;

        for meeting in meeting_iter {
            return Ok(Some(meeting?));
        }

        Ok(None)
    }

    pub fn get_all_meetings(&self) -> Result<Vec<Meeting>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, created_at, updated_at, duration_seconds, 
                    audio_file_path, transcript, meeting_minutes, language, ai_provider
             FROM meetings ORDER BY created_at DESC"
        )?;

        let meeting_iter = stmt.query_map([], |row| {
            Ok(Meeting {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(2)?)
                    .map_err(|e| rusqlite::Error::InvalidColumnType(2, "created_at".to_string(), rusqlite::types::Type::Text))?
                    .with_timezone(&Local),
                updated_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(3)?)
                    .map_err(|e| rusqlite::Error::InvalidColumnType(3, "updated_at".to_string(), rusqlite::types::Type::Text))?
                    .with_timezone(&Local),
                duration_seconds: row.get(4)?,
                audio_file_path: row.get(5)?,
                transcript: row.get(6)?,
                meeting_minutes: row.get(7)?,
                language: row.get(8)?,
                ai_provider: row.get(9)?,
            })
        })?;

        let mut meetings = Vec::new();
        for meeting in meeting_iter {
            meetings.push(meeting?);
        }

        Ok(meetings)
    }

    pub fn delete_meeting(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM meetings WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn add_meeting_segment(&self, segment: &MeetingSegment) -> Result<()> {
        self.conn.execute(
            "INSERT INTO meeting_segments (id, meeting_id, start_time, end_time, text, confidence)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                segment.id,
                segment.meeting_id,
                segment.start_time,
                segment.end_time,
                segment.text,
                segment.confidence
            ],
        )?;

        Ok(())
    }

    pub fn get_meeting_segments(&self, meeting_id: &str) -> Result<Vec<MeetingSegment>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, meeting_id, start_time, end_time, text, confidence
             FROM meeting_segments WHERE meeting_id = ?1 ORDER BY start_time"
        )?;

        let segment_iter = stmt.query_map([meeting_id], |row| {
            Ok(MeetingSegment {
                id: row.get(0)?,
                meeting_id: row.get(1)?,
                start_time: row.get(2)?,
                end_time: row.get(3)?,
                text: row.get(4)?,
                confidence: row.get(5)?,
            })
        })?;

        let mut segments = Vec::new();
        for segment in segment_iter {
            segments.push(segment?);
        }

        Ok(segments)
    }

    pub fn search_meetings(&self, query: &str) -> Result<Vec<Meeting>> {
        let search_query = format!("%{}%", query);
        let mut stmt = self.conn.prepare(
            "SELECT id, title, created_at, updated_at, duration_seconds, 
                    audio_file_path, transcript, meeting_minutes, language, ai_provider
             FROM meetings 
             WHERE title LIKE ?1 OR transcript LIKE ?1 OR meeting_minutes LIKE ?1
             ORDER BY created_at DESC"
        )?;

        let meeting_iter = stmt.query_map([&search_query], |row| {
            Ok(Meeting {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(2)?)
                    .map_err(|e| rusqlite::Error::InvalidColumnType(2, "created_at".to_string(), rusqlite::types::Type::Text))?
                    .with_timezone(&Local),
                updated_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(3)?)
                    .map_err(|e| rusqlite::Error::InvalidColumnType(3, "updated_at".to_string(), rusqlite::types::Type::Text))?
                    .with_timezone(&Local),
                duration_seconds: row.get(4)?,
                audio_file_path: row.get(5)?,
                transcript: row.get(6)?,
                meeting_minutes: row.get(7)?,
                language: row.get(8)?,
                ai_provider: row.get(9)?,
            })
        })?;

        let mut meetings = Vec::new();
        for meeting in meeting_iter {
            meetings.push(meeting?);
        }

        Ok(meetings)
    }
}