-- V12 created sha256 as CHAR(64), but the JPA entity (EvidenceRecord.sha256,
-- a plain String @Column(length = 64) with no columnDefinition) validates
-- against VARCHAR(64), causing Hibernate schema validation to fail at
-- startup ("wrong column type ... found [char], but expecting [varchar(64)]").
ALTER TABLE diag_evidence MODIFY sha256 VARCHAR(64) NOT NULL;
