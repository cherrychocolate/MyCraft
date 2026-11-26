CREATE TABLE access_requests (user_id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', created REAL NOT NULL, reviewed REAL);
CREATE TABLE documents (owner TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL,revision INTEGER NOT NULL,updated REAL NOT NULL,PRIMARY KEY(owner,id));
CREATE TABLE history (owner TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL,revision INTEGER NOT NULL,updated REAL NOT NULL,PRIMARY KEY(owner,id,revision));
CREATE TABLE runs (owner TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,created REAL NOT NULL,PRIMARY KEY(owner,id));
CREATE INDEX docs_owner_kind ON documents(owner,kind);
CREATE INDEX runs_owner_time ON runs(owner,created);
CREATE TABLE usage_limits (owner TEXT NOT NULL,day TEXT NOT NULL,calls INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner,day));
