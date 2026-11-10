-- Explicit opt-in: never part of the ordinary migration chain. Requires pgvector.
create extension if not exists vector;
create table emba_embedding_model (
 model_id text primary key check (length(model_id) between 1 and 120),
 dimensions integer not null check (dimensions between 1 and 2048),
 unique(model_id,dimensions)
);
create table emba_document_embedding (
 document_id uuid not null,
 version integer not null,
 ordinal integer not null,
 model_id text not null,
 dimensions integer not null,
 embedding vector not null,
 primary key(document_id,version,ordinal,model_id),
 foreign key(document_id,version,ordinal) references emba_document_passage(document_id,version,ordinal) on delete cascade,
 foreign key(model_id,dimensions) references emba_embedding_model(model_id,dimensions),
 check(vector_dims(embedding)=dimensions and vector_norm(embedding)>0)
);
alter table emba_embedding_model enable row level security;
alter table emba_document_embedding enable row level security;
revoke all on emba_embedding_model,emba_document_embedding from public,anon,authenticated;
-- Persist metadata-only authorization to transmit before calling the provider.
alter table emba_audit drop constraint emba_audit_action_check;
alter table emba_audit add constraint emba_audit_action_check check (action in ('memory:read','memory:write','plan:read','activity:write','lease:grant','lease:revoke','lease:list','audit:read','confirmation:approve','confirmation:consume','knowledge:write','activity:create','activity:revise','activity:commit','activity:finalize','activity:withdraw','activity:dependency-consent','activity:completed','activity:cancelled','activity:read','activity:list','activity:disclosure','activity:names','activity:report','inbox:read','inbox:acknowledge','privacy:export','privacy:delete','knowledge:embed-document','knowledge:embed-query'));
