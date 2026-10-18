package com.orchestration.tasks;

import java.nio.file.Path;

record Note(Path path, String relativePath, String domain, String content, String origin) {}
