---
applyTo: "**"
---

[PROJECT CONTEXT]
Internal software tools and automation scripts for deployment, diagnostics, and system management.  
Primary goals: clarity, maintainability, reliability, and code traceability.

[ARCHITECTURE & PATTERNS]
Prioritize simplicity and known, proven design patterns.  
Avoid over-engineering or creating structures that require reading multiple files to understand the logic.  
Document the overall architecture: major components, service boundaries, data flows, and the reasoning behind structural choices.  
Clearly explain any project-specific conventions or patterns that differ from standard practices.  
Highlight integration points, external dependencies, and how components communicate.  
Keep the design intuitive and immediately understandable to a new developer.

[CODING PRINCIPLES]
Write clean, complete, documented, and unique code.  
Always review existing code before adding or modifying functionality.  
Never duplicate logic or leave commented or temporary code.  
Remove old implementations entirely when replacing a feature.  
Always make a backup before deleting files, stored under /old.  
Use a dry-run mode for any destructive or write operation.  
Never use absolute paths or hardcoded values.  
Code must remain self-contained, portable, and environment-independent.

[STRUCTURE & ORGANIZATION]
Follow standard structure conventions of the active language.  
Separate source, utilities, configurations, tests, and logs.  
Centralize configuration files in readable formats (JSON, YAML, XML).  
All file paths must be relative.  
The logger must be globally accessible in every module.

[DOCUMENTATION RULES]
Each file begins with a descriptive header including file name, module, author, description, dependencies, and creation date.  
Every function, method, and class includes a documentation block describing purpose, parameters, return values, and notes.  
All documentation must stay consistent with the actual code.

[LOGGING & ERROR HANDLING]
Use a centralized logging class for all messages, warnings, and errors.  
No direct print, console.log, or Write-Host.  
The logger must be simple and easy to use, handling levels, timestamps, formatting, and file logging.  
All exceptions must be properly caught, logged, and explained.

[GOOD PRACTICES]
Apply the official naming conventions of each language.  
Always validate file or directory existence before operating on them.  
Perform full error handling in every module.  
Never commit commented-out or unused code.  
Run a final self-review before any commit.  
Ensure the logger is used for all output.  
Maintain code readability over micro-optimization.  
Keep the /old directory clean by archiving or purging outdated backups.

[VERSION CONTROL & REVIEW]
Use a proper version control system.  
Commit only tested, reviewed, and validated code.  
Use explicit, descriptive commit messages.  
Never push untested or temporary work.  
Require review for changes impacting architecture or logic.  
Disallow merges until all tests pass.

[DOCUMENTATION & MAINTENANCE]
Maintain an updated README.md describing dependencies, usage, environment variables, and setup instructions.  
Document all external libraries and their purpose.  
Ensure any configuration change is reflected in the documentation.  
Include critical developer workflows such as build, test, and debugging commands that may not be obvious from inspection alone.

[SECURITY]
Do not include credentials, API keys, or confidential data in source code.  
Store sensitive information in configuration files excluded from version control.  
Scrub logs before publishing or sharing them externally.

[TESTING & VALIDATION]
Provide unit or validation tests for all critical modules.  
Ensure new code does not break existing functionality.  
Log test results in a structured file or system.

[PERFORMANCE & CLEANUP]
Prioritize clarity over micro-optimization.  
Detect and eliminate redundant loops or heavy calls.  
Regularly clean obsolete files from /old and remove dead code or unused dependencies.

[OUTPUT EXPECTATION]
When generating, reviewing, or completing code:

- Provide full, executable, and documented code.
- Maintain conformity with all conventions above.
- Explain design choices concisely.
- Avoid pseudo-code, placeholder comments, or partial snippets.
- Always prefer simplicity, clarity, and maintainability.
