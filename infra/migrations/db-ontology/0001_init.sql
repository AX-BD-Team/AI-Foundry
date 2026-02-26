-- db-ontology: Ontology normalization results
CREATE TABLE IF NOT EXISTS ontologies (
  ontology_id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  neo4j_graph_id TEXT,
  skos_concept_scheme TEXT,
  term_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS terms (
  term_id TEXT PRIMARY KEY,
  ontology_id TEXT NOT NULL,
  label TEXT NOT NULL,
  definition TEXT,
  skos_uri TEXT,
  broader_term_id TEXT,
  embedding_model TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ontology_id) REFERENCES ontologies(ontology_id)
);

CREATE TABLE IF NOT EXISTS term_mappings (
  mapping_id TEXT PRIMARY KEY,
  source_term_id TEXT NOT NULL,
  target_term_id TEXT NOT NULL,
  mapping_type TEXT NOT NULL,  -- exactMatch | closeMatch | broadMatch | narrowMatch
  confidence REAL DEFAULT 1.0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ontologies_policy ON ontologies(policy_id);
CREATE INDEX IF NOT EXISTS idx_terms_ontology ON terms(ontology_id);
CREATE INDEX IF NOT EXISTS idx_terms_label ON terms(label);
