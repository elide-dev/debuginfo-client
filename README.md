# debuginfo.dev client tools

Public installation and GitHub Actions integration for the debuginfo.dev hosted service. This repository contains only the reusable setup action and compiled CLI downloads. The hosted service source and customer symbols are not published here.

The current build is a staging onboarding preview for Linux x86_64 and a debuginfod-enabled GDB. It is not a production release. Downloads identify their exact source revision and include SHA256SUMS. No Elide repository token is needed.

The setup action is MIT-licensed (LICENSE). Compiled dbginfo binaries are proprietary: you may download and run them to use debuginfo.dev. No source-code license or right to redistribute, modify or sublicense the CLI is granted. Third-party dependencies retain their own licenses.

## Install on Linux x86_64

Download the Linux archive and SHA256SUMS from Releases. Verify `sha256sum --check SHA256SUMS`, extract the archive, and put `dbginfo` on your PATH. Read the release notes for the source revision and tested scope.

## CI setup

After the build and tests in your trusted branch job, use this action pinned to its commit SHA. Give that job `permissions: { contents: read, id-token: write }`. Set the action inputs `url`, `org` and `project`, then run `dbginfo ingest ./symbols` on your preserved symbol files. Authenticate immediately before uploading; access lasts 15 minutes. Never upload private symbols from fork or untrusted pull-request jobs.

Repository linking must be approved once by someone who administers both the team and the GitHub repository. Each developer then runs `dbginfo --url https://api.staging.debuginfo.dev --org TEAM connect --project PROJECT` and approves their own computer in the browser.
