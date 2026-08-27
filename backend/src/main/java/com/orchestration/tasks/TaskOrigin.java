package com.orchestration.tasks;

/** How a task came to exist, so the archive can separate auto-collected reports from things the user
 * asked for directly — independent of {@link TaskDomain}, since a chat-instructed task can carry any domain. */
public enum TaskOrigin { COLLECTION, MANUAL, UPLOAD }
